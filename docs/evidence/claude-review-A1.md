# Claude review of Astra A1 (`src/modules/sources`)

Result: **accepted** with one integration fix on Claude's side and one follow-up for Astra.

Checked
- `http.ts`: token bucket (burst = perMinute, steady refill), 3 attempts with 500/1000 ms backoff on 429/5xx, 402 → `CreditsExhaustedError` without retry, 10 s timeout combined with caller signal. OK.
- `dexscreener.ts`: only official base URL; `tokens()` refuses > 30 addresses; lenient `z.looseObject` schemas. OK.
- `dexpaprika.ts`: key only in `Authorization` when set; limit 1–100 enforced; cursor pagination. OK.
- `normalize.ts`: highest-liquidity pair per (chain, token); `marketCap ?? fdv`. OK.
- `tier.ts`: boundaries per LAB option A. OK.
- Tests: 12 new tests on recorded fixtures, no network. Full suite 17/17 green; `tsc` clean after `next typegen` (the `RouteContext` errors Astra reported were missing generated Next types, not code errors).

Live check (Claude, real network, 2026-09-27 00:2x): one worker cycle discovered 454 assets (+170 from DexPaprika), enriched 221, froze pools for every case × chain (trending/all = 97).

Finding → fixed by Claude
- F1 (medium): `QUOTE_TOKENS` for robinhood/arc only lists the zero address, so a DexPaprika pool's WETH side became a "candidate"; WETH (Robinhood) and non-meme majors (WBTC, UNI, ONDO) reached pools. Fix: migration `0003_symbol_blocklist.sql` + pool eligibility excludes blocklisted symbols (stables, wrapped natives, staked and large non-meme majors).

Follow-up for Astra (next task)
- Add the real wrapped-native / stable addresses for robinhood and arc to `QUOTE_TOKENS` once known from their explorers (needs network; record the source URL in the comment).
