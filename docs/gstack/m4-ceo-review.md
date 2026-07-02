# M4 CEO Review — Meccha Chameleon Scout Deployment

**Status:** DONE_WITH_CONCERNS
**Date:** 2026-07-02
**Branch:** main
**Model:** gpt-5.5

---

## Verdict

Use **HOLD SCOPE**. M4 should ship the hider deployment and moderation loop only, plus lightweight territory projection from approved live hides. Do not pull in capture, seeker proof, QR/NFC, re-hide, check-ins, expiry, or production deployment.

No design doc was found for this branch, so this is a standard CEO review grounded in `docs/delivery-plan.md`, `docs/security-model.md`, migrations, and current code.

---

## Confirmed M4 Boundary

### In Scope

- Authenticated onboarded player submits a hide.
- Server derives player faction from `players.faction`; client never sends authoritative faction.
- Exact coordinate is accepted by server only, validated, converted to H3 res 7, and stored only in `private_hide_locations`.
- Public hide record is created in `public_hides` with `status='awaiting_moderation'`.
- Clue image is EXIF-stripped and resized before writing only the sanitized output to VPS media storage.
- Moderator queue shows awaiting hides with enough context to approve/reject/request more info.
- Moderator approve/reject writes `moderator_actions`.
- Approved hide becomes `live`.
- Territory projection updates public cell state from live hides only.

### Out of Scope

- Seeker proof and capture flow.
- QR/NFC verification.
- Re-hide mechanics.
- Check-ins and missed-check weakening.
- Hide expiry timers.
- Production deploy.
- Full M6 territory recalculation worker.

---

## Data Flow

### Player Submission
```
Player browser
  -> POST /api/hides with exact GPS + clue fields + photo
  -> server auth + Turnstile + onboarded-player check
  -> sanitiseImage(raw photo)
  -> write sanitized clue file to /srv/.../media/public/clues/
  -> service-role transaction:
       private_hide_locations.exact_location
       public_hides(status='awaiting_moderation', faction=player.faction)
  -> browser receives public hide id/status only, no coordinates
```

### Moderation
```
Moderator
  -> queue reads awaiting_moderation hides
  -> approve/reject/request-info
  -> service-role transaction:
       update public_hides.status
       insert moderator_actions
       recompute projected territory_cells for affected H3 cell
```

---

## Acceptance Criteria

- Player must be signed in and onboarded before submitting.
- Submission route must reject missing/invalid lat/lng, unsupported image, oversized image, missing safety checklist, and non-Reading/out-of-pilot cells.
- Browser/API response must never include `exact_location`, lat/lng echo, `private_location_id`, `ST_X`, or `ST_Y`.
- `public_hides.faction` must equal the submitting player's current faction from the database.
- Raw image buffer is never written to disk; only `sanitiseImage()` output is stored.
- Submitted hide appears in moderator queue as `awaiting_moderation`.
- Moderator approval changes hide to `live`; rejection changes hide to `retired`.
- "Request more info" records a moderator action and leaves the hide non-live.
- Every moderator decision creates a `moderator_actions` row.
- Approved hides appear on the public territory map only as H3 cell impact, not pins/markers.
- Territory projection is deterministic from live hides in the cell.
- Lint, typecheck, build, unit tests, API privacy tests, and moderation E2E smoke path pass.

---

## Territory Projection Rule

For M4, keep this simple:

- `0 live hides` -> `unclaimed`, `controller_faction = null`
- `live hides from one faction` -> `controlled`, `controller_faction = that faction`
- `live hides from multiple factions` -> `contested`, `controller_faction = faction with highest live hide count` or `null` if tied

This is projection, not final territory logic. M6 can replace it with capture/check-in/expiry-derived state.

---

## Main Concern

Current RLS allows only moderator/service_role writes to `public_hides` and `private_hide_locations`, so player submission must be a server-side service-role transaction. That is correct, but it makes API DTO discipline critical.

---

## Landscape Note

This matches the proven pattern in geocaching-style systems: user-generated physical placements need approval, restricted-location rules, and caution around private property/suspicious placements.
