# Collaboration: Claude + Codex (Astra)

The owner asked Claude to build Lockabox end to end from `docs/LAB_MASTER.md` and to coordinate **Codex (Astra)** as the
second engineer. Claude assigns tasks on this board, integrates, runs DB/E2E suites, reviews, accepts and is the **only committer**.

## Ownership

| Owner | Paths |
|---|---|
| **Claude** | `db/**`, `src/lib/**`, `src/modules/{rolls,cases,points,auth,swap,sponsors,admin,gates}/**`, `src/app/api/**`, `worker/**`, `scripts/**`, `tests/integration/**`, `tests/unit/{rolls,cases,points,gates,auth,swap}*.test.ts`, `docs/COLLABORATION.md`, `docs/DECISIONS.md`, `docs/UI_CONTRACT.md`, `docs/BUILD_STATUS.md`, `docs/HANDOFF.md`, `docs/evidence/claude-*.md` |
| **Astra** | `src/modules/sources/**`, `src/app/**` except `src/app/api/**`, `src/components/**`, `src/styles/**`, `tests/unit/sources*.test.ts`, `tests/unit/ui*.test.ts`, `tests/e2e/**`, `playwright.config.ts`, `docs/evidence/astra-*.md` |
| Shared, change by request | `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`. Write the request in your evidence file; Claude applies it. |

## How Astra is run
- `~/.local/bin/codex exec -C ~/Lockabox -s workspace-write -o docs/evidence/astra-<task>.last.md "<task prompt>"`.
- The sandbox has **no network**: tests use the recorded fixtures in `tests/fixtures/**` (captured by Claude on 2026-09-27 from the real APIs).
- Astra writes code, tests and `docs/evidence/astra-<task>.md` (what was done, how it was tested, open issues). Astra does not commit.
- Claude reviews every Astra diff, writes `docs/evidence/claude-review-<task>.md`, runs the suites, and commits the task's paths.

## Rules
- Never edit the other owner's paths; put requests in your evidence file.
- Only official APIs (LAB_MASTER §3). No HTML scraping, no dexscreener.com internal endpoints, no proxying raw third-party data.
- No private keys, no signing, no live money, no deployment, no outbound messages. Every mainnet action is the owner's.
- A green build is not acceptance: acceptance is the `LAB-AC-###` case passing with evidence.

## Task board

| Id | Owner | Task | Depends on | Status |
|---|---|---|---|---|
| C0 | Claude | Repo, toolchain, embedded Postgres, migrations runner, fixtures | — | DONE |
| A1 | Astra | `src/modules/sources`: DEX Screener + DexPaprika clients (rate limit, retry, typed errors), normalisation to asset snapshots, market-cap tiering, unit tests on fixtures | C0 | DONE (reviewed: claude-review-A1.md; F1 fixed by Claude) |
| C1 | Claude | DB schema (assets, snapshots, gates, cases, pools, seeds, rolls, users, wallets, points, trades, sponsors), provably-fair roll engine, pool builder | C0 | DONE |
| C2 | Claude | Hidden gates (Solana sell route via Jupiter quote, liquidity floor), worker (discover → enrich → gate → pools), API routes + `docs/UI_CONTRACT.md` | A1, C1 | DONE |
| A2 | Astra | UI per `design/brand-explore-v11.html`: case page, spinner, contents grid, token header, DEX Screener embed chart (fallback GeckoTerminal), buys table, token rail, swap box, proof box, verify page, mobile | C2 contract | IN PROGRESS (re-dispatched: first prompt wrongly read as 'edit only COLLABORATION.md') |
| C3 | Claude | Wallet auth (SIWS), Jupiter swap build endpoint, trade recording, points + tasks, FOMO feed from real events | C2 | DONE (backend); UI in A2 |
| R* | both | Cross-review each other's tasks; findings in evidence files | — | ongoing |
