import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import {
  parseCardmarketPrices,
  fetchWithRetry,
  type MtgjsonPriceEntry,
} from "../../src/fetchers/mtgjson.js";

describe("parseCardmarketPrices", () => {
  it("extracts normal retail prices from MTGJSON structure", () => {
    const data: Record<string, MtgjsonPriceEntry> = {
      "uuid-001": {
        paper: {
          cardmarket: {
            retail: {
              normal: { "2026-02-23": 15.5 },
              foil: { "2026-02-23": 25.0 },
            },
          },
        },
      },
      "uuid-002": {
        paper: {
          cardmarket: {
            retail: {
              normal: { "2026-02-23": 8.0 },
            },
          },
        },
      },
    };

    const result = parseCardmarketPrices(data);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      uuid: "uuid-001",
      date: "2026-02-23",
      cmTrend: 15.5,
      cmFoilTrend: 25.0,
    });
    expect(result[1]).toEqual({
      uuid: "uuid-002",
      date: "2026-02-23",
      cmTrend: 8.0,
      cmFoilTrend: undefined,
    });
  });

  it("skips entries without cardmarket data", () => {
    const data: Record<string, MtgjsonPriceEntry> = {
      "uuid-001": {
        paper: {
          tcgplayer: { retail: { normal: { "2026-02-23": 10.0 } } },
        },
      },
    };

    const result = parseCardmarketPrices(data);
    expect(result).toHaveLength(0);
  });

  it("handles empty data", () => {
    const result = parseCardmarketPrices({});
    expect(result).toHaveLength(0);
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries on network failure and succeeds", async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWithRetry("https://example.com", 3);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries exceeded", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const promise = fetchWithRetry("https://example.com", 2);
    // Suppress unhandled rejection warning — the rejection fires during timer
    // advancement before our `.rejects.toThrow()` assertion handles it.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).rejects.toThrow("Network error");
  });

  it("retries on HTTP error and throws after exhausting retries", async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWithRetry("https://example.com", 2);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).rejects.toThrow("HTTP 500");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("streamJsonDataEntries", () => {
  const TMP_DIR = "tests/tmp-mtgjson";
  const TMP_FILE = `${TMP_DIR}/test-stream.json`;

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("yields key-value pairs from the 'data' key of a JSON file", async () => {
    const { streamJsonDataEntries } = await import("../../src/fetchers/mtgjson.js");

    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      JSON.stringify({
        meta: { version: "1.0" },
        data: {
          "uuid-001": { name: "Card A" },
          "uuid-002": { name: "Card B" },
        },
      }),
    );

    const entries: { key: string; value: unknown }[] = [];
    for await (const entry of streamJsonDataEntries(TMP_FILE)) {
      entries.push(entry);
    }

    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first?.key).toBe("uuid-001");
    expect((first?.value as { name: string }).name).toBe("Card A");
    expect(second?.key).toBe("uuid-002");
  });
});
