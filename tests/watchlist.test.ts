import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadWatchlist } from "../src/watchlist.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = "tests/tmp";
const TMP_FILE = join(TMP_DIR, "watchlist.json");

describe("loadWatchlist", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("loads cards from watchlist JSON", () => {
    writeFileSync(
      TMP_FILE,
      JSON.stringify({
        cards: [
          { name: "Ragavan, Nimble Pilferer", category: "creature", notes: "test" },
          { name: "The One Ring", category: "artifact", notes: "test" },
        ],
      }),
    );

    const cards = loadWatchlist(TMP_FILE);
    expect(cards).toHaveLength(2);
    expect(cards[0]?.name).toBe("Ragavan, Nimble Pilferer");
    expect(cards[1]?.name).toBe("The One Ring");
  });

  it("returns empty array for missing file", () => {
    const cards = loadWatchlist("nonexistent.json");
    expect(cards).toHaveLength(0);
  });
});
