# Lockabox runbooks (AC-081, AC-082)

Who acts: the **owner** (or an on-call person the owner names). The agent never touches production, never signs, never sends messages.
Admin calls need `Authorization: Bearer $ADMIN_TOKEN` (≥ 24 chars; unset = admin API off) and should send `x-admin-actor: <your name>`;
every admin action (and every automatic quarantine) is written to the append-only `audit_log`. `GET /api/admin/overview` lists pending
campaigns, killed coins and the last 100 audit entries.
Drill status: each runbook has been rehearsed **locally** (evidence below); the staging drill is still owed before `LIVE` (AC-081 "M").

Signals come from `GET /api/health` (point an uptime checker at it; it returns 503 with `alerts[]` when something is wrong):

| Alert code | Meaning | Runbook |
|---|---|---|
| `worker_late` / `worker_failing` | no finished ingest cycle for > 10 min, or 3 failed in a row | §2 |
| `ds_budget` | DEX Screener calls > 80 % of 60/min | §2 |
| `paprika_budget` | DexPaprika credits > 80 % of the 30-day budget | §2 |
| `swap_failures` | > 5 % of swaps failed in 24 h (≥ 20 swaps) | §1 / §2 |
| `no_seed` | no active fairness seed | §5 |

---

## 1. A coin rugs / must be removed now (kill switch)
Goal: gone from every case and swap locked in ≤ 60 s (AC-069).
1. `curl -X POST $SITE/api/admin/kill -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' -d '{"assetId":<id>,"reason":"<why>"}'`
   (asset id: from `/verify/<roll>` or the coin page URL). Killed by mistake: same call to `/api/admin/unkill`; the coin returns at the next pool build if it still passes the gates.
2. Effect is immediate: the roll path filters killed assets at roll time and `swapEnabled` turns false; the next worker cycle
   (≤ 60 s) freezes new pools without it. Nothing else to restart.
3. If a sponsored campaign uses that token: the campaign stops paying out automatically (`liveSponsoredItems` excludes killed assets).
   Tell the sponsor from the owner's own channel; refunds follow §4.
4. Write a one-line note in the incident log (date, asset, reason, who).
Local drill: `tests/integration/core.db.test.ts` "kill switch" + `sponsors.db.test.ts`; killed coins also leave Best pulls (`r3.db.test.ts`).

## 2. A data source is down or over budget
- **DEX Screener down** (enrich errors in the worker log, `worker_late` may follow): nothing to do for 10 min. After 10 min the worker
  automatically prices coins in current pools from DexPaprika every 5 min (log line `DEX Screener down > 10 min: N prices from DexPaprika`;
  coin pages say the price source). If DexPaprika is also down, coins go stale after 15 min, drop out of pools, and cases show
  "this case is filling up": the product pauses itself rather than show old prices (AC-022).
- **A symbol that isn't a memecoin keeps showing up** (a stable, a wrapped major): `POST /api/admin/blocklist {"symbol":"…","op":"add","reason":"…"}`.
- **Budget alerts**: lower the load before the provider cuts us off. Options in order: set `DEXPAPRIKA_API_KEY` (free key → 30/min, 100k/30 d);
  raise the worker interval (`worker/index.ts` `INTERVAL_MS`); lower `MAX_ENRICH` in `worker/ingest.ts`. Never add a per-user call to a provider.
- **Provider revokes access / changes terms**: disable the affected chain (`update chains set enabled = false where id = '<chain>'`) or
  the whole ingest; cases pause as above. Owner contacts the provider (draft: `docs/evidence/dexscreener-email-draft.md`).
- **Jupiter down** (`swap_failures`, quote errors): swap shows errors and "View on DEX Screener" still works. To turn in-app swap off:
  `update chains set swap_enabled = false where id = 'solana'`.
Local drill: `tests/integration/fallback.db.test.ts` (both-down pause, fallback, budget stop); live: health endpoint `ok` with real worker.

## 3. Points abuse (farms, bots, invite rings)
1. Find it: many accounts from one IP range, invitees with identical activity, sudden claim spikes
   (`select user_id, count(*) from task_completions where created_at > now() - interval '1 day' group by 1 order by 2 desc limit 50`).
2. Lock the accounts: `POST /api/admin/users/<user id>/lock {"lock": true, "reason": "…"}` (no claims, no spending, no invites; unlock with `false`).
   Points can't be deleted (append-only ledger). Neutralise with a compensating row: `insert into points_ledger (user_id, delta, reason, ref) values (<id>, -<n>, 'admin:abuse', '<case id>')`.
3. Invite rings: the invitee rule (wallet + 3 distinct active days, accounts < 24 h only, 10/day cap) limits damage; revoke by the same compensating rows.
4. Rate limits are per process (`src/lib/ratelimit.ts`); with several app instances, move them to Postgres/Redis before scaling out.
Local drill: invite cap + 24 h rules in `r3.db.test.ts` and `sponsors.db.test.ts`.

## 4. Sponsor dispute (content, payout, refund)
1. Content complaint: reject or end the campaign (`update sponsor_campaigns set status = 'ended' where id = <id>`); it leaves the sponsored case at once.
   Content that promises returns is already blocked on submit (AC-070).
2. Payouts: the vault distribution job is **off**. Redemptions stay `pending`; the owner pays them manually from the campaign vault
   and records the tx hash (`update redemptions set status='sent', tx_hash='<sig>' where id = <id>` — the only allowed update).
3. Refund of unused budget (AC-066): owner sends the remaining tokens back from the vault, records the tx hash in the campaign note.
4. Every decision: note in `review_note` with date and reason.

## 5. Fairness seed problem (`no_seed`, or a verify page says mismatch)
- `no_seed`: the next roll or worker cycle creates one automatically (`activeSeed`). If it persists, check the DB is writable.
- A `mismatch` on `/verify/<id>`: stop and investigate before anything else. Rolls, pools and ledger are immutable in the DB, so compare
  `rolls.items_hash` with the stored items and recompute with `resolveRoll`. Publish what happened. Do not rotate seeds by hand
  (rotation reveals the seed; the worker rotates daily and waits for in-flight rolls).

## 6. Backup and restore (AC-082)
- Production: use the managed Postgres provider's **daily backups + point-in-time recovery** (enable on day one), plus a weekly
  logical copy off-provider: `DATABASE_URL=<prod read replica> pnpm exec tsx scripts/backup.ts dump backups/<date>` (JSON lines + manifest with
  per-table row counts and content hashes; contains wallet addresses, so store it encrypted).
- Restore drill (quarterly and before `LIVE`): create an empty database, then
  `pnpm exec tsx scripts/backup.ts restore backups/<date> <empty database url>` → runs migrations, loads every table, checks row counts and
  content hashes against the manifest, and re-checks every foreign key.
- Local drill 2026-09-27: 23 tables, 9 866 rows dumped from the dev DB and restored into `lockabox_restore_drill`; counts and hashes
  matched, 28 foreign keys re-checked (`docs/evidence/claude-ops-drills.md`).

## 7. Deploy / rollback (for the owner; the agent never deploys)
- Deploy = migrations first (`pnpm db:migrate`, additive only), then app, then worker. One worker instance only.
- Rollback = previous app build; migrations are additive so the old app keeps working. Never run a destructive migration without a backup from §6.
