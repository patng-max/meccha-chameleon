-- M4: Hide Deployment, Faction Enforcement & Moderator Approval
-- Adds columns, Meccha ID trigger, indexes, append-only trigger, and RLS policies.

BEGIN;

-- ─── Meccha ID sequence ────────────────────────────────────────────────────────
create sequence if not exists meccha_seq;

-- ─── Fix existing difficulty CHECK constraint ───────────────────────────────────
-- Initial schema had ('easy', 'medium', 'hard'); M4 normalises to
-- ('easy', 'moderate', 'challenging').  Apply to existing rows.
alter table public.public_hides drop constraint if exists public_hides_difficulty_check;
alter table public.public_hides
  add constraint public_hides_difficulty_check
  check (difficulty in ('easy', 'moderate', 'challenging'));
update public.public_hides set difficulty = 'moderate' where difficulty = 'medium';

-- ─── New columns on public_hides ──────────────────────────────────────────────
-- identity_photo_url: moderator-only URL (private path), never public
-- clue_text: private while pending; public after approval
-- broad_area_label: approved public area label
-- faction_colour_confirmed: boolean declaration by hider
-- safety_declaration: JSONB checklist
-- moderator_notes: set on reject / request-info
-- mc_id: server-generated permanent public Meccha ID
-- submitted_by: references players(id), populated by trigger

alter table public.public_hides
  add column if not exists identity_photo_url text,
  add column if not exists clue_text text,
  add column if not exists broad_area_label text,
  add column if not exists faction_colour_confirmed boolean default false,
  add column if not exists safety_declaration jsonb default '{}'::jsonb,
  add column if not exists moderator_notes text,
  add column if not exists mc_id text,
  add column if not exists submitted_by uuid references public.players(id);

-- ─── mc_id BEFORE INSERT trigger ───────────────────────────────────────────────
-- PostgreSQL does not allow nextval() in a column DEFAULT and return the
-- generated value to the client in the same INSERT.  A BEFORE INSERT trigger
-- is the correct mechanism: it sets mc_id from the sequence before the row
-- is visible to RETURNING, and the value is reliably returned to the caller.
create or replace function public.generate_mc_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mc_id is null or new.mc_id = '' then
    new.mc_id := 'MC-RDG-' || lpad(nextval('public.meccha_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generate_mc_id on public.public_hides;
create trigger trg_generate_mc_id
  before insert on public.public_hides
  for each row
  execute function public.generate_mc_id();

-- Make mc_id not null after population (existing rows get values below)
update public.public_hides
  set mc_id = 'MC-RDG-' || lpad(nextval('public.meccha_seq')::text, 4, '0')
  where mc_id is null;
alter table public.public_hides alter column mc_id set not null;

-- ─── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists public_hides_status_created_at_idx
  on public.public_hides (status, created_at desc);

create index if not exists public_hides_player_created_at_idx
  on public.public_hides (player_id, created_at desc);

create index if not exists moderator_actions_target_idx
  on public.moderator_actions (target_type, target_id, created_at desc);

-- ─── Append-only trigger on moderator_actions ─────────────────────────────────
create or replace function public.block_moderator_actions_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'moderator_actions is append-only: UPDATE and DELETE are not permitted';
end;
$$;

drop trigger if exists block_moderator_actions_modification on public.moderator_actions;
create trigger block_moderator_actions_modification
  before update or delete on public.moderator_actions
  for each row
  execute function public.block_moderator_actions_modification();

-- ─── RLS: players can read their own submissions ───────────────────────────────
-- Players may see their own submissions in any status.
-- Live hides are readable by everyone (existing policy).
-- Moderators and service_role see all.
drop policy if exists "players can read their own public hides"
  on public.public_hides;
create policy "players_can_read_own_hides"
  on public.public_hides for select
  using (
    player_id = public.current_player_id()
    or status = 'live'
    or auth.role() = 'service_role'
  );

-- ─── submitted_by trigger (security invoker — no SECURITY DEFINER) ─────────────
-- This trigger runs with the caller's privileges.  It needs INSERT privilege
-- on public_hides, which is already granted to authenticated users via RLS.
-- SECURITY DEFINER is NOT needed here.
create or replace function public.set_submitted_by()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.submitted_by is null then
    new.submitted_by := new.player_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_public_hides_submitted_by on public.public_hides;
create trigger set_public_hides_submitted_by
  before insert on public.public_hides
  for each row
  execute function public.set_submitted_by();

-- ─── Rate-limiting helper ─────────────────────────────────────────────────────
-- Tracks hide submissions per player per hour for abuse prevention.
-- Used by the API to reject excessive submissions.
create table if not exists public.hide_submission_rate (
  player_id uuid primary key references public.players(id) on delete cascade,
  submissions_last_hour integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.hide_submission_rate enable row level security;
-- Service role only — players never touch this table directly
drop policy if exists "hide_submission_rate_all" on public.hide_submission_rate;
create policy "hide_submission_rate_service_role_only"
  on public.hide_submission_rate
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ─── Territory projection helper (used by API) ─────────────────────────────────
-- Returns the projected territory state for a given H3 cell based on live hides.
-- Does NOT persist — caller decides when to upsert territory_cells.
create or replace function public.project_territory_state(p_h3_cell text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
  v_faction text;
  v_state text;
  v_controller text;
begin
  select jsonb_object_agg(faction_val, cnt)
  into v_counts
  from (
    select faction as faction_val, count(*) as cnt
    from public.public_hides
    where h3_public_cell = p_h3_cell
      and status = 'live'
    group by faction
  ) s;

  if jsonb_object_keys(v_counts) is null then
    v_state := 'unclaimed';
    v_controller := null;
  elsif jsonb_object_keys(v_counts) = 1 then
    v_state := 'controlled';
    v_controller := (select * from jsonb_object_keys(v_counts) k limit 1);
  else
    v_state := 'contested';
    -- majority wins; null if tied
    select k into v_controller
    from jsonb_each(v_counts) d
    order by d.value desc
    limit 1;
    -- if top two are tied, controller is null (contested, no clear leader)
    declare
      top_cnt int;
      second_cnt int;
    begin
      select (jsonb_each_text(v_counts)).value::int into top_cnt
      from jsonb_each(v_counts) d order by (d.value)::int desc limit 1;
      select (jsonb_each_text(v_counts)).value::int into second_cnt
      from jsonb_each(v_counts) d order by (d.value)::int desc offset 1 limit 1;
      if top_cnt = coalesce(second_cnt, 0) then
        v_controller := null;
      end if;
    end;
  end if;

  return jsonb_build_object(
    'state', v_state,
    'controller_faction', v_controller,
    'active_hide_count', coalesce((select sum((value)::int) from jsonb_each_text(v_counts)), 0)
  );
end;
$$;

COMMIT;
