#!/bin/bash
# Local deploy: build on this machine, push artifacts to GCP, reload pm2.
#
# Usage:
#   ./deploy/deploy-local.sh <user@host>
#   GCP_HOST=user@host ./deploy/deploy-local.sh
#
# Example:
#   ./deploy/deploy-local.sh vijay@34.100.200.50
#   ./deploy/deploy-local.sh vijay@krishnabyrr.com   # if DNS points to GCP
#
# SSH key: uses ~/.ssh/id_ed25519_personal
# To avoid typing the host every time, set it in your shell profile:
#   export GCP_HOST=vijay@34.100.200.50

set -euo pipefail

# ── Resolve host ───────────────────────────────────────────────────────────────
GCP_HOST="${1:-${GCP_HOST:-}}"
if [[ -z "$GCP_HOST" ]]; then
  echo "Error: GCP host required."
  echo "Usage: $0 <user@host>"
  echo "   or: export GCP_HOST=user@host && $0"
  exit 1
fi

REMOTE_DIR="~/krishnabyrr"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Auto-detect which key works for this host.
# GCP instances typically use id_rsa or id_ed25519 (added via gcloud/console).
# id_ed25519_personal is for GitHub only.
SSH_OPTS="-o StrictHostKeyChecking=no"
for KEY in "$HOME/.ssh/id_rsa" "$HOME/.ssh/id_ed25519" "$HOME/.ssh/id_ed25519_personal"; do
  if [[ -f "$KEY" ]]; then
    if ssh -i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 "$GCP_HOST" true 2>/dev/null; then
      SSH_OPTS="-i $KEY -o StrictHostKeyChecking=no"
      echo "  Using SSH key: $KEY"
      break
    fi
  fi
done

SSH="ssh $SSH_OPTS"
RSYNC="rsync -az --no-owner --no-group -e \"ssh $SSH_OPTS\""

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   KrishnaByrr — Local Build + Push Deploy    ║"
echo "╚══════════════════════════════════════════════╝"
echo "  Target: $GCP_HOST:$REMOTE_DIR"
echo ""

cd "$SCRIPT_DIR"

# ── 1. Install deps ────────────────────────────────────────────────────────────
echo "==> [1/6] Installing dependencies..."
npm install --workspaces --include-workspace-root --silent

# ── 2. Build everything ────────────────────────────────────────────────────────
echo "==> [2/6] Building all workspaces..."

# Shared package (must build before api)
echo "      shared..."
npm run build -w packages/shared --silent

# API (TypeScript → dist/)
echo "      api..."
npm run build -w api --silent

# Admin (Vite → apps/admin/dist/)
echo "      admin..."
npm run build -w apps/admin --silent

# Web (Next.js → apps/web/.next/ with standalone output)
echo "      web (this takes ~60s)..."
npm run build -w apps/web --silent

# Standalone doesn't auto-copy static assets — do it now so the bundle is self-contained.
echo "      copying static assets into standalone..."
cp -r apps/web/.next/static   apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public         apps/web/.next/standalone/apps/web/public

echo "      done."

# ── 3. Ensure remote dir structure exists ──────────────────────────────────────
echo "==> [3/6] Preparing remote directories and clearing stale cache..."
$SSH "$GCP_HOST" "
  mkdir -p $REMOTE_DIR/api/uploads $REMOTE_DIR/apps/web $REMOTE_DIR/apps/admin $REMOTE_DIR/deploy $REMOTE_DIR/packages/shared/dist
  # Wipe Next.js fetch cache and pre-rendered pages so production DB data is used fresh
  rm -rf $REMOTE_DIR/apps/web/.next/cache
  rm -rf $REMOTE_DIR/apps/web/.next/server/app
"

# Copy SQL migrations into dist so compiled migrate.js can find them
echo "      copying SQL migrations into api/dist/db/migrations..."
rm -rf api/dist/db/migrations && cp -r api/src/db/migrations api/dist/db/migrations

# ── 4. Rsync source + built artifacts ─────────────────────────────────────────
echo "==> [4/6] Pushing files to GCP..."

# Common excludes (paths relative to each rsync source root)
COMMON_EXCLUDES=(
  --exclude='.git'
  --exclude='.claude'
  --exclude='node_modules'
  --exclude='*.test.ts'
  --exclude='*.test.js'
  --exclude='.env.local'
  --exclude='SESSION_CHECKPOINT.md'
)

# Root: package.json, package-lock.json, tsconfig, deploy/
eval $RSYNC "${COMMON_EXCLUDES[@]}" \
  --include='package.json' \
  --include='package-lock.json' \
  --include='tsconfig.json' \
  --include='deploy/***' \
  --exclude='*' \
  ./ "$GCP_HOST:$REMOTE_DIR/"

# Shared package dist/ — API requires this at runtime via @krishnabyrr/shared
eval $RSYNC "${COMMON_EXCLUDES[@]}" \
  packages/shared/dist/ "$GCP_HOST:$REMOTE_DIR/packages/shared/dist/"

# API: compiled dist/ (includes migrations) — no source needed on server
eval $RSYNC "${COMMON_EXCLUDES[@]}" \
  api/dist/ "$GCP_HOST:$REMOTE_DIR/api/dist/"

# Also sync api package.json and .env for dotenv
eval $RSYNC "${COMMON_EXCLUDES[@]}" \
  --include='package.json' \
  --include='.env' \
  --exclude='*' \
  api/ "$GCP_HOST:$REMOTE_DIR/api/"

# Web: push the standalone bundle (self-contained, includes its own minimal node_modules).
# Static assets and public/ were already copied into standalone above.
# We deliberately exclude node_modules from COMMON_EXCLUDES here — the standalone
# node_modules are pure-JS and intentionally part of the artifact.
eval "rsync -az --no-owner --no-group -e 'ssh $SSH_OPTS'" \
  --exclude='.git' \
  --exclude='.env.local' \
  --delete \
  apps/web/.next/standalone/ "$GCP_HOST:$REMOTE_DIR/apps/web/.next/standalone/"

# Admin: compiled dist/ only (static files served by nginx)
# Note: Vite bakes public/ assets into dist/ at build time, so no separate copy needed
eval $RSYNC "${COMMON_EXCLUDES[@]}" \
  apps/admin/dist/ "$GCP_HOST:$REMOTE_DIR/apps/admin/dist/"

echo "      files pushed."

# ── 5. Install API production deps on server ───────────────────────────────────
# The web app uses a standalone bundle (self-contained node_modules included in artifact).
# Only the API needs a server-side install — its production deps are small (~50 MB).
echo "==> [5/6] Installing API production node_modules on server..."
# Run from monorepo root with --workspace=api so npm also creates the
# @krishnabyrr/shared workspace symlink. --include-workspace-root covers
# any root-level deps. Web/admin are excluded — web uses standalone bundle.
$SSH "$GCP_HOST" "cd $REMOTE_DIR && npm install --omit=dev --workspace=api --include-workspace-root --silent"

# ── 6. Run migrations + reload pm2 ────────────────────────────────────────────
echo "==> [6/6] Running migrations and reloading services..."
$SSH "$GCP_HOST" "
  set -e
  cd $REMOTE_DIR/api
  NODE_ENV=production node -r dotenv/config dist/db/migrate.js
  cd $REMOTE_DIR
  pm2 reload deploy/ecosystem.config.js --update-env
  pm2 list
"

echo ""
echo "✓ Deploy complete."
