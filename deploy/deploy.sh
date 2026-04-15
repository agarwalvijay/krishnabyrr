#!/bin/bash
# Run from ~/krishnabyrr after pulling latest code.
# Usage: cd ~/krishnabyrr && ./deploy/deploy.sh

set -e

APP_DIR="$HOME/krishnabyrr"
cd "$APP_DIR"

echo "==> Pulling latest code..."
git pull origin main

echo "==> Installing dependencies..."
npm install --workspaces --include-workspace-root

echo "==> Building shared package..."
npm run build -w packages/shared

echo "==> Building API..."
npm run build -w api

echo "==> Building admin..."
npm run build -w apps/admin

echo "==> Building web..."
npm run build -w apps/web

echo "==> Running DB migrations..."
cd "$APP_DIR/api" && NODE_ENV=production node -r dotenv/config dist/db/migrate.js
cd "$APP_DIR"

echo "==> Restarting services..."
pm2 reload "$APP_DIR/deploy/ecosystem.config.js" --update-env

echo "==> Done."
pm2 list
