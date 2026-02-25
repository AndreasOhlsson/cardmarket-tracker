#!/bin/sh
set -e

# Export current env vars so cron jobs can access them
env | grep -E '^(DB_PATH|NODE_ENV|SLACK_WEBHOOK_URL|PRICE_FLOOR|TREND_DROP|WATCHLIST_ALERT|IDENTIFIERS|PIPELINE|PATH|HOME|IDENTIFIERS_CACHE_PATH)' > /app/.env.cron

# Install crontab and start crond in background
crontab /app/crontab
crond -l 2

echo "Cron scheduler started (pipeline runs daily at 06:00 UTC)"

# Start the web server (foreground — keeps the container alive)
exec npx tsx server/api.ts
