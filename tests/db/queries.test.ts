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
});
