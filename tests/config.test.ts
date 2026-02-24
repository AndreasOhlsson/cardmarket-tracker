import { describe, it, expect, afterEach } from "vitest";
import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  const CONFIG_ENV_KEYS = [
    "SLACK_WEBHOOK_URL",
    "PRICE_FLOOR_EUR",
    "TREND_DROP_PCT",
    "WATCHLIST_ALERT_PCT",
    "DB_PATH",
    "WATCHLIST_PATH",
    "IDENTIFIERS_CACHE_PATH",
    "ALL_PRICES_CACHE_PATH",
    "IDENTIFIERS_MAX_AGE_DAYS",
    "PIPELINE_MAX_RETRIES",
    "PIPELINE_RETRY_DELAY_MS",
  ] as const;

  afterEach(() => {
    for (const key of CONFIG_ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("returns default config values", () => {
    const config = getConfig();
    expect(config.priceFloorEur).toBe(10);
    expect(config.trendDropPct).toBe(0.15);
    expect(config.watchlistAlertPct).toBe(0.05);
    expect(config.mtgjson.allPricesTodayUrl).toContain("mtgjson.com");
    expect(config.mtgjson.allPricesUrl).toContain("mtgjson.com");
    expect(config.mtgjson.allIdentifiersUrl).toContain("mtgjson.com");
    expect(config.dbPath).toBe("data/tracker.db");
    expect(config.watchlistPath).toBe("data/watchlist.json");
    expect(config.identifiersCachePath).toBe("data/cache/AllIdentifiers.json");
    expect(config.allPricesCachePath).toBe("data/cache/AllPrices.json");
    expect(config.identifiersMaxAgeDays).toBe(30);
    expect(config.pipelineMaxRetries).toBe(3);
    expect(config.pipelineRetryDelayMs).toBe(15 * 60 * 1000);
  });

  it("reads SLACK_WEBHOOK_URL from env", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    const config = getConfig();
    expect(config.slackWebhookUrl).toBe("https://hooks.slack.com/test");
  });

  it("validates numeric env vars and rejects invalid values", () => {
    process.env.PRICE_FLOOR_EUR = "not-a-number";
    expect(() => getConfig()).toThrow();
  });

  it("accepts valid numeric overrides", () => {
    process.env.PRICE_FLOOR_EUR = "25";
    process.env.TREND_DROP_PCT = "0.20";
    const config = getConfig();
    expect(config.priceFloorEur).toBe(25);
    expect(config.trendDropPct).toBe(0.2);
  });

  it("accepts overrides for retry and refresh config fields", () => {
    process.env.IDENTIFIERS_MAX_AGE_DAYS = "7";
    process.env.PIPELINE_MAX_RETRIES = "5";
    process.env.PIPELINE_RETRY_DELAY_MS = "60000";
    const config = getConfig();
    expect(config.identifiersMaxAgeDays).toBe(7);
    expect(config.pipelineMaxRetries).toBe(5);
    expect(config.pipelineRetryDelayMs).toBe(60000);
  });
});
