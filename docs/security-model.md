# Security Model — Meccha Chameleon: Faction Hunt

> **Authority:** Committed from validated codebase baseline (Milestone 1).
> This document is the authoritative security specification. All implementation must match it.

---

## Core Invariant

> **Exact hide coordinates (`private_hide_locations.exact_location`) must never reach the browser, public APIs, server logs, or map payloads.**

This invariant is enforced at three independent layers:
1. **Database layer** — RLS policies block all queries from browser
2. **Application layer** — Supabase client/server split ensures service role key never reaches browser
3. **Image layer** — EXIF stripping removes GPS metadata before any photo is stored

---

## EXIF Stripping Verification

**Implementation:** `src/lib/exif-strip.ts`

```typescript
export async function stripImageExif(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const input = Buffer.from(buffer);
  // Parse to confirm image is valid (result discarded, only used as guard)
  try { ExifReader.load(input); } catch { /* unsupported format */ }

  const metadata = await sharp(input).metadata();
  // .rotate() applies EXIF orientation then discards all metadata on re-encode
  const pipeline = sharp(input).rotate();
  const output =
    metadata.format === "png"
      ? await pipeline.png().toBuffer()       // PNG recompress → no EXIF
      : await pipeline.jpeg({ mozjpeg: true }).toBuffer(); // JPEG recompress → no EXIF

  // Return fresh buffer (no reference to original)
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}
```

**Verification checklist:**
- [x] JPEG path: `jpeg({ mozjpeg: true })` — mozjpeg strips all metadata
- [x] PNG path: `png()` — recompresses, strips all metadata
- [x] Rotation applied before re-encode (handles EXIF orientation tag)
- [x] Return uses `.buffer.slice()` — fresh ArrayBuffer, no reference to input
- [x] Both paths (JPEG and PNG) are covered
- [x] `ExifReader.load()` is used as a format guard only (result not used for stripping)

**Gap noted:** `ExifReader.load()` result is discarded. This is non-blocking because sharp's re-encode deterministically strips metadata regardless of input metadata. Future improvement: assert that GPS IFD exists before strip and is absent after.

---

## RLS Policy Inventory

All tables in `supabase/migrations/001_initial_schema.sql`:

### `players`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (true)` | Everyone — all columns readable: id, user_id, faction, display_name, created_at, last_active_at |
| INSERT | `with check (user_id = auth.uid() OR auth.role() = 'service_role')` | Owner or service_role |
| UPDATE | `using (user_id = auth.uid() OR auth.role() = 'service_role')` | Owner or service_role |
| DELETE | No policy | Not allowed (no delete operation defined) |

### `private_hide_locations`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (is_moderator() OR auth.role() = 'service_role')` | Moderator or service_role only |
| INSERT | `with check (is_moderator() OR auth.role() = 'service_role')` | Moderator or service_role only |
| UPDATE | Same | Moderator or service_role only |
| DELETE | Same | Moderator or service_role only |

**This is the primary coordinate isolation table.** Normal authenticated players cannot read or write it.

### `public_hides`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (status = 'live' OR is_moderator() OR auth.role() = 'service_role')` | Everyone for live; moderator for all |
| INSERT | `with check (is_moderator() OR auth.role() = 'service_role')` | Moderator or service_role only |
| UPDATE | `using (is_moderator() OR auth.role() = 'service_role')` | Moderator or service_role only |
| DELETE | Same | Moderator or service_role only |

**Note:** `public_hides` contains NO exact coordinates column. It holds only h3_public_cell, approximate_area_label, clue_photo_url, clue_text, difficulty.

### `capture_claims`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (claimant_id = current_player_id() OR is_moderator() OR auth.role() = 'service_role')` | Owner, moderator, or service_role |
| INSERT | `with check (claimant_id = current_player_id() OR is_moderator() OR auth.role() = 'service_role')` | Owner, moderator, or service_role |
| UPDATE | Same | Owner, moderator, or service_role |
| DELETE | Same | Owner, moderator, or service_role |

**Proof photos are not public.** Only the claimant and moderators can see `proof_photo_url`.

### `territory_events`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (true)` | Everyone (append-only log, no coordinates) |
| INSERT | `with check (auth.role() = 'service_role')` | Service_role only |

**This is the public territory state log.** No coordinates — only H3 cell + event type + faction.

### `check_ins`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (player_id = current_player_id() OR auth.role() = 'service_role')` | Owner or service_role |
| INSERT | `with check (player_id = current_player_id() OR auth.role() = 'service_role')` | Owner or service_role |
| UPDATE | Same | Owner or service_role |
| DELETE | Same | Owner or service_role |

### `moderator_actions`
| Operation | Policy | Who |
|-----------|--------|-----|
| SELECT | `using (is_moderator() OR auth.role() = 'service_role')` | Moderator or service_role |
| INSERT | `with check (is_moderator() OR auth.role() = 'service_role')` | Moderator or service_role |
| UPDATE | Same | Moderator or service_role |
| DELETE | Same | Moderator or service_role |

---

## Credential Model

| Variable | Prefix | Reach | Purpose |
|----------|--------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | NEXT_PUBLIC | Browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | NEXT_PUBLIC | Browser | Supabase anonymous key (RLS-gated) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | NEXT_PUBLIC | Browser | Cloudflare Turnstile site key |
| `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` | NEXT_PUBLIC | Browser | Map tile style URL |
| `NEXT_PUBLIC_MAPTILER_KEY` | NEXT_PUBLIC | Browser | MapTiler API key (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NONE** | Server-only | Supabase service role (bypasses RLS) |
| `TURNSTILE_SECRET_KEY` | **NONE** | Server-only | Cloudflare Turnstile secret |

**Rule:** No credential that grants access beyond RLS-gated data may have the `NEXT_PUBLIC_` prefix.

---

## Abuse Prevention

### Bot Protection
- Cloudflare Turnstile on all POST requests to protected routes (`/api/*`, `/dashboard`)
- Rate limiting at Cloudflare layer on auth endpoints (GitHub OAuth callback)
- Supabase Auth rate limits on email/password (if enabled)

### Submission Flooding
- Rate limit: maximum 10 hide submissions per player per hour (enforced at API route level)
- Duplicate detection: if a player submits a hide with the same H3 cell + codename within 24h, flag for review

### GPS Accuracy
- Client-side: use `navigator.geolocation.getCurrentPosition()` with `enableHighAccuracy: true`
- Server-side: reject coordinates outside valid lat/lng bounds (−90/90, −180/180)
- Approximate area label is human-written — moderator checks plausibility against the label

### Moderation Integrity
- Every moderation decision creates a `moderator_actions` row — NOTE: the RLS policy is `for all` (update and delete allowed for moderators). For true immutability, remove the UPDATE/DELETE policies or add a database trigger to block post-insert modifications.
- Moderator role assigned via Supabase `app_metadata.role` (set manually in Supabase dashboard)
- Service role operations are never exposed to moderator dashboards

---

## Moderation Workflow

```
Player submits hide
    → status='awaiting_moderation'
    → appears in moderator queue

Moderator reviews:
  ✅ Approve → status='live', insert moderator_actions (approve)
  ❌ Reject  → status='retired', insert moderator_actions (reject)
  ⚠️  More info → status='awaiting_moderation' + review_notes

Live hide:
  → visible on territory map
  → affects H3 cell controller
  → subject to check-in reminders
```

**Moderator safety checklist (per hide):**
1. Location is publicly accessible (no private land, no restricted areas)
2. No climbing or hazardous terrain required to reach the hide
3. Clue photo does not reveal exact GPS location
4. Clue text provides fair search challenge without being impossibly vague
5. Approximate area label matches actual location

**Reject criteria:**
- Private land or restricted area
- Roadside placement (even if public footpath)
- School, hospital, or children's facility proximity
- Clue photo showing identifiable landmarks (bus stop numbers, shop names)
- Difficulty inconsistent with location (impossibly hard in a public place)

---

## Privacy Guarantees

| What players CAN see | What players CANNOT see |
|---------------------|------------------------|
| H3 cell boundaries on map | Exact hide coordinates |
| Approximate area labels | Private hide location table |
| Faction scores and cell counts | Other players' exact GPS submissions |
| Live hide codenames and clue photos | Proof photos from other players |
| Territory event log (append-only) | Unmoderated or rejected hides |
| Public player names + factions | Internal moderator notes |
| Clue photo (moderator-approved) | Unmoderated capture claims |

---

## Incident Response

If a coordinate leak is discovered:
1. **Contain:** Take the Supabase project to maintenance mode (suspend public access)
2. **Assess:** Identify which rows were exposed, for how long, to how many users
3. **Notify:** Inform affected players (those whose hide coordinates were exposed)
4. **Remediate:** Fix the RLS policy or application logic
5. **Verify:** Confirm fix with test queries from a non-moderator browser client
6. **Resume:** Bring project back online with monitoring increased

---

## Compliance Notes

- **UK GDPR:** Hide locations are personal data (player-submitted, linked to player identity). They must be stored securely, not shared, and deleted on player request.
- **Photo EXIF:** Stripping EXIF reduces but does not eliminate re-identification risk from photo content (landmarks, signage). Moderator review of clue photos is the primary safeguard.
- **Children's safety:** Hide placement near schools is prohibited. Moderation must enforce this.