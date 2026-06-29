# Test Strategy — Meccha Chameleon: Faction Hunt

> **Authority:** Committed from validated codebase baseline (Milestone 1).
> No test files existed at baseline — this document defines the strategy going forward.

---

## Overview

Test strategy follows a **three-layer pyramid**:

```
       /\
      /e2e\        ← End-to-end (Playwright) — game-critical paths
     /------\
    / unit+  \     ← Unit + integration (Vitest) — logic correctness
   /----------\
  /  static   \   ← Type checking + lint (TypeScript + ESLint)
  /------------\
```

**CI gate:** all layers must pass before merge to `main`.

---

## Layer 1: Static Analysis (always-on)

| Tool | What it checks | Failure = |
|------|---------------|-----------|
| TypeScript (`tsc --noEmit`) | Type correctness, unused exports, invalid imports | CI fail |
| ESLint (`eslint src/`) | Code style, banned patterns, security anti-patterns | CI fail |
| `tsx` / `next build` | Next.js compilation, missing env vars at build time | CI fail |

**Security-specific lint rules:**
- No `SUPABASE_SERVICE_ROLE_KEY` in files (grep check in CI)
- No `NEXT_PUBLIC_` prefix on `SERVICE_ROLE` or `SECRET_KEY` variables
- No `console.log` of Supabase query results containing location data

---

## Layer 2: Unit + Integration Tests (Vitest)

### What to test

**Core library logic:**

| Module | Tests |
|--------|-------|
| `src/lib/exif-strip.ts` | Strips EXIF from JPEG/PNG; GPS IFD absent after strip; returns fresh ArrayBuffer |
| `src/lib/h3-utils.ts` | `latLngToCell` returns valid H3 index at res 7; `cellToBoundary` returns array of [lat, lng] pairs; boundary closes correctly |
| `src/lib/game-data.ts` | `factionById` returns correct faction; `safetyRules` length > 0; `activeHides` have required fields |

**RLS policy logic (via Supabase client tests):**

| Scenario | Expected |
|----------|----------|
| Anon client selects `public_hides` | Receives only `status='live'` rows |
| Anon client selects `private_hide_locations` | Receives 0 rows (RLS block) |
| Authenticated player selects own `capture_claims` | Receives their own rows only |
| Authenticated player selects other player's `capture_claims` | Receives 0 rows |
| Service role client selects `private_hide_locations` | Receives all rows |

**API route logic:**

| Route | Tests |
|-------|-------|
| `POST /api/upload` | Accepts valid image, returns URL; rejects non-image; strips EXIF before storage |
| `POST /api/hides` | Valid submission inserts to both tables; invalid GPS rejected; unauthenticated rejected |
| `GET /api/territory` | Returns public territory events; no coordinates |

**Test file locations:**
```
src/lib/
  exif-strip.test.ts
  h3-utils.test.ts
  game-data.test.ts

src/app/api/
  upload.test.ts
  hides.test.ts
  territory.test.ts
```

**Running tests:**
```bash
npm test          # vitest run (CI)
npm test -- --ui  # vitest browser UI (local dev)
```

---

## Layer 3: End-to-End Tests (Playwright)

### Critical paths to cover

**P1 — game core:**
1. Player can sign in with GitHub OAuth → reaches dashboard
2. Authenticated player can see live hides on territory map
3. Hide submission form: exact GPS stored in `private_hide_locations` (not visible in any UI)
4. Clue photo uploaded → EXIF-stripped before storage (verify via Storage API)
5. Moderator approves hide → hide appears on territory map
6. Seeker submits proof for live hide → capture claim created
7. Moderator approves capture → territory event logged, cell flips faction

**P1 — privacy:**
8. Normal authenticated player cannot access `private_hide_locations` via any API
9. Landing page renders no exact coordinates
10. Map renders H3 cell boundaries only, no marker points

**P2 — moderation:**
11. Moderator can see awaiting_moderation queue
12. Moderator approve → hide goes live; reject → hide removed from queue
13. Moderator actions are logged in `moderator_actions`

**P3 — edge cases:**
14. Unauthenticated user redirected from `/dashboard`
15. Turnstile challenge fires on POST to `/api/*`
16. Upload rejects files > 10MB
17. Territory recalculation correct after multiple simultaneous captures

### Playwright config

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

**E2E test locations:**
```
e2e/
  auth.spec.ts
  territory-map.spec.ts
  hide-submission.spec.ts
  capture-flow.spec.ts
  moderation.spec.ts
  privacy.spec.ts
```

---

## Pilot Acceptance Criteria

Before declaring the Reading pilot "live," the following must be confirmed:

| # | Criterion | Test type | How to verify |
|---|-----------|-----------|---------------|
| 1 | Exact coordinates not retrievable via browser | Manual | Inspect all Supabase queries from browser Network tab; confirm no lat/lng columns requested |
| 2 | EXIF stripped from uploaded photos | Automated | Run exif-strip unit test with known GPS EXIF JPEG; confirm GPS IFD absent after strip |
| 3 | RLS enforced on private_hide_locations | Automated | Supabase test: anon/an authenticated query → 0 rows returned |
| 4 | Live hides readable by all, non-live hidden | Automated | Anon/an query → only status='live' rows returned |
| 5 | Capture claims readable by owner only | Automated | Anon/an queries for other players' claims → 0 rows |
| 6 | Territory events public-readable | Automated | Anon query → all rows returned |
| 7 | Map shows cells, not exact points | Manual | Inspect MapLibre render; confirm no Marker or Point GeoJSON |
| 8 | Turnstile challenge on POST to protected routes | Manual | Inspect Network tab for Turnstile verification request on form submit |
| 9 | Auth flow completes: GitHub OAuth → faction selection → dashboard | E2E | Playwright `auth.spec.ts` |
| 10 | Moderation workflow: submit → approve → live on map | E2E | Playwright `moderation.spec.ts` |

---

## CI Configuration

**GitHub Actions workflow** (`.github/workflows/ci.yml`):

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint-and-type:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
```

**Required secrets in GitHub repo:**
- `TEST_SUPABASE_URL` — staging Supabase project URL
- `TEST_SUPABASE_ANON_KEY` — staging anon key
- `E2E_BASE_URL` — staging deployment URL

---

## Test Data Strategy

**Unit tests:** use static mock data (no external dependencies).

**Integration tests:** use a dedicated Supabase test project (not staging, not prod). Test project has RLS enabled (same policies as prod) but with relaxed row limits.

**E2E tests:** run against staging environment. Staging Supabase project has:
- Real RLS policies (same as prod)
- Seeded with test players (one per faction)
- Test hides in various states
- No real player data

**Never use prod credentials in any test suite.**

---

## Coverage Requirements

| Layer | Minimum coverage |
|-------|-----------------|
| Unit (Vitest) | 80% line coverage for `src/lib/` |
| Integration | All API routes covered |
| E2E | All P1 critical paths |

Coverage reports generated via `vitest --coverage`.

---

## Defect Triaging

| Severity | Description | SLA |
|----------|-------------|-----|
| S1 | Coordinate leak — any path that exposes `private_hide_locations.exact_location` to browser | Fix within 1 hour of detection |
| S2 | RLS bypass — normal user can read/write another user's private data | Fix within 4 hours |
| S3 | EXIF leak — GPS metadata survives image upload | Fix within 24 hours |
| S4 | UI bug — map wrong, hide not appearing | Fix before next release |
| S5 | Cosmetic / copy | Fix in next release |