# Cardmarket Deal Finder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a run-once pipeline that fetches MTG card prices from MTGJSON, stores them in SQLite, detects deals on Commander-legal cards, and sends Slack notifications.

**Architecture:** MTGJSON AllPricesToday downloaded on each run, parsed for Cardmarket EUR prices, stored in SQLite alongside card metadata from AllIdentifiers. Deal engine compares today's price against 30-day average, watchlist thresholds, and historical lows. Slack webhook fires batched alerts. Process exits after each run — external scheduler (cron/systemd/Docker) handles timing.

**Tech Stack:** TypeScript (ESM, strict), Node.js 18+, better-sqlite3, stream-json, Zod, Vitest, ESLint, Prettier, dotenv, native fetch, zlib

**Code Quality:** Every task must pass `yarn lint` and `yarn format:check` before committing. Run `yarn format && yarn lint:fix` after writing code.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `.prettierrc`

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
    "seed": "tsx src/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/ tests/",
    "lint:fix": "eslint src/ tests/ --fix",
    "format": "prettier --write 'src/**/*.ts' 'tests/**/*.ts'",
    "format:check": "prettier --check 'src/**/*.ts' 'tests/**/*.ts'"
  },
  "dependencies": {
    "better-sqlite3": "^12.6.0",
    "dotenv": "^16.4.0",
    "stream-json": "^1.9.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "@types/stream-json": "^1.7.7",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^10.0.0",
    "prettier": "^3.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "typescript-eslint": "^8.0.0",
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
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
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

**Step 3: Create eslint.config.js**

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  }
);
```

**Step 4: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 5: Create vitest.config.ts**

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

**Step 6: Update .gitignore**

```
node_modules/
dist/
*.db
data/cache/
.env
```

**Step 7: Install dependencies**

Run: `yarn install`
Expected: `node_modules/` created, `yarn.lock` generated

**Step 8: Verify toolchain**

Run: `yarn tsc --noEmit && yarn eslint --version && yarn prettier --version`
Expected: No errors, prints ESLint and Prettier versions

**Step 9: Commit**

```bash
git add package.json yarn.lock tsconfig.json vitest.config.ts eslint.config.js .prettierrc .gitignore
git commit -m "feat: project scaffolding with TypeScript strict, Zod, ESLint, Prettier"
```

---

### Task 2: Configuration Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  afterEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.PRICE_FLOOR_EUR;
    delete process.env.TREND_DROP_PCT;
  });

  it("returns default config values", () => {
    const config = getConfig();
    expect(config.priceFloorEur).toBe(10);
    expect(config.trendDropPct).toBe(0.15);
    expect(config.watchlistAlertPct).toBe(0.05);
    expect(config.mtgjson.allPricesTodayUrl).toContain("mtgjson.com");
    expect(config.mtgjson.allPricesUrl).toContain("mtgjson.com");
    expect(config.mtgjson.allIdentifiersUrl).toContain("mtgjson.com");
    expect(config.dbPath).toBe("data/tracker.db");
    expect(config.watchlistPath).toBe("data/watchlist.json");
    expect(config.identifiersCachePath).toBe("data/cache/AllIdentifiers.json");
    expect(config.allPricesCachePath).toBe("data/cache/AllPrices.json");
    expect(config.identifiersMaxAgeDays).toBe(30);
    expect(config.pipelineMaxRetries).toBe(3);
    expect(config.pipelineRetryDelayMs).toBe(15 * 60 * 1000);
  });

  it("reads SLACK_WEBHOOK_URL from env", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    const config = getConfig();
    expect(config.slackWebhookUrl).toBe("https://hooks.slack.com/test");
  });

  it("validates numeric env vars and rejects invalid values", () => {
    process.env.PRICE_FLOOR_EUR = "not-a-number";
    expect(() => getConfig()).toThrow();
  });

  it("accepts valid numeric overrides", () => {
    process.env.PRICE_FLOOR_EUR = "25";
    process.env.TREND_DROP_PCT = "0.20";
    const config = getConfig();
    expect(config.priceFloorEur).toBe(25);
    expect(config.trendDropPct).toBe(0.2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn vitest run tests/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`

**Step 3: Write implementation**

```typescript
// src/config.ts
import { z } from "zod";

const configSchema = z.object({
  priceFloorEur: z.number().min(0).default(10),
  trendDropPct: z.number().min(0).max(1).default(0.15),
  watchlistAlertPct: z.number().min(0).max(1).default(0.05),
  slackWebhookUrl: z.string().url().or(z.literal("")).default(""),
  dbPath: z.string().default("data/tracker.db"),
  watchlistPath: z.string().default("data/watchlist.json"),
  identifiersCachePath: z.string().default("data/cache/AllIdentifiers.json"),
  allPricesCachePath: z.string().default("data/cache/AllPrices.json"),
  identifiersMaxAgeDays: z.number().min(1).default(30),
  pipelineMaxRetries: z.number().min(1).default(3),
  pipelineRetryDelayMs: z.number().min(0).default(15 * 60 * 1000), // 15 minutes
  mtgjson: z.object({
    allPricesTodayUrl: z.string().url(),
    allPricesUrl: z.string().url(),
    allIdentifiersUrl: z.string().url(),
  }),
});

export type Config = z.infer<typeof configSchema>;

function parseNumericEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric env var value: "${value}"`);
  }
  return parsed;
}

export function getConfig(): Config {
  const raw = {
    priceFloorEur: parseNumericEnv(process.env.PRICE_FLOOR_EUR),
    trendDropPct: parseNumericEnv(process.env.TREND_DROP_PCT),
    watchlistAlertPct: parseNumericEnv(process.env.WATCHLIST_ALERT_PCT),
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    dbPath: process.env.DB_PATH,
    watchlistPath: process.env.WATCHLIST_PATH,
    identifiersCachePath: process.env.IDENTIFIERS_CACHE_PATH,
    allPricesCachePath: process.env.ALL_PRICES_CACHE_PATH,
    identifiersMaxAgeDays: parseNumericEnv(process.env.IDENTIFIERS_MAX_AGE_DAYS),
    pipelineMaxRetries: parseNumericEnv(process.env.PIPELINE_MAX_RETRIES),
    pipelineRetryDelayMs: parseNumericEnv(process.env.PIPELINE_RETRY_DELAY_MS),
    mtgjson: {
      allPricesTodayUrl: "https://mtgjson.com/api/v5/AllPricesToday.json.gz",
      allPricesUrl: "https://mtgjson.com/api/v5/AllPrices.json.gz",
      allIdentifiersUrl: "https://mtgjson.com/api/v5/AllIdentifiers.json.gz",
    },
  };

  // Strip undefined values so Zod defaults apply
  const cleaned = JSON.parse(JSON.stringify(raw));
  return configSchema.parse(cleaned);
}
```

**Step 4: Run test to verify it passes**

Run: `yarn vitest run tests/config.test.ts`
Expected: PASS (4 tests)

**Step 5: Format and lint**

Run: `yarn prettier --write src/config.ts tests/config.test.ts && yarn eslint src/config.ts`
Expected: Files formatted, no lint errors

**Step 6: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add Zod-validated configuration module"
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

    db.prepare(
      "INSERT INTO cards (uuid, name) VALUES ('test-uuid', 'Test Card')"
    ).run();

    db.prepare(
      "INSERT INTO prices (uuid, date, cm_trend, source) VALUES ('test-uuid', '2026-01-01', 10.0, 'mtgjson')"
    ).run();

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

Run: `yarn vitest run tests/db/schema.test.ts`
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
      cm_trend REAL,               -- Cardmarket trend price (EUR) from MTGJSON retail.normal
      cm_avg REAL,                 -- Cardmarket average sell price (Phase 2)
      cm_low REAL,                 -- Cardmarket lowest listing price (Phase 2)
      cm_foil_trend REAL,          -- Cardmarket foil trend price from MTGJSON retail.foil
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

Run: `yarn vitest run tests/db/schema.test.ts`
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
      const today = new Date().toISOString().split("T")[0]!;
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
      const today = new Date().toISOString().split("T")[0]!;
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
      expect(history[0]!.cm_trend).toBe(16.0);
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
        const dateStr = d.toISOString().split("T")[0]!;
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
      const today = new Date().toISOString().split("T")[0]!;
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
      expect(deals[0]!.deal_type).toBe("trend_drop");

      markDealsNotified(db, deals.map((d) => d.id));

      const after = getUnnotifiedDeals(db);
      expect(after).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn vitest run tests/db/queries.test.ts`
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

export function upsertWatchlistEntry(
  db: Database.Database,
  uuid: string,
  notes?: string
): void {
  const today = new Date().toISOString().split("T")[0]!;
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

Run: `yarn vitest run tests/db/queries.test.ts`
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
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseCardmarketPrices,
  fetchWithRetry,
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

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries on network failure and succeeds", async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWithRetry("https://example.com", 3);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries exceeded", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const promise = fetchWithRetry("https://example.com", 2);
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).rejects.toThrow("Network error");
  });

  it("throws on HTTP error without retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(fetchWithRetry("https://example.com")).rejects.toThrow(
      "HTTP 500",
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn vitest run tests/fetchers/mtgjson.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/fetchers/mtgjson.ts
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

// --- Types (no Zod for large data — validated defensively in parser) ---

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
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ParsedPrice {
  uuid: string;
  date: string;
  cmTrend: number; // Cardmarket trend price (EUR) from MTGJSON retail.normal
  cmFoilTrend?: number;
}

// --- Parsing ---

export function parseCardmarketPrices(
  data: Record<string, MtgjsonPriceEntry>,
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
    if (!latestDate) continue;

    const price = normalPrices[latestDate];
    if (price === undefined) continue;

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

export async function fetchWithRetry(
  url: string,
  retries = 3,
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
  outputPath: string,
): Promise<void> {
  const response = await fetchWithRetry(url);
  if (!response.body) throw new Error("No response body");

  const gunzip = createGunzip();
  const fileStream = createWriteStream(outputPath);

  // Node 18+ fetch returns a web ReadableStream, convert to Node stream
  const nodeStream = Readable.fromWeb(
    response.body as ReadableStream<Uint8Array>,
  );

  await pipeline(nodeStream, gunzip, fileStream);
}

/**
 * Stream-parse entries from a JSON file's "data" key without loading the
 * entire file into memory. Uses stream-json for constant memory usage.
 */
export async function* streamJsonDataEntries(
  filePath: string,
): AsyncGenerator<{ key: string; value: unknown }> {
  const { parser } = await import("stream-json");
  const { pick } = await import("stream-json/filters/Pick.js");
  const { streamObject } = await import("stream-json/streamers/StreamObject.js");

  const stream = createReadStream(filePath)
    .pipe(parser())
    .pipe(pick({ filter: "data" }))
    .pipe(streamObject());

  for await (const entry of stream) {
    yield entry as { key: string; value: unknown };
  }
}

export async function fetchAllPricesToday(
  url: string,
): Promise<Record<string, MtgjsonPriceEntry>> {
  console.log("Downloading AllPricesToday...");
  const json = await downloadMtgjsonGz(url);
  console.log(`Downloaded ${(json.length / 1024 / 1024).toFixed(1)}MB`);

  const parsed = JSON.parse(json) as { data?: unknown };
  if (!parsed.data || typeof parsed.data !== "object") {
    throw new Error("AllPricesToday: missing or invalid 'data' key");
  }
  return parsed.data as Record<string, MtgjsonPriceEntry>;
}
```

**Step 4: Run test to verify it passes**

Run: `yarn vitest run tests/fetchers/mtgjson.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/fetchers/mtgjson.ts tests/fetchers/mtgjson.test.ts
git commit -m "feat: add MTGJSON fetcher with gzip download, streaming parser, and retry"
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
import { detectDeals } from "../../src/engine/deals.js";

// Helper to generate date strings relative to today
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
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
    expect(trendDrops[0]!.uuid).toBe("card-1");
    expect(trendDrops[0]!.pctChange).toBeLessThan(-0.15);
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

  it("detects new_low when price is strictly below previous historical low", () => {
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

  it("does NOT trigger new_low when price equals existing low", () => {
    // The existing low in our test data is 49 (50 + (1%3) - 1 = 49)
    upsertPrice(db, {
      uuid: "card-1",
      date: daysAgo(0),
      cmTrend: 49.0,
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(),
    });

    const newLows = deals.filter((d) => d.dealType === "new_low");
    expect(newLows).toHaveLength(0);
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
      (d) => d.dealType === "watchlist_alert",
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

Run: `yarn vitest run tests/engine/deals.test.ts`
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
  prev_low: number | null;
}

export function detectDeals(
  db: Database.Database,
  config: DealDetectionConfig,
): DetectedDeal[] {
  const deals: DetectedDeal[] = [];

  // Get Commander-legal cards with their latest price, 30-day avg,
  // and historical low EXCLUDING today (for correct new_low detection).
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
    avgs AS (
      SELECT p.uuid, AVG(p.cm_trend) as avg_30d
      FROM prices p
      JOIN commander_cards cc ON p.uuid = cc.uuid
      WHERE p.cm_trend IS NOT NULL AND p.date >= date('now', '-30 days')
      GROUP BY p.uuid
    ),
    prev_lows AS (
      SELECT l.uuid, MIN(p2.cm_trend) as prev_low
      FROM latest l
      JOIN prices p2 ON l.uuid = p2.uuid
      WHERE l.rn = 1
        AND p2.cm_trend IS NOT NULL
        AND p2.date < l.date
      GROUP BY l.uuid
    )
    SELECT
      l.uuid,
      l.cm_trend as latest_price,
      l.date as latest_date,
      a.avg_30d,
      pl.prev_low
    FROM latest l
    LEFT JOIN avgs a ON l.uuid = a.uuid
    LEFT JOIN prev_lows pl ON l.uuid = pl.uuid
    WHERE l.rn = 1
  `,
    )
    .all() as CardPriceSummary[];

  for (const summary of summaries) {
    const { uuid, latest_price, latest_date, avg_30d, prev_low } = summary;

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

    // Rule 2: New historical low — today's price strictly below previous low
    if (aboveFloor && prev_low !== null && latest_price < prev_low) {
      deals.push({
        uuid,
        date: latest_date,
        dealType: "new_low",
        currentPrice: latest_price,
        referencePrice: prev_low,
        pctChange: prev_low > 0 ? (latest_price - prev_low) / prev_low : 0,
      });
    }

    // Rule 3: Watchlist alert — any change >5%
    if (isWatchlisted && avg_30d && avg_30d > 0) {
      const pctChange = (latest_price - avg_30d) / avg_30d;
      if (Math.abs(pctChange) > config.watchlistAlertPct) {
        // Avoid duplicate if already triggered as trend_drop
        const alreadyTrend = deals.some(
          (d) => d.uuid === uuid && d.dealType === "trend_drop",
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

Run: `yarn vitest run tests/engine/deals.test.ts`
Expected: PASS (7 tests)

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
import { describe, it, expect } from "vitest";
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
    expect(JSON.stringify(payload)).toContain("Deal Alert");
  });

  it("returns empty payload for no deals", () => {
    const payload = formatDealBatch([]);
    expect(payload.blocks).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn vitest run tests/notifications/slack.test.ts`
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

function cardmarketUrl(name: string): string {
  const encodedName = encodeURIComponent(name);
  return `https://www.cardmarket.com/en/Magic/Cards/${encodedName}`;
}

export function formatDealMessage(deal: DealForSlack): string {
  const label = DEAL_TYPE_LABELS[deal.dealType] ?? deal.dealType;
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
  deals: DealForSlack[],
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
  payload: { blocks: unknown[] },
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

Run: `yarn vitest run tests/notifications/slack.test.ts`
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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadWatchlist } from "../src/watchlist.js";
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
      }),
    );

    const cards = loadWatchlist(TMP_FILE);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.name).toBe("Ragavan, Nimble Pilferer");
    expect(cards[1]!.name).toBe("The One Ring");
  });

  it("returns empty array for missing file", () => {
    const cards = loadWatchlist("nonexistent.json");
    expect(cards).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn vitest run tests/watchlist.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/watchlist.ts
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

const watchlistCardSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  notes: z.string().optional(),
});

const watchlistSchema = z.object({
  description: z.string().optional(),
  created: z.string().optional(),
  cards: z.array(watchlistCardSchema),
});

export type WatchlistCard = z.infer<typeof watchlistCardSchema>;

export function loadWatchlist(filePath: string): WatchlistCard[] {
  if (!existsSync(filePath)) {
    console.warn(`Watchlist file not found: ${filePath}`);
    return [];
  }

  const raw = readFileSync(filePath, "utf-8");
  const data = watchlistSchema.parse(JSON.parse(raw));
  return data.cards;
}
```

**Step 4: Run test to verify it passes**

Run: `yarn vitest run tests/watchlist.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/watchlist.ts tests/watchlist.test.ts
git commit -m "feat: add watchlist JSON loader with Zod validation"
```

---

### Task 9: Seed Command

**Files:**
- Create: `src/seed.ts`

This is a CLI script. Uses `stream-json` to stream-parse AllIdentifiers and AllPrices from disk without loading into memory. Testing via integration (run it and check the DB).

**Step 1: Write seed.ts**

```typescript
// src/seed.ts
import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./db/schema.js";
import {
  upsertCard,
  upsertPrice,
  upsertWatchlistEntry,
  getCardsByName,
} from "./db/queries.js";
import {
  downloadMtgjsonGzToDisk,
  streamJsonDataEntries,
} from "./fetchers/mtgjson.js";
import { loadWatchlist } from "./watchlist.js";

interface AllIdentifiersCard {
  name: string;
  setCode: string;
  setName: string;
  identifiers?: {
    scryfallId?: string;
    mcmId?: string;
    mcmMetaId?: string;
  };
  legalities?: Record<string, string>;
}

interface AllPricesEntry {
  paper?: {
    cardmarket?: {
      retail?: {
        normal?: Record<string, number>;
        foil?: Record<string, number>;
      };
    };
  };
}

async function main() {
  const config = getConfig();

  // Ensure directories exist
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(dirname(config.identifiersCachePath), { recursive: true });
  mkdirSync(dirname(config.allPricesCachePath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  initializeDatabase(db);

  // Step 1: Download AllIdentifiers to disk
  if (!existsSync(config.identifiersCachePath)) {
    console.log(
      "Downloading AllIdentifiers to disk (this may take several minutes)...",
    );
    await downloadMtgjsonGzToDisk(
      config.mtgjson.allIdentifiersUrl,
      config.identifiersCachePath,
    );
    console.log("AllIdentifiers saved to cache.");
  } else {
    console.log("Using cached AllIdentifiers.");
  }

  // Step 2: Stream-parse AllIdentifiers and insert Commander-legal cards
  console.log("Stream-parsing AllIdentifiers...");
  let cardCount = 0;
  let skipped = 0;

  const upsertCardStmt = db.prepare(`
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
  `);

  db.exec("BEGIN");
  for await (const { key: uuid, value } of streamJsonDataEntries(
    config.identifiersCachePath,
  )) {
    const card = value as AllIdentifiersCard;
    const isCommanderLegal = card.legalities?.commander === "Legal";

    if (!isCommanderLegal) {
      skipped++;
      continue;
    }

    const mcmIdStr = card.identifiers?.mcmId;
    const mcmMetaIdStr = card.identifiers?.mcmMetaId;

    upsertCardStmt.run({
      uuid,
      name: card.name,
      setCode: card.setCode ?? null,
      setName: card.setName ?? null,
      scryfallId: card.identifiers?.scryfallId ?? null,
      mcmId: mcmIdStr ? parseInt(mcmIdStr, 10) : null,
      mcmMetaId: mcmMetaIdStr ? parseInt(mcmMetaIdStr, 10) : null,
      commanderLegal: 1,
    });
    cardCount++;

    if (cardCount % 10000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      console.log(`  ${cardCount} cards inserted...`);
    }
  }
  db.exec("COMMIT");
  console.log(
    `Inserted ${cardCount} Commander-legal cards (skipped ${skipped} non-legal)`,
  );

  // Step 3: Build set of known UUIDs for price filtering
  const knownUuids = new Set(
    (db.prepare("SELECT uuid FROM cards").all() as { uuid: string }[]).map(
      (r) => r.uuid,
    ),
  );

  // Step 4: Download AllPrices to disk
  if (!existsSync(config.allPricesCachePath)) {
    console.log(
      "Downloading AllPrices to disk (90-day history, large file)...",
    );
    await downloadMtgjsonGzToDisk(
      config.mtgjson.allPricesUrl,
      config.allPricesCachePath,
    );
    console.log("AllPrices saved to cache.");
  } else {
    console.log("Using cached AllPrices.");
  }

  // Step 5: Stream-parse AllPrices and insert for known Commander-legal cards
  console.log("Stream-parsing AllPrices...");
  let priceCount = 0;
  let priceSkipped = 0;

  const upsertPriceStmt = db.prepare(`
    INSERT INTO prices (uuid, date, cm_trend, cm_foil_trend, source)
    VALUES (@uuid, @date, @cmTrend, @cmFoilTrend, @source)
    ON CONFLICT(uuid, date, source) DO UPDATE SET
      cm_trend = excluded.cm_trend,
      cm_foil_trend = excluded.cm_foil_trend
  `);

  db.exec("BEGIN");
  for await (const { key: uuid, value } of streamJsonDataEntries(
    config.allPricesCachePath,
  )) {
    if (!knownUuids.has(uuid)) {
      priceSkipped++;
      continue;
    }

    const entry = value as AllPricesEntry;
    const retail = entry.paper?.cardmarket?.retail;
    if (!retail?.normal) continue;

    const normalPrices = retail.normal;
    const foilPrices = retail.foil;

    for (const [date, price] of Object.entries(normalPrices)) {
      if (price === undefined) continue;
      upsertPriceStmt.run({
        uuid,
        date,
        cmTrend: price,
        cmFoilTrend: foilPrices?.[date] ?? null,
        source: "mtgjson",
      });
      priceCount++;
    }

    if (priceCount % 50000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      console.log(`  ${priceCount} price records inserted...`);
    }
  }
  db.exec("COMMIT");
  console.log(
    `Inserted ${priceCount} price records (skipped ${priceSkipped} non-Commander UUIDs)`,
  );

  // Step 6: Populate watchlist table from JSON
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
  console.log(
    `Watchlist: ${watchlistMatches} UUIDs from ${watchlist.length} card names`,
  );

  console.log("Seed complete!");
  db.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `yarn tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/seed.ts
git commit -m "feat: add seed command with stream-json parsing for 90-day price bootstrap"
```

**Step 4: Run seed (integration test)**

Run: `yarn seed`
Expected: Downloads AllIdentifiers (~500MB) and AllPrices (~136MB gzip), stream-parses both, populates SQLite DB. Takes several minutes. Memory usage stays constant (~50-100MB). Output should show progress counts.

Note: This downloads ~650MB+ of data. Run on a stable connection. The seed only needs to run once.

---

### Task 10: Daily Pipeline & Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `tests/pipeline.test.ts`

**Step 1: Write the integration test**

```typescript
// tests/pipeline.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema.js";
import { upsertCard, upsertPrice, getUnnotifiedDeals } from "../src/db/queries.js";
import { runDealDetection, refreshCardMetadataIfStale } from "../src/pipeline.js";

describe("refreshCardMetadataIfStale", () => {
  it("returns 0 when cache file is fresh", async () => {
    const db = new Database(":memory:");
    initializeDatabase(db);

    // Create a dummy cache file that's fresh (just written)
    const tmpDir = "tests/tmp";
    const tmpFile = `${tmpDir}/AllIdentifiers.json`;
    const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpFile, "{}");

    const result = await refreshCardMetadataIfStale(db, {
      identifiersCachePath: tmpFile,
      identifiersMaxAgeDays: 30,
      mtgjson: { allIdentifiersUrl: "", allPricesTodayUrl: "", allPricesUrl: "" },
    } as any);

    expect(result).toBe(0);

    rmSync(tmpDir, { recursive: true, force: true });
    db.close();
  });
});

describe("runDealDetection", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDatabase(db);

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
      const dateStr = d.toISOString().split("T")[0]!;
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
    const today = new Date().toISOString().split("T")[0]!;
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

Run: `yarn vitest run tests/pipeline.test.ts`
Expected: FAIL — cannot find `../src/pipeline.js`

**Step 3: Write pipeline module (testable, no side effects)**

```typescript
// src/pipeline.ts
import Database from "better-sqlite3";
import { statSync, existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
  downloadMtgjsonGzToDisk,
  streamJsonDataEntries,
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
import type { Config } from "./config.js";

interface AllIdentifiersCard {
  name: string;
  setCode: string;
  setName: string;
  identifiers?: {
    scryfallId?: string;
    mcmId?: string;
    mcmMetaId?: string;
  };
  legalities?: Record<string, string>;
}

/**
 * Refresh AllIdentifiers cache if it's older than config.identifiersMaxAgeDays.
 * Stream-parses the file and upserts any new Commander-legal cards.
 * Returns the number of cards upserted (0 if cache is fresh).
 */
export async function refreshCardMetadataIfStale(
  db: Database.Database,
  config: Config,
): Promise<number> {
  const cachePath = config.identifiersCachePath;
  const maxAgeMs = config.identifiersMaxAgeDays * 24 * 60 * 60 * 1000;

  if (existsSync(cachePath)) {
    const stat = statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < maxAgeMs) {
      console.log(
        `AllIdentifiers cache is ${Math.floor(ageMs / 86400000)}d old (max ${config.identifiersMaxAgeDays}d), skipping refresh`,
      );
      return 0;
    }
    console.log(
      `AllIdentifiers cache is ${Math.floor(ageMs / 86400000)}d old (max ${config.identifiersMaxAgeDays}d), refreshing...`,
    );
  } else {
    console.log("AllIdentifiers cache not found, downloading...");
  }

  mkdirSync(dirname(cachePath), { recursive: true });
  await downloadMtgjsonGzToDisk(config.mtgjson.allIdentifiersUrl, cachePath);

  const upsertCardStmt = db.prepare(`
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
  `);

  let cardCount = 0;
  db.exec("BEGIN");
  for await (const { key: uuid, value } of streamJsonDataEntries(cachePath)) {
    const card = value as AllIdentifiersCard;
    if (card.legalities?.commander !== "Legal") continue;

    const mcmIdStr = card.identifiers?.mcmId;
    const mcmMetaIdStr = card.identifiers?.mcmMetaId;

    upsertCardStmt.run({
      uuid,
      name: card.name,
      setCode: card.setCode ?? null,
      setName: card.setName ?? null,
      scryfallId: card.identifiers?.scryfallId ?? null,
      mcmId: mcmIdStr ? parseInt(mcmIdStr, 10) : null,
      mcmMetaId: mcmMetaIdStr ? parseInt(mcmMetaIdStr, 10) : null,
      commanderLegal: 1,
    });
    cardCount++;

    if (cardCount % 10000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
    }
  }
  db.exec("COMMIT");
  console.log(`Refreshed card metadata: ${cardCount} Commander-legal cards upserted`);
  return cardCount;
}

export function runDealDetection(
  db: Database.Database,
  config: DealDetectionConfig,
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

export async function runDailyPipeline(
  db: Database.Database,
  config: Config,
): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting daily pipeline...`);

  // 0. Refresh card metadata if stale
  await refreshCardMetadataIfStale(db, config);

  // 1. Fetch today's prices
  const priceData = await fetchAllPricesToday(config.mtgjson.allPricesTodayUrl);
  const prices = parseCardmarketPrices(priceData);
  console.log(`Parsed ${prices.length} Cardmarket prices`);

  // 2. Store prices only for Commander-legal cards already in DB
  let stored = 0;
  let skipped = 0;
  const storePrices = db.transaction(() => {
    for (const price of prices) {
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

  // 3. Get watchlist UUIDs from DB
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
      unnotified.map((d) => d.id),
    );
  }

  console.log(`[${new Date().toISOString()}] Pipeline complete`);
}
```

**Step 4: Write entry point (run-once with retry, exit)**

```typescript
// src/index.ts
import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./db/schema.js";
import { runDailyPipeline } from "./pipeline.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = getConfig();
  const maxRetries = config.pipelineMaxRetries;
  const retryDelayMs = config.pipelineRetryDelayMs;

  mkdirSync(dirname(config.dbPath), { recursive: true });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    initializeDatabase(db);

    try {
      await runDailyPipeline(db, config);
      db.close();
      return; // Success — exit cleanly
    } catch (err) {
      db.close();
      if (attempt < maxRetries) {
        const delayMin = Math.round(retryDelayMs / 60000);
        console.error(
          `Attempt ${attempt}/${maxRetries} failed: ${err instanceof Error ? err.message : err}`,
        );
        console.error(`Retrying in ${delayMin} minutes...`);
        await sleep(retryDelayMs);
      } else {
        console.error(
          `All ${maxRetries} attempts failed. Last error:`,
          err,
        );
        process.exit(1);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

**Step 5: Run test to verify it passes**

Run: `yarn vitest run tests/pipeline.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/pipeline.ts src/index.ts tests/pipeline.test.ts
git commit -m "feat: add run-once daily pipeline with deal detection and Slack alerts"
```

---

### Task 11: Run All Tests & Final Verification

**Step 1: Format all code**

Run: `yarn format`
Expected: All files formatted

**Step 2: Lint all code**

Run: `yarn lint`
Expected: No lint errors (zero `@typescript-eslint/no-explicit-any` violations)

**Step 3: Run full test suite**

Run: `yarn vitest run`
Expected: All tests pass

**Step 4: Type check**

Run: `yarn tsc --noEmit`
Expected: No type errors

**Step 5: Build**

Run: `yarn build`
Expected: `dist/` directory created with compiled JS

**Step 6: Create .env.example**

```
# Required: Slack webhook for deal notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Optional overrides (defaults shown)
# PRICE_FLOOR_EUR=10
# TREND_DROP_PCT=0.15
# WATCHLIST_ALERT_PCT=0.05
# DB_PATH=data/tracker.db
# IDENTIFIERS_MAX_AGE_DAYS=30
# PIPELINE_MAX_RETRIES=3
# PIPELINE_RETRY_DELAY_MS=900000
```

**Step 7: Commit**

```bash
git add .env.example
git commit -m "feat: add .env.example with configuration reference"
```

---

## End-to-End Verification

After all tasks are complete:

1. **Seed the database:** `yarn seed` — downloads MTGJSON data, stream-parses, populates SQLite
2. **Run the pipeline:** `SLACK_WEBHOOK_URL=https://hooks.slack.com/test yarn start` — refreshes card metadata if stale, fetches today's prices, detects deals, attempts Slack notification, retries up to 3 times on failure, exits
3. **Check the database:** `yarn tsx -e "import Database from 'better-sqlite3'; const db = new Database('data/tracker.db'); console.log('Cards:', db.prepare('SELECT COUNT(*) as c FROM cards').get()); console.log('Prices:', db.prepare('SELECT COUNT(*) as c FROM prices').get()); console.log('Deals:', db.prepare('SELECT COUNT(*) as c FROM deals').get());"`
4. **Set up scheduling:** Add `0 8 * * * cd /path/to/cardmarket-tracker && node dist/index.js` to system crontab, or equivalent systemd timer / Docker cron

## Pre-implementation Fix

Remove duplicate "Fierce Guardianship" from `data/watchlist.json` (appears on both line 75 and line 176).

## Task Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Project scaffolding | — |
| 2 | Config module (with `allPricesCachePath`, retry config) | 4 |
| 3 | Database schema (with UNIQUE on deals) | 4 |
| 4 | Database queries (upsert deals, watchlist, DealWithCardRow) | 7 |
| 5 | MTGJSON fetcher (stream-to-disk, streaming parser, retry, `fetchWithRetry` tests) | 6 |
| 6 | Deal detection engine (commander-legal filter, correct `new_low`) | 7 |
| 7 | Slack notifications | 3 |
| 8 | Watchlist loader | 2 |
| 9 | Seed command (stream-json parsing, constant memory) | integration |
| 10 | Daily pipeline (auto-refresh, retry) + entry point (dotenv) | 2 |
| 11 | Full verification | — |

## All Issues Fixed in This Revision

| # | Issue | Fix |
|---|---|---|
| 1 | Seed OOMs on AllIdentifiers/AllPrices | `stream-json` streaming parser, constant memory |
| 2 | `noUncheckedIndexedAccess` type errors | Null guards on all indexed access (`!` assertions, `?? ` fallbacks) |
| 3 | `as any` in `Readable.fromWeb` | `as ReadableStream<Uint8Array>` — type-safe |
| 4 | `new_low` detection broken | Compare to `prev_low` excluding today's date, strictly less than |
| 5 | Slow Zod validation on AllPricesToday | Removed schema parse on big data, defensive type check |
| 6 | Fragile `allPricesCachePath` derivation | Proper config field with default |
| 7 | Dead `prev` CTE in deal SQL | Removed entirely |
| 8 | `npm` → `yarn` | Global replacement |
| 9 | No `dotenv` | Added dependency, `import "dotenv/config"` in entry points |
| 10 | No network code tests | `fetchWithRetry` tests with `vi.stubGlobal` + fake timers |
| 11 | No graceful shutdown | Run-once architecture, `node-cron` removed |
| 12 | Misleading `cmTrend` field name | Clarifying comments in schema and types |
| 13 | Watchlist test missing imports | Explicit `beforeEach`/`afterEach` imports |
| 14 | No mechanism to refresh AllIdentifiers for new sets | Auto-refresh in pipeline if cache mtime >30 days old |
| 15 | No retry on pipeline failure | Built-in retry loop: 3 attempts, 15-minute delay, exit code 1 after exhausting |

## Previous Issues (already fixed in earlier revision)

| # | Issue | Fix |
|---|---|---|
| 1 | Tests break after 30 days (hardcoded dates) | All tests use dates relative to `new Date()` |
| 2 | Commander-legal filter never applied | Seed only inserts legal cards; deal engine filters in SQL |
| 3 | `as any` type casts in index.ts | `DealWithCardRow` type, proper typing |
| 4 | `filters.ts` missing from design | Removed from design (YAGNI) |
| 5 | Watchlist DB table never populated | Seed populates from watchlist.json |
| 6 | Duplicate deals on re-run | UNIQUE constraint + upsert |
| 7 | `isMainModule` check fragile | Separated into `pipeline.ts` (testable) + `index.ts` (entry point) |
| 8 | Cardmarket URL unvalidated | `/Cards/{name}` search URL |
| 9 | Duplicate in watchlist.json | Flag to fix before implementation |
| 10 | No retry on MTGJSON download | `fetchWithRetry` with exponential backoff |
