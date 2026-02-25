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
  upsertWatchlistEntry,
  upsertDeal,
  getUnnotifiedDeals,
  markDealsNotified,
  getDealsFiltered,
  getDealStats,
  getWatchlistWithCards,
  searchCards,
  getCardDeals,
  getCardPrintings,
  getPipelineStats,
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
      expect(card?.name).toBe("Lightning Bolt");
      expect(card?.mcm_id).toBe(1234);
      expect(card?.commander_legal).toBe(1);
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
      expect(card?.set_code).toBe("STA");
    });
  });

  describe("upsertPrice", () => {
    it("inserts a price record", () => {
      const today = new Date().toISOString().slice(0, 10);
      upsertCard(db, { uuid: "abc-123", name: "Test", commanderLegal: true });
      upsertPrice(db, {
        uuid: "abc-123",
        date: today,
        cmTrend: 15.5,
        source: "mtgjson",
      });

      const latest = getLatestPrice(db, "abc-123");
      expect(latest).toBeTruthy();
      expect(latest?.cm_trend).toBe(15.5);
    });

    it("replaces on duplicate uuid+date+source", () => {
      const today = new Date().toISOString().slice(0, 10);
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
      expect(history[0]?.cm_trend).toBe(16.0);
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
        const dateStr = d.toISOString().slice(0, 10);
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
      expect(latest?.cm_trend).toBe(11); // most recent = 1 day ago, value 10+1
    });
  });

  describe("deals", () => {
    it("inserts and retrieves unnotified deals", () => {
      const today = new Date().toISOString().slice(0, 10);
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
      expect(deals[0]?.deal_type).toBe("trend_drop");

      markDealsNotified(
        db,
        deals.map((d) => d.id),
      );

      const after = getUnnotifiedDeals(db);
      expect(after).toHaveLength(0);
    });

    it("markDealsNotified does not throw on empty array", () => {
      expect(() => markDealsNotified(db, [])).not.toThrow();
    });
  });

  describe("getCardsByName", () => {
    it("returns multiple printings of the same card", () => {
      upsertCard(db, {
        uuid: "bolt-a25",
        name: "Lightning Bolt",
        setCode: "A25",
        commanderLegal: true,
      });
      upsertCard(db, {
        uuid: "bolt-sta",
        name: "Lightning Bolt",
        setCode: "STA",
        commanderLegal: true,
      });
      upsertCard(db, { uuid: "other", name: "Other Card", commanderLegal: true });

      const bolts = getCardsByName(db, "Lightning Bolt");
      expect(bolts).toHaveLength(2);
      expect(bolts.map((c) => c.set_code).sort()).toEqual(["A25", "STA"]);
    });
  });

  describe("watchlist", () => {
    it("upsertWatchlistEntry + getWatchlistUuids round-trip", () => {
      upsertCard(db, { uuid: "abc-123", name: "Test", commanderLegal: true });
      upsertWatchlistEntry(db, "abc-123", "test notes");

      const uuids = getWatchlistUuids(db);
      expect(uuids).toEqual(["abc-123"]);
    });
  });

  describe("edge cases on empty DB", () => {
    it("get30DayAvgPrice returns null for unknown UUID", () => {
      expect(get30DayAvgPrice(db, "nonexistent")).toBeNull();
    });

    it("getHistoricalLowPrice returns null for unknown UUID", () => {
      expect(getHistoricalLowPrice(db, "nonexistent")).toBeNull();
    });

    it("getLatestPrice returns undefined for unknown UUID", () => {
      expect(getLatestPrice(db, "nonexistent")).toBeUndefined();
    });
  });

  describe("dashboard queries", () => {
    const today = new Date().toISOString().slice(0, 10);

    beforeEach(() => {
      // Seed cards: two printings of Ragavan + Sol Ring
      upsertCard(db, {
        uuid: "card-a",
        name: "Ragavan, Nimble Pilferer",
        setCode: "MH2",
        scryfallId: "scryfall-a",
        mcmId: 100,
        commanderLegal: true,
      });
      upsertCard(db, {
        uuid: "card-b",
        name: "Ragavan, Nimble Pilferer",
        setCode: "2X2",
        scryfallId: "scryfall-b",
        commanderLegal: true,
      });
      upsertCard(db, {
        uuid: "card-c",
        name: "Sol Ring",
        setCode: "C21",
        scryfallId: "scryfall-c",
        commanderLegal: true,
      });

      // Seed prices for card-a
      for (let i = 5; i >= 1; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        upsertPrice(db, {
          uuid: "card-a",
          date: d.toISOString().slice(0, 10),
          cmTrend: 50 - i,
          source: "mtgjson",
        });
      }

      // Seed deals
      upsertDeal(db, {
        uuid: "card-a",
        date: today,
        dealType: "trend_drop",
        currentPrice: 40,
        referencePrice: 50,
        pctChange: -0.2,
      });
      upsertDeal(db, {
        uuid: "card-c",
        date: today,
        dealType: "new_low",
        currentPrice: 15,
        referencePrice: 20,
        pctChange: -0.25,
      });

      // Seed watchlist
      upsertWatchlistEntry(db, "card-a", "test notes");
      upsertWatchlistEntry(db, "card-c");
    });

    it("getDealsFiltered returns deals with card data", () => {
      const result = getDealsFiltered(db, {});
      expect(result.length).toBe(2);
      expect(result[0]?.name).toBeDefined();
      expect(result[0]?.set_code).toBeDefined();
      expect(result[0]?.scryfall_id).toBeDefined();
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

    it("getDealsFiltered sorts by pct_change", () => {
      const result = getDealsFiltered(db, { sort: "pct_change", sortDir: "asc" });
      expect(result.length).toBe(2);
      expect(result[0]?.pct_change).toBeLessThanOrEqual(result[1]?.pct_change ?? 0);
    });

    it("getDealStats returns counts by type and date", () => {
      const stats = getDealStats(db);
      expect(stats.length).toBeGreaterThanOrEqual(2);
      const trendDrop = stats.find((s) => s.deal_type === "trend_drop");
      expect(trendDrop?.count).toBe(1);
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
      expect(result[0]?.name).toContain("Ragavan");
    });

    it("searchCards returns matching cards", () => {
      const result = searchCards(db, "Ragavan");
      expect(result.length).toBe(2);
      expect(result[0]?.name).toContain("Ragavan");
    });

    it("searchCards returns empty for no match", () => {
      const result = searchCards(db, "Nonexistent Card XYZ");
      expect(result.length).toBe(0);
    });

    it("getCardDeals returns deals for a specific card", () => {
      const result = getCardDeals(db, "card-a");
      expect(result.length).toBe(1);
      expect(result[0]?.deal_type).toBe("trend_drop");
    });

    it("getCardDeals returns empty for card with no deals", () => {
      const result = getCardDeals(db, "card-b");
      expect(result.length).toBe(0);
    });

    it("getCardPrintings returns all printings by name", () => {
      const result = getCardPrintings(db, "Ragavan, Nimble Pilferer");
      expect(result.length).toBe(2);
      expect(result.map((r) => r.set_code).sort()).toEqual(["2X2", "MH2"]);
    });

    it("getPipelineStats returns correct counts", () => {
      const stats = getPipelineStats(db);
      expect(stats.totalCards).toBe(3);
      expect(stats.totalPrices).toBe(5);
      expect(stats.totalDeals).toBe(2);
      expect(stats.watchlistSize).toBe(2);
      expect(stats.latestPriceDate).toBeDefined();
    });
  });
});
