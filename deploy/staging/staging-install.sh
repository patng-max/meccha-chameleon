#!/bin/sh
# staging-install.sh — deploy a Meccha Chameleon staging release
# Usage: ./staging-install.sh <release-sha>
# Called by GitHub Actions SSH action after SCP transfer.

set -e

RELEASE_SHA="${1:-}"
STAGING_ROOT="/opt/meccha-chameleon/staging"
RELEASES_DIR="$STAGING_ROOT/releases"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_SHA"
SHARED_DIR="$STAGING_ROOT/shared"
SERVICE_NAME="meccha-chameleon-staging"
MAX_RELEASES=3

if [ -z "$RELEASE_SHA" ]; then
    echo "ERROR: Usage: staging-install.sh <release-sha>"
    exit 1
fi

echo "=== Staging Deploy: $RELEASE_SHA ==="

# Verify release directory was created by the tar extraction
if [ ! -d "$RELEASE_DIR" ]; then
    echo "ERROR: Release directory $RELEASE_DIR does not exist"
    exit 1
fi

# Ensure media directories exist (in case this is a fresh install)
mkdir -p /srv/meccha-chameleon-staging/media/public/clues
mkdir -p /srv/meccha-chameleon-staging/media/private/proofs

# Install dependencies (omit devDependencies for smaller artifact)
echo "Installing dependencies..."
cd "$RELEASE_DIR"
/home/deploy/.nvm/versions/node/v22.22.2/bin/npm ci --omit=dev --silent

# Build the Next.js standalone
echo "Building Next.js..."
/home/deploy/.nvm/versions/node/v22.22.2/bin/node node_modules/.bin/next build

# --- Atomic symlink switch ---
echo "Switching symlink to new release..."
rm -f "$STAGING_ROOT/current"
ln -s "$RELEASE_DIR" "$STAGING_ROOT/current"

# Restart systemd service
echo "Restarting $SERVICE_NAME..."
sudo systemctl restart "$SERVICE_NAME"

# --- Local health check (5 retries, 5s apart) ---
echo "Running local health check..."
HEALTH_OK=""
for i in 1 2 3 4 5; do
    sleep 5
    if curl -sf http://127.0.0.1:4201/api/health | grep -q '"status":"healthy"'; then
        HEALTH_OK="yes"
        echo "Health check passed (attempt $i)"
        break
    fi
    echo "Health check attempt $i failed"
done

if [ -z "$HEALTH_OK" ]; then
    echo "ERROR: Local health check failed after 5 attempts — rolling back"
    # Restore previous release
    sudo systemctl stop "$SERVICE_NAME"
    rm -f "$STAGING_ROOT/current"
    PREV=$(ls -1t "$RELEASES_DIR" | grep -v "^$RELEASE_SHA$" | head -1)
    if [ -n "$PREV" ]; then
        echo "Restoring previous release: $PREV"
        ln -s "$RELEASES_DIR/$PREV" "$STAGING_ROOT/current"
        sudo systemctl restart "$SERVICE_NAME"
    fi
    echo "Rollback complete. Current release is $(ls -la "$STAGING_ROOT/current" 2>/dev/null | grep -o 'releases/[^ ]*' || echo 'none')"
    exit 1
fi

echo "Deployment successful: $RELEASE_SHA"

# --- Prune old releases (keep MAX_RELEASES most recent) ---
echo "Pruning old releases (keeping $MAX_RELEASES)..."
ls -1t "$RELEASES_DIR" | tail -n +$((MAX_RELEASES + 1)) | while read -r old_release; do
    echo "Deleting old release: $old_release"
    rm -rf "$RELEASES_DIR/$old_release"
done

echo "=== Deploy complete: $RELEASE_SHA ==="
