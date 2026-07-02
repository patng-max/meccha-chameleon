# M4 Engineering Review — Meccha Chameleon Scout Deployment

**Status:** DONE
**Date:** 2026-07-02
**Branch:** main

---

## Key Architectural Decisions

### Upload Flow

```
Browser                        Next.js Route Handler             VPS Storage
  |                                       |                          |
  |-- raw JPEG/PNG multipart/formData ---> |
  |                                       |-- ExifReader.load()      |
  |                                       |-- sharp().rotate()       |
  |                                       |   .jpeg({ mozjpeg:true })
  |                                       |   .resize(1600, {fit:inside})
  |                                       |   -- sanitised ArrayBuffer
  |                                       |                          |
  |                                       |-- write to              -->|
  |                                       |  /srv/.../media/public/   |
  |                                       |  clues/{uuid}.jpg        |
  |<-- { hideId, status } JSON ---------|                          |
```

**Sharp EXIF strip:** Already implemented in `src/lib/exif-strip.ts` via `sanitiseImage()`. JPEG uses `mozjpeg`, PNG uses recompression. Both strips all EXIF. Max dimension 1600px longest edge.

**Key nuance:** Raw upload buffer is never written to disk. On DB write failure, must delete the already-written sanitised file (best-effort rollback).

**Storage paths (staging):**
- Clue photos (pending + approved): `/srv/meccha-chameleon-staging/media/public/clues/`
- Identity photos: `/srv/meccha-chameleon-staging/media/private/proofs/` (not accessible as static URL)
- Nginx must be configured to serve only `/srv/.../media/public/` as static files.

### Hide Submission: Server-Side Faction Derivation

Client NEVER sends authoritative faction. Server reads player.faction from DB using service role:

```typescript
// POST /api/hides handler (simplified)
const supabase = createServiceRoleClient();
const { data: player } = await supabase
  .from('players').select('id, faction').eq('user_id', user.id).single();

// faction is server-authoritative — client form field is ignored
```

### Privacy Boundaries

**Forbidden keys** (from `src/lib/contracts/territory.ts` FORBIDDEN_KEYS):
- `exact_location`, `private_location_id`, `latitude`, `longitude`
- `ST_X`, `ST_Y`, `user_id`, `last_active_at`

These must never appear in any browser-visible response. The existing `/api/territory` route already has `FORBIDDEN_KEYS` validation via string search on raw JSON.

### RLS Policies

| Table | Select | Insert | Update |
|-------|--------|--------|--------|
| `private_hide_locations` | moderator/service_role | moderator/service_role | moderator/service_role |
| `public_hides` | `status='live'` or moderator | moderator/service_role | moderator/service_role |
| `moderator_actions` | moderator/service_role | moderator/service_role | moderator/service_role |

**Player submission path:** Player POSTs to `/api/hides` → server uses service role to write both `private_hide_locations` + `public_hides` in one transaction.

### State Machine

```
awaiting_moderation
  | approve
  v
live -> later M5/M6 states: weakened/captured/expired
  ^
  |
request_more_info keeps awaiting_moderation with review note

awaiting_moderation
  | reject
  v
retired
```

### API Routes Needed

| Route | Auth | Method | Description |
|-------|------|--------|-------------|
| `/api/hides` | session + Turnstile | POST | Submit hide (service role) |
| `/api/hides/mine` | session | GET | List player's own submissions |
| `/api/moderation/hides` | session + moderator | GET | Moderation queue |
| `/api/moderation/hides/[id]/approve` | session + moderator | POST | Approve hide |
| `/api/moderation/hides/[id]/reject` | session + moderator | POST | Reject hide |
| `/api/moderation/hides/[id]/request-info` | session + moderator | POST | Request more info |

### Territory Projection (on Approval)

Simple projection rule (no capture/check-in/expiry yet):
- `0 live hides` in cell -> `unclaimed`, `controller_faction = null`
- `1 faction's live hides` in cell -> `controlled`, `controller_faction = that faction`
- `2+ factions' live hides` in cell -> `contested`, `controller_faction = majority faction` (or null if tied)

```typescript
// Territory projection on approve
const { data: hides } = await supabase
  .from('public_hides')
  .select('faction')
  .eq('h3_public_cell', h3Cell)
  .eq('status', 'live');

const factionCounts = countBy(hides, 'faction');
// ... apply rule above, upsert territory_cells
```

### Database Changes Needed

- Add indexes:
  - `public_hides(status, created_at desc)`
  - `public_hides(player_id, created_at desc)`
  - `moderator_actions(target_type, target_id, created_at desc)`
- Consider append-only trigger on `moderator_actions` (block UPDATE/DELETE)
- `territory_cells` upsert logic for projected state

### Turnstile Integration

**Staging/Dev (`TURNSTILE_ENABLED=false`):** Skip verification gracefully.
**Production (`TURNSTILE_ENABLED=true`):** Verify via `middleware.ts` check on POST to protected routes.

Middleware already has:
- `TURNSTILE_ENABLED` flag check before any key presence
- `verifyTurnstile()` function calling Cloudflare API
- Protected route prefixes: `["/api", "/dashboard", "/onboarding"]`

The `/api/hides` POST route falls under `/api` prefix — it will be gated by middleware when enabled.

### Test Plan

**Vitest:**
```
POST /api/hides
  -> unauthenticated 401
  -> missing Turnstile 403 in production-like config
  -> invalid lat/lng rejected
  -> non-image rejected
  -> oversized image rejected
  -> JPEG/PNG re-encoded, EXIF absent, max dimension <= 1600
  -> DB failure deletes sanitized file
  -> response excludes forbidden keys

moderator approve
  -> non-moderator rejected
  -> status awaiting_moderation -> live
  -> moderator_actions row inserted
  -> territory_events row inserted
  -> territory_cells upserted
  -> repeated approve is idempotent or returns 409

RLS/migration tests
  -> public_hides only live rows visible to anon
  -> private_hide_locations invisible to anon/auth player
  -> moderator_actions cannot update/delete
```

**Playwright:**
- Submit -> moderation queue -> approve -> map visible
- Privacy check: network responses contain no coordinate/private keys

---

## Completeness

**9/10** if M4 includes: append-only audit, image resize, one-piece hide submission, approval projection, and focused tests.

**6/10** if it ships only upload + status changes and defers audit immutability or territory projection.
