# HANDOFF (2026-09-27, Claude)

State: backend R0–R6 core + UI (Astra A1–A3) built, reviewed and committed. `docs/BUILD_STATUS.md`: 58/89 VERIFIED_LOCAL,
14 PARTIAL (mostly "needs staging/owner"), 4 SPEC (EVM sign-in, EVM swap, vault refund job, vi UI), 4 NEEDS_OWNER.
Tests: 25 unit · 29 DB integration · 19 e2e (Playwright, contract fixtures) · `pnpm build` green · typecheck clean.

Run locally: `pnpm db:start` (Postgres 127.0.0.1:55442) · `pnpm worker` (ingest every 60 s, real APIs) · `pnpm dev` → http://127.0.0.1:4310.
Ops: `docs/RUNBOOKS.md` · `GET /api/health` · `pnpm db:backup <dir>` / `pnpm db:restore <dir> <url>` · `pnpm loadtest --url …` (localhost only).
Evidence: `docs/evidence/claude-review-A{1,2,3}.md`, `claude-ops-drills.md` (load test, restore drill, fallback), `img/chart-embeds-localhost.png`.

Next (agent):
1. Astra **A4** (see COLLABORATION board): en/vi UI incl. legal + "Quảng cáo · Sponsored", significant-digit prices, "price via DexPaprika"
   note, sponsor dashboard + CSV + submit form, `multiPrices` in the DexPaprika client (then switch `worker/fallback.ts` to it).
2. EVM: choose a zero-fee aggregator with calldata for an `eth_call` sell simulation (0x / 1inch / LI.FI), SIWE sign-in; until then EVM chains
   stay "View on DEX" (DECISIONS #6). Robinhood/Arc swap only after router addresses come from official docs (spikes/R0.md).
3. Re-run the load test on staging (2+ instances, generator on another machine); AC-083 p95 was 507–658 ms locally.

Owner (the agent can't do these):
- Send `docs/evidence/dexscreener-email-draft.md`; read DexPaprika's terms; get a free DexPaprika key (`DEXPAPRIKA_API_KEY`).
- Lawyer review of `src/content/legal.ts` (drafts) and the LAB §9 checklist; fill `CONTACT` in that file.
- Buy lockabox.fun/.io; staging with managed Postgres (daily backups + PITR); an uptime checker on `/api/health`; set `ADMIN_TOKEN` (≥ 24 chars).
- Sponsored drops stay manual: redemptions remain `pending` until the owner pays them from the campaign vault (RUNBOOKS §4).
