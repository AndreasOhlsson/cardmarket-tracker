import { z } from "zod";

const configSchema = z.object({
  priceFloorEur: z.number().min(0).default(10),
  trendDropPct: z.number().min(0).max(1).default(0.15),
  watchlistAlertPct: z.number().min(0).max(1).default(0.05),
  slackWebhookUrl: z.string().url().or(z.literal("")).default(""),
  dbPath: z.string().default("data/tracker.db"),
  watchlistPath: z.string().default("data/watchlist.json"),
  identifiersCachePath: z.string().default("data/cache/AllIdentifiers.json"),
  allPricesCachePath: z.string().default("data/cache/AllPrices.json"),
  identifiersMaxAgeDays: z.number().min(1).default(30),
  pipelineMaxRetries: z.number().min(1).default(3),
  pipelineRetryDelayMs: z
    .number()
    .min(0)
    .default(15 * 60 * 1000), // 15 minutes
  mtgjson: z.object({
    allPricesTodayUrl: z.string().url(),
    allPricesUrl: z.string().url(),
    allIdentifiersUrl: z.string().url(),
  }),
});

export type Config = z.infer<typeof configSchema>;

function parseNumericEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric env var value: "${value}"`);
  }
  return parsed;
}

export function getConfig(): Config {
  const raw = {
    priceFloorEur: parseNumericEnv(process.env.PRICE_FLOOR_EUR),
    trendDropPct: parseNumericEnv(process.env.TREND_DROP_PCT),
    watchlistAlertPct: parseNumericEnv(process.env.WATCHLIST_ALERT_PCT),
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    dbPath: process.env.DB_PATH,
    watchlistPath: process.env.WATCHLIST_PATH,
    identifiersCachePath: process.env.IDENTIFIERS_CACHE_PATH,
    allPricesCachePath: process.env.ALL_PRICES_CACHE_PATH,
    identifiersMaxAgeDays: parseNumericEnv(process.env.IDENTIFIERS_MAX_AGE_DAYS),
    pipelineMaxRetries: parseNumericEnv(process.env.PIPELINE_MAX_RETRIES),
    pipelineRetryDelayMs: parseNumericEnv(process.env.PIPELINE_RETRY_DELAY_MS),
    mtgjson: {
      allPricesTodayUrl: "https://mtgjson.com/api/v5/AllPricesToday.json.gz",
      allPricesUrl: "https://mtgjson.com/api/v5/AllPrices.json.gz",
      allIdentifiersUrl: "https://mtgjson.com/api/v5/AllIdentifiers.json.gz",
    },
  };

  // Strip undefined values so Zod defaults apply
  const cleaned = JSON.parse(JSON.stringify(raw));
  return configSchema.parse(cleaned);
}
