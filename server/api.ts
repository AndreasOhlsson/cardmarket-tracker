import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { createWriteStream, renameSync, unlinkSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema.js";
import {
  getCardByUuid,
  getDealsFiltered,
  getDealsFilteredCount,
  getDealStats,
  getWatchlistWithCards,
  getWatchlistCount,
  searchCards,
  getPriceHistory,
  getCardDeals,
  getCardPrintings,
  getPipelineStats,
  get30DayAvgPrice,
  get90DayAvgPrice,
  getHistoricalLowPrice,
  getLatestPrice,
  isOnWatchlist,
  upsertWatchlistEntry,
  removeWatchlistEntry,
  computeDealSignal,
} from "../src/db/queries.js";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "tracker.db");
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// Write handle first — creates the DB file and schema if missing
const writeDb = new Database(DB_PATH);
writeDb.pragma("journal_mode = WAL");
initializeDatabase(writeDb);

const db = new Database(DB_PATH, { readonly: true });
db.pragma("journal_mode = WAL");

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://cards.scryfall.io"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// --- Helpers ---

function clampInt(val: string | undefined, fallback: number, max: number): number {
  if (val === undefined) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function bearerMatch(header: string | string[] | undefined, secret: string): boolean {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

// --- API Routes ---

app.get("/api/deals", (req, res) => {
  const filter = {
    dealType: req.query.type as string | undefined,
    date: req.query.date as string | undefined,
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    search: req.query.search as string | undefined,
    sort: req.query.sort as "pct_change" | "current_price" | "date" | undefined,
    sortDir: req.query.sortDir as "asc" | "desc" | undefined,
    limit: clampInt(req.query.limit as string | undefined, 50, 200),
    offset: clampInt(req.query.offset as string | undefined, 0, 100_000),
  };
  const items = getDealsFiltered(db, filter);
  const total = getDealsFilteredCount(db, filter);
  res.json({ items, total });
});

app.get("/api/deals/stats", (_req, res) => {
  res.json(getDealStats(db));
});

app.get("/api/watchlist", (req, res) => {
  const filter = {
    search: req.query.search as string | undefined,
    sort: req.query.sort as "name" | "latest_price" | "avg_30d" | "avg_90d" | "pct_change" | undefined,
    sortDir: req.query.sortDir as "asc" | "desc" | undefined,
    limit: clampInt(req.query.limit as string | undefined, 50, 200),
    offset: clampInt(req.query.offset as string | undefined, 0, 100_000),
  };
  const rows = getWatchlistWithCards(db, filter);
  const total = getWatchlistCount(db, filter);
  const enriched = rows.map((row) => ({
    ...row,
    signal: computeDealSignal(row.latest_price, row.avg_30d, row.historical_low),
  }));
  res.json({ items: enriched, total });
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
  const avg90d = get90DayAvgPrice(db, req.params.uuid);
  const historicalLow = getHistoricalLowPrice(db, req.params.uuid);
  const latestPriceRow = getLatestPrice(db, req.params.uuid);
  const latestPrice = latestPriceRow?.cm_trend ?? null;
  const foilPrice = latestPriceRow?.cm_foil_trend ?? null;
  const signal = computeDealSignal(latestPrice, avg30d, historicalLow);
  const watched = isOnWatchlist(db, req.params.uuid);
  const printings = getCardPrintings(db, card.name);
  res.json({ ...card, avg30d, avg90d, historicalLow, latestPrice, foilPrice, signal, isWatched: watched, printings });
});

app.get("/api/cards/:uuid/prices", (req, res) => {
  const days = clampInt(req.query.days as string | undefined, 30, 365);
  res.json(getPriceHistory(db, req.params.uuid, days));
});

app.get("/api/cards/:uuid/deals", (req, res) => {
  res.json(getCardDeals(db, req.params.uuid));
});

app.get("/api/stats/pipeline", (_req, res) => {
  res.json(getPipelineStats(db));
});

// --- Watchlist mutations (protected when WATCHLIST_SECRET is set) ---

const WATCHLIST_SECRET = process.env.WATCHLIST_SECRET;

const requireWatchlistAuth: express.RequestHandler = (req, res, next) => {
  if (!WATCHLIST_SECRET) { next(); return; }
  if (!bearerMatch(req.headers.authorization, WATCHLIST_SECRET)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

app.post("/api/watchlist/:uuid", requireWatchlistAuth, (req, res) => {
  const uuid = req.params.uuid as string;
  const card = getCardByUuid(db, uuid);
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  const notes = req.body?.notes ?? null;
  upsertWatchlistEntry(writeDb, uuid, notes);
  res.json({ ok: true });
});

app.delete("/api/watchlist/:uuid", requireWatchlistAuth, (req, res) => {
  const uuid = req.params.uuid as string;
  removeWatchlistEntry(writeDb, uuid);
  res.json({ ok: true });
});

// --- DB Sync (protected by SYNC_SECRET) ---

const SYNC_SECRET = process.env.SYNC_SECRET;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB decompressed

app.put("/api/sync-db", (req, res) => {
  if (!SYNC_SECRET) {
    res.status(503).json({ error: "Sync not configured" });
    return;
  }
  if (!bearerMatch(req.headers.authorization, SYNC_SECRET)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const tmpPath = DB_PATH + ".uploading";
  const isGzip = req.headers["content-encoding"] === "gzip";
  const writeStream = createWriteStream(tmpPath);

  let bytesDecompressed = 0;
  const sizeGuard = new Transform({
    transform(chunk, _encoding, cb) {
      bytesDecompressed += chunk.length;
      if (bytesDecompressed > MAX_UPLOAD_BYTES) {
        cb(new Error(`Upload exceeds ${MAX_UPLOAD_BYTES} byte limit`));
        return;
      }
      cb(null, chunk);
    },
  });

  const source = isGzip
    ? req.pipe(createGunzip()).pipe(sizeGuard)
    : req.pipe(sizeGuard);

  pipeline(source, writeStream)
    .then(() => {
      // Close existing DB connections before replacing
      db.close();
      writeDb.close();

      // Remove WAL/SHM files from old DB
      try { unlinkSync(DB_PATH + "-wal"); } catch {}
      try { unlinkSync(DB_PATH + "-shm"); } catch {}

      renameSync(tmpPath, DB_PATH);

      res.json({ ok: true, message: "DB replaced. Restarting..." });

      // Exit so Fly restarts the process with the new DB
      setTimeout(() => process.exit(0), 500);
    })
    .catch((err) => {
      try { unlinkSync(tmpPath); } catch {}
      res.status(500).json({ error: String(err) });
    });
});

// --- Static file serving (production) ---
const webDist = path.join(process.cwd(), "web", "dist");
app.use(express.static(webDist));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

const HOST = process.env.HOST ?? "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Dashboard API running at http://${HOST}:${PORT}`);
});
