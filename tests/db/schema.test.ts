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
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
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
      ]),
    );
  });

  it("prices table has unique constraint on uuid+date+source", () => {
    initializeDatabase(db);

    db.prepare("INSERT INTO cards (uuid, name) VALUES ('test-uuid', 'Test Card')").run();

    db.prepare(
      "INSERT INTO prices (uuid, date, cm_trend, source) VALUES ('test-uuid', '2026-01-01', 10.0, 'mtgjson')",
    ).run();

    expect(() =>
      db
        .prepare(
          "INSERT INTO prices (uuid, date, cm_trend, source) VALUES ('test-uuid', '2026-01-01', 11.0, 'mtgjson')",
        )
        .run(),
    ).toThrow();
  });

  it("enforces foreign key constraints", () => {
    initializeDatabase(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO prices (uuid, date, cm_trend, source) VALUES ('no-such-card', '2026-01-01', 5.0, 'mtgjson')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("is idempotent — safe to call multiple times", () => {
    initializeDatabase(db);
    initializeDatabase(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables.length).toBeGreaterThan(0);
  });
});
