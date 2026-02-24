import Database from "better-sqlite3";
import { statSync, existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  upsertPrice,
  getUnnotifiedDeals,
  markDealsNotified,
  upsertDeal,
  getWatchlistUuids,
  type DealWithCardRow,
} from "./db/queries.js";
import {
  fetchAllPricesToday,
  parseCardmarketPrices,
  downloadMtgjsonGzToDisk,
  streamJsonDataEntries,
  type AllIdentifiersCard,
} from "./fetchers/mtgjson.js";
import { detectDeals, type DealDetectionConfig } from "./engine/deals.js";
import { batchDeals, sendSlackNotification, type DealForSlack } from "./notifications/slack.js";
import type { Config } from "./config.js";

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

  if (!config.mtgjson.allIdentifiersUrl) {
    throw new Error("AllIdentifiers cache missing and no download URL configured");
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
  try {
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
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  console.log(`Refreshed card metadata: ${cardCount} Commander-legal cards upserted`);
  return cardCount;
}

export function runDealDetection(db: Database.Database, config: DealDetectionConfig): number {
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

export async function runDailyPipeline(db: Database.Database, config: Config): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting daily pipeline...`);

  // 0. Refresh card metadata if stale
  await refreshCardMetadataIfStale(db, config);

  // 0b. Prune old price records (>180 days)
  const pruned = db.prepare("DELETE FROM prices WHERE date < date('now', '-180 days')").run();
  if (pruned.changes > 0) {
    console.log(`Pruned ${pruned.changes} price records older than 180 days`);
  }

  // 1. Fetch today's prices
  const priceData = await fetchAllPricesToday(config.mtgjson.allPricesTodayUrl);
  const prices = parseCardmarketPrices(priceData);
  console.log(`Parsed ${prices.length} Cardmarket prices`);

  // 1b. Data quality validation
  if (prices.length === 0) {
    throw new Error("AllPricesToday returned 0 Cardmarket prices — aborting pipeline");
  }
  if (prices.length < 100) {
    console.warn(
      `WARNING: Only ${prices.length} Cardmarket prices parsed. Expected 10,000+. Data may be incomplete.`,
    );
  }

  // 2. Store prices only for Commander-legal cards already in DB
  // Build UUID Set for O(1) lookups instead of per-price SELECT
  const knownUuids = new Set(
    (
      db.prepare("SELECT uuid FROM cards WHERE commander_legal = 1").all() as { uuid: string }[]
    ).map((r) => r.uuid),
  );

  let stored = 0;
  let skipped = 0;
  const storePrices = db.transaction(() => {
    for (const price of prices) {
      if (!knownUuids.has(price.uuid)) {
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

  // 5. Send Slack notification (batch into max 48 deals per message)
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

    const batches = batchDeals(slackDeals);
    for (const payload of batches) {
      await sendSlackNotification(config.slackWebhookUrl, payload);
    }

    markDealsNotified(
      db,
      unnotified.map((d) => d.id),
    );
  }

  console.log(
    `[${new Date().toISOString()}] Pipeline complete. Prices stored: ${stored}, Deals found: ${dealCount}, Notifications sent: ${dealCount > 0 ? "yes" : "no"}`,
  );
}
