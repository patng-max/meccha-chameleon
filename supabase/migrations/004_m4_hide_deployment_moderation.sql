-- M4: Hide Deployment, Faction Enforcement & Moderator Approval
-- Adds columns to public_hides, indexes, sequence for Meccha IDs,
-- append-only trigger on moderator_actions, and territory projection helpers.

-- ─── Meccha ID sequence ────────────────────────────────────────────────────────
create sequence if not exists meccha_seq;

-- ─── Fix existing difficulty CHECK constraint ───────────────────────────────────
-- The initial schema had check (difficulty in ('easy', 'medium', 'hard'))
-- M4 form uses ('easy', 'moderate', 'challenging'). Drop old, add new.
alter table public.public_hides drop constraint if exists public_hides_difficulty_check;
alter table public.public_hides
  add constraint public_hides_difficulty_check
  check (difficulty in ('easy', 'moderate', 'challenging'));

-- Normalise existing rows from old vocabulary to new vocabulary
update public.public_hides set difficulty = 'moderate' where difficulty = 'medium' returning 1;

-- ─── New columns on public_hides ──────────────────────────────────────────────
-- difficulty and codename already exist from initial schema — skip them
alter table public.public_hides
  add column if not exists broad_area_label text,
  add column if not exists faction_colour_confirmed boolean default false,
  add column if not exists safety_declaration jsonb default '{}'::jsonb,
  add column if not exists moderator_notes text,
  add column if not exists mc_id text default ('MC-RDG-' || lpad(nextval('meccha_seq')::text, 4, '0')),
  add column if not exists submitted_by uuid references public.players(id);

-- approximate_area_label NOT NULL is fine — existing rows have values

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

-- ─── RLS: allow players to read their own submissions ─────────────────────────
-- Players can see their own submissions regardless of status.
create policy "players can read their own public hides"
  on public.public_hides for select
  using (player_id = public.current_player_id()
          or status = 'live'
          or public.is_moderator()
          or auth.role() = 'service_role');

-- ─── submitted_by trigger (set default from player_id) ─────────────────────────
create or replace function public.set_submitted_by()
returns trigger
language plpgsql
security definer
set search_path = public
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
