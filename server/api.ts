import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema.js";
import {
  getCardByUuid,
  getDealsFiltered,
  getDealStats,
  getWatchlistWithCards,
  searchCards,
  getPriceHistory,
  getCardDeals,
  getCardPrintings,
  getPipelineStats,
  get30DayAvgPrice,
  getHistoricalLowPrice,
} from "../src/db/queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "data", "tracker.db");
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const db = new Database(DB_PATH, { readonly: true });
db.pragma("journal_mode = WAL");
initializeDatabase(db);

const app = express();

// --- API Routes ---

app.get("/api/deals", (req, res) => {
  const filter = {
    dealType: req.query.type as string | undefined,
    date: req.query.date as string | undefined,
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    sort: req.query.sort as "pct_change" | "current_price" | "date" | undefined,
    sortDir: req.query.sortDir as "asc" | "desc" | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  };
  res.json(getDealsFiltered(db, filter));
});

app.get("/api/deals/stats", (_req, res) => {
  res.json(getDealStats(db));
});

app.get("/api/watchlist", (req, res) => {
  const filter = {
    search: req.query.search as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  };
  res.json(getWatchlistWithCards(db, filter));
});

app.get("/api/cards/search", (req, res) => {
  const q = (req.query.q as string) ?? "";
  if (q.length < 2) {
    res.json([]);
    return;
  }
  res.json(searchCards(db, q));
});

app.get("/api/cards/:uuid", (req, res) => {
  const card = getCardByUuid(db, req.params.uuid);
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  const avg30d = get30DayAvgPrice(db, req.params.uuid);
  const historicalLow = getHistoricalLowPrice(db, req.params.uuid);
  const printings = getCardPrintings(db, card.name);
  res.json({ ...card, avg30d, historicalLow, printings });
});

app.get("/api/cards/:uuid/prices", (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 30;
  res.json(getPriceHistory(db, req.params.uuid, days));
});

app.get("/api/cards/:uuid/deals", (req, res) => {
  res.json(getCardDeals(db, req.params.uuid));
});

app.get("/api/stats/pipeline", (_req, res) => {
  res.json(getPipelineStats(db));
});

// --- Static file serving (production) ---
const webDist = path.join(__dirname, "..", "web", "dist");
app.use(express.static(webDist));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard API running at http://localhost:${PORT}`);
});
