# Architecture Decision Records — Meccha Chameleon: Faction Hunt

> **Authority:** Committed from validated codebase baseline (Milestone 1).
> All ADRs must be committed to `docs/architecture.md` before implementation of the referenced component.

---

## ADR-001: Public H3 Zones vs. Private Exact Coordinates

### Status
Accepted.

### Context
Players submit exact GPS when placing a hide. The public game must show approximate areas and cell-level territory without exposing exact hide locations to players.

### Decision
**Two-table design:**

| Table | Visibility | Contents |
|-------|-----------|----------|
| `private_hide_locations` | moderator / service_role only | exact PostGIS `geometry(point, 4326)`, h3_private_cell |
| `public_hides` | authenticated + anon (status=live) | h3_public_cell, approximate_area_label, clue_photo_url, clue_text, difficulty |

The join key `private_hide_locations.id = public_hides.private_location_id` is stored in `public_hides` but never joined in any client-visible query.

### Rationale
PostgreSQL RLS enforces the privacy boundary at the database layer. Even a code error that selects wrong columns cannot expose exact coordinates through normal Supabase queries from the browser.

### Consequences
- All API routes that need exact coordinates must use the `createServiceRoleClient()` (server-side only)
- Browser Supabase client uses anon key only — RLS policies guarantee coordinate isolation
- Map rendering uses H3 cell boundaries (public) + approximate labels, never exact points

---

## ADR-002: Database Schema and RLS Design

### Status
Accepted (validated in migration `001_initial_schema.sql`).

### Decision

**Seven tables, all with RLS enabled:**

```
players              — faction, display_name, user_id (FK auth.users)
private_hide_locations — exact geometry (PostGIS), FK players
public_hides         — h3_public_cell, approximate_area_label, clue fields, FK players
capture_claims       — proof_photo_url, state, FK hides, FK claimants
check_ins            — hide activity heartbeat, FK players
territory_events     — append-only log for cell state changes, public read
moderator_actions    — audit trail for moderation decisions, moderator-only
```

**Key RLS policies:**

| Table | Select | Insert | Update/Delete |
|-------|--------|--------|---------------|
| players | everyone | owner (auth.uid) | owner |
| private_hide_locations | moderator/service_role | moderator/service_role | moderator/service_role |
| public_hides | status='live' OR moderator | moderator/service_role | moderator/service_role |
| capture_claims | claimant OR moderator | claimant OR moderator | claimant OR moderator |
| territory_events | everyone | service_role only | — (append-only) |
| check_ins | owner OR service_role | owner OR service_role | owner OR service_role |
| moderator_actions | moderator/service_role | moderator/service_role | moderator/service_role |

**Helper functions:**
- `current_player_id()` — `security definer`, returns player.id for `auth.uid()`
- `is_moderator()` — checks `auth.jwt() -> 'app_metadata' ->> 'role' IN ('moderator', 'service_role')` OR `auth.role() = 'service_role'`

---

## ADR-003: MapLibre + MapTiler Integration

### Status
Accepted (NEXT_PUBLIC_MAPLIBRE_STYLE_URL and NEXT_PUBLIC_MAPTILER_KEY in env).

### Decision
- **Map renderer:** MapLibre GL JS (browser, loaded via CDN or npm package)
- **Style tiles:** OpenFreeMap (`NEXT_PUBLIC_MAPLIBRE_STYLE_URL=https://tiles.openfreemap.org/styles/liberty`) as default; MapTiler as fallback (`NEXT_PUBLIC_MAPTILER_KEY`)
- **Cell rendering:** H3 cell boundaries from `h3-js` `cellToBoundary()` — returns polygon vertices in **[lat, lng] format**. ⚠️ **Note:** GeoJSON coordinates must be `[lng, lat]`. The output must be reversed before constructing GeoJSON polygons. `cellToBoundary()` does not close the polygon (does not repeat the first vertex at the end) — this must be done before passing to GeoJSON.
- **No exact coordinates on map:** only H3 cell polygons rendered, colored by controller faction

### Tile source priority
1. OpenFreeMap (free, no API key for style tiles)
2. MapTiler (requires `NEXT_PUBLIC_MAPTILER_KEY`, used for terrain/satellite fallback)

---

## ADR-004: Supabase Auth, Storage, PostGIS Setup

### Status
Accepted.

### Auth
- Provider: GitHub OAuth
- Session: Supabase SSR cookie-based sessions (`@supabase/ssr`)
- Browser client: `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server client: `createServerClient` (SSR) with `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service role: `createServiceRoleClient` (server-only, `SUPABASE_SERVICE_ROLE_KEY`)

### Storage ⚠️ NOT YET IMPLEMENTED
- Bucket: `clue-photos` (for clue images), `proof-photos` (for capture proof images) — **no Supabase Storage bucket or storage policy exists in migration yet**
- All uploads processed through `exif-strip.ts` (Sharp re-encode) before Supabase Storage
- Storage policies: authenticated users can upload; public read for clue photos (moderator-approved only)
- **Implementation required in M4 (Hider deployment flow)**

### PostGIS
- Extension: `postgis` in `public` schema
- `private_hide_locations.exact_location` — `geometry(point, 4326)` (WGS84)
- GiST index on `exact_location` for spatial queries
- H3 resolution 7 cells computed server-side from exact coordinates via `h3-js`

---

## ADR-005: VPS Staging/Prod Deployment Architecture

### Status
Proposed (architecture defined, deployment not yet implemented).

### Decision
- **Host:** VPS (app.amfbss.com or equivalent) with Docker
- **Containers:** Next.js web app (Node.js), optional: background worker for territory recalculation
- **CI/CD:** Git push → GitHub Actions → Docker build → VPS pull + restart
- **Environment:** `.env.local` variables injected at deploy time (not baked into image)
- **Healthcheck:** `GET /api/health` returns 200 if app is healthy

### DNS / Edge
- Cloudflare Turnstile on all public-facing POST routes
- Cloudflare DNS proxy (proxied A/AAAA records) for DDoS protection
- Rate limiting at Cloudflare layer for auth endpoints

### Staging vs. Prod
- Staging: `staging.taiwan-way.co.uk` (separate Supabase project)
- Prod: `taiwan-way.co.uk` (separate Supabase project)
- Each has its own Supabase project with separate anon/service keys

---

## ADR-006: Cloudflare Turnstile, DNS, Edge Protection

### Status
Accepted.

### Decision
- **Bot protection:** Cloudflare Turnstile (invisible, privacy-friendly alternative to reCAPTCHA)
- **Site key:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, safe for browser)
- **Secret key:** `TURNSTILE_SECRET_KEY` (server-only env var, no `NEXT_PUBLIC_`)
- **Verification:** `src/middleware.ts` calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` server-side before granting access to protected routes
- **Protected routes:** `prefix: ["/api", "/dashboard"]`
- **Trigger condition:** `request.method === "POST"` (GET routes bypass; sensitive ops are always POST)

### DNS
- Domain registrar: Cloudflare (nameservers set to Cloudflare)
- DNSSEC: enabled
- SSL/TLS: Full (strict mode once certificates provisioned)
- Always-on HTTPS (HSTS preloading)

---

## ADR-007: Scheduled Maintenance (Expiry, Check-ins, Territory Recalculation)

### Status
Proposed.

### Decision
Server-side systemd timers + one-shot service scripts:

| Job | Frequency | Action |
|-----|-----------|--------|
| `hide-expiry-check` | Every 15 min | Find hides past `expires_at`, set status='expired', insert territory_event |
| `check-in-reminder` | Daily 9am | Find pending check_ins, send reminder (or mark missed) |
| `territory-recalculate` | Every 5 min | Re-read latest approved capture_claims per h3_public_cell, update territory_events |
| `moderator-escalation` | Hourly | Flag hides in `awaiting_moderation` > 24h for human review |

All jobs use `createServiceRoleClient()` (service role key) to bypass RLS restrictions on write operations.

**Important:** these jobs are NOT yet implemented in the codebase. This ADR documents the planned architecture.

---

## ADR-008: Image Upload Flow with EXIF Stripping

### Status
Accepted (validated in `src/lib/exif-strip.ts`).

### Decision

```
Browser                   Server                    Supabase Storage
   |                          |                            |
   |-- upload request + --→  |                            |
   |   photo (raw)            |                            |
   |                          |-- sharp.recode() --------→|
   |                          |   (EXIF stripped, fresh    |
   |                          |    JPEG or PNG)            |
   |                          |                            |
   |←- storage URL ----------|-- store URL in -----------→|
   |   (no EXIF)              |   public_hides.clue_photo  |
```

**`src/lib/exif-strip.ts`:**
```typescript
// sharp re-encode: .rotate() applies EXIF orientation then discards metadata
// JPEG: mozjpeg recompresses, drops all EXIF
// PNG:  png() recompresses, drops all EXIF
const pipeline = sharp(input).rotate();
const output = metadata.format === "png"
  ? await pipeline.png().toBuffer()
  : await pipeline.jpeg({ mozjpeg: true }).toBuffer();
return output.buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
```

**Verification:**
- `ExifReader.load(input)` is called but result is discarded — used only to confirm image is parseable before re-encoding
- Both JPEG and PNG paths strip all metadata
- No GPS data survives into the returned `ArrayBuffer`

**Upload endpoint:** `POST /api/upload` (protected, authenticated, Turnstile-verified) → server-side EXIF strip → upload to Supabase Storage → return public URL → store in `public_hides.clue_photo_url`

---

## H3 Resolution Justification

| Resolution | Cell edge (km) | Area (km²) | Cells for Reading (~88 km²) |
|-----------|----------------|------------|------------------------------|
| 6 | 1.83 km | 2.94 km² | ~30 |
| **7** | **0.917 km** | **0.73 km²** | **~120** |
| 8 | 0.46 km | 0.18 km² | ~490 |
| 9 | 0.23 km | 0.045 km² | ~1,950 |

**Resolution 7 selected** because:
- Granular enough to distinguish city neighbourhoods (~0.73 km² per cell)
- Coarse enough that a single hide's approximate area does not uniquely identify a location
- Cell count per city (~120) is manageable for territory game UX (not overwhelming)
- H3 index size: 15 hex chars — fits in a `text` column with index

**Privacy note:** H3 cell boundaries are public (rendered on map). A cell at res 7 covers ~0.73 km² — the approximate area label further generalises location. This is the intended privacy trade-off.