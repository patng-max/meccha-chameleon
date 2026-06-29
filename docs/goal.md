# Meccha Chameleon: Faction Hunt — Product Goal

> **Status:** `docs/goal.md` created from validated codebase baseline (Milestone 1).
> Prior /goal, /office-hours, /plan-ceo-review, /plan-eng-review outputs were NOT committed.
> This document establishes the authoritative committed baseline.

---

## Product Vision

**Meccha Chameleon: Faction Hunt** is a real-world geolocation capture game where players hide physical Meccha Chameleon figures in safe public locations, publish clue photos (EXIF-stripped), and compete for territory control — one H3 cell at a time.

The game has **three factions** competing across cities:
- **Verdant Circuit** — "Patient scouts who turn parks, plazas, and paths into living routes."
- **Ember Relay** — "Fast challengers who use street-level clues and quick captures."
- **Tide Assembly** — "Coordinated crews who sweep riverside routes and transport hubs."

**Privacy-first architecture:** Exact hide coordinates are server-only, never exposed to the browser, public APIs, logs, or map payloads.

**Pilot city:** Reading, UK. All other cities start as unclaimed "founding missions."

---

## Game Rules

### Core Loop

1. **Place** — A player picks a safe public location, submits the exact GPS privately (stored in `private_hide_locations`), and publishes an approximate area label + EXIF-stripped clue photo.
2. **Moderate** — Staff approve safety, public access, clue quality, and city eligibility before the hide goes live and affects territory.
3. **Seek** — Rivals use the clue to locate the hide and submit a proof photo privately.
4. **Capture** — Moderators review the proof. Approved captures weaken or flip the H3 cell without exposing finder coordinates.
5. **Territory** — The H3 cell (res 7, ~0.73 km²) updates controllerfaction based on the most recent approved capture event.

### H3 Cell Geography

- **Resolution 7** — cell edge ≈ 0.917 km, area ≈ **0.73 km²**
- A city the size of Reading (~88 km²) has ~120 H3 res 7 cells — appropriate for city-level territory games
- Cell boundaries are public (safe for map rendering); exact hide coordinates are never public

### Faction Mechanics

- Factions accumulate score and cell count based on active (live) hides and approved captures
- Cells transition: `founding → secure → weakened → captured/lost`
- Check-ins required to keep hides active; missed check-ins weaken the cell

### Moderation-gated Deployment

All hides go through a safety checklist before becoming live:
- No private land, roads, restricted areas, schools, or risky placements
- Visible from a public path, no climbing required
- Clue photo quality and city eligibility confirmed

---

## Delivery Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1 | Repository + foundation — Next.js, Supabase schema, RLS, auth, EXIF strip, H3, landing page | ✅ DONE |
| M2 | Factions + player identity + auth completion | ⏳ NEXT |
| M3 | Public territory map with MapLibre | ⏳ |
| M4 | Hider deployment flow with moderation | ⏳ |
| M5 | Seeker proof and capture flow | ⏳ |
| M6 | Territory calculation and maintenance processing | ⏳ |
| M7 | Moderation, safety, privacy, pilot hardening | ⏳ |

### M2: Factions + Player Identity + Auth Completion

**What ships:**
- Player onboarding: faction selection, display name, GitHub OAuth
- Auth middleware: Cloudflare Turnstile for bot protection on protected routes
- Player profile page (faction badge, stats, owned hides)
- Faction dashboard: scoreboard, active hides, territory map

**Acceptance criteria:**
- Player can sign in with GitHub OAuth and select a faction
- Authenticated player sees their faction dashboard
- Protected routes (`/api`, `/dashboard`) blocked for unauthenticated users
- Turnstile challenge fires on POST to protected routes

**Risks:**
- GitHub OAuth scopes may need review for production
- Turnstile bypass via GET-only endpoints (mitigated: sensitive ops are POST)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Players hide in unsafe/restricted locations | Medium | High | Moderation gate before any hide affects territory |
| EXIF data leaks from re-encoded images | Low | High | Sharp re-encode strips all metadata; JPEG/PNG both covered |
| Coordinate leak via client Supabase queries | Low | Critical | RLS blocks `private_hide_locations` for all non-moderators |
| Bot signups via OAuth | Medium | Medium | Turnstile on protected POST routes; rate limiting at VPS layer |
| H3 cell gaming (fake GPS placements) | Medium | Medium | Moderator review of approximate area plausibility |
| Supabase service role key exposed | Low | Critical | Key never has `NEXT_PUBLIC_` prefix; server-only in env |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (React 19) |
| Database | Supabase (PostgreSQL + PostGIS + RLS) |
| Auth | Supabase Auth (GitHub OAuth) |
| Map | MapLibre GL JS + MapTiler / OpenFreeMap |
| Image processing | Sharp (EXIF strip) |
| Bot protection | Cloudflare Turnstile |
| Deployment | VPS (Docker, systemd timers) |

---

## Privacy Model (summary)

- `private_hide_locations.exact_location` — PostGIS `geometry(point, 4326)`, RLS: moderator/service_role only
- `public_hides` — H3 res 7 cell, approximate area label, clue photo URL, clue text, difficulty. NO exact coordinates.
- EXIF stripped from all uploaded photos before storage
- H3 cell boundaries are public (safe for map tiles); exact coordinates never leave server