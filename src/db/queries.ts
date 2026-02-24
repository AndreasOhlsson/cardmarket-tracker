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
      `SELECT d.*, c.name, c.set_code, c.mcm_id
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
