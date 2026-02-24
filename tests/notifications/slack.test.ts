import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatDealMessage,
  formatDealBatch,
  batchDeals,
  sendSlackNotification,
  type DealForSlack,
} from "../../src/notifications/slack.js";

describe("formatDealMessage", () => {
  it("formats a single deal into a Slack block", () => {
    const msg = formatDealMessage({
      name: "Ragavan, Nimble Pilferer",
      setCode: "MH2",
      dealType: "trend_drop",
      currentPrice: 48.5,
      referencePrice: 57.8,
      pctChange: -0.161,
      mcmId: 12345,
    });

    expect(msg).toContain("Ragavan, Nimble Pilferer");
    expect(msg).toContain("MH2");
    expect(msg).toContain("48.50");
    expect(msg).toContain("57.80");
    expect(msg).toContain("-16.1%");
    expect(msg).toContain("cardmarket.com/en/Magic/Products/Singles/12345");
  });

  it("falls back to name-based URL when mcmId is missing", () => {
    const msg = formatDealMessage({
      name: "Sol Ring",
      setCode: "C21",
      dealType: "watchlist_alert",
      currentPrice: 3.0,
      referencePrice: 4.0,
      pctChange: -0.25,
    });

    expect(msg).toContain("cardmarket.com/en/Magic/Cards/Sol%20Ring");
  });
});

describe("formatDealBatch", () => {
  it("creates a Slack payload with multiple deals", () => {
    const payload = formatDealBatch([
      {
        name: "Card A",
        setCode: "SET",
        dealType: "trend_drop",
        currentPrice: 10,
        referencePrice: 15,
        pctChange: -0.33,
      },
      {
        name: "Card B",
        setCode: "SET",
        dealType: "new_low",
        currentPrice: 20,
        referencePrice: 20,
        pctChange: 0,
      },
    ]);

    expect(payload.blocks).toBeDefined();
    expect(payload.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).toContain("Deal Alert");
  });

  it("returns empty payload for no deals", () => {
    const payload = formatDealBatch([]);
    expect(payload.blocks).toHaveLength(0);
  });
});

describe("batchDeals", () => {
  function makeDeal(i: number): DealForSlack {
    return {
      name: `Card ${i}`,
      setCode: "SET",
      dealType: "trend_drop",
      currentPrice: 10,
      referencePrice: 15,
      pctChange: -0.33,
    };
  }

  it("returns a single batch for <=48 deals", () => {
    const deals = Array.from({ length: 48 }, (_, i) => makeDeal(i));
    const batches = batchDeals(deals);
    expect(batches).toHaveLength(1);
    // 48 deal blocks + header + divider = 50 blocks
    expect(batches[0]?.blocks).toHaveLength(50);
  });

  it("splits into multiple batches for >48 deals", () => {
    const deals = Array.from({ length: 60 }, (_, i) => makeDeal(i));
    const batches = batchDeals(deals);
    expect(batches).toHaveLength(2);
    // First batch: 48 deals + 2 overhead = 50 blocks
    expect(batches[0]?.blocks).toHaveLength(50);
    // Second batch: 12 deals + 2 overhead = 14 blocks
    expect(batches[1]?.blocks).toHaveLength(14);
  });

  it("returns empty array for no deals", () => {
    expect(batchDeals([])).toHaveLength(0);
  });
});

describe("sendSlackNotification", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST with correct payload", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const payload = formatDealBatch([
      {
        name: "Test Card",
        setCode: "TST",
        dealType: "trend_drop",
        currentPrice: 10,
        referencePrice: 15,
        pctChange: -0.33,
      },
    ]);

    await sendSlackNotification("https://hooks.slack.com/test", payload);

    expect(mockFetch).toHaveBeenCalledOnce();
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    const [url, options] = callArgs;
    expect(url).toBe("https://hooks.slack.com/test");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual(payload);
  });

  it("skips notification when webhook URL is empty", async () => {
    await sendSlackNotification("", { blocks: [{ type: "section" }] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws on non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(
      sendSlackNotification("https://hooks.slack.com/test", {
        blocks: [{ type: "section" }],
      }),
    ).rejects.toThrow("Slack webhook failed: 500");
  });
});
