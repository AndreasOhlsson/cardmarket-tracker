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
Seed (one-time)                     Scheduler (daily)
    │                                   │
    ├── AllPrices (90-day) ─────┐       ├── MTGJSON Fetcher ──────┐
    │                           ▼       │                         ▼
    └── AllIdentifiers ──► SQLite DB ◄──┤── Cardmarket CSV ──► Deal Engine ──► Slack Webhook
        (card metadata)        ▲        │   Fetcher (Phase 2)     ▲
                               │        │                         │
                               │        └── Watchlist (JSON) ─────┘
                               │
                          AllIdentifiers
                          (cached monthly)
```

### Bootstrap: `yarn seed`

- Download MTGJSON `AllPrices` (~136MB gzipped, 90-day history) to disk
- Download MTGJSON `AllIdentifiers` (~500MB+, card metadata) to disk
- Stream-parse both files using `stream-json` (constant memory, no OOM)
- Populate `cards` table with names, set codes, mcmId, scryfall_id, format legality
- Populate `prices` table with 90-day Cardmarket price history
- Filter to Commander-legal cards only
- This gives the deal engine a meaningful baseline from day one

### Phase 1: MTGJSON daily pipeline

- Auto-refresh AllIdentifiers if cache is >30 days old (check file mtime), re-download and upsert new Commander-legal cards
- Download MTGJSON `AllPricesToday` (JSON, ~5MB gzipped, ~50MB uncompressed)
- Load full file into memory and parse Cardmarket paper prices
- Path: `data.<uuid>.paper.cardmarket.retail.normal: { "YYYY-MM-DD": price }`
- Filter to Commander-legal cards with trend price > €10 (or on watchlist)
- Store daily snapshots in SQLite
- Run deal detection against accumulated history
- Send Slack webhook for triggered alerts
- Built-in retry: on failure, retry up to 3 times with 15-minute delay between attempts

### Phase 2: Cardmarket CSV enrichment (runs alongside Phase 1)

- Download Cardmarket's official Price Guide CSV (free for all users)
- Merge with MTGJSON data — adds low_price, 1/7/30-day averages
- Improves deal detection with low_price vs trend_price comparison
- Requires Cardmarket account + session cookie management

### Card identity: AllIdentifiers

- MTGJSON price files are keyed by UUID but do NOT contain card names or metadata
- AllIdentifiers provides: name, setCode, setName, mcmId, mcmMetaId, scryfallId, legalities
- Cached locally, auto-refreshed when cache file mtime is >30 days old
- Daily pipeline checks staleness before fetching prices — ensures new set cards are tracked
- mcmId used to construct Cardmarket URLs: `https://www.cardmarket.com/en/Magic/Products/Singles/<set>/<name>`

## Data Model (SQLite)

```sql
CREATE TABLE cards (
    uuid TEXT PRIMARY KEY,       -- MTGJSON UUID
    name TEXT NOT NULL,
    set_code TEXT,
    set_name TEXT,
    scryfall_id TEXT,
    mcm_id INTEGER,              -- Cardmarket product ID (for URL construction)
    mcm_meta_id INTEGER,         -- Cardmarket meta product ID
    commander_legal INTEGER DEFAULT 0  -- 1 if legal in Commander
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

- **Format:** Commander-legal cards only (checked against AllIdentifiers legalities)
- **Price floor:** Only track cards with Cardmarket trend > €10 (configurable)
- **Watchlist:** Always track watchlisted cards regardless of price
- **Multiple printings:** All printings tracked separately (same card name, different sets/UUIDs)
- **Language:** Phase 2 — MTGJSON aggregates across languages. Per-language filtering requires Cardmarket's product-level data or individual listing scraping
- **Region:** Cardmarket is inherently EU. No additional filtering needed.

## Project Structure

```
cardmarket-tracker/
├── src/
│   ├── index.ts              # Entry point (run-once, exit)
│   ├── seed.ts               # Bootstrap: download AllPrices + AllIdentifiers
│   ├── fetchers/
│   │   ├── mtgjson.ts        # MTGJSON download + parse
│   │   └── cardmarket.ts     # Phase 2: CSV download + parse
│   ├── db/
│   │   ├── schema.ts         # SQLite schema, migrations
│   │   └── queries.ts        # CRUD operations
│   ├── engine/
│   │   └── deals.ts          # Deal detection logic + filters
│   ├── notifications/
│   │   └── slack.ts           # Slack webhook client
│   └── config.ts             # All configurable thresholds
├── data/
│   ├── watchlist.json        # User's card watchlist (~190 Commander staples)
│   └── cache/                # Cached AllIdentifiers (refreshed monthly)
├── docs/
│   └── plans/
│       └── 2026-02-23-cardmarket-deal-finder-design.md
├── package.json
├── tsconfig.json
└── .gitignore
```

## Tech Stack

- **Runtime:** Node.js + TypeScript (ESM, strict mode)
- **Validation:** Zod (config, watchlist, small payloads only — not used on large data files)
- **Database:** better-sqlite3 (sync, fast, zero-config)
- **HTTP:** native fetch (Node 18+)
- **Scheduling:** External (system cron / systemd timer / Docker). Run-once architecture.
- **Slack:** Incoming Webhook POST (no library needed)
- **Compression:** zlib (for MTGJSON gzip handling)
- **JSON Streaming:** stream-json (for parsing multi-GB MTGJSON files without OOM)
- **Env Loading:** dotenv (loads .env file on startup)
- **Code Quality:** ESLint (typescript-eslint strict), Prettier, `noUncheckedIndexedAccess`

## Resolved Design Decisions

| # | Question | Decision |
|---|---|---|
| 1 | AllPricesToday file size | ~5MB gzipped, ~50MB uncompressed. Load fully into memory. |
| 2 | Card identity (names, metadata) | Download AllIdentifiers separately (~500MB+), cache locally, refresh monthly. |
| 3 | Cardmarket URL construction | Build from mcmId (product ID) in AllIdentifiers. |
| 4 | Large file memory handling | Stream-parse from disk using stream-json. AllPricesToday (~50MB) loads into memory; AllPrices/AllIdentifiers (multi-GB) stream. |
| 5 | Multiple printings of same card | Track all printings separately (unique UUID per printing). |
| 6 | Cold start (no history) | Separate `yarn seed` command bootstraps 90-day history from AllPrices. |
| 7 | MTGJSON buylist data | Empty for Cardmarket — ignore. |
| 8 | Format filtering | Commander-legal cards only. |

| 9 | Run-once vs long-running | Run-once script. External scheduler handles timing. Removes node-cron. |
| 10 | dotenv or external env vars | Add dotenv for local dev convenience. |
| 11 | Zod on large data files | Skip Zod for multi-MB payloads (AllPricesToday). Validate defensively in parser. |
| 12 | AllIdentifiers staleness | Auto-refresh in daily pipeline if cache mtime >30 days. Stream-parse and upsert new cards. |
| 13 | Pipeline failure retry | Built-in retry loop: 3 attempts max, 15-minute delay between retries. Exit code 1 after exhausting retries. |

## Open Questions for Implementation

1. Slack webhook message size limits — batch appropriately (max ~50 attachments per message)
