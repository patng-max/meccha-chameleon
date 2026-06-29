create extension if not exists postgis with schema public;
create extension if not exists pgcrypto with schema public;

create type public.faction_id as enum ('verdant', 'ember', 'tide');
create type public.hide_status as enum (
  'awaiting_moderation',
  'live',
  'weakened',
  'captured',
  'lost',
  'expired',
  'retired',
  'disputed'
);
create type public.capture_state as enum (
  'submitted',
  'needs_more_evidence',
  'approved',
  'rejected',
  'expired',
  'superseded'
);
create type public.check_in_state as enum ('pending', 'confirmed', 'missed');

create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  faction public.faction_id not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table public.private_hide_locations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  exact_location public.geometry(point, 4326) not null,
  h3_private_cell text not null,
  submitted_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.public_hides (
  id uuid primary key default gen_random_uuid(),
  private_location_id uuid not null references public.private_hide_locations(id),
  player_id uuid not null references public.players(id),
  faction public.faction_id not null,
  codename text not null,
  clue_photo_url text,
  clue_text text not null,
  approximate_area_label text not null,
  h3_public_cell text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  safety_checklist jsonb not null default '{}'::jsonb,
  status public.hide_status not null default 'awaiting_moderation',
  moderated_at timestamptz,
  moderated_by uuid,
  created_at timestamptz not null default now()
);

create table public.capture_claims (
  id uuid primary key default gen_random_uuid(),
  hide_id uuid not null references public.public_hides(id),
  claimant_id uuid not null references public.players(id),
  proof_photo_url text,
  verification_code text,
  state public.capture_state not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_notes text
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  hide_id uuid not null references public.public_hides(id),
  player_id uuid not null references public.players(id),
  state public.check_in_state not null default 'pending',
  checked_in_at timestamptz,
  reminder_sent_at timestamptz
);

create table public.territory_events (
  id uuid primary key default gen_random_uuid(),
  h3_cell text not null,
  event_type text not null,
  faction public.faction_id,
  hide_id uuid references public.public_hides(id),
  capture_claim_id uuid references public.capture_claims(id),
  player_id uuid references public.players(id),
  territory_state text,
  created_at timestamptz not null default now()
);

create table public.moderator_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.players(id),
  action_type text not null,
  target_id uuid not null,
  target_type text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index private_hide_locations_exact_location_idx
  on public.private_hide_locations using gist (exact_location);
create index public_hides_status_idx on public.public_hides (status);
create index public_hides_h3_public_cell_idx on public.public_hides (h3_public_cell);
create index territory_events_h3_cell_created_at_idx
  on public.territory_events (h3_cell, created_at desc);

alter table public.players enable row level security;
alter table public.private_hide_locations enable row level security;
alter table public.public_hides enable row level security;
alter table public.capture_claims enable row level security;
alter table public.check_ins enable row level security;
alter table public.territory_events enable row level security;
alter table public.moderator_actions enable row level security;

create function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.players where user_id = auth.uid() limit 1
$$;

create function public.is_moderator()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('moderator', 'service_role')
    or auth.role() = 'service_role'
$$;

create policy "players are readable by everyone"
  on public.players for select
  using (true);

create policy "players can insert themselves"
  on public.players for insert
  with check (user_id = auth.uid() or auth.role() = 'service_role');

create policy "players can update themselves"
  on public.players for update
  using (user_id = auth.uid() or auth.role() = 'service_role')
  with check (user_id = auth.uid() or auth.role() = 'service_role');

create policy "live public hides are readable"
  on public.public_hides for select
  using (status = 'live' or public.is_moderator() or auth.role() = 'service_role');

create policy "moderators manage public hides"
  on public.public_hides for all
  using (public.is_moderator() or auth.role() = 'service_role')
  with check (public.is_moderator() or auth.role() = 'service_role');

create policy "capture claims are readable by owner or moderator"
  on public.capture_claims for select
  using (
    claimant_id = public.current_player_id()
    or public.is_moderator()
    or auth.role() = 'service_role'
  );

create policy "players submit own capture claims"
  on public.capture_claims for insert
  with check (
    claimant_id = public.current_player_id()
    or public.is_moderator()
    or auth.role() = 'service_role'
  );

create policy "owners or moderators update capture claims"
  on public.capture_claims for update
  using (
    claimant_id = public.current_player_id()
    or public.is_moderator()
    or auth.role() = 'service_role'
  )
  with check (
    claimant_id = public.current_player_id()
    or public.is_moderator()
    or auth.role() = 'service_role'
  );

create policy "owners or moderators delete capture claims"
  on public.capture_claims for delete
  using (
    claimant_id = public.current_player_id()
    or public.is_moderator()
    or auth.role() = 'service_role'
  );

create policy "private locations require moderator or service role"
  on public.private_hide_locations for all
  using (public.is_moderator() or auth.role() = 'service_role')
  with check (public.is_moderator() or auth.role() = 'service_role');

create policy "territory events are readable by everyone"
  on public.territory_events for select
  using (true);

create policy "service role inserts territory events"
  on public.territory_events for insert
  with check (auth.role() = 'service_role');

create policy "check ins are accessible by owner or service role"
  on public.check_ins for all
  using (player_id = public.current_player_id() or auth.role() = 'service_role')
  with check (player_id = public.current_player_id() or auth.role() = 'service_role');

create policy "moderator actions require moderator or service role"
  on public.moderator_actions for all
  using (public.is_moderator() or auth.role() = 'service_role')
  with check (public.is_moderator() or auth.role() = 'service_role');
