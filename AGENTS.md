# AGENTS.md — Meccha Chameleon: Faction Hunt

> **Purpose:** Project-specific operating rules for AI agents working in this repository.
> Inherits from `~/.openclaw/workspace-arch/AGENTS.md` (global rules). This file overrides where project-specific rules apply.

---

## Repository Context

- **Repo:** `~/dev/meccha-chameleon` (or `https://github.com/patng-max/meccha-chameleon`)
- **Pilot city:** Reading, UK
- **Current milestone:** M1 (Foundation) — completed
- **Privacy model:** Exact coordinates are server-only, never reach browser

---

## Operating Model: Arch → Subagent → Codex CLI

### Who does what

| Role | Responsibility |
|------|---------------|
| **Arch** (main agent) | Owns Git, GitHub, commits, pushes, deployment, VPS configuration, environment variables, Nginx/systemd, and production verification. Spawns subagents. Receives reports. |
| **Subagent** (spawned task agent) | Executes a specific task within a defined scope. Reports evidence to Arch. Does not commit. |
| **Codex CLI** | Non-interactive planning and implementation tool. Invoked by Subagent via `codex exec`. |

### Mandatory process for all code, workflow, and test changes

> **Rule:** All repository code, workflow, middleware, server-action, Next.js configuration, and test changes MUST go through the Subagent → Codex CLI path. No direct implementation in the repository.

**Required workflow for every change:**
1. Subagent calls `codex exec /office-hours "<goal>" --sandbox workspace-write`
2. `codex exec /plan-ceo-review "<goal>" --sandbox workspace-write`
3. `codex exec /plan-eng-review "<goal>" --sandbox workspace-write`
4. Implementation via `codex exec "Implement <feature>. Details: <spec>" --sandbox workspace-write`
5. `codex exec /review "<scope>" --sandbox workspace-write`
6. `codex exec /qa "<scope>" --sandbox workspace-write`
7. `codex exec /ship "<summary>" --sandbox workspace-write`
8. Subagent reports evidence to Arch
9. **Arch commits all resulting docs and code to GitHub** (Subagent never commits)

**Arch owns these directly (no Codex required):**
- Git operations (commit, push, merge, PR management)
- VPS configuration (Nginx, systemd environment files, environment variables)
- GitHub Actions workflow dispatches and reruns
- Production/staging verification and smoke testing
- Emergency mitigations (apply immediately, then represent through Codex for the canonical record)

**Note on emergency mitigations:** If Arch applies a live fix to the VPS (e.g., nginx config) without Codex, Arch must represent that fix in the repository's canonical deployment configuration immediately after, so it survives future deploys. The workflow file is the canonical record — direct VPS changes without corresponding workflow updates will be overwritten on the next deploy.

### Rules

1. **Arch owns all Git/GitHub operations.** Subagents never commit, push, merge, or alter git state.
2. **Subagent executes tasks** using Codex CLI (`codex exec --sandbox workspace-write`) for implementation and documentation.
3. **All material decisions and gstack outputs must be committed before implementation begins.** Canonical docs live in `docs/`:
   - `docs/goal.md` — product goal
   - `docs/architecture.md` — architecture decision records
   - `docs/delivery-plan.md` — milestone plan
   - `docs/security-model.md` — privacy and safety controls
   - `docs/test-strategy.md` — CI gates and test criteria
4. **Codex must use gstack slash commands** (`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/review`, `/qa`, `/ship`) for all planning. Codex outputs are committed to `docs/` before any code is written.
5. **No implementation without a committed plan.** If the relevant doc does not exist in `docs/`, Codex must produce it first.

---

## Hard Security Rules

These rules are never relaxed, regardless of context:

### Exact coordinates — absolute boundary

- `private_hide_locations.exact_location` (PostGIS `geometry(point, 4326))` must NEVER appear in:
  - Browser JavaScript or React components
  - API responses to the browser
  - Server logs or error messages
  - Map payloads (no markers, no pins, no GeoJSON points)
  - Supabase queries from the browser client (`createBrowserClient` / anon key)
  - Any file with `NEXT_PUBLIC_` prefixed variable
- The only exception: server-side code using `createServiceRoleClient()` (service role key) for legitimate hide management operations.

### Credentials — never expose to browser

- `SUPABASE_SERVICE_ROLE_KEY` must never have `NEXT_PUBLIC_` prefix
- `TURNSTILE_SECRET_KEY` must never have `NEXT_PUBLIC_` prefix
- Any secret key must be in `.env.local` (not committed) and accessed only via server-side code
- Before committing any code, verify: `grep -r "NEXT_PUBLIC" src/` and `grep -r "SERVICE_ROLE" src/`

### EXIF stripping — always on

- All uploaded photos (clue photos and proof photos) must be processed through `src/lib/exif-strip.ts` before storage
- Never store the raw uploaded buffer — only the sharp-reencoded output

### Media storage — VPS only, not Supabase Storage

- All clue and proof images are stored on VPS persistent storage at `/srv/meccha-chameleon/media/`
- Public clue media: `/srv/meccha-chameleon/media/public/clues/` — served via Nginx + Cloudflare (Cache-Control: public, max-age=31536000, immutable)
- Private proof media: `/srv/meccha-chameleon/media/private/proofs/` — never has a public URL; served only via authenticated app route
- **Never use Supabase Storage buckets** for clue-photos or proof-photos
- Staging uses `/srv/meccha-chameleon-staging/media/` (separate from production)

---

## Codex CLI Usage

### Standard command template

```bash
# Planning / gstack workflow
codex exec /office-hours "<scenario>" --sandbox workspace-write
codex exec /plan-ceo-review "<scenario>" --sandbox workspace-write
codex exec /plan-eng-review "<scenario>" --sandbox workspace-write
codex exec /review "<scope>" --sandbox workspace-write
codex exec /qa "<scope>" --sandbox workspace-write
codex exec /ship "<summary>" --sandbox workspace-write

# Implementation
codex exec "Implement <feature>. Details: <spec>" --sandbox workspace-write
```

### Gstack Workflow

All material planning uses the gstack pipeline:

```
1. /office-hours        → clarify product thinking
2. /plan-ceo-review     → scope, strategy, milestones
3. /plan-eng-review     → architecture, tech approach
4. /review              → independent 2nd opinion
5. /qa                  → quality gates
6. /ship                → commit and announce
```

Output from each stage is written to `docs/gstack/` (or directly to the appropriate `docs/*.md`) and committed before the next stage begins.

### Subagent task template

When Arch spawns a subagent for this repo, the subagent uses this template:

```javascript
task: """Run gstack workflow for <project> <slice>.

Workdir: /Users/patrickclaw/dev/meccha-chameleon

Steps:
1. Run: codex exec /office-hours "<scenario>" --sandbox workspace-write
   Save output to /tmp/<slice>-office-hours.md
2. Run: codex exec /plan-ceo-review "<scenario>" --sandbox workspace-write
   Save output to /tmp/<slice>-ceo-review.md
3. ... (continue through /ship)
4. Commit all docs to GitHub before implementation

Rules:
- Use Codex slash commands for /office-hours, /plan-ceo-review, /plan-eng-review, /review, /qa, /ship
- Arch owns all Git operations — do not commit from Codex
- Exact coordinates must never appear in Codex output or docs
- All canonical docs committed to docs/ before implementation
"""
```

---

## Repository Structure

```
meccha-chameleon/
├── docs/                          # Committed canonical documentation
│   ├── goal.md                    # Product goal (source of truth)
│   ├── architecture.md            # ADRs
│   ├── delivery-plan.md           # Milestone plan
│   ├── security-model.md          # Privacy + safety controls
│   └── test-strategy.md           # CI + test criteria
├── src/
│   ├── app/                       # Next.js app router pages
│   ├── components/                # React components
│   ├── lib/                       # Core library code
│   │   ├── exif-strip.ts          # EXIF stripping (critical)
│   │   ├── h3-utils.ts            # H3 utilities
│   │   ├── game-data.ts           # Static game data
│   │   ├── supabase/
│   │   │   ├── client.ts          # Browser Supabase client (anon key only)
│   │   │   └── server.ts          # Server Supabase clients (anon + service role)
│   │   └── types.ts               # TypeScript types
│   └── middleware.ts              # Turnstile + auth middleware
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql # Database schema + RLS policies
├── .env.local.example             # Environment variable template
└── package.json
```

---

## Milestone Tracking

Current milestone: **M1 (Foundation) — DONE**

| Milestone | Status | Docs |
|-----------|--------|------|
| M1: Repository + Foundation | ✅ Done | `docs/goal.md` |
| M2: Factions + player identity + auth | ⏳ Next | `docs/delivery-plan.md` |
| M3: Public territory map (MapLibre) | ⏳ | `docs/delivery-plan.md` |
| M4: Hider deployment flow + moderation | ⏳ | `docs/delivery-plan.md` |
| M5: Seeker proof and capture flow | ⏳ | `docs/delivery-plan.md` |
| M6: Territory calculation + maintenance | ⏳ | `docs/delivery-plan.md` |
| M7: Moderation, safety, privacy, hardening | ⏳ | `docs/delivery-plan.md` |

---

## Key Decisions (committed)

| Decision | Document | Key rationale |
|----------|----------|---------------|
| H3 res 7 for public cells | `docs/architecture.md` ADR-001 | ~0.73 km² per cell — right granularity for city-level territory game |
| Two-table privacy split | `docs/architecture.md` ADR-001 | `private_hide_locations` isolated via RLS at DB layer |
| EXIF strip via sharp | `docs/architecture.md` ADR-008 | JPEG mozjpeg + PNG recompress strips all metadata |
| Cloudflare Turnstile | `docs/architecture.md` ADR-006 | Privacy-friendly bot protection, server-side verification |
| No markers on map | `docs/security-model.md` | Only H3 cell polygons — no exact coordinates ever rendered |
| Service role server-only | `docs/security-model.md` | Key has no `NEXT_PUBLIC_` prefix — never reaches browser |

---

## Validation Before Any Commit

Before committing any change, verify:

```bash
# 1. No coordinates in client-facing code
grep -r "exact_location\|longitude\|latitude\|ST_X\|ST_Y" src/ --include="*.ts" --include="*.tsx"

# 2. No NEXT_PUBLIC on secret keys
grep -r "NEXT_PUBLIC.*SERVICE_ROLE\|NEXT_PUBLIC.*SECRET_KEY" src/

# 3. No hardcoded credentials
grep -r "AKFycbw\|sk-\|ghp_\|\x27[0-9a-f]{32}\x27" src/ --include="*.ts" --include="*.tsx"

# 4. RLS policies still cover all tables
grep "enable row level security" supabase/migrations/*.sql

# 5. All new API routes have auth + Turnstile checks
grep -r "verifyTurnstile\|getUser\|auth" src/app/api/
```

If any of the above returns unexpected results, investigate before committing.

---

## Deployment Rules

### Immutable release model

- **Deploy from artifact, not git checkout.** Artifacts are built in GitHub Actions, uploaded to VPS via SCP, and unpacked into timestamped release directories under `/opt/meccha-chameleon/staging/releases/<timestamp>-<sha>/`.
- Never run `git clone` or `git pull` on the VPS as a deployment mechanism.
- The `current` symlink is the only pointer to the active release. Switch it atomically.

### Secrets on VPS only

- `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, and any future server-only secrets live ONLY in `/opt/meccha-chameleon/staging/shared/.env.production` on the VPS.
- These files must NEVER be in the release artifact or committed to GitHub.
- Browser-safe values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) may be in the artifact because they are already public-facing.

### Migrations are Arch-controlled

- Database migrations are separate from application deployments.
- Never mix migration runs into the deploy script. Run them before or after deploy, separately.
- Always test migrations on staging Supabase before applying to production.

### Media paths are immutable per environment

- Staging: `/srv/meccha-chameleon-staging/media/`
- Production: `/srv/meccha-chameleon/media/`
- Media directories are NEVER inside release directories (`/opt/meccha-chameleon/`).
- Media directories are NEVER rolled back with app releases.

### Rollback is automatic on local failure

- `staging-install.sh` must automatically restore the previous `current` symlink if local health fails after a symlink switch.
- Explicit rollback via `staging-rollback.sh` is for operator use only.

### No Docker for staging

- Staging uses systemd + immutable releases. Docker is deferred to the production deployment milestone.
- This is per ADR-010, not a temporary choice.

---

## Getting Help

- **Architecture questions** → read `docs/architecture.md`
- **Milestone scope** → read `docs/delivery-plan.md`
- **Security concerns** → read `docs/security-model.md`
- **Test requirements** → read `docs/test-strategy.md`
- **Product goal** → read `docs/goal.md`

---

_Last validated: 2026-06-29 (M1 baseline recovery pass)_