import Database from "better-sqlite3";

export function initializeDatabase(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT,
      scryfall_id TEXT,
      mcm_id INTEGER,
      mcm_meta_id INTEGER,
      commander_legal INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL REFERENCES cards(uuid),
      date TEXT NOT NULL,
      cm_trend REAL,               -- Cardmarket trend price (EUR) from MTGJSON retail.normal
      cm_avg REAL,                 -- Cardmarket average sell price (Phase 2)
      cm_low REAL,                 -- Cardmarket lowest listing price (Phase 2)
      cm_foil_trend REAL,          -- Cardmarket foil trend price from MTGJSON retail.foil
      source TEXT NOT NULL,
      UNIQUE(uuid, date, source)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      uuid TEXT PRIMARY KEY REFERENCES cards(uuid),
      added_date TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL REFERENCES cards(uuid),
      date TEXT NOT NULL,
      deal_type TEXT NOT NULL,
      current_price REAL NOT NULL,
      reference_price REAL NOT NULL,
      pct_change REAL NOT NULL,
      notified INTEGER DEFAULT 0,
      UNIQUE(uuid, date, deal_type)
    );

    CREATE INDEX IF NOT EXISTS idx_prices_uuid_date ON prices(uuid, date);
    CREATE INDEX IF NOT EXISTS idx_deals_date ON deals(date);
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
    CREATE INDEX IF NOT EXISTS idx_cards_commander ON cards(commander_legal);
  `);
}
