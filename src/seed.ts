import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./db/schema.js";
import { upsertWatchlistEntry, getCardsByName } from "./db/queries.js";
import {
  downloadMtgjsonGzToDisk,
  streamJsonDataEntries,
  type AllIdentifiersCard,
  type MtgjsonPriceEntry,
} from "./fetchers/mtgjson.js";
import { loadWatchlist } from "./watchlist.js";

function safeParseInt(str: string | undefined): number | null {
  if (!str) return null;
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? null : n;
}

function safeRollback(db: Database.Database): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // No active transaction (e.g., after a periodic COMMIT) — safe to ignore
  }
}

async function main() {
  const config = getConfig();

  // Ensure directories exist
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(dirname(config.identifiersCachePath), { recursive: true });
  mkdirSync(dirname(config.allPricesCachePath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeDatabase(db);

  // Step 1: Download AllIdentifiers to disk
  if (!existsSync(config.identifiersCachePath)) {
    console.log("Downloading AllIdentifiers to disk (this may take several minutes)...");
    await downloadMtgjsonGzToDisk(config.mtgjson.allIdentifiersUrl, config.identifiersCachePath);
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
  try {
    for await (const { key: uuid, value } of streamJsonDataEntries(config.identifiersCachePath)) {
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
        mcmId: safeParseInt(mcmIdStr),
        mcmMetaId: safeParseInt(mcmMetaIdStr),
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
  } catch (err) {
    safeRollback(db);
    throw err;
  }
  console.log(`Inserted ${cardCount} Commander-legal cards (skipped ${skipped} non-legal)`);

  // Step 3: Build set of known UUIDs for price filtering
  const knownUuids = new Set(
    (db.prepare("SELECT uuid FROM cards").all() as { uuid: string }[]).map((r) => r.uuid),
  );

  // Step 4: Download AllPrices to disk
  if (!existsSync(config.allPricesCachePath)) {
    console.log("Downloading AllPrices to disk (90-day history, large file)...");
    await downloadMtgjsonGzToDisk(config.mtgjson.allPricesUrl, config.allPricesCachePath);
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
  try {
    for await (const { key: uuid, value } of streamJsonDataEntries(config.allPricesCachePath)) {
      if (!knownUuids.has(uuid)) {
        priceSkipped++;
        continue;
      }

      const entry = value as MtgjsonPriceEntry;
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
  } catch (err) {
    safeRollback(db);
    throw err;
  }
  console.log(`Inserted ${priceCount} price records (skipped ${priceSkipped} non-Commander UUIDs)`);

  // Step 5b: Remove AllPrices cache (multi-GB file, no longer needed after seed)
  console.log("Removing AllPrices cache (no longer needed)...");
  unlinkSync(config.allPricesCachePath);

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
  console.log(`Watchlist: ${watchlistMatches} UUIDs from ${watchlist.length} card names`);

  console.log("Seed complete!");
  db.close();
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
