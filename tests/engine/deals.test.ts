import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../../src/db/schema.js";
import { upsertCard, upsertPrice } from "../../src/db/queries.js";
import { detectDeals } from "../../src/engine/deals.js";

// Helper to generate date strings relative to today (UTC)
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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
    expect(trendDrops[0]?.uuid).toBe("card-1");
    expect(trendDrops[0]?.pctChange).toBeLessThan(-0.15);
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

    const watchlistAlerts = deals.filter((d) => d.dealType === "watchlist_alert");
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

  it("does NOT produce duplicate watchlist_alert when trend_drop already fires", () => {
    // Card on watchlist with >15% drop should produce exactly 1 deal (trend_drop),
    // not both trend_drop AND watchlist_alert
    upsertPrice(db, {
      uuid: "card-1",
      date: daysAgo(0),
      cmTrend: 40.0, // ~20% drop from ~50 avg — triggers both thresholds
      source: "mtgjson",
    });

    const deals = detectDeals(db, {
      priceFloorEur: 10,
      trendDropPct: 0.15,
      watchlistAlertPct: 0.05,
      watchlistUuids: new Set(["card-1"]),
    });

    const card1Deals = deals.filter((d) => d.uuid === "card-1");
    const trendDrops = card1Deals.filter((d) => d.dealType === "trend_drop");
    const watchlistAlerts = card1Deals.filter((d) => d.dealType === "watchlist_alert");
    expect(trendDrops).toHaveLength(1);
    expect(watchlistAlerts).toHaveLength(0);
  });
});
