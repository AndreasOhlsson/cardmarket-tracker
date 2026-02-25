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
  scryfall_id: string | null;
}

// --- Dashboard query types ---

export interface DealsFilter {
  dealType?: string;
  date?: string;
  minPrice?: number;
  search?: string;
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
  sort?: "name" | "latest_price" | "avg_30d" | "avg_90d" | "pct_change";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export type DealSignal = "near_low" | "below_avg" | null;

export interface WatchlistCardRow {
  uuid: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  notes: string | null;
  latest_price: number | null;
  foil_price: number | null;
  historical_low: number | null;
  avg_30d: number | null;
  avg_90d: number | null;
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

// --- Cards ---

export function upsertCard(db: Database.Database, card: CardInput): void {
  db.prepare(
    `
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
  `,
  ).run({
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

export function getCardByUuid(db: Database.Database, uuid: string): CardRow | undefined {
  return db.prepare("SELECT * FROM cards WHERE uuid = ?").get(uuid) as CardRow | undefined;
}

export function getCardsByName(db: Database.Database, name: string): CardRow[] {
  return db.prepare("SELECT * FROM cards WHERE name = ?").all(name) as CardRow[];
}

// --- Prices ---

export function upsertPrice(db: Database.Database, price: PriceInput): void {
  db.prepare(
    `
    INSERT INTO prices (uuid, date, cm_trend, cm_avg, cm_low, cm_foil_trend, source)
    VALUES (@uuid, @date, @cmTrend, @cmAvg, @cmLow, @cmFoilTrend, @source)
    ON CONFLICT(uuid, date, source) DO UPDATE SET
      cm_trend = excluded.cm_trend,
      cm_avg = excluded.cm_avg,
      cm_low = excluded.cm_low,
      cm_foil_trend = excluded.cm_foil_trend
  `,
  ).run({
    uuid: price.uuid,
    date: price.date,
    cmTrend: price.cmTrend ?? null,
    cmAvg: price.cmAvg ?? null,
    cmLow: price.cmLow ?? null,
    cmFoilTrend: price.cmFoilTrend ?? null,
    source: price.source,
  });
}

export function getPriceHistory(db: Database.Database, uuid: string, days: number): PriceRow[] {
  return db
    .prepare(
      `SELECT * FROM prices
       WHERE uuid = ? AND date >= date('now', '-' || ? || ' days')
       ORDER BY date DESC`,
    )
    .all(uuid, days) as PriceRow[];
}

export function getLatestPrice(db: Database.Database, uuid: string): PriceRow | undefined {
  return db.prepare("SELECT * FROM prices WHERE uuid = ? ORDER BY date DESC LIMIT 1").get(uuid) as
    | PriceRow
    | undefined;
}

export function get30DayAvgPrice(db: Database.Database, uuid: string): number | null {
  const row = db
    .prepare(
      `SELECT AVG(cm_trend) as avg_price FROM prices
       WHERE uuid = ? AND cm_trend IS NOT NULL
       AND date >= date('now', '-30 days')`,
    )
    .get(uuid) as { avg_price: number | null } | undefined;
  return row?.avg_price ?? null;
}

export function get90DayAvgPrice(db: Database.Database, uuid: string): number | null {
  const row = db
    .prepare(
      `SELECT AVG(cm_trend) as avg_price FROM prices
       WHERE uuid = ? AND cm_trend IS NOT NULL
       AND date >= date('now', '-90 days')`,
    )
    .get(uuid) as { avg_price: number | null } | undefined;
  return row?.avg_price ?? null;
}

export function getHistoricalLowPrice(db: Database.Database, uuid: string): number | null {
  const row = db
    .prepare(
      `SELECT MIN(cm_trend) as low_price FROM prices
       WHERE uuid = ? AND cm_trend IS NOT NULL`,
    )
    .get(uuid) as { low_price: number | null } | undefined;
  return row?.low_price ?? null;
}

// --- Watchlist ---

export function getWatchlistUuids(db: Database.Database): string[] {
  const rows = db.prepare("SELECT uuid FROM watchlist").all() as { uuid: string }[];
  return rows.map((r) => r.uuid);
}

export function upsertWatchlistEntry(db: Database.Database, uuid: string, notes?: string): void {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    `
    INSERT INTO watchlist (uuid, added_date, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET notes = excluded.notes
  `,
  ).run(uuid, today, notes ?? null);
}

export function isOnWatchlist(db: Database.Database, uuid: string): boolean {
  return db.prepare("SELECT 1 FROM watchlist WHERE uuid = ?").get(uuid) !== undefined;
}

export function removeWatchlistEntry(db: Database.Database, uuid: string): void {
  db.prepare("DELETE FROM watchlist WHERE uuid = ?").run(uuid);
}

export function computeDealSignal(
  currentPrice: number | null,
  avg30d: number | null,
  historicalLow: number | null,
): DealSignal {
  if (currentPrice == null) return null;

  if (historicalLow != null && historicalLow > 0) {
    const distFromLow = (currentPrice - historicalLow) / historicalLow;
    if (distFromLow <= 0.10) return "near_low";
  }

  if (avg30d != null && avg30d > 0) {
    const distFromAvg = (currentPrice - avg30d) / avg30d;
    if (distFromAvg <= -0.05) return "below_avg";
  }

  return null;
}

// --- Deals ---

export function upsertDeal(db: Database.Database, deal: DealInput): void {
  db.prepare(
    `
    INSERT INTO deals (uuid, date, deal_type, current_price, reference_price, pct_change)
    VALUES (@uuid, @date, @dealType, @currentPrice, @referencePrice, @pctChange)
    ON CONFLICT(uuid, date, deal_type) DO UPDATE SET
      current_price = excluded.current_price,
      reference_price = excluded.reference_price,
      pct_change = excluded.pct_change,
      notified = CASE WHEN excluded.current_price != deals.current_price THEN 0 ELSE deals.notified END
  `,
  ).run({
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
      `SELECT d.*, c.name, c.set_code, c.mcm_id, c.scryfall_id
       FROM deals d JOIN cards c ON d.uuid = c.uuid
       WHERE d.notified = 0
       ORDER BY d.pct_change ASC`,
    )
    .all() as DealWithCardRow[];
}

export function markDealsNotified(db: Database.Database, dealIds: number[]): void {
  if (dealIds.length === 0) return;
  const placeholders = dealIds.map(() => "?").join(",");
  db.prepare(`UPDATE deals SET notified = 1 WHERE id IN (${placeholders})`).run(...dealIds);
}

// --- Dashboard queries ---

function buildDealsWhere(filter: DealsFilter): { where: string; params: Record<string, unknown> } {
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
  if (filter.search) {
    conditions.push("c.name LIKE @search");
    params.search = `%${filter.search}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export function getDealsFiltered(db: Database.Database, filter: DealsFilter): DealWithCardRow[] {
  const { where, params } = buildDealsWhere(filter);
  const allowedSorts = ["pct_change", "current_price", "date"];
  const safeSort = allowedSorts.includes(filter.sort ?? "") ? filter.sort : "date";
  const safeDir = filter.sortDir === "asc" ? "ASC" : "DESC";
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

export function getDealsFilteredCount(db: Database.Database, filter: DealsFilter): number {
  const { where, params } = buildDealsWhere(filter);

  return (db.prepare(
    `SELECT COUNT(*) as count FROM deals d JOIN cards c ON d.uuid = c.uuid ${where}`,
  ).get(params) as { count: number }).count;
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

  const allowedSorts = ["name", "latest_price", "avg_30d", "avg_90d", "pct_change"];
  const sort = allowedSorts.includes(filter.sort ?? "") ? filter.sort! : "name";
  const dir = filter.sortDir === "desc" ? "DESC" : "ASC";
  const nullsLast = dir === "ASC" ? "999999" : "-999999";

  // For name sort, paginate first (fast) then enrich only the page.
  // For computed columns, enrich all then sort+paginate (watchlist is small enough).
  if (sort === "name") {
    return db
      .prepare(
        `WITH page AS (
           SELECT w.uuid, w.notes
           FROM watchlist w
           JOIN cards c ON w.uuid = c.uuid
           WHERE 1=1 ${where}
           ORDER BY c.name ${dir}
           LIMIT @limit OFFSET @offset
         )
         SELECT
           page.uuid, c.name, c.set_code, c.set_name, c.scryfall_id, c.mcm_id, page.notes,
           (SELECT p.cm_trend FROM prices p
            WHERE p.uuid = page.uuid AND p.cm_trend IS NOT NULL
            ORDER BY p.date DESC LIMIT 1) as latest_price,
           (SELECT p.cm_foil_trend FROM prices p
            WHERE p.uuid = page.uuid
            ORDER BY p.date DESC LIMIT 1) as foil_price,
           (SELECT MIN(p.cm_trend) FROM prices p
            WHERE p.uuid = page.uuid AND p.cm_trend IS NOT NULL) as historical_low,
           (SELECT AVG(p.cm_trend) FROM prices p
            WHERE p.uuid = page.uuid AND p.cm_trend IS NOT NULL
            AND p.date >= date('now', '-30 days')) as avg_30d,
           (SELECT AVG(p.cm_trend) FROM prices p
            WHERE p.uuid = page.uuid AND p.cm_trend IS NOT NULL
            AND p.date >= date('now', '-90 days')) as avg_90d,
           CASE
             WHEN (SELECT AVG(p2.cm_trend) FROM prices p2
                   WHERE p2.uuid = page.uuid AND p2.cm_trend IS NOT NULL
                   AND p2.date >= date('now', '-30 days')) > 0
             THEN ((SELECT p3.cm_trend FROM prices p3
                    WHERE p3.uuid = page.uuid AND p3.cm_trend IS NOT NULL
                    ORDER BY p3.date DESC LIMIT 1)
                  - (SELECT AVG(p4.cm_trend) FROM prices p4
                     WHERE p4.uuid = page.uuid AND p4.cm_trend IS NOT NULL
                     AND p4.date >= date('now', '-30 days')))
                 / (SELECT AVG(p5.cm_trend) FROM prices p5
                    WHERE p5.uuid = page.uuid AND p5.cm_trend IS NOT NULL
                    AND p5.date >= date('now', '-30 days'))
             ELSE NULL
           END as pct_change
         FROM page
         JOIN cards c ON page.uuid = c.uuid
         ORDER BY c.name ${dir}`,
      )
      .all({ ...params, limit, offset }) as WatchlistCardRow[];
  }

  // Computed column sort: enrich all matching rows, then sort + paginate
  return db
    .prepare(
      `SELECT
         w.uuid, c.name, c.set_code, c.set_name, c.scryfall_id, c.mcm_id, w.notes,
         (SELECT p.cm_trend FROM prices p
          WHERE p.uuid = w.uuid AND p.cm_trend IS NOT NULL
          ORDER BY p.date DESC LIMIT 1) as latest_price,
         (SELECT p.cm_foil_trend FROM prices p
          WHERE p.uuid = w.uuid
          ORDER BY p.date DESC LIMIT 1) as foil_price,
         (SELECT MIN(p.cm_trend) FROM prices p
          WHERE p.uuid = w.uuid AND p.cm_trend IS NOT NULL) as historical_low,
         (SELECT AVG(p.cm_trend) FROM prices p
          WHERE p.uuid = w.uuid AND p.cm_trend IS NOT NULL
          AND p.date >= date('now', '-30 days')) as avg_30d,
         (SELECT AVG(p.cm_trend) FROM prices p
          WHERE p.uuid = w.uuid AND p.cm_trend IS NOT NULL
          AND p.date >= date('now', '-90 days')) as avg_90d,
         CASE
           WHEN (SELECT AVG(p2.cm_trend) FROM prices p2
                 WHERE p2.uuid = w.uuid AND p2.cm_trend IS NOT NULL
                 AND p2.date >= date('now', '-30 days')) > 0
           THEN ((SELECT p3.cm_trend FROM prices p3
                  WHERE p3.uuid = w.uuid AND p3.cm_trend IS NOT NULL
                  ORDER BY p3.date DESC LIMIT 1)
                - (SELECT AVG(p4.cm_trend) FROM prices p4
                   WHERE p4.uuid = w.uuid AND p4.cm_trend IS NOT NULL
                   AND p4.date >= date('now', '-30 days')))
               / (SELECT AVG(p5.cm_trend) FROM prices p5
                  WHERE p5.uuid = w.uuid AND p5.cm_trend IS NOT NULL
                  AND p5.date >= date('now', '-30 days'))
           ELSE NULL
         END as pct_change
       FROM watchlist w
       JOIN cards c ON w.uuid = c.uuid
       WHERE 1=1 ${where}
       ORDER BY COALESCE(${sort}, ${nullsLast}) ${dir}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as WatchlistCardRow[];
}

export function getWatchlistCount(db: Database.Database, filter: WatchlistFilter): number {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.search) {
    conditions.push("c.name LIKE @search");
    params.search = `%${filter.search}%`;
  }

  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  return (db.prepare(
    `SELECT COUNT(*) as count FROM watchlist w JOIN cards c ON w.uuid = c.uuid WHERE 1=1 ${where}`,
  ).get(params) as { count: number }).count;
}

export function searchCards(db: Database.Database, query: string, limit: number = 20): CardSearchRow[] {
  return db
    .prepare(
      `SELECT c.uuid, c.name, c.set_code, c.set_name, c.scryfall_id, c.mcm_id,
              (SELECT p.cm_trend FROM prices p
               WHERE p.uuid = c.uuid AND p.cm_trend IS NOT NULL
               ORDER BY p.date DESC LIMIT 1) as latest_price
       FROM cards c
       WHERE c.name LIKE @query AND c.commander_legal = 1
       ORDER BY c.name ASC
       LIMIT @limit`,
    )
    .all({ query: `%${query}%`, limit }) as CardSearchRow[];
}

export function getCardDeals(db: Database.Database, uuid: string): DealRow[] {
  return db
    .prepare(`SELECT * FROM deals WHERE uuid = @uuid ORDER BY date DESC`)
    .all({ uuid }) as DealRow[];
}

export function getCardPrintings(db: Database.Database, name: string): CardRow[] {
  return db
    .prepare(`SELECT * FROM cards WHERE name = @name AND commander_legal = 1 ORDER BY set_code ASC`)
    .all({ name }) as CardRow[];
}

export function getPipelineStats(db: Database.Database): PipelineStatsRow {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM cards WHERE commander_legal = 1) as totalCards,
         (SELECT COUNT(*) FROM deals) as totalDeals,
         (SELECT COUNT(*) FROM watchlist) as watchlistSize,
         (SELECT MAX(date) FROM prices) as latestPriceDate`,
    )
    .get() as { totalCards: number; totalDeals: number; watchlistSize: number; latestPriceDate: string | null };

  // prices COUNT is the expensive one (6.7M rows) — use max(id) as a fast proxy
  const priceCountRow = db
    .prepare("SELECT MAX(id) as totalPrices FROM prices")
    .get() as { totalPrices: number | null };

  return {
    totalCards: row.totalCards,
    totalPrices: priceCountRow.totalPrices ?? 0,
    totalDeals: row.totalDeals,
    watchlistSize: row.watchlistSize,
    latestPriceDate: row.latestPriceDate,
  };
}
