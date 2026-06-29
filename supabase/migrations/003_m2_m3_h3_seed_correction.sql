-- Migration: M2/3 H3 Seed Correction and Fictional State Reset
-- =============================================================
-- CORRECTION SUMMARY
-- 1. Removes all fictional controlled/contested territory from migration 002.
--    All territory_cells rows are reset to honest unclaimed state.
-- 2. Replaces the H3 seed cells with cells validated as resolution 7
--    via getResolution() === 7 from h3-js. The previous migration 002
--    contained cells at mixed resolutions (mostly res 9) which is wrong.
-- 3. Removes created_at from public_player_profiles view (privacy minimisation).
--
-- Representative coordinates used for seed generation (all public landmarks):
--   Reading Town Centre: lat=51.454, lng=-0.974
--   Forbury Gardens:    lat=51.456, lng=-0.971
--   Reading Station:    lat=51.4563, lng=-0.9638
--   Caversham:          lat=51.465, lng=-0.968
--   Abbey Quarter:      lat=51.459, lng=-0.978
--   Oracle:             lat=51.452, lng=-0.969
--   Whitley:            lat=51.444, lng=-0.985
--   Tilehurst:          lat=51.464, lng=-1.008
--   South Reading:      lat=51.438, lng=-0.975
--
-- All seed cells confirmed as res 7 via getResolution() === 7.
-- All seed cells are unclaimed — no faction control invented for M2/3.

BEGIN;

-- ── Step 1: Reset all existing territory_cells to honest unclaimed state ─────
-- This removes the fictional controlled/contested state from migration 002.
UPDATE public.territory_cells
SET
  state = 'unclaimed',
  controller_faction = NULL,
  active_hide_count = 0,
  contested_hide_count = 0;

-- Verify: controlled and contested counts should now be 0
-- SELECT state, COUNT(*) FROM territory_cells GROUP BY state;
-- Expected: only 'unclaimed' rows

-- ── Step 2: Delete the incorrect-mixed-resolution seed cells ─────────────────
-- Migration 002 inserted cells that were mostly res 9, not res 7.
-- We delete all and re-insert only validated res 7 cells.
DELETE FROM public.territory_cells;

-- ── Step 3: Insert validated H3 res 7 cells covering Reading ─────────────────
-- All cells verified as res 7 via getResolution(cell) === 7 from h3-js.
-- Source coordinates: public landmarks (Wikipedia, public transport data).
-- All cells are unclaimed — no faction ownership invented.
INSERT INTO public.territory_cells (h3_cell, area_label, controller_faction, state, active_hide_count, contested_hide_count)
VALUES
  ('87195d2b1ffffff', 'Reading Town Centre', NULL, 'unclaimed', 0, 0),
  ('87195d2b5ffffff', 'Caversham',           NULL, 'unclaimed', 0, 0),
  ('87195d2b0ffffff', 'Abbey Quarter',       NULL, 'unclaimed', 0, 0),
  ('87195d2b3ffffff', 'Whitley',             NULL, 'unclaimed', 0, 0),
  ('87195d2b2ffffff', 'Tilehurst',           NULL, 'unclaimed', 0, 0),
  ('87195d2b6ffffff', 'South Reading',       NULL, 'unclaimed', 0, 0);

-- ── Step 4: Minimise public_player_profiles — remove created_at ─────────────
-- created_at is not needed by any M2/3 feature and is removed to minimise
-- exposed player data surface.
CREATE OR REPLACE VIEW public.public_player_profiles AS
  SELECT id, faction, display_name
  FROM public.players;

COMMIT;
