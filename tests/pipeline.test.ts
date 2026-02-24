import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema.js";
import { upsertCard, upsertPrice, getUnnotifiedDeals } from "../src/db/queries.js";
import { runDealDetection, refreshCardMetadataIfStale } from "../src/pipeline.js";
import { getConfig } from "../src/config.js";

describe("refreshCardMetadataIfStale", () => {
  it("returns 0 when cache file is fresh", async () => {
    const db = new Database(":memory:");
    initializeDatabase(db);

    // Create a dummy cache file that's fresh (just written)
    const tmpDir = "tests/tmp-pipeline";
    const tmpFile = `${tmpDir}/AllIdentifiers.json`;
    const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpFile, "{}");

    const config = {
      ...getConfig(),
      identifiersCachePath: tmpFile,
      identifiersMaxAgeDays: 30,
    };
    const result = await refreshCardMetadataIfStale(db, config);

    expect(result).toBe(0);

    rmSync(tmpDir, { recursive: true, force: true });
    db.close();
  });

  it("throws when cache is missing and download URL is empty", async () => {
    const db = new Database(":memory:");
    initializeDatabase(db);

    const config = {
      ...getConfig(),
      identifiersCachePath: "tests/tmp-pipeline/nonexistent.json",
      mtgjson: {
        ...getConfig().mtgjson,
        allIdentifiersUrl: "",
      },
    };

    await expect(refreshCardMetadataIfStale(db, config)).rejects.toThrow();

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
      const dateStr = d.toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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
