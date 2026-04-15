#!/bin/bash
# Usage: ./deploy/deploy.sh
# Run from /var/www/krishnabyrr after pulling latest code.

set -e

APP_DIR="/var/www/krishnabyrr"
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
cd api && NODE_ENV=production node -r dotenv/config node_modules/.bin/ts-node src/db/migrate.ts; cd ..

echo "==> Restarting services..."
pm2 reload deploy/ecosystem.config.js --update-env

echo "==> Done. Status:"
pm2 list
