# Staging Deployment Runbook — Meccha Chameleon

> **Authority:** ADR-010 (`docs/architecture.md`).  
> This runbook is for the Meccha Chameleon staging environment on `app.amfbss.com`.

---

## Prerequisites (One-Time VPS Setup)

These steps must be completed before the first GitHub Actions deployment.

### 1. Create deploy user (if not exists)

```bash
# On VPS as root
useradd -m -s /bin/bash -G ssh,docker deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
```

### 2. Authorise SSH key for deploy user

```bash
# Add the GitHub Actions SSH deploy key to:
# /home/deploy/.ssh/authorized_keys
# chmod 600 /home/deploy/.ssh/authorized_keys
```

### 3. Install Node.js via nvm

```bash
# As deploy user
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 22.22.2
nvm alias default 22.22.2
```

Verify:
```bash
node -v   # should output v22.22.2
npm -v
```

### 4. Create directory structure

```bash
# As deploy user (or via sudo from deploy)
sudo mkdir -p /opt/meccha-chameleon/staging/releases
sudo mkdir -p /opt/meccha-chameleon/staging/shared
sudo mkdir -p /srv/meccha-chameleon-staging/media/public/clues
sudo mkdir -p /srv/meccha-chameleon-staging/media/private/proofs
sudo chown -R deploy:deploy /opt/meccha-chameleon
sudo chown -R deploy:deploy /srv/meccha-chameleon-staging
```

### 5. Create environment file

Create `/opt/meccha-chameleon/staging/shared/.env.production` with staging-only values:

```env
NODE_ENV=production
PORT=4201
HOSTNAME=127.0.0.1

# Supabase (staging project)
NEXT_PUBLIC_SUPABASE_URL=https://rquntpbnpvslnnjzaaxd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<staging-site-key>
TURNSTILE_SECRET_KEY=<staging-secret-key>

# Map
NEXT_PUBLIC_MAPLIBRE_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

**Important:** This file must NOT be committed to the repo. It lives only on the VPS.

### 6. Install and configure Nginx

```bash
# Install
sudo apt-get install -y nginx

# Copy committed Nginx config into place
sudo cp /opt/meccha-chameleon/staging/deploy/staging/nginx-meccha-chameleon-staging.conf \
       /etc/nginx/sites-available/meccha-chameleon-staging
sudo ln -sf /etc/nginx/sites-available/meccha-chameleon-staging \
             /etc/nginx/sites-enabled/meccha-chameleon-staging

# Remove default site if present
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

### 7. Install systemd service

```bash
sudo cp /opt/meccha-chameleon/staging/deploy/staging/meccha-chameleon-staging.service \
       /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable meccha-chameleon-staging.service
```

### 8. Cloudflare DNS

- Add a proxied A record: `staging.meccha.fun` → `187.77.103.25`
- Set SSL/TLS mode to **Full (strict)**
- Enable **Always Use HTTPS**
- Create a Cache Rule: `UrlPath` matches `/media/public/clues/*` → **Cache eligibility: eligible, max-age=31536000**
- Create a Cache Rule: `UrlPath` matches `/media/private/proofs/*` OR `Cache-Control: private` → **Bypass cache**

### 9. Supabase OAuth callback

Add to staging Supabase project authentication settings:
- Redirect URL: `https://staging.meccha.fun/auth/callback`

---

## Deploying (Automatic)

Staging deploys automatically on every push to `main` via GitHub Actions.

**Pipeline:**
1. CI gates: lint → typecheck → test → build
2. Package standalone artifact
3. Upload to VPS via SCP
4. `staging-install.sh` unpacks, symlink-switches, restarts systemd, health-checks
5. External health check against `https://staging.meccha.fun/api/health`

**Verify a successful deploy:**

```bash
# Local health (from VPS)
curl -s http://127.0.0.1:4201/api/health

# External health
curl -s https://staging.meccha.fun/api/health

# Check which release is live
ls -la /opt/meccha-chameleon/staging/current
# Or:
cat /opt/meccha-chameleon/staging/current/REVISION

# Check systemd service
sudo systemctl status meccha-chameleon-staging.service
```

**Health response must:**
- Return HTTP 200
- Contain `{"status":"ok",...}` (or similar non-secret JSON)
- NOT contain any env values, secret keys, coordinates, or internal paths

---

## Rolling Back

### Automatic rollback

`staging-install.sh` automatically rolls back if local health fails after a symlink switch. No action required.

### Manual rollback (operator)

```bash
# Roll back to the previous release
ssh deploy@app.amfbss.com \
  '/opt/meccha-chameleon/staging/scripts/staging-rollback.sh previous'

# Roll back to a specific release
ssh deploy@app.amfbss.com \
  '/opt/meccha-chameleon/staging/scripts/staging-rollback.sh 20260629T153000Z-ce84f9b'
```

**After rollback, verify:**
```bash
curl -s http://127.0.0.1:4201/api/health
curl -s https://staging.meccha.fun/api/health
```

### List available releases

```bash
ssh deploy@app.amfbss.com \
  'ls -t /opt/meccha-chameleon/staging/releases/ | head -10'
```

---

## Verifying Staging Environment

### Health endpoint
```bash
curl -s https://staging.meccha.fun/api/health | python3 -m json.tool
```

### Public media accessible
```bash
# Should return image data with long cache headers
curl -sI https://staging.meccha.fun/media/public/clues/test.jpg \
  | grep -E 'Content-Type|Cache-Control|HTTP/'

# Expected Cache-Control: public, max-age=31536000, immutable
```

### Private media NOT publicly accessible
```bash
# Must return 404 or deny (not 200)
curl -sI https://staging.meccha.fun/media/private/proofs/test.jpg \
  | grep -E 'HTTP/'

# Should NOT have Cache-Control: public
```

### Nginx serving app
```bash
# App routes proxied
curl -sI https://staging.meccha.fun/api/territory \
  | grep -E 'HTTP/|Content-Type'

# Should return HTTP 200 with JSON
```

### Nginx config test
```bash
sudo nginx -t
```

---

## Logs

### Application logs (systemd journal)
```bash
sudo journalctl -u meccha-chameleon-staging.service -f --since "10 minutes ago"
sudo journalctl -u meccha-chameleon-staging.service --since today
```

### Nginx access/error logs
```bash
sudo tail -f /var/log/nginx/meccha-chameleon-staging_access.log
sudo tail -f /var/log/nginx/meccha-chameleon-staging_error.log
```

---

## Media Directories

| Path | Contents | Access |
|------|----------|--------|
| `/srv/meccha-chameleon-staging/media/public/clues/` | Clue photos | Static via Nginx + Cloudflare |
| `/srv/meccha-chameleon-staging/media/private/proofs/` | Proof photos | Authenticated app routes only |

**Media is never inside `/opt/meccha-chameleon/staging/releases/`.**

---

## Migrations

Database migrations are separate from application deployments.

**To run migrations on staging Supabase:**

```bash
# Apply all migrations via Supabase CLI (from local machine)
supabase db push --project-ref rquntpbnpvslnnjzaaxd

# Or apply a specific migration manually via psql
psql "postgresql://postgres:<password>@db.rquntpbnpvslnnjzaaxd.supabase.co:5432/postgres" \
  -f supabase/migrations/003_m2_m3_h3_seed_correction.sql
```

**Rules:**
- Migrations run BEFORE or AFTER deploy, not during
- Never run migrations against prod before staging
- Always verify migration result in staging Supabase dashboard before prod

---

## Cleanup (Release Pruning)

Old releases are pruned automatically by `staging-install.sh` (keeps 5 most recent).

To manually prune:
```bash
ssh deploy@app.amfbss.com \
  'ls -t /opt/meccha-chameleon/staging/releases/ | tail -n +6 | \
   xargs -I{} rm -rf /opt/meccha-chameleon/staging/releases/{}'
```

---

## Troubleshooting

### App returns 502
- Check systemd service is running: `sudo systemctl status meccha-chameleon-staging.service`
- Check app is binding localhost:4201: `ss -tlnp | grep 4201`
- Check Nginx proxy config: `sudo nginx -t`

### Health check fails but app is running
- Check app logs: `sudo journalctl -u meccha-chameleon-staging.service --since "5 minutes ago"`
- Verify `.env.production` exists and has correct values
- Verify Supabase staging project is accessible from VPS (network test)

### CSS/assets missing after deploy
- Check `.next/static` was copied into the release: `ls /opt/meccha-chameleon/staging/current/.next/static/`
- Check Nginx is serving static files: `curl -sI https://staging.meccha.fun/_next/static/...`
- If missing, the release was likely not packaged correctly — rollback and investigate

### Private media returns 200 (security incident)
- Immediately investigate Nginx config for misconfigured aliases
- Run: `curl -sI https://staging.meccha.fun/media/private/proofs/test.jpg`
- If public, block the URL at Cloudflare level and escalate

---

## Emergency Contacts

- **Supabase Dashboard (staging):** https://supabase.com/dashboard/project/rquntpbnpvslnnjzaaxd
- **Cloudflare Dashboard:** https://dash.cloudflare.com/
- **VPS SSH:** `ssh -i ~/.ssh/id_ed25519_vps_arch deploy@app.amfbss.com`
