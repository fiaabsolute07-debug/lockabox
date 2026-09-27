# Astra A4 evidence

Date: 2026-09-27

## Completed

| Item | Files (file:line) | Tests |
|---|---|---|
| EN/VI dictionary, server-selected initial language, `lab_lang` cookie, live switch, locale helpers, translated known API errors | [src/components/i18n.tsx:6](/Users/dohoangphi/Lockabox/src/components/i18n.tsx:6), [src/components/i18n.tsx:550](/Users/dohoangphi/Lockabox/src/components/i18n.tsx:550), [src/components/AppShell.tsx:55](/Users/dohoangphi/Lockabox/src/components/AppShell.tsx:55), [src/app/layout.tsx:18](/Users/dohoangphi/Lockabox/src/app/layout.tsx:18) | [tests/e2e/a4.spec.ts:37](/Users/dohoangphi/Lockabox/tests/e2e/a4.spec.ts:37), [tests/e2e/a4.spec.ts:53](/Users/dohoangphi/Lockabox/tests/e2e/a4.spec.ts:53) |
| Legal pages use the current language, including translated draft note and dates | [src/components/LegalDocument.tsx:6](/Users/dohoangphi/Lockabox/src/components/LegalDocument.tsx:6), [src/app/legal/[slug]/page.tsx:20](/Users/dohoangphi/Lockabox/src/app/legal/[slug]/page.tsx:20) | [tests/e2e/a4.spec.ts:46](/Users/dohoangphi/Lockabox/tests/e2e/a4.spec.ts:46) |
| Significant-digit token prices and compact localized market numbers | [src/components/api.ts:315](/Users/dohoangphi/Lockabox/src/components/api.ts:315), [src/components/MarketView.tsx:19](/Users/dohoangphi/Lockabox/src/components/MarketView.tsx:19), [src/components/LeaderboardClient.tsx:46](/Users/dohoangphi/Lockabox/src/components/LeaderboardClient.tsx:46), [src/components/SwapBox.tsx:50](/Users/dohoangphi/Lockabox/src/components/SwapBox.tsx:50) | [tests/unit/ui.test.ts:4](/Users/dohoangphi/Lockabox/tests/unit/ui.test.ts:4) |
| DexPaprika price-source note only on header and rail | [src/components/MarketView.tsx:19](/Users/dohoangphi/Lockabox/src/components/MarketView.tsx:19), [src/components/MarketView.tsx:81](/Users/dohoangphi/Lockabox/src/components/MarketView.tsx:81), [src/styles/globals.css:294](/Users/dohoangphi/Lockabox/src/styles/globals.css:294) | [tests/e2e/a4.spec.ts:61](/Users/dohoangphi/Lockabox/tests/e2e/a4.spec.ts:61) |
| Sponsor dashboard: signed-out state, own campaign list, stats, client CSV export, checks, submit, policy translation; footer link | [src/components/SponsorDashboard.tsx:25](/Users/dohoangphi/Lockabox/src/components/SponsorDashboard.tsx:25), [src/components/SponsorDashboard.tsx:58](/Users/dohoangphi/Lockabox/src/components/SponsorDashboard.tsx:58), [src/components/SponsorDashboard.tsx:88](/Users/dohoangphi/Lockabox/src/components/SponsorDashboard.tsx:88), [src/components/SponsorDashboard.tsx:104](/Users/dohoangphi/Lockabox/src/components/SponsorDashboard.tsx:104), [src/app/sponsor/page.tsx:1](/Users/dohoangphi/Lockabox/src/app/sponsor/page.tsx:1), [src/components/AppShell.tsx:273](/Users/dohoangphi/Lockabox/src/components/AppShell.tsx:273) | [tests/e2e/a4.spec.ts:83](/Users/dohoangphi/Lockabox/tests/e2e/a4.spec.ts:83) |
| DexPaprika `multiPrices`, zod validation, batching at 10, limiter/retry/auth reuse | [src/modules/sources/dexpaprika.ts:52](/Users/dohoangphi/Lockabox/src/modules/sources/dexpaprika.ts:52), [src/modules/sources/dexpaprika.ts:153](/Users/dohoangphi/Lockabox/src/modules/sources/dexpaprika.ts:153), [src/modules/sources/index.ts:40](/Users/dohoangphi/Lockabox/src/modules/sources/index.ts:40) | [tests/unit/sources.test.ts:51](/Users/dohoangphi/Lockabox/tests/unit/sources.test.ts:51), [tests/unit/sources.test.ts:161](/Users/dohoangphi/Lockabox/tests/unit/sources.test.ts:161) |
| A4 browser coverage added while preserving the A3/case suites | [tests/e2e/a4.spec.ts:37](/Users/dohoangphi/Lockabox/tests/e2e/a4.spec.ts:37) | `playwright test --list`: 23 tests total, including the 19 existing tests |

## Checks

- `pnpm exec vitest run tests/unit`: pass, 7 files / 39 tests.
- `pnpm exec playwright test --list`: pass, 23 tests listed.
- `git diff --check`: pass.
- `pnpm exec tsc --noEmit -p tsconfig.json --incremental false`: blocked by two existing errors in the out-of-scope `tests/unit/sponsor-verify.test.ts` (`process.env` objects omit required `NODE_ENV`, lines 32–33). No A4 file appears in the error output.

## Not done / environment limits

- The browser suite was not executed here: the sandbox rejects the dev server bind with `listen EPERM` on `127.0.0.1:4310`, and browser UI control was unavailable. Claude should run the full Playwright suite.
- I read the v11 reference and current UI source; the live UI screenshot could not be captured for the same server/browser restriction.
- No commit was made.

## Contract gaps to request from Claude

- The allowed UI/API boundary prevented changing `src/app/api/**`. The sponsor POST route currently checks presence/address/number shape but does not enforce all documented constraints server-side: project name length 2–60, description length ≤280, positive `totalOpens`, or `endsAt > startsAt` ([src/app/api/sponsor/campaigns/route.ts:16](/Users/dohoangphi/Lockabox/src/app/api/sponsor/campaigns/route.ts:16)). The dashboard mirrors the documented checks client-side, but the API should enforce them too.
- The same route reads `w.address` after a signed-in user lookup without explicitly handling a user who has no Solana wallet ([src/app/api/sponsor/campaigns/route.ts:15](/Users/dohoangphi/Lockabox/src/app/api/sponsor/campaigns/route.ts:15)). Please add a contract-consistent `needs_wallet` response server-side.
- The existing TypeScript `ProcessEnv` test typing issue needs an owner-approved change outside Astra’s allowed paths if the top-level tsc check must be green.
