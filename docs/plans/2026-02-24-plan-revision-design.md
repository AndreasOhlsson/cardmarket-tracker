# Plan Revision — Design Document

**Date:** 2026-02-24
**Status:** Approved
**Revises:** 2026-02-23-cardmarket-deal-finder-implementation.md

## Context

Evaluation of the implementation plan identified 13 issues (3 critical, 6 moderate, 4 minor) plus 3 open architectural questions. This document captures the approved fixes.

## Architectural Decisions

| # | Question | Decision |
|---|---|---|
| 1 | 90-day bootstrap vs accumulate daily | Keep 90-day bootstrap. Fix OOM with streaming JSON parser. |
| 2 | Long-running process vs run-once | Run-once, exit. External scheduler (cron/systemd/Docker) handles timing. Remove node-cron. |
| 3 | dotenv or external env vars | Add dotenv. Convenient for local dev, tiny dependency. |

## Fixes

### Critical

**1. OOM on AllPrices/AllIdentifiers JSON.parse**

Problem: Seed streams large files to disk, then `JSON.parse(readFileSync(...))` loads entire multi-GB file into memory.

Fix: Add `stream-json` dependency. Stream-parse each UUID entry from disk one at a time using `StreamObject` on the `data` key. Memory stays constant (~50MB working set) regardless of file size.

**2. `noUncheckedIndexedAccess` type errors**

Problem: Array/record indexed access returns `T | undefined` with this flag, but code assumes `T`.

Fix: Add null guards on every indexed access (arrays and records) across mtgjson.ts, seed.ts, index.ts.

### Moderate

**3. `as any` in `Readable.fromWeb`**

Fix: Replace `as any` with `as ReadableStream<Uint8Array>`. Type-safe — response.body IS this type, DOM/Node type definitions just don't align.

**4. Broken `new_low` detection**

Problem: Counts occurrences of minimum price value. Fails after first day at a given low.

Fix: Compute historical low excluding today's date (`WHERE date < latest_date`). Trigger when `latest_price < prev_low`. Clean, no edge cases.

**5. Slow Zod validation on AllPricesToday (~50MB)**

Fix: Remove `allPricesTodaySchema.parse()` on the full data object. Validate top-level shape with a simple check (`if (!data || typeof data !== "object")`). Keep Zod for config, watchlist, and individual card entries (all small).

**6. Fragile `allPricesCachePath` derivation**

Fix: Add `allPricesCachePath` as a proper field in the Zod config schema with default `"data/cache/AllPrices.json"`. Remove string `.replace()` hack.

**7. Dead `prev` CTE in deal engine SQL**

Fix: Remove the `prev` CTE and `prev_price` from `CardPriceSummary` interface. Never used.

**8. npm → yarn**

Fix: Global replacement across all 11 tasks. `npm install` → `yarn install`, `npm run X` → `yarn X`, `npx X` → `yarn X`, `package-lock.json` → `yarn.lock`.

### Minor

**9. No dotenv**

Fix: Add `dotenv` dependency. Import `"dotenv/config"` at top of both entry points (index.ts, seed.ts).

**10. No network code tests**

Fix: Add mock-based tests for `fetchWithRetry`: retry on failure, throw after max retries, throw on HTTP 500.

**11. Graceful shutdown**

Fix: Solved by run-once architecture. No long-lived process. Remove node-cron dependency.

**12. Misleading `cmTrend` field name**

Fix: Keep naming (it likely IS the Cardmarket trend price). Add clarifying comment: `// Cardmarket trend price (EUR) from MTGJSON retail.normal`.

**13. Watchlist test missing imports**

Fix: Add explicit `beforeEach`/`afterEach` imports to match all other test files.

### Gaps (identified during full flow review)

**14. No mechanism to refresh AllIdentifiers for new sets**

Problem: AllIdentifiers is only downloaded during `yarn seed`. New MTG sets release quarterly, but the daily pipeline never re-downloads, so new cards are invisible to deal detection.

Fix: Add `refreshCardMetadataIfStale()` to pipeline. Checks cache file mtime — if >30 days old (configurable via `identifiersMaxAgeDays`), re-downloads AllIdentifiers and stream-parses/upserts new Commander-legal cards. Runs before price fetching.

**15. No retry on pipeline failure**

Problem: If the daily pipeline fails mid-run (network error, MTGJSON down), the process exits and no retry happens until the next scheduled run (next day).

Fix: Wrap `runDailyPipeline()` in a retry loop in `index.ts`. 3 attempts max (configurable via `pipelineMaxRetries`), 15-minute delay between retries (configurable via `pipelineRetryDelayMs`). DB connection is closed and reopened between attempts. Exit code 1 after all retries exhausted.

## Dependency Changes

| Action | Package | Reason |
|---|---|---|
| Add | `stream-json` | Streaming JSON parser for multi-GB files |
| Add | `@types/stream-json` | TypeScript types |
| Add | `dotenv` | .env file loading |
| Remove | `node-cron` | Replaced by run-once architecture |
| Remove | `@types/node-cron` | No longer needed |

## Files Affected

- **package.json** — dependency changes, remove dev script, yarn
- **src/config.ts** — add `allPricesCachePath`, retry config fields, dotenv import
- **src/seed.ts** — streaming JSON parser, null guards, dotenv import
- **src/fetchers/mtgjson.ts** — remove Zod on big data, null guards, fix `as any`
- **src/engine/deals.ts** — fix new_low SQL, remove dead prev CTE
- **src/pipeline.ts** — add `refreshCardMetadataIfStale()`, auto-refresh AllIdentifiers
- **src/index.ts** — run-once with retry loop (remove cron), dotenv import
- **tests/pipeline.test.ts** — add test for fresh cache skipping refresh
- **tests/fetchers/mtgjson.test.ts** — add fetchWithRetry tests
- **tests/watchlist.test.ts** — add missing imports
