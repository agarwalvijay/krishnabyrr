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

# API (TypeScript → dist/)
echo "      api..."
npm run build -w api --silent

# Admin (Vite → apps/admin/dist/)
echo "      admin..."
npm run build -w apps/admin --silent

# Web (Next.js → apps/web/.next/)
echo "      web (this takes ~60s)..."
npm run build -w apps/web --silent

echo "      done."

# ── 3. Ensure remote dir structure exists ──────────────────────────────────────
echo "==> [3/6] Preparing remote directories..."
$SSH "$GCP_HOST" "mkdir -p $REMOTE_DIR/api/uploads $REMOTE_DIR/apps/web $REMOTE_DIR/apps/admin $REMOTE_DIR/deploy"

# ── 4. Rsync source + built artifacts ─────────────────────────────────────────
echo "==> [4/6] Pushing files to GCP..."

# Common excludes
EXCLUDES=(
  --exclude='.git'
  --exclude='.claude'
  --exclude='node_modules'
  --exclude='*.test.ts'
  --exclude='*.test.js'
  --exclude='.env.local'
  --exclude='SESSION_CHECKPOINT.md'
  --exclude='apps/web/.next/cache'    # skip fetch cache — forces fresh on restart
)

# Root: package.json, package-lock.json, tsconfig, deploy/
eval $RSYNC "${EXCLUDES[@]}" \
  --include='package.json' \
  --include='package-lock.json' \
  --include='tsconfig.json' \
  --include='deploy/***' \
  --exclude='*' \
  ./ "$GCP_HOST:$REMOTE_DIR/"

# API: source (for migrations) + compiled dist/
eval $RSYNC "${EXCLUDES[@]}" \
  api/ "$GCP_HOST:$REMOTE_DIR/api/"

# Web: source + .next build output
eval $RSYNC "${EXCLUDES[@]}" \
  apps/web/ "$GCP_HOST:$REMOTE_DIR/apps/web/"

# Admin: compiled dist/ only (static files served by nginx)
eval $RSYNC "${EXCLUDES[@]}" \
  apps/admin/dist/ "$GCP_HOST:$REMOTE_DIR/apps/admin/dist/"

echo "      files pushed."

# ── 5. Install production deps on server (fast — no build) ────────────────────
echo "==> [5/6] Installing production node_modules on server..."
$SSH "$GCP_HOST" "cd $REMOTE_DIR && npm install --workspaces --include-workspace-root --omit=dev --silent"

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
