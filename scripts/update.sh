#!/bin/sh
set -e

# Run the price pipeline locally, then sync the DB to Fly.io
# Usage: yarn update

cd "$(dirname "$0")/.."

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

DB_PATH="${DB_PATH:-data/tracker.db}"
FLY_URL="${FLY_URL:-https://cardmarket-tracker.fly.dev}"

if [ -z "$SYNC_SECRET" ]; then
  echo "Error: SYNC_SECRET not set in .env"
  exit 1
fi

# 1. Build and run pipeline
echo "==> Building..."
yarn build 2>&1 | tail -1

echo "==> Running pipeline..."
node dist/src/index.js

# 2. Compress and upload DB
if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
echo "==> Compressing $DB_PATH ($DB_SIZE)..."
gzip -c "$DB_PATH" > /tmp/tracker.db.gz
GZ_SIZE=$(du -h /tmp/tracker.db.gz | cut -f1)
echo "    Compressed to $GZ_SIZE"

echo "==> Uploading to $FLY_URL..."
HTTP_CODE=$(curl -s -o /tmp/sync-response.txt -w "%{http_code}" \
  -X PUT "$FLY_URL/api/sync-db" \
  -H "Authorization: Bearer $SYNC_SECRET" \
  -H "Content-Encoding: gzip" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/tracker.db.gz \
  --max-time 300)

rm -f /tmp/tracker.db.gz

if [ "$HTTP_CODE" = "200" ]; then
  echo "==> Done! DB synced to Fly.io"
else
  echo "Upload failed (HTTP $HTTP_CODE):"
  cat /tmp/sync-response.txt
  echo
  exit 1
fi
