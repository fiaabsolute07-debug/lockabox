# Astra A3 evidence

Implemented the C4 UI in the Astra-owned paths. No commit created.

## Delivered

| Item | Files | Tests / evidence |
|---|---|---|
| Best pulls page, 24H/7D fetch toggle, empty state, table, sidebar nav | [LeaderboardClient.tsx](/Users/dohoangphi/Lockabox/src/components/LeaderboardClient.tsx:1), [leaderboard/page.tsx](/Users/dohoangphi/Lockabox/src/app/leaderboard/page.tsx:1), [AppShell.tsx](/Users/dohoangphi/Lockabox/src/components/AppShell.tsx:248), [globals.css](/Users/dohoangphi/Lockabox/src/styles/globals.css:209) | `a3.spec.ts` Best pulls test; typecheck; build |
| Signed-in account menu, privacy toggle, sign-out, outside click/Escape handling | [AppShell.tsx](/Users/dohoangphi/Lockabox/src/components/AppShell.tsx:145), [globals.css](/Users/dohoangphi/Lockabox/src/styles/globals.css:56) | `a3.spec.ts` privacy/sign-out test; typecheck |
| Referral capture, URL stripping, one-shot accept, accepted toast | [AppShell.tsx](/Users/dohoangphi/Lockabox/src/components/AppShell.tsx:70) | `a3.spec.ts` referral test; typecheck |
| Invite card, full link copy, stats, repeatable invite task, claimable progress | [EarnClient.tsx](/Users/dohoangphi/Lockabox/src/components/EarnClient.tsx:11), [globals.css](/Users/dohoangphi/Lockabox/src/styles/globals.css:350) | `a3.spec.ts` invite test; typecheck |
| Pull sharing and X fallback without referral codes | [SharePullButton.tsx](/Users/dohoangphi/Lockabox/src/components/SharePullButton.tsx:1), [CaseWorkspace.tsx](/Users/dohoangphi/Lockabox/src/components/CaseWorkspace.tsx:173), [VerifyRoll.tsx](/Users/dohoangphi/Lockabox/src/components/VerifyRoll.tsx:38) | `a3.spec.ts` share test; typecheck |
| Verify OG/Twitter metadata with Next 16 Promise params | [verify/[id]/page.tsx](/Users/dohoangphi/Lockabox/src/app/verify/[id]/page.tsx:1) | `a3.spec.ts` OG metadata test; build |
| Sponsored live tab, labelled drops, points-only open, pending result and errors | [CaseWorkspace.tsx](/Users/dohoangphi/Lockabox/src/components/CaseWorkspace.tsx:63), [globals.css](/Users/dohoangphi/Lockabox/src/styles/globals.css:231) | `a3.spec.ts` sponsored empty/live/open test; typecheck; build |
| English legal pages, draft note, unknown-slug 404, footer links | [legal/[slug]/page.tsx](/Users/dohoangphi/Lockabox/src/app/legal/[slug]/page.tsx:1), [AppShell.tsx](/Users/dohoangphi/Lockabox/src/components/AppShell.tsx:267) | `a3.spec.ts` legal/footer test; build |
| Wallet adapter font and touch-only SPACE hint cleanup | [WalletProviders.tsx](/Users/dohoangphi/Lockabox/src/components/WalletProviders.tsx:1), [wallet-adapter.css](/Users/dohoangphi/Lockabox/src/styles/wallet-adapter.css:1), [globals.css](/Users/dohoangphi/Lockabox/src/styles/globals.css:96) | build; `git diff --check` |
| Contract types and A3 fixture coverage | [api.ts](/Users/dohoangphi/Lockabox/src/components/api.ts:45), [a3.spec.ts](/Users/dohoangphi/Lockabox/tests/e2e/a3.spec.ts:1) | 8 A3 tests listed by Playwright |

## Checks

- `pnpm exec tsc --noEmit -p tsconfig.json --incremental false` — passed.
- `pnpm exec vitest run tests/unit` — passed, 25 tests.
- `pnpm build` — passed; all new routes compiled, including `/leaderboard`, `/legal/[slug]`, and `/verify/[id]`.
- `pnpm exec playwright test --list` — passed; 19 tests listed across the existing suite and `a3.spec.ts`.
- `git diff --check` — passed.
- Full Playwright execution was not possible in this sandbox: the configured dev server could not bind `127.0.0.1:4310` (`listen EPERM`). Claude should run the browser suite against the dev server/real DB as planned.

## Not done / contract notes

- Vietnamese rendering/switch is intentionally deferred to A4; legal pages use `en` as specified.
- `src/content/legal.ts` remains read-only and is rendered as supplied; all four documents remain visibly `Draft — pending legal review`.
- Existing changes outside Astra’s allowed paths were present before this task and were not modified. No request for another path is needed for A3.
