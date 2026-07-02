# M4 Office Hours — Meccha Chameleon Scout Deployment

**Status:** DONE (context gathering complete)
**Date:** 2026-07-02
**Branch:** main

---

## Context Gathered

### Codebase State (as of 2026-07-02)

**Auth & Session:**
- GitHub OAuth via `@supabase/ssr` cookie sessions
- `createServerAnonClient()` — SSR cookies, anon key
- `createServiceRoleClient()` — server-only, bypasses RLS
- No browser service role exposure

**Existing API Routes:**
- `GET /api/player/me` → `{ status, player: { id, displayName, faction } }`
- `POST /api/player/onboard` → Turnstile gate, faction-locked on insert
- `GET /api/territory` → GeoJSON FeatureCollection, `FORBIDDEN_KEYS` validation
- `GET /api/dashboard` → faction standings + player data
- `GET /api/health` → public health check

**Existing Schema:**
- `players` — faction-locked after insert, RLS: owner/service_role read, owner insert
- `private_hide_locations` — moderator/service_role only, PostGIS geometry
- `public_hides` — RLS: live-or-moderator select, moderator/service_role write
- `moderator_actions` — moderator/service_role only
- `territory_events` — public read, service_role insert
- `territory_cells` — public read, service_role write

**Turnstile:**
- `TURNSTILE_ENABLED=false` disables in staging/dev
- `middleware.ts` verifies on all POST to `/api/*` and `/dashboard/*`
- `src/app/onboarding/actions.ts` also has inline Turnstile verify

**EXIF Strip:**
- `src/lib/exif-strip.ts` → `sanitiseImage()` — JPEG (mozjpeg) + PNG paths
- Max 1600px longest edge, rotation applied, all EXIF stripped
- Returns fresh ArrayBuffer, no reference to input

**Migrations:**
- `001_initial_schema.sql` — full schema with RLS policies
- `002_m2_m3_player_onboarding_territory.sql` — players RLS fix, territory_cells table, public_player_profiles view
- `003_m2_m3_h3_seed_correction.sql` — correct res 7 cells, remove created_at from public_player_profiles, reset all cells to unclaimed

**Staging Deployment:**
- ADR-010: systemd + immutable releases + Nginx reverse proxy
- Staging hostname: `staging.meccha.fun`
- Media dirs: `/srv/meccha-chameleon-staging/media/public/clues/`, `/srv/...-staging/media/private/proofs/`
- Health check route confirmed at `/api/health`

---

## Office Hours Synthesis

### What M4 Must Build

**Deployment flow (player-facing):**
1. `/dashboard/deploy` — mobile-first form with: identity photo, clue photo, GPS coordinate picker, broad area label, codename, difficulty, safety checklist, faction-colour confirmation
2. `POST /api/hides` — receives exact GPS + clue data + photo, writes both `private_hide_locations` + `public_hides` via service role, EXIF strip + Sharp, H3 res 7 from server-side coordinate
3. `GET /api/hides/mine` — player's own submissions

**Moderation flow (moderator-facing):**
1. `/dashboard/moderation` — queue of `awaiting_moderation` hides
2. `GET /api/moderation/hides` — moderator queue
3. `POST /api/moderation/hides/[id]/approve` — approve + territory projection
4. `POST /api/moderation/hides/[id]/reject` — reject
5. `POST /api/moderation/hides/[id]/request-info` — request more info

**Territory projection (on approve):**
- Upsert `territory_cells` based on live hide counts per H3 cell
- Insert `territory_events` record

### Key Constraint Confirmed

Player submission CANNOT go through the browser Supabase client (RLS blocks it). Must be a server-side route using `createServiceRoleClient()` in a transaction.

### Scope Boundary

M4 does NOT include: seeker proof, capture, QR/NFC, re-hide, check-ins, expiry, production deployment.
