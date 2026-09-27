# HANDOFF (2026-09-27, Claude, cloud session, solo; no Codex/Astra)

State: backend R0–R6 core, UI A1–A5, all committed on `claude/tender-lovelace-rgid6q`. `docs/BUILD_STATUS.md`: **73/89 VERIFIED_LOCAL**,
9 PARTIAL, 1 BUILT, 1 SPEC, 4 NEEDS_OWNER, 1 DROPPED (vi UI, owner decision). Everything still open needs the owner (list below).
Tests: unit **40** · DB integration **45** · e2e **44** (Playwright) · `pnpm lint` 0 errors · typecheck clean · `pnpm build` green.
GitHub Actions (`.github/workflows/ci.yml`, every push/PR, macOS) runs all of it incl. lint, build and e2e: green on this branch.

This session (commits 7622082 → 72ef011):
1. A4 review finished (`docs/evidence/claude-review-A4.md`): VI copy rewritten against the glossary, error codes `daily_cap` / `locked` /
   `not_done` / … mean what the server says (server now returns `locked` 403), VI strings stuck in English fixed, language switch no
   longer drops the pull, DexPaprika `multiPrices` counts one credit per token.
2. A5 done by Claude (`docs/evidence/claude-A5.md`): EVM wallets (EIP-6963 + viem), SIWE sign-in, EVM buy box (hidden while swap is off),
   `/admin` console. e2e with a mock `window.ethereum`, plus real SIWE/SIWS round trips against the local API + DB with throwaway keys.
3. AC-077 (`docs/evidence/claude-lcp-4g.md`, `scripts/lcp.ts`): production build, Slow 4G + 4× CPU: LCP 1.76–1.77 s (first visits were
   4.76 s until the 18+ gate moved server-side, `lab_age` cookie). Roll service p95 4.3 ms (18 ms at 10 concurrent).
4. Closed without the owner: AC-001 (lint config + CI), 003, 004, 034, 035, 040, 044, 061, 068, 071 (DB guard, migration 0012), 076, 078, 080, 086.
   AC-042 now shows confirmed/failed (`GET /api/trades/:id`); its real-transaction half is the owner's.

Later the same day (owner requests, commits after 0f07bf1):
5. CS:GO-style case opening: synthesised sound (clicks, heartbeat, drum roll, tier stings from a sad trombone to a fanfare + crowd)
   and a full-screen reveal per tier (confetti, rays, shake, flash; womp for Micro), closed by the user (DECISIONS #14).
6. **English only**: the Vietnamese UI and legal drafts are removed (DECISIONS #13). Lawyer: check the Vietnamese advertising-label rule.
7. **All DEX Screener chains** (58, with self-hosted logos; auto-registration of new ids; DECISIONS #15). Chains with coins are listed first.
   Hero layout fixed for 901–1500 px screens.

## Run locally
`pnpm install` · `pnpm db:start` (embedded Postgres 127.0.0.1:55442) · `pnpm db:migrate` · `pnpm db:test:prepare` · `pnpm worker` · `pnpm dev` → http://127.0.0.1:4310.
Checks: `pnpm lint` · `pnpm typecheck` (run `pnpm exec next typegen` once on a fresh clone) · `pnpm test` · `pnpm test:integration` · `pnpm build` · `pnpm exec playwright test`.
- Containers without Google Chrome: `PW_EXECUTABLE=/path/to/chromium pnpm exec playwright test`.
- Linux without `libicuuc.so.60` (this cloud container): the embedded binary won't start; any Postgres on 127.0.0.1:55442 with user
  `postgres` / password `local_dev_only` and databases `lockabox`, `lockabox_test` works (used Postgres 16 here).
- This container cannot reach DEX Screener / DexPaprika / Jupiter (egress policy), so no live data was ingested this session.
Ops: `docs/RUNBOOKS.md` (§8 new: turning on EVM buys) · `GET /api/health` · `/admin` (token only in the tab) · `pnpm db:backup` / `db:restore` · `pnpm loadtest`.

## Next for an agent
- Refactor the 19 React Compiler lint warnings (`react-hooks/set-state-in-effect`, `refs`; DECISIONS #11) and make them errors.
- 18+ gate: its button works only after hydration (~4.7 s on Slow 4G); a plain `<form method="post">` fallback would fix taps before that.
- `.env.example` lists `SESSION_SECRET`, which no code reads: remove it or use it.
- With network access to DEX Screener: run `pnpm worker:once` and check which of the 58 chain ids produce assets; fix any id that stays empty.
- Once staging exists: re-run `scripts/lcp.ts` with live data (AC-077) and `pnpm loadtest` from another machine (AC-083, p95 was 507–658 ms locally).
- After the owner decides: vault distribution/refund job (AC-066), WalletConnect (AC-036).

## Owner (the agent can't do these)
1. **DEX Screener**: send `docs/evidence/dexscreener-email-draft.md` and keep the reply in `docs/evidence/` (AC-012). Read DexPaprika's
   terms and get a free key → `DEXPAPRIKA_API_KEY`.
2. **Lawyer**: review `src/content/legal.ts` (en + vi drafts, now mention the language and 18+ cookies) and the LAB §9 checklist;
   fill `CONTACT` in that file; sign `docs/LEGAL_CHECKLIST.md` (AC-079).
3. **Domain**: buy lockabox.fun (+ .io); submit it for wallet domain verification (Phantom, MetaMask/Blowfish…) (AC-085).
4. **Staging**: managed Postgres with daily backups + PITR (AC-082), an uptime checker on `/api/health` (AC-080), rehearse each
   runbook once there (AC-081), load test (AC-083), then approve staging before LIVE (AC-087).
5. **Secrets**: `ADMIN_TOKEN` (≥ 24 chars; unset = admin API off); `SPONSOR_TREASURY`, `SPONSOR_VAULT`, `SPONSOR_FEE_USDC`
   (unset = no campaign can be approved, AC-063/067). Make the first real sponsor deposit (AC-063 M).
6. **EVM swap decision** (DECISIONS #10): LI.FI keeps 0.25 % per route and excludes US persons. If yes, follow RUNBOOKS §8 per chain
   (Base first); the database refuses a chain without its route config. Until then EVM coins show "View on DEX Screener" (AC-038, AC-072).
7. **One small real swap** from your own wallet on Solana (and on each EVM chain you turn on): closes AC-037 (no platform fee on a
   real transaction) and the "M" half of AC-040/042.
8. Optional: a WalletConnect/Reown project id if mobile wallets without an injected provider matter (AC-036); decide whether to
   run the vault job for automatic drops/refunds (AC-066; today redemptions stay `pending` and you pay them by hand, RUNBOOKS §4).
