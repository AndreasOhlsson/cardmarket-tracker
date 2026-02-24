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
- **tests/pipeline.test.ts** — add test for fresh cache skipping refresh, add missing cache test
- **tests/fetchers/mtgjson.test.ts** — add fetchWithRetry tests, add streamJsonDataEntries test
- **tests/watchlist.test.ts** — add missing imports
- **tests/engine/deals.test.ts** — add watchlist+trend_drop dedup test
- **tests/notifications/slack.test.ts** — add mcmId URL test, batching tests, sendSlackNotification mock tests

## Second Evaluation Round (Fixes 16–25)

Evaluation after applying fixes 1–15 identified 25 additional issues (5 critical, 7 high, 7 moderate, 6 minor). All have been applied.

### Critical

**16. stream-json ESM import paths**

Problem: Import paths used `.js` extension (e.g., `stream-json/streamers/StreamObject.js`) which don't resolve correctly.

Fix: Remove `.js` extensions, add CJS-to-ESM interop with default export fallbacks.

**17. `as any` cast in pipeline test**

Problem: `refreshCardMetadataIfStale` test used `as any` to bypass type checking.

Fix: Construct full config via `{ ...getConfig(), overrides }`.

**18. `markDealsNotified` crashes on empty array**

Problem: SQL `IN ()` with empty array produces invalid SQL.

Fix: Add `if (dealIds.length === 0) return;` guard.

**19. O(N) SELECT per price in daily pipeline**

Problem: `getCardByUuid` called per-price (~100K queries per run).

Fix: Build `Set<string>` of known UUIDs upfront, use `knownUuids.has()`.

**20. `avgs` CTE includes today's price**

Problem: 30-day average includes today, diluting drop detection signal.

Fix: Add `AND p.date < l.date` to exclude today from average calculation.

### High

**21. No transaction safety on stream errors**

Problem: Streaming loops use `BEGIN`/`COMMIT` without `ROLLBACK` on error.

Fix: Wrap both seed.ts streaming loops and `refreshCardMetadataIfStale` in try/catch with `db.exec("ROLLBACK")`.

**22. Foreign keys never enforced**

Problem: SQLite doesn't enforce FK constraints by default.

Fix: Add `db.pragma("foreign_keys = ON")` in schema.ts, seed.ts, and index.ts.

**23. No data quality validation**

Problem: Pipeline proceeds even with 0 prices parsed (data corruption/API failure).

Fix: Throw if 0 prices. Warn if <100 prices.

**24. No Slack failure notification**

Problem: When all retries fail, no notification is sent.

Fix: Send Slack notification with failure message before `process.exit(1)`.

**25. No database pruning**

Problem: Price table grows unbounded.

Fix: Delete records older than 180 days at start of each pipeline run.

**26. Wrong `moduleResolution`**

Problem: `"node"` is CJS-era. ESM projects need `"node16"`.

Fix: Change to `"moduleResolution": "node16"`.

**27. AllPrices cache never cleaned**

Problem: Multi-GB AllPrices file remains on disk after seed.

Fix: `unlinkSync(config.allPricesCachePath)` after price streaming completes.

### Moderate

**28. Broken Cardmarket URLs**

Problem: `encodeURIComponent(name)` doesn't match Cardmarket URL scheme.

Fix: Use `mcmId` for direct product links with name-based fallback.

**29. No Slack message batching**

Problem: >50 deals overflow Block Kit's 50-block limit.

Fix: `batchDeals()` splits into chunks of 48 deals. Multiple webhook POSTs.

**30. Misleading fetchWithRetry test name**

Problem: Test named "retries on failure" but didn't use fake timers.

Fix: Rename, add `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()`.

**31. Duplicate types across files**

Problem: `AllIdentifiersCard` defined in both seed.ts and pipeline.ts.

Fix: Export from `mtgjson.ts`, import in both files. Remove `AllPricesEntry` (reuse `MtgjsonPriceEntry`).

**32. Missing query tests**

Problem: No tests for multiple printings, watchlist round-trip, or empty DB edge cases.

Fix: Added 6 tests to queries.test.ts.

**33. Config afterEach incomplete**

Problem: Only 3 of 11 env vars cleaned up in afterEach.

Fix: Loop over all `CONFIG_ENV_KEYS` (11 keys).

**34. No watchlist+trend_drop dedup test**

Problem: Dedup logic existed but wasn't tested.

Fix: Test that card on watchlist with >15% drop produces exactly 1 deal (trend_drop).

### Minor

**35. No env var override tests for new fields**

Fix: Added test for `IDENTIFIERS_MAX_AGE_DAYS`, `PIPELINE_MAX_RETRIES`, `PIPELINE_RETRY_DELAY_MS`.

**36. Heartbeat logging**

Fix: Pipeline complete log now includes prices stored, deals found, notifications sent.

**37. Missing pipeline test for stale cache**

Fix: Added test: when cache missing and URL empty, `refreshCardMetadataIfStale` throws.

**38. `sendSlackNotification` untested**

Fix: Added 3 tests with mocked fetch (POST payload, empty URL skip, non-200 throw).
