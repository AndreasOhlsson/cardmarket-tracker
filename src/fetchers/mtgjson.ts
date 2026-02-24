import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

// --- Types (no Zod for large data — validated defensively in parser) ---

export interface MtgjsonPriceEntry {
  paper?: {
    cardmarket?: {
      retail?: {
        normal?: Record<string, number>;
        foil?: Record<string, number>;
      };
      buylist?: {
        normal?: Record<string, number>;
        foil?: Record<string, number>;
      };
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AllIdentifiersCard {
  name: string;
  setCode: string;
  setName: string;
  identifiers?: {
    scryfallId?: string;
    mcmId?: string;
    mcmMetaId?: string;
  };
  legalities?: Record<string, string>;
}

export interface ParsedPrice {
  uuid: string;
  date: string;
  cmTrend: number; // Cardmarket trend price (EUR) from MTGJSON retail.normal
  cmFoilTrend?: number;
}

// --- Parsing ---

export function parseCardmarketPrices(data: Record<string, MtgjsonPriceEntry>): ParsedPrice[] {
  const results: ParsedPrice[] = [];

  for (const [uuid, entry] of Object.entries(data)) {
    const retail = entry.paper?.cardmarket?.retail;
    if (!retail?.normal) continue;

    const normalPrices = retail.normal;
    const foilPrices = retail.foil;

    // Get the most recent date's price
    const dates = Object.keys(normalPrices).sort();
    if (dates.length === 0) continue;

    const latestDate = dates[dates.length - 1];
    if (!latestDate) continue;

    const price = normalPrices[latestDate];
    if (price === undefined) continue;

    results.push({
      uuid,
      date: latestDate,
      cmTrend: price,
      cmFoilTrend: foilPrices?.[latestDate],
    });
  }

  return results;
}

// --- Download ---

export async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 2 ** attempt * 1000;
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export async function downloadMtgjsonGz(url: string): Promise<string> {
  const response = await fetchWithRetry(url);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();

    gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);

    gunzip.end(buffer);
  });
}

/**
 * Stream-download a gzipped MTGJSON file directly to disk.
 * Used for large files (AllIdentifiers, AllPrices) to avoid OOM.
 */
export async function downloadMtgjsonGzToDisk(url: string, outputPath: string): Promise<void> {
  const response = await fetchWithRetry(url);
  if (!response.body) throw new Error("No response body");

  const gunzip = createGunzip();
  const fileStream = createWriteStream(outputPath);

  // Node 18+ fetch returns a web ReadableStream, convert to Node stream.
  // Type mismatch between web and Node ReadableStream — safe at runtime.
  const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

  await pipeline(nodeStream, gunzip, fileStream);
}

/**
 * Stream-parse entries from a JSON file's "data" key without loading the
 * entire file into memory. Uses stream-json for constant memory usage.
 *
 * NOTE: stream-json is CJS. Dynamic imports with ESM interop — named exports
 * are available directly. If this fails on your Node version, fall back to
 * `createRequire(import.meta.url)` from `node:module`.
 */
export async function* streamJsonDataEntries(
  filePath: string,
): AsyncGenerator<{ key: string; value: unknown }> {
  // stream-json is CJS with no subpath type declarations.
  // Dynamic imports + interop: named exports may live on the module or on .default.
  const parserMod = await import("stream-json");
  // @ts-expect-error — stream-json subpath has no type declarations
  const pickMod: Record<string, unknown> = await import("stream-json/filters/Pick");
  // @ts-expect-error — stream-json subpath has no type declarations
  const streamObjectMod: Record<string, unknown> = await import("stream-json/streamers/StreamObject"); // prettier-ignore

  type PipeFn = (...args: unknown[]) => NodeJS.ReadWriteStream;

  const parserFn =
    parserMod.parser ?? (parserMod as unknown as { default: { parser: PipeFn } }).default.parser;
  const pickFn = (pickMod.pick ?? (pickMod.default as { pick: PipeFn }).pick) as PipeFn;
  const streamObjectFn = (streamObjectMod.streamObject ??
    (streamObjectMod.default as { streamObject: PipeFn }).streamObject) as PipeFn;

  const stream = createReadStream(filePath)
    .pipe(parserFn())
    .pipe(pickFn({ filter: "data" }) as NodeJS.ReadWriteStream)
    .pipe(streamObjectFn() as NodeJS.ReadWriteStream);

  for await (const entry of stream) {
    yield entry as unknown as { key: string; value: unknown };
  }
}

export async function fetchAllPricesToday(url: string): Promise<Record<string, MtgjsonPriceEntry>> {
  console.log("Downloading AllPricesToday...");
  const json = await downloadMtgjsonGz(url);
  console.log(`Downloaded ${(json.length / 1024 / 1024).toFixed(1)}MB`);

  const parsed = JSON.parse(json) as { data?: unknown };
  if (!parsed.data || typeof parsed.data !== "object") {
    throw new Error("AllPricesToday: missing or invalid 'data' key");
  }
  return parsed.data as Record<string, MtgjsonPriceEntry>;
}
