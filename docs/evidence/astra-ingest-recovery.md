# Ingest recovery and Discover default — 2026-09-27

Owner explicitly requested implementation of the four-part ingest/default-case recommendation. No commit or deployment.

## Changes

- Migration `0014_ingest_identity_queues.sql`: canonical lowercase EVM identity, case-sensitive Solana/other identities, source union, freshest snapshot, conservative gate/moderation merge. Historical asset IDs remain aliases; no roll/pool payloads or hashes are rewritten. Database trigger protects all future inserts, not only the worker. Admin moderation and swap loading resolve aliases.
- Dedicated refresh, newly-discovered and backlog lanes: at most 30 batched token calls per cycle (30 tokens/call), reserving 20/5/5 calls and passing unused capacity forward. Round-robin chain batches; attempt/deadline/failure fields persist across restarts. Empty results back off 5 minutes to 6 hours; transport failures 1–15 minutes. No first-seen-within-seven-days cutoff on refreshing.
- Persistent new-pool cursors/watermarks, newest-first pagination, seven-day initial catch-up, activity-weighted chain turns. During long backfills, alternate fresh-head checks with continuation without advancing the unfinished watermark. Discovery retains tiny pools for later hydration; the existing liquidity gate still decides eligibility. Failed/expired cursors back off then restart without losing the completed watermark.
- Discovery pacing uses 80% of the configured monthly API allowance, bounded daily use and a four-page burst cap. `LAB_PAPRIKA_MONTHLY_CREDITS` optionally overrides the discovery allowance; otherwise existing project defaults are 10,000 without a key / 100,000 with a key. The 10,000 allowance means approximately one discovery page per 5.4 minutes globally before cycle rounding, **not** minute-by-minute scanning of every chain. DEX Screener feeds still run each cycle. A higher verified API allowance is needed for exhaustive fast coverage; no new provider/key was installed and no safety gates were loosened.
- Session advisory lock prevents overlapping ingest cycles. Stopped two legacy local worker processes and started one updated worker. SIGINT/SIGTERM now finish the current cycle before closing the pool (tested idle-worker shutdown); this avoids stranding the reserved lock connection during restart.
- Honeypot probes are capped at 20/cycle because a Solana check takes two quote calls. A rate-limit response ends that batch until the next cycle, without recording an unknown token as passed.
- Default UI case is Discover with the existing <7d filter. Trending remains separate. Discover itself has no source restriction; All/<14d/<30d can expand age while preserving safety checks. Chain counters now describe Discover before filters. Contents remain a 32-item preview, not the size of the roll pool.
- Empty eligibility now publishes an empty pool instead of silently keeping the obsolete one. Roll-time rechecks freshness, canonical identity, enabled chain, moderation, symbol blocks and safety gates even with All selected. New <24h enforces its age at roll time too; future timestamps fail max-age filters.

## Safety and validation

- Final pre-migration backup: `/Users/dohoangphi/Documents/Codex/2026-09-27/tif/work/lockabox-backup-at-migration`, 24 tables / 45,183 rows. Original migrations 0001–0013 are included in its `migrations/` directory. Backup predates the new columns: restore against that original schema before reapplying 0014, not blindly against the latest schema/hash verifier.
- Live migration: 1,024 aliases merged, zero remaining active duplicate identities.
- Before/after full-row content hashes verified unchanged for all **15,920 historical rolls** and **1,944 historical pool versions** (before the restarted worker ran). Roll hash `77951921b92bc859811ac19b01eee2d8`; pool hash `c1c9ea57997f7ec34008d7457dd52bf8`.
- Separate test database `lockabox_ingest_fix_test`, never the local user database, used for unit/integration regression tests. **98 tests passed / 16 files**. Includes real pre-migration schema + duplicates + immutable proofs, Solana casing, alias moderation, backoff, fair chains, newest-first hydration, resumable pagination, watermark boundaries, quota exhaustion, fresh-head peeks, singleton lock and graceful worker shutdown.
- **5 Playwright tests passed**: Discover default / separate Trending, seven-day default, all age presets, preservation of other filters, mobile controls and no retry with silently broadened filters. API responses mocked; no wallet or actual swap used.
- Typecheck passed; backend/new-test lint passed; CaseWorkspace retains four pre-existing React hook/ref warnings; no lint errors. `git diff --check` passed.
- Live browser showed Discover and `Next roll · pair age: <7d` after metadata reload. User subsequently interacted with the page; their current selection/result was left alone.

## Live measurements (dynamic, not guarantees)

At 21:26 local, immediately before migration: 6,682 physical rows / 5,658 logical identities; Trending 107 before filters, 11 matching <7d; New 194.

At 21:31 local, after two completed new-worker cycles: 5,843 canonical tokens, 1,024 historical aliases, 0 duplicate active identities. Discover **1,182 eligible before filters / 964 eligible under seven days**; New <24h **906**; Trending **362 / 211 under seven days**. 2,514 canonical tokens attempted, 25 currently backing off, 2,681 fresh snapshots; backlog processing continues.

First completed new-worker cycle refreshed 806/828 requested tokens (22 no data), made 38 DS / 4 DP calls, and successfully checked 40 honeypot gates. Second cycle succeeded with 38 DS calls. A transient `/api/health` DS-budget alert was the rolling ten-minute window still including two old workers; new worker is bounded to a single 30-call enrichment budget plus feed calls.

At 21:35 local: Discover **1,563 before filters / 1,330 under seven days**, New <24h **1,266**, Trending **389 / 238 under seven days**. 3,656 identities attempted; 1,992 still lacked a snapshot. Health recovered to `ok`, no alerts. No claim that every discovered token is eligible or that discovery covers every new pool across all chains.

No real-money transaction, wallet signing, commit or deployment was performed.
