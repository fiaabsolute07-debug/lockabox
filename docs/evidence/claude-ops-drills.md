# Ops drills and load tests (Claude, 2026-09-27, local only)

Machine: one 8-core laptop running everything at once (embedded Postgres 18, ingest worker on real APIs, `next dev`, the
production instances under test and the load generator). Numbers are a floor, not a capacity plan; repeat on staging.

## Load (AC-083, AC-077) — `scripts/loadtest.ts`
Each virtual user is a new device (own `lab_device` cookie) hitting `POST /api/rolls` (Trending, all chains, ~100-coin pool)
against `next start`. "1 000 concurrent" = 1 000 requests fired at the same instant.

| Build | Setup | Errors | p50 | p95 | p99 | rolls/s |
|---|---|---|---|---|---|---|
| before fixes | 1 instance, pool 10 | **2 × 500** (`UNSAFE_TRANSACTION`) | 762 ms | 1 234 ms | 2 114 ms | 458 |
| + retry, pool cache, no extra read | 1 instance | 0 | 728–796 | 854–1 218 | 860–1 233 | 772–1 118 |
| + device upsert/lock/nonce in one statement, device index, case cache, 1-query asset detail | 1 instance | 0 | 478–732 | 726–1 173 | 1 143–1 201 | 788–833 |
| same | **2 instances** (pool 20 each) | 0 | 337–426 | **507–658** | 525–681 | 1 381–1 760 |
| same | sequential (1 at a time) | 0 | **23–25 ms** | — | — | — |

- AC-077 (server-side roll p95 < 300 ms): met locally, a roll takes ~24 ms end to end.
- AC-083 (1 000 concurrent, no errors, p95 < 500 ms): **no errors**, p95 **just above** the target with 2 instances on this laptop
  (best 507 ms). Not claimed as passed: re-run on staging with the load generator on a separate machine and ≥ 2 app instances.
- Fixes found by the test (all covered by integration tests):
  1. postgres.js 3.4.9 `UNSAFE_TRANSACTION` under a saturated pool (pipelined BEGIN loses its reservation) → the transaction never
     started, so `beginWithRetry` retries it.
  2. The guest pacing check scanned all rolls (`device_id` had no index) → migration 0008.
  3. Per roll: ~16 → ~11 round trips (case + pool cached 30 s / 3 s in process; device create+lock+nonce in one upsert; asset
     detail in one query; items returned from the roll instead of re-read).
- While there: a roll now reads the seed `FOR SHARE` inside its transaction and the daily rotation locks it `FOR UPDATE` before
  stamping the reveal, so no roll can use a seed that is already revealed (test "no roll ever uses a seed that was already
  revealed" in `tests/integration/core.db.test.ts`, 5/5 repeated runs).
- Side effect: the load runs left ~15 000 guest rolls in the local dev DB (15 329 rolls in total) (they show on the local Best pulls/feed). The script refuses
  any non-localhost URL.

## Backup and restore (AC-082) — `scripts/backup.ts`
- Dump of the dev DB: 23 tables, 9 866 rows, JSON lines + manifest (row counts + content hashes), one REPEATABLE READ snapshot.
- Restore into a fresh database `lockabox_restore_drill`: migrations 0001–0007 applied, all rows loaded, **row counts and content
  hashes match for every table, 28 foreign keys re-checked** (dropped and re-added). Drill DB dropped afterwards.
- Found on the way: postgres.js COPY streams hang the process on large tables (inside or outside a transaction), so the script
  uses a cursor instead.
- Production still needs the provider's daily backups + PITR and a staging restore drill (owner).

## Price fallback (AC-022) — `worker/fallback.ts`
- `tests/integration/fallback.db.test.ts`: DEX Screener fresh → no DexPaprika call; stale > 10 min → one batched call, prices
  and caps updated, source shown; again within 5 min → skipped; above 80 % of the credit budget → skipped; both sources down →
  coins leave the pool and the price is hidden.
- Found on the way: once every snapshot came from DexPaprika the "is DEX Screener down" check read "no" and the fallback stopped;
  fixed (down = no DEX Screener snapshot in 10 min, including none at all).
- Live: worker restarted with the fallback; DEX Screener is up, so it stays idle (`/api/health` ok).

## Runbooks (AC-081)
`docs/RUNBOOKS.md`: kill switch, source down/over budget, points abuse, sponsor dispute, seed problems, backup/restore,
deploy/rollback. Each has a local drill reference; the staging drills are owed before LIVE.
