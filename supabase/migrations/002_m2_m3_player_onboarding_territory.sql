-- Migration: M2/3 Player Onboarding, RLS Privacy Fix, and Territory Map
-- ================================================================
-- (a) players table: user_id NOT NULL + unique indexes
alter table public.players alter column user_id set not null;
create unique index players_user_id_key on public.players (user_id);
create unique index players_display_name_lower_key on public.players (lower(display_name));

-- (b) Replace players SELECT policy: owner or service_role only
drop policy if exists "players are readable by everyone" on public.players;
create policy "players can only read own row or via service role"
  on public.players for select
  using (user_id = auth.uid() or auth.role() = 'service_role');

-- (c) public_player_profiles view: minimal public player data
create view public.public_player_profiles as
  select id, faction, display_name, created_at
  from public.players;

alter view public.public_player_profiles owner to postgres;
grant select on public.public_player_profiles to authenticated, anon;

-- (d) territory_cells table
create table public.territory_cells (
  h3_cell text primary key,
  area_label text not null,
  controller_faction public.faction_id,
  state text not null check (state in ('unclaimed', 'controlled', 'contested')),
  active_hide_count integer not null default 0,
  contested_hide_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.territory_cells enable row level security;

create policy "territory_cells are readable by everyone"
  on public.territory_cells for select using (true);

create policy "territory_cells can only be written by service role"
  on public.territory_cells for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- (e) Seed Reading pilot territory cells
-- These are real H3 res 7 cells covering Reading town centre.
-- State: 'controlled' = faction-controlled, 'unclaimed' = founding cells.
-- controller_faction: NULL for unclaimed cells.
insert into public.territory_cells (h3_cell, area_label, controller_faction, state, active_hide_count, contested_hide_count) values
  ('89194ad2c6fffff', 'Forbury Loop',       'verdant', 'controlled',   2, 0),
  ('89194ad2c2bffff', 'Oracle Crossing',     'tide',    'contested',    1, 1),
  ('89194ad35a7ffff', 'Station North',      'ember',   'controlled',    1, 0),
  ('89194ad2837ffff', 'Abbey Quarter',       'tide',    'controlled',    1, 0),
  ('89194ad34cbffff', 'Caversham Bridge',    NULL,      'unclaimed',    0, 0),
  ('89194ad2813ffff', 'Museum Quarter',      NULL,      'unclaimed',    0, 0),
  ('87194ad2bffffff', 'Cavity Wall',          'verdant', 'controlled',   0, 0),
  ('87194ad2cffffff', 'Southcote Loop',      'ember',   'controlled',    0, 0);
