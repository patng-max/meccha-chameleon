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

## Milestone 2/3: Player Identity, Factions & First Playable Territory Map ✅ IN PROGRESS

**Status:** Merged from former M2 + M3. Combined to ship one coherent playable experience.

**What ships:**
- GitHub OAuth sign-in + SSR session handling (existing callback wired up)
- First-time player onboarding: faction selection + display name + confirmation
- Player dashboard: faction badge, display name, starter status, Reading founding mission, territory-map entry point
- Faction-change rule: 30-day cooldown (future change mechanism; locked for pilot)
- Fixed `players` RLS: direct table reads locked to owner/moderator/service_role; `public_player_profiles` view (display_name, faction, created_at) for public game data
- New migration: `002_m2_m3_player_onboarding_territory.sql`
- API routes with explicit DTOs: `GET /api/player/me`, `POST /api/player/onboard`, `GET /api/dashboard`, `GET /api/territory`
- `territory_cells` table (materialized, seeded for Reading pilot)
- MapLibre GL JS client-only territory map: H3 cell polygons, neutral/controlled/contested states, OpenFreeMap default
- Correct H3→GeoJSON coordinate conversion: `[lat, lng]` → `[lng, lat]`, ring closure
- Cell tap: safe public details (area label, status, controller, hide counts); unclaimed cells show "Found this territory" explanation
- Vitest test foundation: H3→GeoJSON ordering, forbidden key leakage, onboarding schema, RLS boundaries
- Playwright skeleton: redirect tests, public page render, API privacy check

**Acceptance criteria:**
- [ ] Fresh user can sign in, select faction, set display name, reach dashboard
- [ ] Signed-in user can open a functioning Reading map on mobile viewport
- [ ] Map uses H3 polygon cells; no pins, markers, or exact location data rendered
- [ ] Public map API payloads contain no exact coordinates or private_location identifiers
- [ ] Public player data cannot expose user_id, last_active_at, or internal fields
- [ ] `players` RLS locked; `public_player_profiles` view is the only public player data path
- [ ] Faction display names globally unique and case-insensitive
- [ ] Unclaimed cells show "Found this territory" / "Coming soon" explanation
- [ ] Lint, type check, production build, and focused tests all pass

**Risks:**
- `players` RLS remains too broad (current state) — fixed in migration 002
- MapLibre accidentally renders points/markers — GeoJSON builder centralized, Polygon-only output tested
- API returns raw Supabase rows with private_location_id — explicit DTO mapping, no table passthrough
- h3-utils coordinate ordering wrong — `[lat,lng]` → `[lng,lat]` reversal fixed + unit tested
- OAuth E2E blocks CI — unit-test mappers, skeleton Playwright, live OAuth deferred

**Gstack planning artifacts:** `docs/gstack/meccha-m2-office-hours.md`, `docs/gstack/meccha-m2-ceo-review.md`, `docs/gstack/meccha-m2-eng-review.md`

---

## Milestone 4: Hider Deployment Flow with Moderation

**What ships:**
- Hide submission form: GPS coordinate picker, approximate area label, clue photo upload, difficulty, safety checklist
- Server-side: exact GPS → H3 res 7 cell computation → insert `private_hide_locations` + `public_hides`
- EXIF stripping + Sharp resize (max 1600px) before write to VPS persistent storage (`/srv/meccha-chameleon/media/public/clues/`)
- Media upload API route writes to VPS, not Supabase Storage
- Moderation queue: list of `awaiting_moderation` hides with approve/reject actions
- Moderator actions: approve (set status='live'), reject (set status='retired'), request more info
- `moderator_actions` audit log entries written on every moderation decision

**Acceptance criteria:**
- [ ] Player can submit a hide with GPS coordinates (exact, stored server-only)
- [ ] Clue photo is EXIF-stripped before storage; original never stored
- [ ] Submitted hide appears in moderation queue with status `awaiting_moderation`
- [ ] Moderator can approve or reject; decision updates `public_hides.status`
- [ ] Approved hides become live (visible on territory map)
- [ ] `moderator_actions` row written on every moderation decision

**Risks:**
- GPS accuracy: player-submitted coordinates may be imprecise
- Clue photo quality: moderators need clear guidance on what to approve/reject

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

### Performance
- MapLibre cell rendering: limit to viewport cells only for large cities
- Supabase query pagination on moderation queue
- Image CDN via Cloudflare (public clue media) + authenticated application routes (private proof media)