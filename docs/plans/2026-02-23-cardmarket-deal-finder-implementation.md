# Cardmarket Deal Finder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a daily pipeline that fetches MTG card prices from MTGJSON, stores them in SQLite, detects deals on Commander-legal cards, and sends Slack notifications.

**Architecture:** MTGJSON AllPricesToday downloaded daily, parsed for Cardmarket EUR prices, stored in SQLite alongside card metadata from AllIdentifiers. Deal engine compares today's price against 30-day average, watchlist thresholds, and historical lows. Slack webhook fires batched alerts.

**Tech Stack:** TypeScript (ESM), Node.js 18+, better-sqlite3, node-cron, Vitest, native fetch, zlib

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`

**Step 1: Create package.json**

```json
{
  "name": "cardmarket-tracker",
  "version": "0.1.0",
  "type": "module",
  "description": "Track MTG card prices from Cardmarket and get notified of deals via Slack",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "seed": "tsx src/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^12.6.0",
    "node-cron": "^4.2.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

**Step 4: Update .gitignore**

```
node_modules/
dist/
*.db
data/cache/
.env
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, clean exit)

**Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "feat: project scaffolding with TypeScript, better-sqlite3, vitest"
```

---

### Task 2: Configuration Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, it, expect } from "vitest";
import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  it("returns default config values", () => {
    const config = getConfig();
    expect(config.priceFloorEur).toBe(10);
    expect(config.trendDropPct).toBe(0.15);
    expect(config.watchlistAlertPct).toBe(0.05);
    expect(config.cronSchedule).toBe("0 8 * * *");
    expect(config.mtgjson.allPricesTodayUrl).toContain("mtgjson.com");
    expect(config.mtgjson.allPricesUrl).toContain("mtgjson.com");
    expect(config.mtgjson.allIdentifiersUrl).toContain("mtgjson.com");
    expect(config.dbPath).toBe("data/tracker.db");
    expect(config.watchlistPath).toBe("data/watchlist.json");
    expect(config.identifiersCachePath).toBe("data/cache/AllIdentifiers.json");
  });

  it("reads SLACK_WEBHOOK_URL from env", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    const config = getConfig();
    expect(config.slackWebhookUrl).toBe("https://hooks.slack.com/test");
    delete process.env.SLACK_WEBHOOK_URL;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`

**Step 3: Write implementation**

```typescript
// src/config.ts
export interface Config {
  priceFloorEur: number;
  trendDropPct: number;
  watchlistAlertPct: number;
  cronSchedule: string;
  slackWebhookUrl: string;
  dbPath: string;
  watchlistPath: string;
  identifiersCachePath: string;
  mtgjson: {
    allPricesTodayUrl: string;
    allPricesUrl: string;
    allIdentifiersUrl: string;
  };
}

export function getConfig(): Config {
  return {
    priceFloorEur: Number(process.env.PRICE_FLOOR_EUR) || 10,
    trendDropPct: Number(process.env.TREND_DROP_PCT) || 0.15,
    watchlistAlertPct: Number(process.env.WATCHLIST_ALERT_PCT) || 0.05,
    cronSchedule: process.env.CRON_SCHEDULE || "0 8 * * *",
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
    dbPath: process.env.DB_PATH || "data/tracker.db",
    watchlistPath: process.env.WATCHLIST_PATH || "data/watchlist.json",
    identifiersCachePath:
      process.env.IDENTIFIERS_CACHE_PATH || "data/cache/AllIdentifiers.json",
    mtgjson: {
      allPricesTodayUrl:
        "https://mtgjson.com/api/v5/AllPricesToday.json.gz",
      allPricesUrl:
        "https://mtgjson.com/api/v5/AllPrices.json.gz",
      allIdentifiersUrl:
        "https://mtgjson.com/api/v5/AllIdentifiers.json.gz",
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add configuration module with env overrides"
```

---

### Task 3: Database Schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `tests/db/schema.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/db/schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../../src/db/schema.js";

describe("initializeDatabase", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates all required tables", () => {
    initializeDatabase(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("cards");
    expect(tableNames).toContain("prices");
    expect(tableNames).toContain("watchlist");
    expect(tableNames).toContain("deals");
  });

  it("cards table has correct columns", () => {
    initializeDatabase(db);

    const info = db.pragma("table_info(cards)") as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "uuid",
        "name",
        "set_code",
        "set_name",
        "scryfall_id",
        "mcm_id",
        "mcm_meta_id",
        "commander_legal",
      ])
    );
  });

  it("prices table has unique constraint on uuid+date+source", () => {
    initializeDatabase(db);

    // Insert a card first
    db.prepare(
      "INSERT INTO cards (uuid, name) VALUES ('test-uuid', 'Test Card')"
    ).run();

    // Insert a price
    db.prepare(
      "INSERT INTO prices (uuid, date, cm_trend, source) VALUES ('test-uuid', '2026-01-01', 10.0, 'mtgjson')"
    ).run();

    // Duplicate should fail
    expect(() =>
      db
        .prepare(
          "INSERT INTO prices (uuid, date, cm_trend, source) VALUES ('test-uuid', '2026-01-01', 11.0, 'mtgjson')"
        )
        .run()
    ).toThrow();
  });

  it("is idempotent — safe to call multiple times", () => {
    initializeDatabase(db);
    initializeDatabase(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — cannot find module

**Step 3: Write implementation**

```typescript
// src/db/schema.ts
import Database from "better-sqlite3";

export function initializeDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT,
      scryfall_id TEXT,
      mcm_id INTEGER,
      mcm_meta_id INTEGER,
      commander_legal INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL REFERENCES cards(uuid),
      date TEXT NOT NULL,
      cm_trend REAL,
      cm_avg REAL,
      cm_low REAL,
      cm_foil_trend REAL,
      source TEXT NOT NULL,
      UNIQUE(uuid, date, source)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      uuid TEXT PRIMARY KEY REFERENCES cards(uuid),
      added_date TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL REFERENCES cards(uuid),
      date TEXT NOT NULL,
      deal_type TEXT NOT NULL,
      current_price REAL NOT NULL,
      reference_price REAL NOT NULL,
      pct_change REAL NOT NULL,
      notified INTEGER DEFAULT 0,
      UNIQUE(uuid, date, deal_type)
    );

    CREATE INDEX IF NOT EXISTS idx_prices_uuid_date ON prices(uuid, date);
    CREATE INDEX IF NOT EXISTS idx_deals_date ON deals(date);
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
    CREATE INDEX IF NOT EXISTS idx_cards_commander ON cards(commander_legal);
  `);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/db/schema.ts tests/db/schema.test.ts
git commit -m "feat: add SQLite schema with cards, prices, watchlist, deals tables"
```

---

### Task 4: Database Queries (CRUD)

**Files:**
- Create: `src/db/queries.ts`
- Create: `tests/db/queries.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/db/queries.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../../src/db/schema.js";
import {
  upsertCard,
  upsertPrice,
  getCardByUuid,
  getCardsByName,
  getPriceHistory,
  getLatestPrice,
  get30DayAvgPrice,
  getHistoricalLowPrice,
  getWatchlistUuids,
  upsertDeal,
  getUnnotifiedDeals,
  markDealsNotified,
} from "../../src/db/queries.js";

describe("database queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("upsertCard", () => {
    it("inserts a new card", () => {
      upsertCard(db, {
        uuid: "abc-123",
        name: "Lightning Bolt",
        setCode: "A25",
        setName: "Masters 25",
        scryfallId: "scr-123",
        mcmId: 1234,
        mcmMetaId: 5678,
        commanderLegal: true,
      });

      const card = getCardByUuid(db, "abc-123");
      expect(card).toBeTruthy();
      expect(card!.name).toBe("Lightning Bolt");
      expect(card!.mcm_id).toBe(1234);
      expect(card!.commander_legal).toBe(1);
    });

    it("updates existing card on conflict", () => {
      upsertCard(db, {
        uuid: "abc-123",
        name: "Lightning Bolt",
        setCode: "A25",
        setName: "Masters 25",
        commanderLegal: true,
      });
      upsertCard(db, {
        uuid: "abc-123",
        name: "Lightning Bolt",
        setCode: "STA",
        setName: "Strixhaven Mystical Archive",
        commanderLegal: true,
      });

      const card = getCardByUuid(db, "abc-123");
      expect(card!.set_code).toBe("STA");
    });
  });

  describe("upsertPrice", () => {
    it("inserts a price record", () => {
      const today = new Date().toISOString().split("T")[0];
      upsertCard(db, { uuid: "abc-123", name: "Test", commanderLegal: true });
      upsertPrice(db, {
        uuid: "abc-123",
        date: today,
        cmTrend: 15.5,
        source: "mtgjson",
      });

      const latest = getLatestPrice(db, "abc-123");
      expect(latest).toBeTruthy();
      expect(latest!.cm_trend).toBe(15.5);
    });

    it("replaces on duplicate uuid+date+source", () => {
      const today = new Date().toISOString().split("T")[0];
      upsertCard(db, { uuid: "abc-123", name: "Test", commanderLegal: true });
      upsertPrice(db, {
        uuid: "abc-123",
        date: today,
        cmTrend: 15.5,
        source: "mtgjson",
      });
      upsertPrice(db, {
        uuid: "abc-123",
        date: today,
        cmTrend: 16.0,
        source: "mtgjson",
      });

      const history = getPriceHistory(db, "abc-123", 30);
      expect(history).toHaveLength(1);
      expect(history[0].cm_trend).toBe(16.0);
    });
  });

  describe("price aggregations", () => {
    beforeEach(() => {
      upsertCard(db, { uuid: "abc-123", name: "Test", commanderLegal: true });
      // Insert 5 days of prices relative to today
      const today = new Date();
      for (let i = 5; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        upsertPrice(db, {
          uuid: "abc-123",
          date: dateStr,
          cmTrend: 10 + i, // 15, 14, 13, 12, 11
          source: "mtgjson",
        });
      }
    });

    it("get30DayAvgPrice returns average of recent prices", () => {
      const avg = get30DayAvgPrice(db, "abc-123");
      expect(avg).toBe(13); // (15+14+13+12+11) / 5
    });

    it("getHistoricalLowPrice returns minimum", () => {
      const low = getHistoricalLowPrice(db, "abc-123");
      expect(low).toBe(11);
    });

    it("getLatestPrice returns most recent", () => {
      const latest = getLatestPrice(db, "abc-123");
      expect(latest!.cm_trend).toBe(11); // most recent = 1 day ago, value 10+1
    });
  });

  describe("deals", () => {
    it("inserts and retrieves unnotified deals", () => {
      const today = new Date().toISOString().split("T")[0];
      upsertCard(db, { uuid: "abc-123", name: "Test", commanderLegal: true });
      upsertDeal(db, {
        uuid: "abc-123",
        date: today,
        dealType: "trend_drop",
        currentPrice: 10.0,
        referencePrice: 13.0,
        pctChange: -0.23,
      });

      const deals = getUnnotifiedDeals(db);
      expect(deals).toHaveLength(1);
      expect(deals[0].deal_type).toBe("trend_drop");

      markDealsNotified(db, deals.map((d) => d.id));

      const after = getUnnotifiedDeals(db);
      expect(after).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: FAIL — cannot find module

**Step 3: Write implementation**

```typescript
// src/db/queries.ts
import Database from "better-sqlite3";

// --- Types ---

export interface CardInput {
  uuid: string;
  name: string;
  setCode?: string;
  setName?: string;
  scryfallId?: string;
  mcmId?: number;
  mcmMetaId?: number;
  commanderLegal: boolean;
}

export interface PriceInput {
  uuid: string;
  date: string;
  cmTrend?: number;
  cmAvg?: number;
  cmLow?: number;
  cmFoilTrend?: number;
  source: string;
}

export interface DealInput {
  uuid: string;
  date: string;
  dealType: string;
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
}

export interface CardRow {
  uuid: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  mcm_meta_id: number | null;
  commander_legal: number;
}

export interface PriceRow {
  id: number;
  uuid: string;
  date: string;
  cm_trend: number | null;
  cm_avg: number | null;
  cm_low: number | null;
  cm_foil_trend: number | null;
  source: string;
}

export interface DealRow {
  id: number;
  uuid: string;
  date: string;
  deal_type: string;
  current_price: number;
  reference_price: number;
  pct_change: number;
  notified: number;
}

export interface DealWithCardRow extends DealRow {
  name: string;
  set_code: string | null;
  mcm_id: number | null;
}

// --- Cards ---

export function upsertCard(db: Database.Database, card: CardInput): void {
  db.prepare(`
    INSERT INTO cards (uuid, name, set_code, set_name, scryfall_id, mcm_id, mcm_meta_id, commander_legal)
    VALUES (@uuid, @name, @setCode, @setName, @scryfallId, @mcmId, @mcmMetaId, @commanderLegal)
    ON CONFLICT(uuid) DO UPDATE SET
      name = excluded.name,
      set_code = excluded.set_code,
      set_name = excluded.set_name,
      scryfall_id = excluded.scryfall_id,
      mcm_id = excluded.mcm_id,
      mcm_meta_id = excluded.mcm_meta_id,
      commander_legal = excluded.commander_legal
  `).run({
    uuid: card.uuid,
    name: card.name,
    setCode: card.setCode ?? null,
    setName: card.setName ?? null,
    scryfallId: card.scryfallId ?? null,
    mcmId: card.mcmId ?? null,
    mcmMetaId: card.mcmMetaId ?? null,
    commanderLegal: card.commanderLegal ? 1 : 0,
  });
}

export function getCardByUuid(
  db: Database.Database,
  uuid: string
): CardRow | undefined {
  return db.prepare("SELECT * FROM cards WHERE uuid = ?").get(uuid) as
    | CardRow
    | undefined;
}

export function getCardsByName(
  db: Database.Database,
  name: string
): CardRow[] {
  return db
    .prepare("SELECT * FROM cards WHERE name = ?")
    .all(name) as CardRow[];
}

// --- Prices ---

export function upsertPrice(db: Database.Database, price: PriceInput): void {
  db.prepare(`
    INSERT INTO prices (uuid, date, cm_trend, cm_avg, cm_low, cm_foil_trend, source)
    VALUES (@uuid, @date, @cmTrend, @cmAvg, @cmLow, @cmFoilTrend, @source)
    ON CONFLICT(uuid, date, source) DO UPDATE SET
      cm_trend = excluded.cm_trend,
      cm_avg = excluded.cm_avg,
      cm_low = excluded.cm_low,
      cm_foil_trend = excluded.cm_foil_trend
  `).run({
    uuid: price.uuid,
    date: price.date,
    cmTrend: price.cmTrend ?? null,
    cmAvg: price.cmAvg ?? null,
    cmLow: price.cmLow ?? null,
    cmFoilTrend: price.cmFoilTrend ?? null,
    source: price.source,
  });
}

export function getPriceHistory(
  db: Database.Database,
  uuid: string,
  days: number
): PriceRow[] {
  return db
    .prepare(
      `SELECT * FROM prices
       WHERE uuid = ? AND date >= date('now', '-' || ? || ' days')
       ORDER BY date DESC`
    )
    .all(uuid, days) as PriceRow[];
}

export function getLatestPrice(
  db: Database.Database,
  uuid: string
): PriceRow | undefined {
  return db
    .prepare("SELECT * FROM prices WHERE uuid = ? ORDER BY date DESC LIMIT 1")
    .get(uuid) as PriceRow | undefined;
}

export function get30DayAvgPrice(
  db: Database.Database,
  uuid: string
): number | null {
  const row = db
    .prepare(
      `SELECT AVG(cm_trend) as avg_price FROM prices
       WHERE uuid = ? AND cm_trend IS NOT NULL
       AND date >= date('now', '-30 days')`
    )
    .get(uuid) as { avg_price: number | null } | undefined;
  return row?.avg_price ?? null;
}

export function getHistoricalLowPrice(
  db: Database.Database,
  uuid: string
): number | null {
  const row = db
    .prepare(
      `SELECT MIN(cm_trend) as low_price FROM prices
       WHERE uuid = ? AND cm_trend IS NOT NULL`
    )
    .get(uuid) as { low_price: number | null } | undefined;
  return row?.low_price ?? null;
}

// --- Watchlist ---

export function getWatchlistUuids(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT uuid FROM watchlist")
    .all() as { uuid: string }[];
  return rows.map((r) => r.uuid);
}

// --- Watchlist ---

export function upsertWatchlistEntry(
  db: Database.Database,
  uuid: string,
  notes?: string
): void {
  const today = new Date().toISOString().split("T")[0];
  db.prepare(`
    INSERT INTO watchlist (uuid, added_date, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET notes = excluded.notes
  `).run(uuid, today, notes ?? null);
}

// --- Deals ---

export function upsertDeal(db: Database.Database, deal: DealInput): void {
  db.prepare(`
    INSERT INTO deals (uuid, date, deal_type, current_price, reference_price, pct_change)
    VALUES (@uuid, @date, @dealType, @currentPrice, @referencePrice, @pctChange)
    ON CONFLICT(uuid, date, deal_type) DO UPDATE SET
      current_price = excluded.current_price,
      reference_price = excluded.reference_price,
      pct_change = excluded.pct_change,
      notified = 0
  `).run({
    uuid: deal.uuid,
    date: deal.date,
    dealType: deal.dealType,
    currentPrice: deal.currentPrice,
    referencePrice: deal.referencePrice,
    pctChange: deal.pctChange,
  });
}

export function getUnnotifiedDeals(db: Database.Database): DealWithCardRow[] {
  return db
    .prepare(
      `SELECT d.*, c.name, c.set_code, c.mcm_id
       FROM deals d JOIN cards c ON d.uuid = c.uuid
       WHERE d.notified = 0
       ORDER BY d.pct_change ASC`
    )
    .all() as DealWithCardRow[];
}

export function markDealsNotified(
  db: Database.Database,
  dealIds: number[]
): void {
  const placeholders = dealIds.map(() => "?").join(",");
  db.prepare(
    `UPDATE deals SET notified = 1 WHERE id IN (${placeholders})`
  ).run(...dealIds);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/db/queries.ts tests/db/queries.test.ts
git commit -m "feat: add database CRUD queries with upsert, aggregations, deal tracking"
```

---

### Task 5: MTGJSON Fetcher

**Files:**
- Create: `src/fetchers/mtgjson.ts`
- Create: `tests/fetchers/mtgjson.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/fetchers/mtgjson.test.ts
import { describe, it, expect } from "vitest";
import {
  parseCardmarketPrices,
  type MtgjsonPriceEntry,
} from "../../src/fetchers/mtgjson.js";

describe("parseCardmarketPrices", () => {
  it("extracts normal retail prices from MTGJSON structure", () => {
    const data: Record<string, MtgjsonPriceEntry> = {
      "uuid-001": {
        paper: {
          cardmarket: {
            retail: {
              normal: { "2026-02-23": 15.5 },
              foil: { "2026-02-23": 25.0 },
            },
          },
        },
      },
      "uuid-002": {
        paper: {
          cardmarket: {
            retail: {
              normal: { "2026-02-23": 8.0 },
            },
          },
        },
      },
    };

    const result = parseCardmarketPrices(data);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      uuid: "uuid-001",
      date: "2026-02-23",
      cmTrend: 15.5,
      cmFoilTrend: 25.0,
    });
    expect(result[1]).toEqual({
      uuid: "uuid-002",
      date: "2026-02-23",
      cmTrend: 8.0,
      cmFoilTrend: undefined,
    });
  });

  it("skips entries without cardmarket data", () => {
    const data: Record<string, MtgjsonPriceEntry> = {
      "uuid-001": {
        paper: {
          tcgplayer: { retail: { normal: { "2026-02-23": 10.0 } } },
        },
      },
    };

    const result = parseCardmarketPrices(data);
    expect(result).toHaveLength(0);
  });

  it("handles empty data", () => {
    const result = parseCardmarketPrices({});
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetchers/mtgjson.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/fetchers/mtgjson.ts
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

// --- Types matching MTGJSON AllPricesToday structure ---

export interface MtgjsonPriceEntry {
  paper?: {
    cardmarket?: {
      retail?: {
        normal?: Record<string, number>;
        foil?: Record<string, number>;
      };
      buylist?: {
        normal?: Record<string, number>;
        foil?: Record<string, number>;
      };
    };
    [vendor: string]: unknown;
  };
  [platform: string]: unknown;
}

export interface ParsedPrice {
  uuid: string;
  date: string;
  cmTrend: number;
  cmFoilTrend?: number;
}

// --- Parsing ---

export function parseCardmarketPrices(
  data: Record<string, MtgjsonPriceEntry>
): ParsedPrice[] {
  const results: ParsedPrice[] = [];

  for (const [uuid, entry] of Object.entries(data)) {
    const retail = entry.paper?.cardmarket?.retail;
    if (!retail?.normal) continue;

    const normalPrices = retail.normal;
    const foilPrices = retail.foil;

    // Get the most recent date's price
    const dates = Object.keys(normalPrices).sort();
    if (dates.length === 0) continue;

    const latestDate = dates[dates.length - 1];
    const price = normalPrices[latestDate];

    results.push({
      uuid,
      date: latestDate,
      cmTrend: price,
      cmFoilTrend: foilPrices?.[latestDate],
    });
  }

  return results;
}

// --- Download ---

async function fetchWithRetry(
  url: string,
  retries = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 2 ** attempt * 1000;
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export async function downloadMtgjsonGz(url: string): Promise<string> {
  const response = await fetchWithRetry(url);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Decompress gzip
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();

    gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);

    gunzip.end(buffer);
  });
}

/**
 * Stream-download a gzipped MTGJSON file directly to disk.
 * Used for large files (AllIdentifiers, AllPrices) to avoid OOM.
 */
export async function downloadMtgjsonGzToDisk(
  url: string,
  outputPath: string
): Promise<void> {
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");

  const response = await fetchWithRetry(url);
  if (!response.body) throw new Error("No response body");

  const gunzip = createGunzip();
  const fileStream = createWriteStream(outputPath);

  // Node 18+ fetch returns a web ReadableStream, convert to Node stream
  const { Readable } = await import("node:stream");
  const nodeStream = Readable.fromWeb(response.body as any);

  await pipeline(nodeStream, gunzip, fileStream);
}

export async function fetchAllPricesToday(
  url: string
): Promise<Record<string, MtgjsonPriceEntry>> {
  console.log("Downloading AllPricesToday...");
  const json = await downloadMtgjsonGz(url);
  console.log(`Downloaded ${(json.length / 1024 / 1024).toFixed(1)}MB`);

  const parsed = JSON.parse(json);
  return parsed.data as Record<string, MtgjsonPriceEntry>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetchers/mtgjson.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/fetchers/mtgjson.ts tests/fetchers/mtgjson.test.ts
git commit -m "feat: add MTGJSON fetcher with gzip download and price parsing"
```

---

### Task 6: Deal Detection Engine

**Files:**
- Create: `src/engine/deals.ts`
- Create: `tests/engine/deals.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/deals.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../../src/db/schema.js";
import { upsertCard, upsertPrice } from "../../src/db/queries.js";
import { detectDeals, type DetectedDeal } from "../../src/engine/deals.js";

// Helper to generate date strings relative to today
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

describe("detectDeals", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDatabase(db);

    // Insert a Commander-legal card with 30 days of price history
    upsertCard(db, {
      uuid: "card-1",
      name: "Ragavan, Nimble Pilferer",
      setCode: "MH2",
      commanderLegal: true,
    });

    // Insert 30 days of prices averaging ~€50
    for (let i = 30; i >= 1; i--) {
      upsertPrice(db, {
        uuid: "card-1",
        date: daysAgo(i),
        cmTrend: 50 + (i % 3) - 1, // ~49-51 range
        source: "mtgjson",
      });
    }
  });

  afterEach(() => {
    db.close();
  });

  it("detects trend_drop when price drops >15% below 30-day avg", () => {
    // Today's price is €40, ~20% below avg of ~50
    upsertPrice(db, {
      uuid: "card-1",
      date: daysAgo(0),
      cmTrend: 40.0,
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    const trendDrops = deals.filter((d) => d.dealType === "trend_drop");
    expect(trendDrops.length).toBeGreaterThanOrEqual(1);
    expect(trendDrops[0].uuid).toBe("card-1");
    expect(trendDrops[0].pctChange).toBeLessThan(-0.15);
  });

  it("does NOT trigger trend_drop for small dips", () => {
    upsertPrice(db, {
      uuid: "card-1",
      date: daysAgo(0),
      cmTrend: 48.0,
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    const trendDrops = deals.filter((d) => d.dealType === "trend_drop");
    expect(trendDrops).toHaveLength(0);
  });

  it("detects new_low when price hits historical minimum", () => {
    upsertPrice(db, {
      uuid: "card-1",
      date: daysAgo(0),
      cmTrend: 35.0,
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    const newLows = deals.filter((d) => d.dealType === "new_low");
    expect(newLows.length).toBeGreaterThanOrEqual(1);
  });

  it("detects watchlist_alert for watchlisted cards with >5% change", () => {
    upsertPrice(db, {
      uuid: "card-1",
      date: daysAgo(0),
      cmTrend: 46.0, // ~8% drop from ~50
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(["card-1"]),
    });

    const watchlistAlerts = deals.filter(
      (d) => d.dealType === "watchlist_alert"
    );
    expect(watchlistAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("skips cards below price floor", () => {
    upsertCard(db, {
      uuid: "cheap-card",
      name: "Sol Ring",
      commanderLegal: true,
    });
    upsertPrice(db, {
      uuid: "cheap-card",
      date: daysAgo(0),
      cmTrend: 2.0,
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    const cheapDeals = deals.filter((d) => d.uuid === "cheap-card");
    expect(cheapDeals).toHaveLength(0);
  });

  it("skips non-Commander-legal cards", () => {
    upsertCard(db, {
      uuid: "modern-only",
      name: "Modern Card",
      commanderLegal: false,
    });
    for (let i = 30; i >= 0; i--) {
      upsertPrice(db, {
        uuid: "modern-only",
        date: daysAgo(i),
        cmTrend: i === 0 ? 10.0 : 50.0,
        source: "mtgjson",
      });
    }

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    const modernDeals = deals.filter((d) => d.uuid === "modern-only");
    expect(modernDeals).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/deals.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/engine/deals.ts
import Database from "better-sqlite3";

export interface DetectedDeal {
  uuid: string;
  date: string;
  dealType: "trend_drop" | "new_low" | "watchlist_alert";
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
}

export interface DealDetectionConfig {
  priceFloorEur: number;
  trendDropPct: number;
  watchlistAlertPct: number;
  watchlistUuids: Set<string>;
}

interface CardPriceSummary {
  uuid: string;
  latest_price: number;
  latest_date: string;
  avg_30d: number | null;
  historical_low: number | null;
  prev_price: number | null;
}

export function detectDeals(
  db: Database.Database,
  config: DealDetectionConfig
): DetectedDeal[] {
  const deals: DetectedDeal[] = [];

  // Get Commander-legal cards with their latest price and aggregations
  // Uses a single query for efficiency
  const summaries = db
    .prepare(
      `
    WITH commander_cards AS (
      SELECT uuid FROM cards WHERE commander_legal = 1
    ),
    latest AS (
      SELECT p.uuid, p.cm_trend, p.date,
             ROW_NUMBER() OVER (PARTITION BY p.uuid ORDER BY p.date DESC) as rn
      FROM prices p
      JOIN commander_cards cc ON p.uuid = cc.uuid
      WHERE p.cm_trend IS NOT NULL
    ),
    prev AS (
      SELECT p.uuid, p.cm_trend as prev_price,
             ROW_NUMBER() OVER (PARTITION BY p.uuid ORDER BY p.date DESC) as rn
      FROM prices p
      JOIN commander_cards cc ON p.uuid = cc.uuid
      WHERE p.cm_trend IS NOT NULL
    ),
    avgs AS (
      SELECT p.uuid, AVG(p.cm_trend) as avg_30d
      FROM prices p
      JOIN commander_cards cc ON p.uuid = cc.uuid
      WHERE p.cm_trend IS NOT NULL AND p.date >= date('now', '-30 days')
      GROUP BY p.uuid
    ),
    lows AS (
      SELECT p.uuid, MIN(p.cm_trend) as historical_low
      FROM prices p
      JOIN commander_cards cc ON p.uuid = cc.uuid
      WHERE p.cm_trend IS NOT NULL
      GROUP BY p.uuid
    )
    SELECT
      l.uuid,
      l.cm_trend as latest_price,
      l.date as latest_date,
      a.avg_30d,
      lo.historical_low,
      p.prev_price
    FROM latest l
    LEFT JOIN avgs a ON l.uuid = a.uuid
    LEFT JOIN lows lo ON l.uuid = lo.uuid
    LEFT JOIN prev p ON l.uuid = p.uuid AND p.rn = 2
    WHERE l.rn = 1
  `
    )
    .all() as CardPriceSummary[];

  for (const summary of summaries) {
    const {
      uuid,
      latest_price,
      latest_date,
      avg_30d,
      historical_low,
    } = summary;

    const isWatchlisted = config.watchlistUuids.has(uuid);
    const aboveFloor = latest_price >= config.priceFloorEur;

    // Rule 1: Trend drop — price >15% below 30-day avg
    if (aboveFloor && avg_30d && avg_30d > 0) {
      const pctChange = (latest_price - avg_30d) / avg_30d;
      if (pctChange < -config.trendDropPct) {
        deals.push({
          uuid,
          date: latest_date,
          dealType: "trend_drop",
          currentPrice: latest_price,
          referencePrice: avg_30d,
          pctChange,
        });
      }
    }

    // Rule 2: New historical low
    if (aboveFloor && historical_low !== null && latest_price <= historical_low) {
      // Only trigger if this is actually a new low (price equals the minimum,
      // meaning today set it)
      const priceCount = db
        .prepare(
          "SELECT COUNT(*) as cnt FROM prices WHERE uuid = ? AND cm_trend = ?"
        )
        .get(uuid, historical_low) as { cnt: number };

      if (priceCount.cnt <= 1) {
        deals.push({
          uuid,
          date: latest_date,
          dealType: "new_low",
          currentPrice: latest_price,
          referencePrice: historical_low,
          pctChange: 0,
        });
      }
    }

    // Rule 3: Watchlist alert — any change >5%
    if (isWatchlisted && avg_30d && avg_30d > 0) {
      const pctChange = (latest_price - avg_30d) / avg_30d;
      if (Math.abs(pctChange) > config.watchlistAlertPct) {
        // Avoid duplicate if already triggered as trend_drop
        const alreadyTrend = deals.some(
          (d) => d.uuid === uuid && d.dealType === "trend_drop"
        );
        if (!alreadyTrend) {
          deals.push({
            uuid,
            date: latest_date,
            dealType: "watchlist_alert",
            currentPrice: latest_price,
            referencePrice: avg_30d,
            pctChange,
          });
        }
      }
    }
  }

  return deals;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/deals.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/engine/deals.ts tests/engine/deals.test.ts
git commit -m "feat: add deal detection engine with trend drop, new low, watchlist alerts"
```

---

### Task 7: Slack Notification Client

**Files:**
- Create: `src/notifications/slack.ts`
- Create: `tests/notifications/slack.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/notifications/slack.test.ts
import { describe, it, expect, vi } from "vitest";
import { formatDealMessage, formatDealBatch } from "../../src/notifications/slack.js";

describe("formatDealMessage", () => {
  it("formats a single deal into a Slack block", () => {
    const msg = formatDealMessage({
      name: "Ragavan, Nimble Pilferer",
      setCode: "MH2",
      dealType: "trend_drop",
      currentPrice: 48.5,
      referencePrice: 57.8,
      pctChange: -0.161,
      mcmId: 12345,
    });

    expect(msg).toContain("Ragavan, Nimble Pilferer");
    expect(msg).toContain("MH2");
    expect(msg).toContain("48.50");
    expect(msg).toContain("57.80");
    expect(msg).toContain("-16.1%");
    expect(msg).toContain("cardmarket.com");
  });
});

describe("formatDealBatch", () => {
  it("creates a Slack payload with multiple deals", () => {
    const payload = formatDealBatch([
      {
        name: "Card A",
        setCode: "SET",
        dealType: "trend_drop",
        currentPrice: 10,
        referencePrice: 15,
        pctChange: -0.33,
      },
      {
        name: "Card B",
        setCode: "SET",
        dealType: "new_low",
        currentPrice: 20,
        referencePrice: 20,
        pctChange: 0,
      },
    ]);

    expect(payload.blocks).toBeDefined();
    expect(payload.blocks.length).toBeGreaterThan(0);
    // Header block
    expect(JSON.stringify(payload)).toContain("Deal Alert");
  });

  it("returns empty payload for no deals", () => {
    const payload = formatDealBatch([]);
    expect(payload.blocks).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notifications/slack.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/notifications/slack.ts

export interface DealForSlack {
  name: string;
  setCode?: string;
  dealType: string;
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
  mcmId?: number;
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  trend_drop: "TREND DROP",
  new_low: "NEW LOW",
  watchlist_alert: "WATCHLIST",
};

function cardmarketUrl(name: string, mcmId?: number): string {
  // Cardmarket search URL — reliable fallback that always works
  const encodedName = encodeURIComponent(name);
  return `https://www.cardmarket.com/en/Magic/Cards/${encodedName}`;
}

export function formatDealMessage(deal: DealForSlack): string {
  const label = DEAL_TYPE_LABELS[deal.dealType] || deal.dealType;
  const pctStr = `${(deal.pctChange * 100).toFixed(1)}%`;
  const setStr = deal.setCode ? ` (${deal.setCode})` : "";
  const url = cardmarketUrl(deal.name);
  const urlLine = `\n<${url}|View on Cardmarket>`;

  return (
    `*${label}:* ${deal.name}${setStr}\n` +
    `€${deal.currentPrice.toFixed(2)} ← €${deal.referencePrice.toFixed(2)} (${pctStr})` +
    urlLine
  );
}

export function formatDealBatch(
  deals: DealForSlack[]
): { blocks: unknown[] } {
  if (deals.length === 0) return { blocks: [] };

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Deal Alert — ${deals.length} deal${deals.length > 1 ? "s" : ""} found`,
      },
    },
    { type: "divider" },
  ];

  for (const deal of deals) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatDealMessage(deal),
      },
    });
  }

  return { blocks };
}

export async function sendSlackNotification(
  webhookUrl: string,
  payload: { blocks: unknown[] }
): Promise<void> {
  if (!webhookUrl) {
    console.log("No Slack webhook URL configured, skipping notification");
    return;
  }

  if (payload.blocks.length === 0) {
    console.log("No deals to notify");
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log(`Slack notification sent (${payload.blocks.length - 2} deals)`);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notifications/slack.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/notifications/slack.ts tests/notifications/slack.test.ts
git commit -m "feat: add Slack notification client with Block Kit formatting"
```

---

### Task 8: Watchlist Loader

**Files:**
- Create: `src/watchlist.ts`
- Create: `tests/watchlist.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/watchlist.test.ts
import { describe, it, expect } from "vitest";
import { loadWatchlist, type WatchlistCard } from "../src/watchlist.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = "tests/tmp";
const TMP_FILE = join(TMP_DIR, "watchlist.json");

describe("loadWatchlist", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("loads cards from watchlist JSON", () => {
    writeFileSync(
      TMP_FILE,
      JSON.stringify({
        cards: [
          { name: "Ragavan, Nimble Pilferer", category: "creature", notes: "test" },
          { name: "The One Ring", category: "artifact", notes: "test" },
        ],
      })
    );

    const cards = loadWatchlist(TMP_FILE);
    expect(cards).toHaveLength(2);
    expect(cards[0].name).toBe("Ragavan, Nimble Pilferer");
    expect(cards[1].name).toBe("The One Ring");
  });

  it("returns empty array for missing file", () => {
    const cards = loadWatchlist("nonexistent.json");
    expect(cards).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/watchlist.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/watchlist.ts
import { readFileSync, existsSync } from "node:fs";

export interface WatchlistCard {
  name: string;
  category: string;
  notes?: string;
}

export function loadWatchlist(filePath: string): WatchlistCard[] {
  if (!existsSync(filePath)) {
    console.warn(`Watchlist file not found: ${filePath}`);
    return [];
  }

  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  return (data.cards || []) as WatchlistCard[];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/watchlist.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/watchlist.ts tests/watchlist.test.ts
git commit -m "feat: add watchlist JSON loader"
```

---

### Task 9: Seed Command

**Files:**
- Create: `src/seed.ts`

This is a CLI script, not a library module. Testing via integration (run it and check the DB).

**Step 1: Write seed.ts**

```typescript
// src/seed.ts
import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./db/schema.js";
import { upsertCard, upsertPrice, upsertWatchlistEntry, getCardsByName } from "./db/queries.js";
import { downloadMtgjsonGzToDisk, downloadMtgjsonGz, type MtgjsonPriceEntry } from "./fetchers/mtgjson.js";
import { loadWatchlist } from "./watchlist.js";

interface AllIdentifiersCard {
  uuid: string;
  name: string;
  setCode: string;
  setName: string;
  identifiers: {
    scryfallId?: string;
    mcmId?: string;
    mcmMetaId?: string;
  };
  legalities: Record<string, string>;
}

async function main() {
  const config = getConfig();

  // Ensure directories exist
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(dirname(config.identifiersCachePath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  initializeDatabase(db);

  // Step 1: Download AllIdentifiers to disk (stream to avoid OOM)
  if (!existsSync(config.identifiersCachePath)) {
    console.log("Downloading AllIdentifiers to disk (this may take several minutes)...");
    await downloadMtgjsonGzToDisk(
      config.mtgjson.allIdentifiersUrl,
      config.identifiersCachePath
    );
    console.log("AllIdentifiers saved to cache.");
  } else {
    console.log("Using cached AllIdentifiers.");
  }

  // Step 2: Parse and insert Commander-legal cards only
  console.log("Parsing AllIdentifiers...");
  const identifiersRaw = JSON.parse(
    readFileSync(config.identifiersCachePath, "utf-8")
  ).data as Record<string, AllIdentifiersCard>;

  console.log("Inserting Commander-legal card metadata...");
  let cardCount = 0;
  let skipped = 0;

  const insertCards = db.transaction(() => {
    for (const [uuid, card] of Object.entries(identifiersRaw)) {
      const isCommanderLegal = card.legalities?.commander === "Legal";

      // Only insert Commander-legal cards to keep DB lean
      if (!isCommanderLegal) {
        skipped++;
        continue;
      }

      upsertCard(db, {
        uuid,
        name: card.name,
        setCode: card.setCode,
        setName: card.setName,
        scryfallId: card.identifiers?.scryfallId,
        mcmId: card.identifiers?.mcmId
          ? parseInt(card.identifiers.mcmId)
          : undefined,
        mcmMetaId: card.identifiers?.mcmMetaId
          ? parseInt(card.identifiers.mcmMetaId)
          : undefined,
        commanderLegal: isCommanderLegal,
      });
      cardCount++;

      if (cardCount % 10000 === 0) {
        console.log(`  ${cardCount} cards inserted...`);
      }
    }
  });
  insertCards();
  console.log(`Inserted ${cardCount} Commander-legal cards (skipped ${skipped} non-legal)`);

  // Step 3: Build set of known UUIDs for price filtering
  const knownUuids = new Set(
    (db.prepare("SELECT uuid FROM cards").all() as { uuid: string }[])
      .map((r) => r.uuid)
  );

  // Step 4: Download AllPrices to disk (stream), then parse and insert
  const allPricesCachePath = config.identifiersCachePath.replace(
    "AllIdentifiers.json",
    "AllPrices.json"
  );

  if (!existsSync(allPricesCachePath)) {
    console.log("Downloading AllPrices to disk (90-day history, large file)...");
    await downloadMtgjsonGzToDisk(config.mtgjson.allPricesUrl, allPricesCachePath);
    console.log("AllPrices saved to cache.");
  } else {
    console.log("Using cached AllPrices.");
  }

  console.log("Parsing AllPrices...");
  const pricesData = JSON.parse(
    readFileSync(allPricesCachePath, "utf-8")
  ).data as Record<string, MtgjsonPriceEntry>;

  console.log("Inserting price history (Commander-legal cards only)...");
  let priceCount = 0;
  let priceSkipped = 0;

  const insertPrices = db.transaction(() => {
    for (const [uuid, entry] of Object.entries(pricesData)) {
      // Only insert prices for Commander-legal cards we know about
      if (!knownUuids.has(uuid)) {
        priceSkipped++;
        continue;
      }

      const retail = entry.paper?.cardmarket?.retail;
      if (!retail?.normal) continue;

      const normalPrices = retail.normal;
      const foilPrices = retail.foil;

      for (const [date, price] of Object.entries(normalPrices)) {
        upsertPrice(db, {
          uuid,
          date,
          cmTrend: price,
          cmFoilTrend: foilPrices?.[date],
          source: "mtgjson",
        });
        priceCount++;
      }

      if (priceCount % 50000 === 0) {
        console.log(`  ${priceCount} price records inserted...`);
      }
    }
  });
  insertPrices();
  console.log(`Inserted ${priceCount} price records (skipped ${priceSkipped} non-Commander UUIDs)`);

  // Step 5: Populate watchlist table from JSON
  const watchlist = loadWatchlist(config.watchlistPath);
  let watchlistMatches = 0;

  const insertWatchlist = db.transaction(() => {
    for (const card of watchlist) {
      const dbCards = getCardsByName(db, card.name);
      for (const dbCard of dbCards) {
        upsertWatchlistEntry(db, dbCard.uuid, card.notes);
        watchlistMatches++;
      }
    }
  });
  insertWatchlist();
  console.log(`Watchlist: ${watchlistMatches} UUIDs from ${watchlist.length} card names`);

  console.log("Seed complete!");
  db.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/seed.ts
git commit -m "feat: add seed command to bootstrap 90-day price history from MTGJSON"
```

**Step 4: Run seed (integration test)**

Run: `npm run seed`
Expected: Downloads AllIdentifiers (~500MB) and AllPrices (~136MB gzip), populates SQLite DB. Takes several minutes. Output should show progress counts.

Note: This downloads ~650MB+ of data. Run on a stable connection. The seed only needs to run once.

---

### Task 10: Daily Pipeline & Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `tests/pipeline.test.ts`

**Step 1: Write the integration test**

```typescript
// tests/pipeline.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema.js";
import { upsertCard, upsertPrice, getUnnotifiedDeals } from "../src/db/queries.js";
import { runDealDetection } from "../src/index.js";

// Note: importing from index.js works because main() only runs when
// isMainModule is true, which it won't be in test context.

describe("runDealDetection", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDatabase(db);

    // Set up a card with price history
    upsertCard(db, {
      uuid: "test-uuid",
      name: "Test Card",
      setCode: "TST",
      mcmId: 999,
      commanderLegal: true,
    });

    // 30 days of stable prices at €50
    const today = new Date();
    for (let i = 30; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      upsertPrice(db, {
        uuid: "test-uuid",
        date: dateStr,
        cmTrend: 50.0,
        source: "mtgjson",
      });
    }
  });

  afterEach(() => {
    db.close();
  });

  it("detects and stores deals for cards with price drops", () => {
    // Insert a big drop today
    const today = new Date().toISOString().split("T")[0];
    upsertPrice(db, {
      uuid: "test-uuid",
      date: today,
      cmTrend: 40.0,
      source: "mtgjson",
    });

    const dealCount = runDealDetection(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    expect(dealCount).toBeGreaterThan(0);

    const deals = getUnnotifiedDeals(db);
    expect(deals.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: FAIL — cannot find `runDealDetection`

**Step 3: Write implementation**

```typescript
// src/index.ts
import Database from "better-sqlite3";
import cron from "node-cron";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./db/schema.js";
import {
  upsertPrice,
  getUnnotifiedDeals,
  markDealsNotified,
  upsertDeal,
  getCardByUuid,
  getWatchlistUuids,
  type DealWithCardRow,
} from "./db/queries.js";
import {
  fetchAllPricesToday,
  parseCardmarketPrices,
} from "./fetchers/mtgjson.js";
import {
  detectDeals,
  type DealDetectionConfig,
} from "./engine/deals.js";
import {
  formatDealBatch,
  sendSlackNotification,
  type DealForSlack,
} from "./notifications/slack.js";

export function runDealDetection(
  db: Database.Database,
  config: DealDetectionConfig
): number {
  const deals = detectDeals(db, config);

  for (const deal of deals) {
    upsertDeal(db, {
      uuid: deal.uuid,
      date: deal.date,
      dealType: deal.dealType,
      currentPrice: deal.currentPrice,
      referencePrice: deal.referencePrice,
      pctChange: deal.pctChange,
    });
  }

  return deals.length;
}

async function runDailyPipeline(db: Database.Database): Promise<void> {
  const config = getConfig();

  console.log(`[${new Date().toISOString()}] Starting daily pipeline...`);

  // 1. Fetch today's prices
  const priceData = await fetchAllPricesToday(
    config.mtgjson.allPricesTodayUrl
  );
  const prices = parseCardmarketPrices(priceData);
  console.log(`Parsed ${prices.length} Cardmarket prices`);

  // 2. Store prices only for Commander-legal cards already in DB
  let stored = 0;
  let skipped = 0;
  const storePrices = db.transaction(() => {
    for (const price of prices) {
      // Only store prices for cards we seeded (Commander-legal)
      const card = getCardByUuid(db, price.uuid);
      if (!card) {
        skipped++;
        continue;
      }

      upsertPrice(db, {
        uuid: price.uuid,
        date: price.date,
        cmTrend: price.cmTrend,
        cmFoilTrend: price.cmFoilTrend,
        source: "mtgjson",
      });
      stored++;
    }
  });
  storePrices();
  console.log(`Stored ${stored} price records (skipped ${skipped} non-Commander)`);

  // 3. Get watchlist UUIDs from DB (populated during seed)
  const watchlistUuids = new Set(getWatchlistUuids(db));
  console.log(`Watchlist: ${watchlistUuids.size} UUIDs`);

  // 4. Detect deals
  const dealCount = runDealDetection(db, {
    priceFloorEur: config.priceFloorEur,
    trendDropPct: config.trendDropPct,
    watchlistAlertPct: config.watchlistAlertPct,
    watchlistUuids,
  });
  console.log(`Detected ${dealCount} deals`);

  // 5. Send Slack notification
  if (dealCount > 0) {
    const unnotified: DealWithCardRow[] = getUnnotifiedDeals(db);

    const slackDeals: DealForSlack[] = unnotified.map((d) => ({
      name: d.name,
      setCode: d.set_code ?? undefined,
      dealType: d.deal_type,
      currentPrice: d.current_price,
      referencePrice: d.reference_price,
      pctChange: d.pct_change,
      mcmId: d.mcm_id ?? undefined,
    }));

    const payload = formatDealBatch(slackDeals);
    await sendSlackNotification(config.slackWebhookUrl, payload);

    markDealsNotified(
      db,
      unnotified.map((d) => d.id)
    );
  }

  console.log(`[${new Date().toISOString()}] Pipeline complete`);
}

// --- Main ---

async function main() {
  const config = getConfig();

  mkdirSync(dirname(config.dbPath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  initializeDatabase(db);

  // Run once immediately
  await runDailyPipeline(db);

  // Schedule daily runs
  console.log(`Scheduling daily runs at: ${config.cronSchedule}`);
  cron.schedule(config.cronSchedule, async () => {
    try {
      await runDailyPipeline(db);
    } catch (err) {
      console.error("Pipeline failed:", err);
    }
  });
}

// Only run main if executed directly (not imported in tests)
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts tests/pipeline.test.ts
git commit -m "feat: add daily pipeline with MTGJSON fetch, deal detection, Slack alerts"
```

---

### Task 11: Run All Tests & Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Build**

Run: `npm run build`
Expected: `dist/` directory created with compiled JS

**Step 4: Create .env.example**

```
# Required: Slack webhook for deal notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Optional overrides (defaults shown)
# PRICE_FLOOR_EUR=10
# TREND_DROP_PCT=0.15
# WATCHLIST_ALERT_PCT=0.05
# CRON_SCHEDULE=0 8 * * *
# DB_PATH=data/tracker.db
```

**Step 5: Commit**

```bash
git add .env.example
git commit -m "feat: add .env.example with configuration reference"
```

---

## End-to-End Verification

After all tasks are complete:

1. **Seed the database:** `npm run seed` — downloads MTGJSON data, populates SQLite
2. **Run the pipeline:** `SLACK_WEBHOOK_URL=https://hooks.slack.com/test npm run dev` — fetches today's prices, detects deals, attempts Slack notification
3. **Check the database:** `npx tsx -e "import Database from 'better-sqlite3'; const db = new Database('data/tracker.db'); console.log('Cards:', db.prepare('SELECT COUNT(*) as c FROM cards').get()); console.log('Prices:', db.prepare('SELECT COUNT(*) as c FROM prices').get()); console.log('Deals:', db.prepare('SELECT COUNT(*) as c FROM deals').get());"`

## Pre-implementation Fix

Remove duplicate "Fierce Guardianship" from `data/watchlist.json` (appears on both line 75 and line 176).

## Task Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Project scaffolding | — |
| 2 | Config module | 2 |
| 3 | Database schema (with UNIQUE on deals) | 4 |
| 4 | Database queries (upsert deals, watchlist, DealWithCardRow) | 7 |
| 5 | MTGJSON fetcher (stream-to-disk, retry) | 3 |
| 6 | Deal detection engine (commander-legal filter) | 6 |
| 7 | Slack notifications | 3 |
| 8 | Watchlist loader | 2 |
| 9 | Seed command (stream download, filter, populate watchlist) | integration |
| 10 | Daily pipeline + entry point (proper types, import.meta.url) | 1 |
| 11 | Full verification | — |

## Issues Fixed in This Revision

| # | Issue | Fix |
|---|---|---|
| 1 | Tests break after 30 days (hardcoded dates) | All tests use dates relative to `new Date()` |
| 2 | Seed OOMs on AllIdentifiers/AllPrices | `downloadMtgjsonGzToDisk` streams to disk |
| 3 | Commander-legal filter never applied | Seed only inserts legal cards; deal engine filters in SQL |
| 4 | `as any` type casts in index.ts | Added `DealWithCardRow` type, proper typing |
| 5 | `filters.ts` missing from design | Removed from design (YAGNI — filtering is in deal engine) |
| 6 | Watchlist DB table never populated | Seed populates from watchlist.json; pipeline reads from DB |
| 7 | Duplicate deals on re-run | UNIQUE constraint on `deals(uuid, date, deal_type)` + upsert |
| 8 | `isMainModule` check fragile | Uses `fileURLToPath(import.meta.url)` |
| 9 | Cardmarket URL unvalidated | Uses `/Cards/{name}` search URL (always works) |
| 10 | Duplicate in watchlist.json | Flag to fix before implementation |
| 11 | No retry on MTGJSON download | `fetchWithRetry` with exponential backoff |
