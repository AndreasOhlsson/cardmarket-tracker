# Web Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a read-only web dashboard ("Planeswalker's Trading Desk") for monitoring MTG Commander card deals, price histories, and watchlist status.

**Architecture:** Express API server reads the existing SQLite database (`data/tracker.db`) and serves JSON endpoints. A separate React + Vite SPA in `web/` consumes those endpoints. In production, Express serves the built static files alongside the API.

**Tech Stack:** Express 5, React 19, Vite, Tailwind CSS v4, shadcn/ui, Recharts, React Router (createBrowserRouter), TanStack React Query v5, better-sqlite3.

**Design doc:** `docs/plans/2026-02-24-dashboard-design.md`

---

## Task 1: Add Dashboard Queries

The existing `src/db/queries.ts` has queries for the pipeline, but the dashboard needs filtered/paginated data access. Add new query functions and tests.

**Files:**
- Modify: `src/db/queries.ts`
- Modify: `tests/db/queries.test.ts`

**Step 1: Write failing tests for dashboard queries**

Add these tests to `tests/db/queries.test.ts` inside a new `describe("dashboard queries")` block. The test setup should use the existing `beforeEach` pattern (in-memory DB, `initializeDatabase`, seed some cards/prices/deals).

```typescript
describe("dashboard queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDatabase(db);

    // Seed two cards
    upsertCard(db, {
      uuid: "card-a",
      name: "Ragavan, Nimble Pilferer",
      setCode: "MH2",
      commanderLegal: true,
    });
    upsertCard(db, {
      uuid: "card-b",
      name: "Ragavan, Nimble Pilferer",
      setCode: "2X2",
      commanderLegal: true,
    });
    upsertCard(db, {
      uuid: "card-c",
      name: "Sol Ring",
      setCode: "C21",
      commanderLegal: true,
    });

    // Seed prices (last 5 days for card-a)
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      upsertPrice(db, { uuid: "card-a", date, cmTrend: 50 - i, source: "mtgjson" });
    }

    // Seed deals
    upsertDeal(db, {
      uuid: "card-a",
      date: new Date().toISOString().slice(0, 10),
      dealType: "trend_drop",
      currentPrice: 40,
      referencePrice: 50,
      pctChange: -0.2,
    });
    upsertDeal(db, {
      uuid: "card-c",
      date: new Date().toISOString().slice(0, 10),
      dealType: "new_low",
      currentPrice: 15,
      referencePrice: 20,
      pctChange: -0.25,
    });

    // Seed watchlist
    upsertWatchlistEntry(db, "card-a", "test notes");
    upsertWatchlistEntry(db, "card-c", null);
  });

  afterEach(() => db.close());

  it("getDealsFiltered returns deals with card data", () => {
    const result = getDealsFiltered(db, {});
    expect(result.length).toBe(2);
    expect(result[0]?.name).toBeDefined();
    expect(result[0]?.set_code).toBeDefined();
  });

  it("getDealsFiltered filters by deal type", () => {
    const result = getDealsFiltered(db, { dealType: "trend_drop" });
    expect(result.length).toBe(1);
    expect(result[0]?.deal_type).toBe("trend_drop");
  });

  it("getDealsFiltered filters by minimum price", () => {
    const result = getDealsFiltered(db, { minPrice: 20 });
    expect(result.length).toBe(1);
    expect(result[0]?.current_price).toBeGreaterThanOrEqual(20);
  });

  it("getDealStats returns counts by type", () => {
    const stats = getDealStats(db);
    expect(stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deal_type: "trend_drop", count: 1 }),
        expect.objectContaining({ deal_type: "new_low", count: 1 }),
      ]),
    );
  });

  it("getWatchlistWithCards returns cards with price data", () => {
    const result = getWatchlistWithCards(db, {});
    expect(result.length).toBe(2);
    expect(result[0]?.name).toBeDefined();
    expect(result[0]?.uuid).toBeDefined();
  });

  it("getWatchlistWithCards supports search", () => {
    const result = getWatchlistWithCards(db, { search: "Ragavan" });
    expect(result.length).toBe(1);
  });

  it("searchCards returns matching cards", () => {
    const result = searchCards(db, "Ragavan");
    expect(result.length).toBe(2); // Two printings
    expect(result[0]?.name).toContain("Ragavan");
  });

  it("getCardDeals returns deals for a specific card", () => {
    const result = getCardDeals(db, "card-a");
    expect(result.length).toBe(1);
    expect(result[0]?.deal_type).toBe("trend_drop");
  });

  it("getCardPrintings returns all printings of a card by name", () => {
    const result = getCardPrintings(db, "Ragavan, Nimble Pilferer");
    expect(result.length).toBe(2);
    expect(result.map((r) => r.set_code)).toContain("MH2");
    expect(result.map((r) => r.set_code)).toContain("2X2");
  });

  it("getPipelineStats returns freshness info", () => {
    const stats = getPipelineStats(db);
    expect(stats.totalCards).toBeGreaterThan(0);
    expect(stats.latestPriceDate).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `yarn test tests/db/queries.test.ts`
Expected: FAIL — functions not exported from queries.ts

**Step 3: Implement the dashboard queries**

Add these interfaces and functions to `src/db/queries.ts`:

```typescript
// --- Dashboard query interfaces ---

export interface DealsFilter {
  dealType?: string;
  date?: string;
  minPrice?: number;
  sort?: "pct_change" | "current_price" | "date";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface DealStatRow {
  deal_type: string;
  date: string;
  count: number;
}

export interface WatchlistFilter {
  search?: string;
  sort?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface WatchlistCardRow {
  uuid: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  notes: string | null;
  latest_price: number | null;
  avg_30d: number | null;
  pct_change: number | null;
}

export interface CardSearchRow {
  uuid: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  latest_price: number | null;
}

export interface PipelineStatsRow {
  totalCards: number;
  totalPrices: number;
  totalDeals: number;
  watchlistSize: number;
  latestPriceDate: string | null;
}

// --- Dashboard query functions ---

export function getDealsFiltered(
  db: Database.Database,
  filter: DealsFilter,
): DealWithCardRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.dealType) {
    conditions.push("d.deal_type = @dealType");
    params.dealType = filter.dealType;
  }
  if (filter.date) {
    conditions.push("d.date = @date");
    params.date = filter.date;
  }
  if (filter.minPrice) {
    conditions.push("d.current_price >= @minPrice");
    params.minPrice = filter.minPrice;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortCol = filter.sort ?? "date";
  const sortDir = filter.sortDir ?? "desc";
  // Whitelist sort columns to prevent SQL injection
  const allowedSorts = ["pct_change", "current_price", "date"];
  const safeSort = allowedSorts.includes(sortCol) ? sortCol : "date";
  const safeDir = sortDir === "asc" ? "ASC" : "DESC";
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  return db
    .prepare(
      `SELECT d.*, c.name, c.set_code, c.mcm_id, c.scryfall_id
       FROM deals d
       JOIN cards c ON d.uuid = c.uuid
       ${where}
       ORDER BY d.${safeSort} ${safeDir}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as DealWithCardRow[];
}

export function getDealStats(db: Database.Database): DealStatRow[] {
  return db
    .prepare(
      `SELECT deal_type, date, COUNT(*) as count
       FROM deals
       GROUP BY deal_type, date
       ORDER BY date DESC`,
    )
    .all() as DealStatRow[];
}

export function getWatchlistWithCards(
  db: Database.Database,
  filter: WatchlistFilter,
): WatchlistCardRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.search) {
    conditions.push("c.name LIKE @search");
    params.search = `%${filter.search}%`;
  }

  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  return db
    .prepare(
      `SELECT
         w.uuid, c.name, c.set_code, c.set_name, c.scryfall_id, c.mcm_id, w.notes,
         lp.cm_trend as latest_price,
         avg_p.avg_30d,
         CASE WHEN avg_p.avg_30d > 0 AND lp.cm_trend IS NOT NULL
           THEN (lp.cm_trend - avg_p.avg_30d) / avg_p.avg_30d
           ELSE NULL
         END as pct_change
       FROM watchlist w
       JOIN cards c ON w.uuid = c.uuid
       LEFT JOIN (
         SELECT uuid, cm_trend,
                ROW_NUMBER() OVER (PARTITION BY uuid ORDER BY date DESC) as rn
         FROM prices WHERE cm_trend IS NOT NULL
       ) lp ON w.uuid = lp.uuid AND lp.rn = 1
       LEFT JOIN (
         SELECT uuid, AVG(cm_trend) as avg_30d
         FROM prices
         WHERE cm_trend IS NOT NULL AND date >= date('now', '-30 days')
         GROUP BY uuid
       ) avg_p ON w.uuid = avg_p.uuid
       WHERE 1=1 ${where}
       ORDER BY c.name ASC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as WatchlistCardRow[];
}

export function searchCards(
  db: Database.Database,
  query: string,
  limit: number = 20,
): CardSearchRow[] {
  return db
    .prepare(
      `SELECT c.uuid, c.name, c.set_code, c.set_name, c.scryfall_id, c.mcm_id,
              lp.cm_trend as latest_price
       FROM cards c
       LEFT JOIN (
         SELECT uuid, cm_trend,
                ROW_NUMBER() OVER (PARTITION BY uuid ORDER BY date DESC) as rn
         FROM prices WHERE cm_trend IS NOT NULL
       ) lp ON c.uuid = lp.uuid AND lp.rn = 1
       WHERE c.name LIKE @query AND c.commander_legal = 1
       ORDER BY c.name ASC
       LIMIT @limit`,
    )
    .all({ query: `%${query}%`, limit }) as CardSearchRow[];
}

export function getCardDeals(
  db: Database.Database,
  uuid: string,
): DealRow[] {
  return db
    .prepare(
      `SELECT * FROM deals WHERE uuid = @uuid ORDER BY date DESC`,
    )
    .all({ uuid }) as DealRow[];
}

export function getCardPrintings(
  db: Database.Database,
  name: string,
): CardRow[] {
  return db
    .prepare(
      `SELECT * FROM cards WHERE name = @name AND commander_legal = 1 ORDER BY set_code ASC`,
    )
    .all({ name }) as CardRow[];
}

export function getPipelineStats(db: Database.Database): PipelineStatsRow {
  const totalCards = (
    db.prepare("SELECT COUNT(*) as count FROM cards WHERE commander_legal = 1").get() as {
      count: number;
    }
  ).count;
  const totalPrices = (
    db.prepare("SELECT COUNT(*) as count FROM prices").get() as { count: number }
  ).count;
  const totalDeals = (
    db.prepare("SELECT COUNT(*) as count FROM deals").get() as { count: number }
  ).count;
  const watchlistSize = (
    db.prepare("SELECT COUNT(*) as count FROM watchlist").get() as { count: number }
  ).count;
  const latestRow = db
    .prepare("SELECT MAX(date) as latest_date FROM prices")
    .get() as { latest_date: string | null } | undefined;

  return {
    totalCards,
    totalPrices,
    totalDeals,
    watchlistSize,
    latestPriceDate: latestRow?.latest_date ?? null,
  };
}
```

Note: `DealWithCardRow` needs `scryfall_id` added. Update the existing interface:

```typescript
export interface DealWithCardRow extends DealRow {
  name: string;
  set_code: string | null;
  mcm_id: number | null;
  scryfall_id: string | null;  // ADD THIS
}
```

And update `getUnnotifiedDeals` to also SELECT `c.scryfall_id`.

**Step 4: Run tests to verify they pass**

Run: `yarn test tests/db/queries.test.ts`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `yarn test`
Expected: ALL PASS (existing tests unbroken)

**Step 6: Commit**

```bash
git add src/db/queries.ts tests/db/queries.test.ts
git commit -m "feat: add dashboard query functions with tests"
```

---

## Task 2: Express API Server

Create the Express server that reads the SQLite database and exposes JSON endpoints.

**Files:**
- Create: `server/api.ts`
- Modify: `package.json` (add express + @types/express + concurrently)

**Step 1: Install Express**

```bash
yarn add express
yarn add -D @types/express concurrently
```

**Step 2: Create server/api.ts**

```typescript
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema.js";
import {
  getCardByUuid,
  getDealsFiltered,
  getDealStats,
  getWatchlistWithCards,
  searchCards,
  getPriceHistory,
  getCardDeals,
  getCardPrintings,
  getPipelineStats,
  get30DayAvgPrice,
  getHistoricalLowPrice,
} from "../src/db/queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "data", "tracker.db");
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const db = new Database(DB_PATH, { readonly: true });
db.pragma("journal_mode = WAL");

const app = express();

// --- API Routes ---

app.get("/api/deals", (req, res) => {
  const filter = {
    dealType: req.query.type as string | undefined,
    date: req.query.date as string | undefined,
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    sort: req.query.sort as "pct_change" | "current_price" | "date" | undefined,
    sortDir: req.query.sortDir as "asc" | "desc" | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  };
  res.json(getDealsFiltered(db, filter));
});

app.get("/api/deals/stats", (_req, res) => {
  res.json(getDealStats(db));
});

app.get("/api/watchlist", (req, res) => {
  const filter = {
    search: req.query.search as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  };
  res.json(getWatchlistWithCards(db, filter));
});

app.get("/api/cards/search", (req, res) => {
  const q = (req.query.q as string) ?? "";
  if (q.length < 2) {
    res.json([]);
    return;
  }
  res.json(searchCards(db, q));
});

app.get("/api/cards/:uuid", (req, res) => {
  const card = getCardByUuid(db, req.params.uuid);
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  const avg30d = get30DayAvgPrice(db, req.params.uuid);
  const historicalLow = getHistoricalLowPrice(db, req.params.uuid);
  const printings = getCardPrintings(db, card.name);
  res.json({ ...card, avg30d, historicalLow, printings });
});

app.get("/api/cards/:uuid/prices", (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 30;
  res.json(getPriceHistory(db, req.params.uuid, days));
});

app.get("/api/cards/:uuid/deals", (req, res) => {
  res.json(getCardDeals(db, req.params.uuid));
});

app.get("/api/stats/pipeline", (_req, res) => {
  res.json(getPipelineStats(db));
});

// --- Static file serving (production) ---
const webDist = path.join(__dirname, "..", "web", "dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard API running at http://localhost:${PORT}`);
});
```

**Step 3: Add scripts to package.json**

Add these scripts:

```json
{
  "scripts": {
    "dev:server": "tsx watch server/api.ts",
    "dev:web": "cd web && npm run dev",
    "dev": "concurrently \"yarn dev:server\" \"yarn dev:web\""
  }
}
```

**Step 4: Verify the server starts**

Run: `yarn dev:server`
Expected: "Dashboard API running at http://localhost:3001"

Test an endpoint: `curl http://localhost:3001/api/stats/pipeline`
Expected: JSON with totalCards, totalPrices, etc.

Test deals: `curl "http://localhost:3001/api/deals?limit=3"`
Expected: JSON array of deals with card names

Stop the server with Ctrl+C.

**Step 5: Commit**

```bash
git add server/api.ts package.json yarn.lock
git commit -m "feat: add Express API server for dashboard"
```

---

## Task 3: Scaffold React + Vite Project

Create the `web/` directory as a separate Vite + React + TypeScript project.

**Files:**
- Create: `web/` directory (Vite scaffold)
- Modify: `.gitignore`

**Step 1: Scaffold with Vite**

```bash
cd web
npm create vite@latest . -- --template react-ts
```

If prompted about existing directory, choose to overwrite/continue.

**Step 2: Install dependencies**

```bash
cd web
npm install
```

**Step 3: Verify the scaffold works**

```bash
cd web
npm run dev
```

Expected: Vite dev server at http://localhost:5173 with default React page.
Stop with Ctrl+C.

**Step 4: Add web/node_modules and web/dist to .gitignore**

Append to the root `.gitignore`:

```
web/node_modules
web/dist
```

**Step 5: Commit**

```bash
git add web/ .gitignore
git commit -m "feat: scaffold React + Vite project in web/"
```

---

## Task 4: Configure Tailwind CSS v4 + shadcn/ui + MTG Theme

Set up Tailwind CSS v4 with the Vite plugin, initialize shadcn/ui, and configure the MTG dark fantasy theme.

**Files:**
- Modify: `web/vite.config.ts`
- Modify: `web/tsconfig.json`, `web/tsconfig.app.json`
- Modify: `web/src/index.css`
- Create: `web/components.json` (via shadcn init)
- Create: `web/src/lib/utils.ts` (via shadcn init)

**Step 1: Install Tailwind CSS v4 + Vite plugin**

```bash
cd web
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
```

**Step 2: Update vite.config.ts**

```typescript
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
```

**Step 3: Configure TypeScript path aliases**

Update `web/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Add to `web/tsconfig.app.json` `compilerOptions`:
```json
{
  "baseUrl": ".",
  "paths": {
    "@/*": ["./src/*"]
  }
}
```

**Step 4: Initialize shadcn/ui**

```bash
cd web
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Neutral (we'll override with MTG theme)
- CSS variables: Yes

This creates `components.json`, `src/lib/utils.ts`, and modifies `src/index.css`.

**Step 5: Configure MTG dark fantasy theme**

Replace `web/src/index.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* MTG "Planeswalker's Trading Desk" palette */
  --color-background: oklch(0.14 0.01 260);
  --color-foreground: oklch(0.93 0.01 80);
  --color-card: oklch(0.18 0.02 250);
  --color-card-foreground: oklch(0.93 0.01 80);
  --color-popover: oklch(0.18 0.02 250);
  --color-popover-foreground: oklch(0.93 0.01 80);
  --color-primary: oklch(0.72 0.12 80);
  --color-primary-foreground: oklch(0.14 0.01 260);
  --color-secondary: oklch(0.22 0.02 250);
  --color-secondary-foreground: oklch(0.93 0.01 80);
  --color-muted: oklch(0.22 0.02 250);
  --color-muted-foreground: oklch(0.65 0.02 80);
  --color-accent: oklch(0.25 0.03 250);
  --color-accent-foreground: oklch(0.93 0.01 80);
  --color-destructive: oklch(0.58 0.22 25);
  --color-destructive-foreground: oklch(0.93 0.01 80);
  --color-border: oklch(0.30 0.03 80);
  --color-input: oklch(0.25 0.02 250);
  --color-ring: oklch(0.72 0.12 80);
  --color-chart-1: oklch(0.72 0.12 80);
  --color-chart-2: oklch(0.65 0.20 250);
  --color-chart-3: oklch(0.75 0.15 75);
  --color-chart-4: oklch(0.60 0.18 30);
  --color-chart-5: oklch(0.65 0.15 170);
  --color-sidebar-background: oklch(0.12 0.01 260);
  --color-sidebar-foreground: oklch(0.93 0.01 80);
  --color-sidebar-primary: oklch(0.72 0.12 80);
  --color-sidebar-primary-foreground: oklch(0.14 0.01 260);
  --color-sidebar-accent: oklch(0.20 0.02 250);
  --color-sidebar-accent-foreground: oklch(0.93 0.01 80);
  --color-sidebar-border: oklch(0.25 0.02 250);
  --color-sidebar-ring: oklch(0.72 0.12 80);
  --radius: 0.5rem;

  /* Custom deal type colors */
  --color-deal-trend-drop: oklch(0.58 0.22 25);
  --color-deal-new-low: oklch(0.62 0.18 250);
  --color-deal-watchlist: oklch(0.75 0.15 75);
  --color-positive: oklch(0.65 0.15 170);

  /* Typography */
  --font-display: "Cinzel", serif;
  --font-sans: "Source Sans 3", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

/* Google Fonts */
@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap");

/* Force dark mode always */
:root {
  color-scheme: dark;
}

body {
  @apply bg-background text-foreground font-sans antialiased;
}
```

Note: The exact oklch values above are approximations of the hex colors from the design doc (#1a1a2e, #16213e, #c9a84c, etc.). Adjust after visual inspection if needed.

**Step 6: Add shadcn components we'll need**

```bash
cd web
npx shadcn@latest add card badge table input select tabs skeleton button separator command scroll-area chart
```

**Step 7: Verify it builds**

```bash
cd web
npm run dev
```

Expected: Vite dev server starts with dark themed background.
Stop with Ctrl+C.

**Step 8: Commit**

```bash
git add web/
git commit -m "feat: configure Tailwind v4 + shadcn/ui with MTG theme"
```

---

## Task 5: App Shell — Router + Layout + Sidebar

Set up React Router with createBrowserRouter, a sidebar layout, and navigation.

**Files:**
- Modify: `web/src/main.tsx`
- Create: `web/src/App.tsx` (rewrite)
- Create: `web/src/components/layout.tsx`
- Create: `web/src/pages/deals.tsx` (placeholder)
- Create: `web/src/pages/watchlist.tsx` (placeholder)
- Create: `web/src/pages/card-detail.tsx` (placeholder)
- Create: `web/src/pages/stats.tsx` (placeholder)
- Create: `web/src/hooks/use-api.ts`

**Step 1: Install React Router + TanStack Query**

```bash
cd web
npm install react-router-dom @tanstack/react-query
```

**Step 2: Create the API hooks file**

Create `web/src/hooks/use-api.ts`:

```typescript
const API_BASE = "/api";

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}
```

**Step 3: Create placeholder pages**

Create `web/src/pages/deals.tsx`:
```tsx
export default function DealsPage() {
  return <div className="p-6"><h1 className="font-display text-2xl text-primary">Deals</h1></div>;
}
```

Create `web/src/pages/watchlist.tsx`:
```tsx
export default function WatchlistPage() {
  return <div className="p-6"><h1 className="font-display text-2xl text-primary">Watchlist</h1></div>;
}
```

Create `web/src/pages/card-detail.tsx`:
```tsx
export default function CardDetailPage() {
  return <div className="p-6"><h1 className="font-display text-2xl text-primary">Card Detail</h1></div>;
}
```

Create `web/src/pages/stats.tsx`:
```tsx
export default function StatsPage() {
  return <div className="p-6"><h1 className="font-display text-2xl text-primary">Stats</h1></div>;
}
```

**Step 4: Create the sidebar layout**

Create `web/src/components/layout.tsx`:

```tsx
import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Deals", icon: "⚔️" },
  { path: "/watchlist", label: "Watchlist", icon: "👁" },
  { path: "/stats", label: "Stats", icon: "📊" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-sidebar-background flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <h1 className="font-display text-lg text-primary tracking-wide">
            Planeswalker's
          </h1>
          <p className="font-display text-xs text-muted-foreground tracking-widest uppercase">
            Trading Desk
          </p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground">
          MTG Deal Finder
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 5: Set up the router in App.tsx**

Rewrite `web/src/App.tsx`:

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "@/components/layout";
import DealsPage from "@/pages/deals";
import WatchlistPage from "@/pages/watchlist";
import CardDetailPage from "@/pages/card-detail";
import StatsPage from "@/pages/stats";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DealsPage /> },
      { path: "/watchlist", element: <WatchlistPage /> },
      { path: "/card/:uuid", element: <CardDetailPage /> },
      { path: "/stats", element: <StatsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

**Step 6: Set up QueryClient in main.tsx**

Rewrite `web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

**Step 7: Delete leftover scaffold files**

Remove `web/src/App.css` and `web/src/assets/react.svg` (no longer needed).

**Step 8: Verify the app shell works**

Start the server and web dev server:

```bash
# Terminal 1
yarn dev:server

# Terminal 2
cd web && npm run dev
```

Expected: Dark themed sidebar with navigation. Clicking links changes page content.

**Step 9: Commit**

```bash
git add web/ package.json yarn.lock
git commit -m "feat: app shell with React Router, sidebar layout, TanStack Query"
```

---

## Task 6: Deals Page

Build the landing page — a filterable feed of detected deals with card images and Cardmarket links.

**Files:**
- Rewrite: `web/src/pages/deals.tsx`
- Create: `web/src/components/deal-card.tsx`
- Create: `web/src/components/price-sparkline.tsx`

**Step 1: Create the sparkline component**

Create `web/src/components/price-sparkline.tsx`:

```tsx
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface PriceSparklineProps {
  data: { date: string; price: number }[];
  color?: string;
  height?: number;
}

export default function PriceSparkline({
  data,
  color = "hsl(var(--chart-1))",
  height = 32,
}: PriceSparklineProps) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Create the deal card component**

Create `web/src/components/deal-card.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface DealCardProps {
  uuid: string;
  name: string;
  setCode: string | null;
  dealType: string;
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
  scryfallId: string | null;
  mcmId: number | null;
}

const DEAL_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  trend_drop: { label: "TREND DROP", className: "bg-deal-trend-drop/20 text-deal-trend-drop border-deal-trend-drop/30" },
  new_low: { label: "NEW LOW", className: "bg-deal-new-low/20 text-deal-new-low border-deal-new-low/30" },
  watchlist_alert: { label: "WATCHLIST", className: "bg-deal-watchlist/20 text-deal-watchlist border-deal-watchlist/30" },
};

function cardmarketUrl(name: string, mcmId: number | null): string {
  if (mcmId) return `https://www.cardmarket.com/en/Magic/Products/Singles/${mcmId}`;
  return `https://www.cardmarket.com/en/Magic/Cards/${encodeURIComponent(name)}`;
}

function scryfallImageUrl(scryfallId: string | null, size: "small" | "normal" = "small"): string | null {
  if (!scryfallId) return null;
  return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=${size}`;
}

export default function DealCard(props: DealCardProps) {
  const config = DEAL_TYPE_CONFIG[props.dealType] ?? {
    label: props.dealType,
    className: "bg-muted text-muted-foreground",
  };
  const pctStr = (props.pctChange * 100).toFixed(1);
  const imageUrl = scryfallImageUrl(props.scryfallId);

  return (
    <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="p-0 flex">
        {/* Card image */}
        {imageUrl && (
          <Link to={`/card/${props.uuid}`} className="shrink-0">
            <img
              src={imageUrl}
              alt={props.name}
              className="w-24 h-auto object-cover"
              loading="lazy"
            />
          </Link>
        )}

        {/* Deal info */}
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn("text-xs", config.className)}>
                {config.label}
              </Badge>
              {props.setCode && (
                <span className="text-xs text-muted-foreground">{props.setCode}</span>
              )}
            </div>
            <Link to={`/card/${props.uuid}`}>
              <h3 className="font-display text-sm font-semibold text-foreground hover:text-primary transition-colors">
                {props.name}
              </h3>
            </Link>
          </div>

          <div className="flex items-end justify-between mt-2">
            <div>
              <span className="font-mono text-lg font-semibold text-foreground">
                €{props.currentPrice.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ← €{props.referencePrice.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-mono text-sm font-medium",
                  props.pctChange < 0 ? "text-deal-trend-drop" : "text-positive",
                )}
              >
                {props.pctChange > 0 ? "+" : ""}{pctStr}%
              </span>
              <a
                href={cardmarketUrl(props.name, props.mcmId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Buy →
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Build the Deals page**

Rewrite `web/src/pages/deals.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/hooks/use-api";
import DealCard from "@/components/deal-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface DealRow {
  id: number;
  uuid: string;
  date: string;
  deal_type: string;
  current_price: number;
  reference_price: number;
  pct_change: number;
  name: string;
  set_code: string | null;
  mcm_id: number | null;
  scryfall_id: string | null;
}

export default function DealsPage() {
  const [dealType, setDealType] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [sort, setSort] = useState<string>("date");

  const params = new URLSearchParams();
  if (dealType !== "all") params.set("type", dealType);
  if (minPrice) params.set("minPrice", minPrice);
  params.set("sort", sort);
  params.set("limit", "100");

  const { data: deals, isPending } = useQuery({
    queryKey: ["deals", dealType, minPrice, sort],
    queryFn: () => apiFetch<DealRow[]>(`/deals?${params.toString()}`),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl text-primary mb-6">Today's Deals</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <Select value={dealType} onValueChange={setDealType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Deal type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="trend_drop">Trend Drop</SelectItem>
            <SelectItem value="new_low">New Low</SelectItem>
            <SelectItem value="watchlist_alert">Watchlist</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Min price (€)"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="w-36"
        />

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Newest</SelectItem>
            <SelectItem value="pct_change">Biggest drop</SelectItem>
            <SelectItem value="current_price">Lowest price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Deal count */}
      {deals && (
        <p className="text-sm text-muted-foreground mb-4">
          {deals.length} deal{deals.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Deal feed */}
      <div className="space-y-3">
        {isPending &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        {deals?.map((deal) => (
          <DealCard
            key={deal.id}
            uuid={deal.uuid}
            name={deal.name}
            setCode={deal.set_code}
            dealType={deal.deal_type}
            currentPrice={deal.current_price}
            referencePrice={deal.reference_price}
            pctChange={deal.pct_change}
            scryfallId={deal.scryfall_id}
            mcmId={deal.mcm_id}
          />
        ))}
        {deals?.length === 0 && (
          <p className="text-muted-foreground text-center py-12">
            No deals found matching your filters.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Verify with live data**

Run both servers (`yarn dev`). Navigate to http://localhost:5173.
Expected: Deal cards with card images, prices, badges, and Cardmarket links.

**Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: deals page with deal cards, filters, and Cardmarket links"
```

---

## Task 7: Watchlist Page

Build the watchlist page with a sortable/searchable data table.

**Files:**
- Rewrite: `web/src/pages/watchlist.tsx`

**Step 1: Build the Watchlist page**

Rewrite `web/src/pages/watchlist.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WatchlistRow {
  uuid: string;
  name: string;
  set_code: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  notes: string | null;
  latest_price: number | null;
  avg_30d: number | null;
  pct_change: number | null;
}

function scryfallImageUrl(scryfallId: string | null): string | null {
  if (!scryfallId) return null;
  return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=small`;
}

export default function WatchlistPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: cards, isPending } = useQuery({
    queryKey: ["watchlist", search, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.length >= 2) params.set("search", search);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      return apiFetch<WatchlistRow[]>(`/watchlist?${params.toString()}`);
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-primary">Watchlist</h1>
        <Input
          placeholder="Search cards..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-64"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Set</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">30d Avg</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            {cards?.map((card) => (
              <TableRow key={card.uuid} className="hover:bg-muted/20">
                <TableCell>
                  {card.scryfall_id && (
                    <img
                      src={scryfallImageUrl(card.scryfall_id) ?? ""}
                      alt=""
                      className="w-8 h-auto rounded-sm"
                      loading="lazy"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/card/${card.uuid}`}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {card.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{card.set_code}</TableCell>
                <TableCell className="text-right font-mono">
                  {card.latest_price != null ? `€${card.latest_price.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {card.avg_30d != null ? `€${card.avg_30d.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {card.pct_change != null ? (
                    <span
                      className={cn(
                        card.pct_change < 0 ? "text-deal-trend-drop" : "text-positive",
                      )}
                    >
                      {card.pct_change > 0 ? "+" : ""}
                      {(card.pct_change * 100).toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
            {cards?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No cards found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {cards && cards.length > 0 && (
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-sm text-primary disabled:text-muted-foreground"
          >
            ← Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={cards.length < pageSize}
            className="text-sm text-primary disabled:text-muted-foreground"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify with live data**

Navigate to http://localhost:5173/watchlist.
Expected: Table of watchlisted cards with prices and search.

**Step 3: Commit**

```bash
git add web/src/pages/watchlist.tsx
git commit -m "feat: watchlist page with searchable data table"
```

---

## Task 8: Card Detail Page

Build the card detail page with a price history chart, card image, and deal history.

**Files:**
- Rewrite: `web/src/pages/card-detail.tsx`
- Create: `web/src/components/price-chart.tsx`

**Step 1: Create the price chart component**

Create `web/src/components/price-chart.tsx`:

```tsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PriceChartProps {
  data: { date: string; cm_trend: number | null }[];
}

export default function PriceChart({ data }: PriceChartProps) {
  const chartData = data
    .filter((d) => d.cm_trend != null)
    .map((d) => ({ date: d.date, price: d.cm_trend }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return <p className="text-muted-foreground">No price data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.72 0.12 80)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="oklch(0.72 0.12 80)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 80 / 0.3)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }}
          tickFormatter={(v: number) => `€${v}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.18 0.02 250)",
            border: "1px solid oklch(0.30 0.03 80)",
            borderRadius: "0.5rem",
            color: "oklch(0.93 0.01 80)",
            fontFamily: "JetBrains Mono",
            fontSize: "12px",
          }}
          formatter={(value: number) => [`€${value.toFixed(2)}`, "Trend"]}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="oklch(0.72 0.12 80)"
          strokeWidth={2}
          fill="url(#priceGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Build the Card Detail page**

Rewrite `web/src/pages/card-detail.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { apiFetch } from "@/hooks/use-api";
import PriceChart from "@/components/price-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CardData {
  uuid: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  avg30d: number | null;
  historicalLow: number | null;
  printings: { uuid: string; set_code: string | null; set_name: string | null; scryfall_id: string | null }[];
}

interface PriceRow {
  date: string;
  cm_trend: number | null;
}

interface DealRow {
  id: number;
  date: string;
  deal_type: string;
  current_price: number;
  reference_price: number;
  pct_change: number;
}

function cardmarketUrl(name: string, mcmId: number | null): string {
  if (mcmId) return `https://www.cardmarket.com/en/Magic/Products/Singles/${mcmId}`;
  return `https://www.cardmarket.com/en/Magic/Cards/${encodeURIComponent(name)}`;
}

export default function CardDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [days, setDays] = useState("90");

  const { data: card, isPending: cardPending } = useQuery({
    queryKey: ["card", uuid],
    queryFn: () => apiFetch<CardData>(`/cards/${uuid}`),
    enabled: !!uuid,
  });

  const { data: prices } = useQuery({
    queryKey: ["prices", uuid, days],
    queryFn: () => apiFetch<PriceRow[]>(`/cards/${uuid}/prices?days=${days}`),
    enabled: !!uuid,
  });

  const { data: deals } = useQuery({
    queryKey: ["card-deals", uuid],
    queryFn: () => apiFetch<DealRow[]>(`/cards/${uuid}/deals`),
    enabled: !!uuid,
  });

  if (cardPending) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!card) {
    return <div className="p-6 text-muted-foreground">Card not found.</div>;
  }

  const imageUrl = card.scryfall_id
    ? `https://api.scryfall.com/cards/${card.scryfall_id}?format=image&version=normal`
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex gap-8 mb-8">
        {/* Card image */}
        {imageUrl && (
          <div className="shrink-0">
            <img
              src={imageUrl}
              alt={card.name}
              className="w-56 rounded-lg shadow-lg"
            />
          </div>
        )}

        {/* Card info */}
        <div className="flex-1">
          <h1 className="font-display text-3xl text-primary mb-1">{card.name}</h1>
          <p className="text-muted-foreground mb-4">
            {card.set_name} ({card.set_code})
          </p>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">30d Average</p>
                <p className="font-mono text-lg">
                  {card.avg30d != null ? `€${card.avg30d.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Historical Low</p>
                <p className="font-mono text-lg">
                  {card.historicalLow != null ? `€${card.historicalLow.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cardmarket</p>
                <a
                  href={cardmarketUrl(card.name, card.mcm_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm"
                >
                  View on CM →
                </a>
              </CardContent>
            </Card>
          </div>

          {/* Other printings */}
          {card.printings.length > 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Other printings:</p>
              <div className="flex flex-wrap gap-1">
                {card.printings
                  .filter((p) => p.uuid !== card.uuid)
                  .map((p) => (
                    <Link key={p.uuid} to={`/card/${p.uuid}`}>
                      <Badge variant="outline" className="text-xs hover:bg-muted">
                        {p.set_code}
                      </Badge>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Price chart */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-lg">Price History</CardTitle>
          <Tabs value={days} onValueChange={setDays}>
            <TabsList>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
              <TabsTrigger value="365">1y</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {prices ? <PriceChart data={prices} /> : <Skeleton className="h-64" />}
        </CardContent>
      </Card>

      {/* Deal history */}
      {deals && deals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Deal History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        deal.deal_type === "trend_drop" && "text-deal-trend-drop",
                        deal.deal_type === "new_low" && "text-deal-new-low",
                        deal.deal_type === "watchlist_alert" && "text-deal-watchlist",
                      )}
                    >
                      {deal.deal_type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{deal.date}</span>
                  </div>
                  <div className="font-mono text-sm">
                    €{deal.current_price.toFixed(2)}{" "}
                    <span className="text-muted-foreground">← €{deal.reference_price.toFixed(2)}</span>{" "}
                    <span
                      className={cn(
                        deal.pct_change < 0 ? "text-deal-trend-drop" : "text-positive",
                      )}
                    >
                      ({(deal.pct_change * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 3: Verify with live data**

Click a deal card from the Deals page — should navigate to the card detail with chart and info.

**Step 4: Commit**

```bash
git add web/src/
git commit -m "feat: card detail page with price chart, stats, and deal history"
```

---

## Task 9: Stats Page

Build the stats page with deal counts, top drops, and pipeline health.

**Files:**
- Rewrite: `web/src/pages/stats.tsx`

**Step 1: Build the Stats page**

Rewrite `web/src/pages/stats.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface PipelineStats {
  totalCards: number;
  totalPrices: number;
  totalDeals: number;
  watchlistSize: number;
  latestPriceDate: string | null;
}

interface DealStatRow {
  deal_type: string;
  date: string;
  count: number;
}

interface DealRow {
  id: number;
  uuid: string;
  date: string;
  deal_type: string;
  current_price: number;
  reference_price: number;
  pct_change: number;
  name: string;
  set_code: string | null;
  mcm_id: number | null;
  scryfall_id: string | null;
}

export default function StatsPage() {
  const { data: stats, isPending: statsPending } = useQuery({
    queryKey: ["pipeline-stats"],
    queryFn: () => apiFetch<PipelineStats>("/stats/pipeline"),
  });

  const { data: dealStats } = useQuery({
    queryKey: ["deal-stats"],
    queryFn: () => apiFetch<DealStatRow[]>("/deals/stats"),
  });

  const { data: topDrops } = useQuery({
    queryKey: ["top-drops"],
    queryFn: () => apiFetch<DealRow[]>("/deals?sort=pct_change&sortDir=asc&limit=10"),
  });

  // Aggregate deal stats by date for chart
  const chartData = dealStats
    ? Object.values(
        dealStats.reduce(
          (acc, row) => {
            if (!acc[row.date]) acc[row.date] = { date: row.date, trend_drop: 0, new_low: 0, watchlist_alert: 0 };
            const entry = acc[row.date]!;
            if (row.deal_type === "trend_drop") entry.trend_drop = row.count;
            if (row.deal_type === "new_low") entry.new_low = row.count;
            if (row.deal_type === "watchlist_alert") entry.watchlist_alert = row.count;
            return acc;
          },
          {} as Record<string, { date: string; trend_drop: number; new_low: number; watchlist_alert: number }>,
        ),
      ).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl text-primary mb-6">Stats</h1>

      {/* Pipeline health cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statsPending ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cards Tracked</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalCards.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Price Records</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalPrices.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Deals</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalDeals.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Latest Data</p>
                <p className="font-mono text-lg text-foreground">
                  {stats?.latestPriceDate ?? "—"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Deal counts chart */}
      {chartData.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="font-display text-lg">Deals by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 80 / 0.3)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.18 0.02 250)",
                    border: "1px solid oklch(0.30 0.03 80)",
                    borderRadius: "0.5rem",
                    color: "oklch(0.93 0.01 80)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="trend_drop" fill="oklch(0.58 0.22 25)" name="Trend Drop" />
                <Bar dataKey="new_low" fill="oklch(0.62 0.18 250)" name="New Low" />
                <Bar dataKey="watchlist_alert" fill="oklch(0.75 0.15 75)" name="Watchlist" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top drops */}
      {topDrops && topDrops.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Biggest Drops</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDrops.map((deal, i) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <Link
                      to={`/card/${deal.uuid}`}
                      className="text-sm font-medium hover:text-primary transition-colors"
                    >
                      {deal.name}
                    </Link>
                    {deal.set_code && (
                      <span className="text-xs text-muted-foreground">{deal.set_code}</span>
                    )}
                  </div>
                  <div className="font-mono text-sm">
                    <span className="text-deal-trend-drop">
                      {(deal.pct_change * 100).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground ml-2">
                      €{deal.current_price.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: Verify with live data**

Navigate to http://localhost:5173/stats.
Expected: Pipeline health cards, deals-by-day bar chart, and biggest drops list.

**Step 3: Commit**

```bash
git add web/src/pages/stats.tsx
git commit -m "feat: stats page with pipeline health, deal charts, and top drops"
```

---

## Task 10: Production Build & Dev Scripts

Configure Express to serve the built React SPA in production and finalize all scripts.

**Files:**
- Modify: `package.json`
- Modify: `web/package.json`

**Step 1: Add build scripts to root package.json**

```json
{
  "scripts": {
    "build": "tsc",
    "build:web": "cd web && npm run build",
    "build:all": "yarn build && yarn build:web",
    "start": "node dist/index.js",
    "start:dashboard": "tsx server/api.ts",
    "dev:server": "tsx watch server/api.ts",
    "dev:web": "cd web && npm run dev",
    "dev": "concurrently \"yarn dev:server\" \"yarn dev:web\"",
    "seed": "tsx src/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/ tests/",
    "lint:fix": "eslint src/ tests/ --fix",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\" \"server/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\" \"server/**/*.ts\""
  }
}
```

**Step 2: Verify production build**

```bash
yarn build:web
yarn start:dashboard
```

Navigate to http://localhost:3001.
Expected: The full React SPA served from Express, all pages working.

**Step 3: Verify the pipeline still works**

```bash
yarn build
yarn start
```

Expected: Daily pipeline runs normally (no regressions).

**Step 4: Run all tests**

```bash
yarn test
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add package.json web/
git commit -m "feat: production build config for dashboard"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | Dashboard queries + tests |
| 2 | Express API server |
| 3 | Vite + React scaffold |
| 4 | Tailwind v4 + shadcn/ui + MTG theme |
| 5 | Router + Layout + Sidebar |
| 6 | Deals page (landing) |
| 7 | Watchlist page |
| 8 | Card Detail page + price chart |
| 9 | Stats page |
| 10 | Production build scripts |

**Total new files:** ~15 (server + web app)
**Modified files:** 3 (queries.ts, queries.test.ts, package.json)
**New dependencies:** express, react, vite, tailwindcss, shadcn/ui, recharts, react-router-dom, @tanstack/react-query
