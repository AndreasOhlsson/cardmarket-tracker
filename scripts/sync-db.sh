#!/bin/sh
set -e

# Sync local SQLite DB to Fly.io
# Usage: SYNC_SECRET=<secret> ./scripts/sync-db.sh

DB_PATH="${DB_PATH:-data/tracker.db}"
FLY_URL="${FLY_URL:-https://cardmarket-tracker.fly.dev}"

if [ -z "$SYNC_SECRET" ]; then
  echo "Error: SYNC_SECRET is required"
  echo "Set it with: fly secrets set SYNC_SECRET=<your-secret>"
  echo "Then run:    SYNC_SECRET=<your-secret> ./scripts/sync-db.sh"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
echo "Compressing $DB_PATH ($DB_SIZE)..."
gzip -c "$DB_PATH" > /tmp/tracker.db.gz
GZ_SIZE=$(du -h /tmp/tracker.db.gz | cut -f1)
echo "Compressed to $GZ_SIZE"

echo "Uploading to $FLY_URL..."
HTTP_CODE=$(curl -s -o /tmp/sync-response.txt -w "%{http_code}" \
  -X PUT "$FLY_URL/api/sync-db" \
  -H "Authorization: Bearer $SYNC_SECRET" \
  -H "Content-Encoding: gzip" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/tracker.db.gz \
  --max-time 300)

rm -f /tmp/tracker.db.gz

if [ "$HTTP_CODE" = "200" ]; then
  echo "Upload complete!"
  cat /tmp/sync-response.txt
  echo
else
  echo "Upload failed (HTTP $HTTP_CODE):"
  cat /tmp/sync-response.txt
  echo
  exit 1
fi
