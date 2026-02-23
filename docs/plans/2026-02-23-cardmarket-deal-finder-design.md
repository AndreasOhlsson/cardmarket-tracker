# Cardmarket Deal Finder — Design Document

**Date:** 2026-02-23
**Status:** Approved

## Problem

Track MTG card prices from Cardmarket (European market) and get notified via Slack when deals appear — cards priced significantly below their trend/average.

## Feasibility Research Summary

### Direct scraping: Not viable

Cardmarket runs Cloudflare + SEON anti-bot. Every page (including robots.txt) returns Cloudflare challenge pages. All known open-source scrapers (CMScrape, cardmarket_crawler) are dead/archived. Bypassing requires residential proxies, stealth browsers, and constant maintenance.

### Chosen approach: MTGJSON + Cardmarket CSV hybrid

| Source | Phase | Auth | Data | Update |
|---|---|---|---|---|
| MTGJSON AllPricesToday | 1 | None | Cardmarket trend, avg (90-day history) | Daily |
| Cardmarket Price Guide CSV | 2 | Account + session | 18 columns: low, trend, 1/7/30-day avg, foil | Daily |

MTGJSON is free, no auth, and already includes Cardmarket paper prices. Cardmarket's own CSV adds the `low_price` field for more precise deal detection but requires session management through Cloudflare.

## Architecture

```
Scheduler (daily)
    │
    ├── MTGJSON Fetcher ──────┐
    │                         ▼
    ├── Cardmarket CSV ──► SQLite DB ──► Deal Engine ──► Slack Webhook
    │   Fetcher (v2)          ▲
    │                         │
    └── Watchlist (JSON) ─────┘
```

### Phase 1: MTGJSON pipeline

- Download MTGJSON `AllPricesToday` (JSON, ~50MB compressed)
- Parse Cardmarket paper prices
- Filter to cards with trend price > €10
- Store daily snapshots in SQLite
- Run deal detection against accumulated history
- Send Slack webhook for triggered alerts

### Phase 2: Cardmarket CSV enrichment

- Download Cardmarket's official Price Guide CSV (free for all users)
- Merge with MTGJSON data — adds low_price, 1/7/30-day averages
- Improves deal detection with low_price vs trend_price comparison
- Requires Cardmarket account + session cookie management

## Data Model (SQLite)

```sql
CREATE TABLE cards (
    uuid TEXT PRIMARY KEY,       -- MTGJSON UUID
    name TEXT NOT NULL,
    set_code TEXT,
    set_name TEXT,
    scryfall_id TEXT
);

CREATE TABLE prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL REFERENCES cards(uuid),
    date TEXT NOT NULL,           -- YYYY-MM-DD
    cm_trend REAL,               -- Cardmarket trend price (EUR)
    cm_avg REAL,                 -- Cardmarket average sell price
    cm_low REAL,                 -- Cardmarket lowest price (Phase 2)
    cm_foil_trend REAL,          -- Cardmarket foil trend
    source TEXT NOT NULL,        -- 'mtgjson' or 'cardmarket'
    UNIQUE(uuid, date, source)
);

CREATE TABLE watchlist (
    uuid TEXT PRIMARY KEY REFERENCES cards(uuid),
    added_date TEXT NOT NULL,
    notes TEXT
);

CREATE TABLE deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL REFERENCES cards(uuid),
    date TEXT NOT NULL,
    deal_type TEXT NOT NULL,      -- 'trend_drop', 'new_low', 'watchlist_alert'
    current_price REAL NOT NULL,
    reference_price REAL NOT NULL,
    pct_change REAL NOT NULL,
    notified INTEGER DEFAULT 0
);

CREATE INDEX idx_prices_uuid_date ON prices(uuid, date);
CREATE INDEX idx_deals_date ON deals(date);
```

## Deal Detection Rules

| Rule | Trigger | Applies to |
|---|---|---|
| Trend drop | Today's trend > 15% below 30-day avg | All cards > €10 |
| Watchlist alert | Any price change > 5% | Watchlisted cards only |
| New low | Price hits lowest in tracked history | All cards > €10 |

Thresholds are configurable via `config.ts`.

## Slack Notification

Uses Slack Incoming Webhook. Message format using Block Kit:

```
DEAL: Ragavan, Nimble Pilferer (MH2)
  Trend: €58.00 -> €48.50 (-16.4%)
  30-day avg: €57.80
  https://www.cardmarket.com/en/Magic/Products/Singles/...
```

Batch deals into a single message per run to avoid spam. Slack webhooks have no meaningful rate limit for daily batched messages.

## Filters

- **Price floor:** Only track cards with Cardmarket trend > €10 (configurable)
- **Watchlist:** Always track watchlisted cards regardless of price
- **Language:** Phase 2 — MTGJSON aggregates across languages. Per-language filtering requires Cardmarket's product-level data or individual listing scraping
- **Region:** Cardmarket is inherently EU. No additional filtering needed.

## Project Structure

```
cardmarket-tracker/
├── src/
│   ├── index.ts              # Entry point, scheduler
│   ├── fetchers/
│   │   ├── mtgjson.ts        # MTGJSON download + parse
│   │   └── cardmarket.ts     # Phase 2: CSV download + parse
│   ├── db/
│   │   ├── schema.ts         # SQLite schema, migrations
│   │   └── queries.ts        # CRUD operations
│   ├── engine/
│   │   ├── deals.ts          # Deal detection logic
│   │   └── filters.ts        # Price threshold, watchlist filters
│   ├── notifications/
│   │   └── slack.ts           # Slack webhook client
│   └── config.ts             # All configurable thresholds
├── data/
│   └── watchlist.json        # User's card watchlist
├── docs/
│   └── plans/
│       └── 2026-02-23-cardmarket-deal-finder-design.md
├── package.json
├── tsconfig.json
└── .gitignore
```

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Database:** better-sqlite3 (sync, fast, zero-config)
- **HTTP:** native fetch (Node 18+)
- **Scheduling:** node-cron
- **Slack:** Incoming Webhook POST (no library needed)
- **Compression:** zlib (for MTGJSON gzip handling)

## Open Questions for Implementation

1. MTGJSON's AllPricesToday file size — need to verify and handle memory efficiently (stream if large)
2. Cardmarket product ID mapping to MTGJSON UUID — need to verify join key
3. Slack webhook message size limits — batch appropriately (max ~50 attachments per message)
