import Database from "better-sqlite3";

export interface DetectedDeal {
  uuid: string;
  date: string;
  dealType: "trend_drop" | "new_low" | "watchlist_alert";
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
}

export interface DealDetectionConfig {
  priceFloorEur: number;
  trendDropPct: number;
  watchlistAlertPct: number;
  watchlistUuids: Set<string>;
}

interface CardPriceSummary {
  uuid: string;
  latest_price: number;
  latest_date: string;
  avg_30d: number | null;
  prev_low: number | null;
}

export function detectDeals(db: Database.Database, config: DealDetectionConfig): DetectedDeal[] {
  const deals: DetectedDeal[] = [];

  // Get Commander-legal cards with their latest price, 30-day avg,
  // and historical low EXCLUDING today (for correct new_low detection).
  const summaries = db
    .prepare(
      `
    WITH commander_cards AS (
      SELECT uuid FROM cards WHERE commander_legal = 1
    ),
    latest AS (
      SELECT p.uuid, p.cm_trend, p.date,
             ROW_NUMBER() OVER (PARTITION BY p.uuid ORDER BY p.date DESC) as rn
      FROM prices p
      JOIN commander_cards cc ON p.uuid = cc.uuid
      WHERE p.cm_trend IS NOT NULL
    ),
    avgs AS (
      SELECT l.uuid, AVG(p.cm_trend) as avg_30d
      FROM latest l
      JOIN prices p ON l.uuid = p.uuid
      WHERE l.rn = 1
        AND p.cm_trend IS NOT NULL
        AND p.date >= date('now', '-30 days')
        AND p.date < l.date
      GROUP BY l.uuid
    ),
    prev_lows AS (
      SELECT l.uuid, MIN(p2.cm_trend) as prev_low
      FROM latest l
      JOIN prices p2 ON l.uuid = p2.uuid
      WHERE l.rn = 1
        AND p2.cm_trend IS NOT NULL
        AND p2.date < l.date
      GROUP BY l.uuid
    )
    SELECT
      l.uuid,
      l.cm_trend as latest_price,
      l.date as latest_date,
      a.avg_30d,
      pl.prev_low
    FROM latest l
    LEFT JOIN avgs a ON l.uuid = a.uuid
    LEFT JOIN prev_lows pl ON l.uuid = pl.uuid
    WHERE l.rn = 1
  `,
    )
    .all() as CardPriceSummary[];

  for (const summary of summaries) {
    const { uuid, latest_price, latest_date, avg_30d, prev_low } = summary;

    const isWatchlisted = config.watchlistUuids.has(uuid);
    const aboveFloor = latest_price >= config.priceFloorEur;

    // Rule 1: Trend drop — price >15% below 30-day avg
    if (aboveFloor && avg_30d && avg_30d > 0) {
      const pctChange = (latest_price - avg_30d) / avg_30d;
      if (pctChange < -config.trendDropPct) {
        deals.push({
          uuid,
          date: latest_date,
          dealType: "trend_drop",
          currentPrice: latest_price,
          referencePrice: avg_30d,
          pctChange,
        });
      }
    }

    // Rule 2: New historical low — today's price strictly below previous low
    if (aboveFloor && prev_low !== null && latest_price < prev_low) {
      deals.push({
        uuid,
        date: latest_date,
        dealType: "new_low",
        currentPrice: latest_price,
        referencePrice: prev_low,
        pctChange: prev_low > 0 ? (latest_price - prev_low) / prev_low : 0,
      });
    }

    // Rule 3: Watchlist alert — any change >5% (also requires price floor)
    if (isWatchlisted && aboveFloor && avg_30d && avg_30d > 0) {
      const pctChange = (latest_price - avg_30d) / avg_30d;
      if (Math.abs(pctChange) > config.watchlistAlertPct) {
        // Avoid duplicate if already triggered as trend_drop or new_low
        const alreadyReported = deals.some(
          (d) => d.uuid === uuid && (d.dealType === "trend_drop" || d.dealType === "new_low"),
        );
        if (!alreadyReported) {
          deals.push({
            uuid,
            date: latest_date,
            dealType: "watchlist_alert",
            currentPrice: latest_price,
            referencePrice: avg_30d,
            pctChange,
          });
        }
      }
    }
  }

  return deals;
}
