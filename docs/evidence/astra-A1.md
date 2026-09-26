# Astra A1 evidence

## Delivered files

- `src/modules/sources/http.ts` — injectable JSON fetch wrapper, 10-second timeout, token-bucket limiter, retry/backoff, and typed HTTP errors.
- `src/modules/sources/dexscreener.ts` — lenient zod schemas and the official DEX Screener feed/pair client with 60/min and 300/min limiters.
- `src/modules/sources/dexpaprika.ts` — lenient zod schemas and the optional-key DexPaprika client with pagination mapping and an in-memory credit counter.
- `src/modules/sources/normalize.ts` — highest-liquidity pair snapshots, quote-token filtering, chain-ID mapping, and candidate extraction.
- `src/modules/sources/tier.ts` — LAB option-A market-cap tier boundaries.
- `src/modules/sources/index.ts` — public API re-exports.
- `tests/unit/sources.test.ts` — fixture parsing and unit coverage for HTTP behavior, clients, normalization, quote filtering, and tiers.

## Design decisions

- The rate limiter allows an initial burst of `perMinute` tokens and refills at a steady per-minute interval. Clock and sleep are injectable for deterministic tests.
- HTTP retries are three total attempts with 500ms/1000ms backoff. A 429 becomes `RateLimitedError` after the final attempt; a 402 becomes `CreditsExhaustedError` immediately and is never retried.
- DexPaprika `searchPools` preserves validated raw pool fields in `results` and maps pagination fields to `hasNextPage`/`nextCursor`.
- `pairsToAssets` selects the highest `liquidity.usd` pair for each exact `(chainId, baseToken.address)` key. Social handles are derived from the final URL path segment.
- `paprikaPoolsToCandidates` removes Solana wrapped SOL/USDC and known EVM quote tokens, maps the requested seven network IDs, and emits `Date` values for valid creation timestamps.

## Verification

Command: `pnpm exec vitest run tests/unit`

```text
Test Files  2 passed (2)
Tests  17 passed (17)
```

Command: `pnpm exec tsc --noEmit -p tsconfig.json --incremental false`

The sources and source tests produced no diagnostics. The command remains non-zero because of existing/non-owned Claude routes referring to an unavailable `RouteContext` type:

```text
src/app/api/assets/[id]/buys/route.ts
src/app/api/assets/[id]/route.ts
src/app/api/cases/[id]/route.ts
src/app/api/rolls/[id]/route.ts
src/app/api/rolls/[id]/verify/route.ts
src/app/api/tasks/[id]/claim/route.ts
src/app/api/trades/[id]/route.ts
```

## Open issues / requests for Claude

- Please review and integrate the public source client API into the worker/C2 adapters, especially the `Date` fields emitted by normalization.
- Please resolve the non-owned `RouteContext` typecheck errors; Astra did not modify those routes per the collaboration boundary.
- The tests intentionally use only recorded fixtures and injected fetchers; live API smoke tests still belong in a separately authorized staging check.

Astra did not commit.
