# HANDOFF (2026-09-27, Claude)

Done and committed (3 commits on main): backend R0–R4 core (roll engine, pools, gates, worker, Jupiter swap, SIWS sign-in, points/tasks, sponsored cases, kill switch, geo-block flag), Astra A1 sources, spike R0, CI, BUILD_STATUS (45/89 VERIFIED_LOCAL).
Tests: 25 unit + 18 DB integration green; tsc clean after `pnpm exec next typegen`.

In progress: **Astra A2 (UI)** was still running (`codex exec`, log `.local-astra-A2.log`); its files in src/app (non-api), src/components, tests/e2e are **not reviewed or committed**.

Next:
1. When A2 finishes: read docs/evidence/astra-A2.md, review the diff, `pnpm build`, run the app (`pnpm db:start`, `pnpm worker`, `pnpm dev` → http://127.0.0.1:4310), run `pnpm test:e2e`, write claude-review-A2.md, commit.
2. Remaining SPEC items in docs/BUILD_STATUS.md (EVM swap/sign-in, leaderboard, share image, invite task, i18n vi, legal pages, monitoring, runbooks, load test, vault distribution job — owner-run only).
3. Owner actions: send docs/evidence/dexscreener-email-draft.md, read DexPaprika terms, lawyer checklist, buy lockabox.fun/.io.

Local services: `pnpm db:start` (Postgres 127.0.0.1:55442), `pnpm worker` (ingest every 60 s).
