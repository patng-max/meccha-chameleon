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

## Milestone 2: Factions + Player Identity + Auth Completion

**What ships:**
- Player onboarding flow: sign in → select faction → set display name
- Player profile page: faction badge, display name, owned hides, capture stats
- Faction dashboard: scoreboard, active hides, territory map (static initially)
- Protected routes (`/dashboard`, `/api/*`) fully gated — auth + Turnstile
- Supabase Storage buckets configured: `clue-photos`, `proof-photos`
- `src/lib/supabase/server.ts` `createServiceRoleClient()` used in API routes

**Acceptance criteria:**
- [ ] Player can sign in with GitHub OAuth and reach faction selection
- [ ] Player can select a faction and set display name (stored in `players` table)
- [ ] Unauthenticated requests to `/dashboard` redirect to `/`
- [ ] Authenticated player sees their faction stats on profile page
- [ ] Turnstile challenge fires on POST to `/api/*` routes

**Risks:**
- GitHub OAuth scope creep — limit to `read:user` and `user:email`
- Turnstile widget not rendering — ensure `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set

---

## Milestone 3: Public Territory Map with MapLibre

**What ships:**
- MapLibre GL JS component rendered on faction dashboard
- H3 res 7 cell polygons coloured by controller faction
- Cell popup: cell label, approximate area, controller faction, active hides
- OpenFreeMap tiles (default) + MapTiler fallback
- No exact coordinates on map — only H3 cell boundaries

**Acceptance criteria:**
- [ ] Map renders in browser with correct H3 cell polygons for Reading pilot
- [ ] Cells are coloured by faction (Verdant=green, Ember=red, Tide=blue, Unclaimed=grey, Contested=yellow)
- [ ] Cell labels and approximate area shown in popup
- [ ] No exact coordinates (no markers, no pins, no PostGIS points)
- [ ] Map loads without MapTiler key (OpenFreeMap fallback)

**Risks:**
- MapTiler / OpenFreeMap tile availability in pilot region
- Large number of cells rendering performance on mobile

---

## Milestone 4: Hider Deployment Flow with Moderation

**What ships:**
- Hide submission form: GPS coordinate picker, approximate area label, clue photo upload, difficulty, safety checklist
- Server-side: exact GPS → H3 res 7 cell computation → insert `private_hide_locations` + `public_hides`
- EXIF stripping before upload to Supabase Storage
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
- Image CDN via Supabase Storage CDN (not origin-only)