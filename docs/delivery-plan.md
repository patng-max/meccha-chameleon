# Delivery Plan — Meccha Chameleon: Faction Hunt

> **Authority:** Committed from validated codebase baseline (Milestone 1).
> Each milestone ships real product value. No milestone is complete until acceptance criteria are met.

---

## Milestone 1: Repository + Foundation ✅ DONE

**What was built:**
- Next.js 16 + TypeScript project scaffold
- Supabase database schema (7 tables, all with RLS)
- `is_moderator()` and `current_player_id()` security functions
- Cloudflare Turnstile middleware
- Supabase Auth (GitHub OAuth) + SSR cookie sessions
- EXIF stripping via Sharp (JPEG + PNG)
- H3 res 7 utilities (`latLngToCell`, `cellToBoundary`)
- Static landing page with factions, territory preview, hunt flow, safety rules
- Environment variable model (NEXT_PUBLIC_ only for safe anon keys)
- No hardcoded credentials; clean deployment config

**Acceptance criteria — all met:**
- [x] Schema: `private_hide_locations` isolated from normal users
- [x] RLS: normal authenticated users cannot select from `private_hide_locations`
- [x] EXIF: sharp re-encode strips all GPS metadata (JPEG + PNG)
- [x] Credentials: service role key has no `NEXT_PUBLIC_` prefix
- [x] Auth: Turnstile gates protected POST routes
- [x] Landing page: no exact coordinates rendered

**Known gaps:**
- No test files
- No API routes yet
- No MapLibre map component yet
- No upload flow yet (upload endpoint stub only)

---

## Milestone 2/3: Player Identity, Factions & First Playable Territory Map ✅ DONE

**Evidence:** Staging smoke tests completed 2026-07-02 — OAuth login, onboarding faction selection, dashboard redirect, Reading map at `/dashboard/map` all confirmed working via browser automation.

**What shipped:**
- GitHub OAuth sign-in + SSR session handling (existing callback wired up)
- First-time player onboarding: faction selection + display name + confirmation
- Player dashboard: faction badge, display name, starter status, Reading founding mission, territory-map entry point
- Faction-change rule: locked after initial selection (pilot)
- Fixed `players` RLS: direct table reads locked to owner/moderator/service_role; `public_player_profiles` view (display_name, faction) for public game data — **does NOT expose `created_at`**
- Migration `002_m2_m3_player_onboarding_territory.sql` + correction migration `003_m2_m3_h3_seed_correction.sql`
- API routes with explicit DTOs: `GET /api/player/me`, `POST /api/player/onboard`, `GET /api/dashboard`, `GET /api/territory`
- `territory_cells` table (materialized, seeded for Reading pilot at H3 res 7)
- MapLibre GL JS client-only territory map: H3 cell polygons, neutral/controlled/contested states, OpenFreeMap default
- Correct H3→GeoJSON coordinate conversion: `[lat, lng]` → `[lng, lat]`, ring closure
- Cell tap: safe public details (area label, status, controller, hide counts); unclaimed cells show "Scout deployment opens in the next game phase" explanation
- Vitest test foundation: H3→GeoJSON ordering, forbidden key leakage, onboarding schema, RLS boundaries
- Playwright skeleton: redirect tests, public page render, API privacy check

**Gstack planning artifacts:** `docs/gstack/meccha-m2-office-hours.md`, `docs/gstack/meccha-m2-ceo-review.md`, `docs/gstack/meccha-m2-eng-review.md`

---

## Milestone 2/3b: Staging Deployment ✅ DONE

**Evidence:** Live deployment confirmed at `https://staging.meccha.fun`. Health endpoint returns `{"status":"healthy"}`. Auto-rollback on failed health check tested. Deployment workflow (`staging.yml`) verified on multiple pushes. VPS systemd + nginx configuration verified.

**What shipped:**
- `GET /api/health` route — returns `{"status":"healthy"}` with no secrets
- Next.js `output: "standalone"` in `next.config.ts`
- Immutable release model: `/opt/meccha-chameleon/staging/releases/<ts>-<sha>/`, symlink at `current`
- `.github/workflows/staging.yml` — CI gates + artifact build + SCP deploy + health verification with auto-rollback
- systemd service: `meccha-chameleon-staging.service` binds to `127.0.0.1:4201`
- Nginx: `proxy_buffer_size 128k` + `proxy_buffers 8 256k` for Supabase auth Set-Cookie headers
- Persistent media dirs: `/srv/meccha-chameleon-staging/media/public/clues/`, `/srv/meccha-chameleon-staging/media/private/proofs/`
- Supabase staging project (`rquntpbnpvslnnjzaaxd`) OAuth redirect for `https://staging.meccha.fun/auth/callback`
- Shared env file: `/opt/meccha-chameleon/staging/shared/.env.production` with `TURNSTILE_ENABLED=false`, `SITE_URL=https://staging.meccha.fun`

**Staging hostname:** `staging.meccha.fun` (consistent throughout docs)

**Gstack planning artifacts:** `docs/gstack/meccha-staging-office-hours.md`, `docs/gstack/meccha-staging-ceo-review.md`, `docs/gstack/meccha-staging-eng-review.md`

---

## Milestone 4: Scout Deployment, Faction Enforcement & Moderator Approval ⏳ IN PROGRESS

**What ships:**
Player-facing:
- `/dashboard/deploy` — mobile-first deployment form
- `POST /api/hides` — authenticated hide submission, server-side faction derivation, Sharp EXIF strip, H3 res 7 computation, media write to VPS
- `GET /api/hides/mine` — player's own submissions
- Faction-colour enforcement: deployment faction locked to player's faction; confirmation checkbox required
- Permanent public Meccha ID: server-generated, format `MC-RDG-{sequential}` (Reading pilot)
- Safety checklist: 6-point declaration covering property, access, restricted areas, safety, public access, no PII/imagery
- Difficulty selector: easy/moderate/challenging

Moderator-facing:
- `/dashboard/moderation` — pending queue
- `GET /api/moderation/hides` — moderator queue with private details
- `POST /api/moderation/hides/[id]/approve` — approve + promote clue photo to public path + territory projection
- `POST /api/moderation/hides/[id]/reject` — reject with player-visible reason
- `POST /api/moderation/hides/[id]/request-info` — request more info (stays awaiting_moderation)

Server-side:
- Append-only `moderator_actions` with DB-level immutability trigger (UPDATE/DELETE blocked)
- `private_hide_locations`: exact coordinate stored server-only via service role
- `public_hides`: status state machine (awaiting_moderation → live → retired)
- Territory projection on approval: 0→unclaimed, 1 faction→controlled, 2+ factions→contested
- `territory_events`: append-only log of every territory state change
- Media: raw buffer never written; Sharp re-encode always; pending → private path → approved → public path

**Acceptance criteria:**
- [ ] Player can submit a deployment with: private identity photo, clue photo, exact coordinate, broad area label, codename, difficulty, safety declaration, faction-colour confirmation
- [ ] Player cannot choose a different faction from their own
- [ ] Pending media is never publicly reachable (Nginx 404 on private paths)
- [ ] Uploaded originals are never persisted; stored images are sanitised and EXIF/GPS-free
- [ ] Moderator can approve, reject, or request changes
- [ ] Every moderator decision creates an append-only `moderator_actions` row
- [ ] Approval promotes only the clue photo to the public media path
- [ ] Approval turns an unclaimed H3 cell into controlled territory for the correct faction
- [ ] A second approved rival-faction deployment in the same cell changes it to contested
- [ ] Public map/API payloads expose no exact coordinates, private_location IDs, pending media paths, identity photos, or secrets
- [ ] RLS and application authorization block direct browser access to private records
- [ ] Rate limit, enabled-mode Turnstile, faction lock, H3 calculation, EXIF stripping, media visibility, moderation state transitions, and territory updates all have focused automated tests
- [ ] Lint, type check, tests, production build pass

**Privacy rules (enforced in code and tests):**
- Exact coordinates never returned to browser, never in logs, error messages, image paths, map payloads
- Public representation: H3 res 7 cell + broad approved area label only
- `public_hides` to browser: no exact_location, private_location_id, ST_X, ST_Y, user_id
- Identity photos: permanent moderator-only, never promoted to public path
- Public clue photos: promoted only after approval, served via Nginx with Cache-Control

**Turnstile:**
- When `TURNSTILE_ENABLED=true`: widget renders on deployment form, server verifies
- When `TURNSTILE_ENABLED=false`: skips gracefully (no widget rendered, no 403)
- Staging uses `TURNSTILE_ENABLED=false` for M4
- Production requires end-to-end staging test before enabling

**Gstack planning artifacts:** `docs/gstack/meccha-m4-office-hours.md`, `docs/gstack/meccha-m4-ceo-review.md`, `docs/gstack/meccha-m4-eng-review.md`

---

## Milestone 5: Seeker Proof and Capture Flow

**What ships:**
- Live hides visible on map (with approximate area label, not exact GPS)
- Hide detail page: clue text + clue photo, difficulty, safety rules
- Proof submission form: proof photo upload, optional verification code
- EXIF stripping on proof photos before storage
- Capture claim inserted with `state='submitted'`
- Moderator review of capture proof: approve / reject / request more evidence
- Approved captures: `capture_claims.state='approved'`, hide status → `captured` or `weakened`

**Acceptance criteria:**
- [ ] Seeker can view clue for any live hide
- [ ] Seeker can submit proof photo (EXIF-stripped) for a live hide
- [ ] Proof photo not visible to other players (only moderator + claimant)
- [ ] Moderator can approve/reject proof; state transitions recorded
- [ ] Approved capture updates hide status and triggers territory event

**Risks:**
- Proof photo might contain GPS EXIF if not stripped client-side before upload (mitigated: server strips on receipt)
- Verifier gaming: claimants submitting proof from elsewhere

---

## Milestone 6: Territory Calculation and Maintenance Processing

**What ships:**
- Territory recalculation: server job reads latest approved captures per H3 cell, determines cell controller
- `territory_events` append-only log: every cell state change recorded
- Automatic hide expiry: hides past `expires_at` → status='expired'
- Check-in system: player must confirm hide is still active; missed check-in → status='weakened'
- VPS systemd timers for: hide-expiry-check, check-in-reminder, territory-recalculate, moderator-escalation

**Acceptance criteria:**
- [ ] Approved capture on a live hide's cell flips or weakens the cell controller
- [ ] `territory_events` log is complete and public-readable
- [ ] Expired hides no longer appear on map as live
- [ ] Missed check-ins trigger status weakening within 1 hour
- [ ] Systemd timers are installed and running on VPS

**Risks:**
- Race condition: simultaneous captures on same cell (mitigated: service_role client, atomic transactions)
- Timer reliability on VPS restart

---

## Milestone 7: Moderation, Safety, Privacy, Pilot Hardening

**What ships:**
- Safety rules enforcement: reject criteria clearly documented, moderation checklist in UI
- Abuse prevention: rate limiting on submission endpoints, duplicate detection
- Audit trail: all moderator actions logged in `moderator_actions`
- Privacy audit: confirmed no coordinate leak vectors in production
- Pilot acceptance test suite (see `docs/test-strategy.md`)
- Staging environment fully mirroring production
- Deployment pipeline: GitHub Actions → Docker → VPS
- Persistent media directories provisioned at deploy time (`/srv/meccha-chameleon/media/public/clues/`, `/srv/meccha-chameleon/media/private/proofs/`)
- Nginx configured for public media serving + private media proxy routes
- Cloudflare Cache Rules configured: public clues cached (max-age=31536000, immutable), private proofs excluded (bypass)
- Backup runbook for media directory restore documented (`docs/runbooks/media-restore.md`)

**Acceptance criteria:**
- [ ] No way to retrieve `private_hide_locations.exact_location` via browser API
- [ ] All moderation decisions have audit log entries
- [ ] Rate limiting prevents submission flooding (e.g., >10 hides/hour from same player)
- [ ] CI passes: lint, type-check, unit tests
- [ ] Staging deploys automatically on `main` branch push
- [ ] Production deploy requires explicit promotion from staging

**Risks:**
- Real-world safety incidents (player injury) — requires legal disclaimer and clear rules on landing page
- Supabase project limits (storage, bandwidth) at scale

---

## Cross-Cutting Concerns

### Security (always-on)
- Exact coordinates never reach browser, logs, or map payloads
- Service role key never has `NEXT_PUBLIC_` prefix
- All uploads EXIF-stripped server-side before storage
- Turnstile on all protected POST routes
- RLS enforced at database layer (not just application layer)

### Privacy
- H3 res 7 (~0.73 km²) provides acceptable approximate location privacy
- No cross-referencing of public_hides and private_hide_locations possible via browser queries
- Players table is publicly readable (name + faction only) — acceptable for game
- Public player profiles: `id`, `faction`, `display_name` only — **no `created_at`**

### Performance
- MapLibre cell rendering: limit to viewport cells only for large cities
- Supabase query pagination on moderation queue
- Image CDN via Cloudflare (public clue media) + authenticated application routes (private proof media)
