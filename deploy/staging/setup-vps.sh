#!/bin/sh
# setup-vps.sh — one-time VPS setup for Meccha Chameleon staging
# Run once as root or sudo before first GitHub Actions deployment.

set -e

STAGING_ROOT="/opt/meccha-chameleon/staging"
MEDIA_ROOT="/srv/meccha-chameleon-staging"

echo "=== Meccha Chameleon Staging — VPS Setup ==="

# Check node version
NODE_VERSION=$(/home/deploy/.nvm/versions/node/v22.22.2/bin/node --version 2>/dev/null || echo "")
if [ "$NODE_VERSION" != "v22.22.2" ]; then
    echo "ERROR: Expected Node v22.22.2, got $NODE_VERSION"
    echo "Install with: su - deploy && nvm install 22.22.2 && nvm alias default 22.22.2"
    exit 1
fi
echo "Node version: $NODE_VERSION — OK"

# Create application directories
echo "Creating application directories..."
mkdir -p "$STAGING_ROOT/releases"
mkdir -p "$STAGING_ROOT/shared"

# Create media directories
echo "Creating media directories..."
mkdir -p "$MEDIA_ROOT/media/public/clues"
mkdir -p "$MEDIA_ROOT/media/private/proofs"

# Set ownership
echo "Setting ownership to deploy:deploy..."
chown -R deploy:deploy "$STAGING_ROOT"
chown -R deploy:deploy "$MEDIA_ROOT"

echo "Node version: $NODE_VERSION"
echo "Application root: $STAGING_ROOT"
echo "Media root: $MEDIA_ROOT"
echo ""
echo "=== Next steps (do these manually) ==="
echo "1. Create /opt/meccha-chameleon/staging/shared/.env.production with staging env vars"
echo "2. Copy systemd service: cp $STAGING_ROOT/../../../deploy/staging/meccha-chameleon-staging.service /etc/systemd/system/"
echo "3. Copy Nginx config: cp ... /etc/nginx/sites-available/meccha-chameleon-staging"
echo "4. systemctl daemon-reload && systemctl enable meccha-chameleon-staging"
echo "5. nginx -t && systemctl reload nginx"
echo "6. Cloudflare: add A record staging.meccha.fun → 187.77.103.25 (proxied)"
echo ""
echo "Done."
