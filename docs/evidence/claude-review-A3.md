# Claude review of Astra A3 (UI for C4), 2026-09-27

Scope: Best pulls page, account menu (hide wallet, sign out), `?ref=` capture + accept, invite card + repeatable invite task,
share button + OG/Twitter meta on `/verify/:id`, sponsored tab + open flow, legal pages + footer, wallet-adapter font, touch SPACE hint.

## Checks
- `pnpm typecheck` clean · `pnpm test` 25/25 · `pnpm test:integration` 29/29 · `pnpm build` green · `pnpm exec playwright test` **19/19**.
- Rules (LAB §0): no risk/gain wording in `src/components` or `src/app` (grep for moon/x100/guarantee/profit/risk/safe/scam/rug: none);
  share URL is `/verify/:id` with no `ref`; the sponsored flow only calls `POST /api/sponsored/open` (never `/api/rolls` with `sponsored`);
  the sponsored tab is hidden when no drop is live; Best pulls says "Random pulls from real rolls. Past moves don't predict anything."
- Live local: `/leaderboard` renders real rows (24H/7D), `/legal/privacy` shows the draft notice and the en copy from `src/content/legal.ts`.

## Findings
| # | Finding | Status |
|---|---|---|
| F1 | e2e `ref … accepted once`: `expect(page.evaluate(...)).toBeNull()` asserted on a Promise (always failed). | Fixed by Claude → `expect.poll`. |
| F2 | e2e invite claim expected body `{}`, but a claim sends no body (`postDataJSON()` is null). | Fixed by Claude (`?? {}`). |
| F3 | Best pulls shows prices ≥ $0.01 with 2 decimals, so a 3 % move reads "$0.01 → $0.02". | A4: significant-digit price format. |
| F4 | Vietnamese UI and "Quảng cáo · Sponsored" label not done (scheduled). | A4. |
| F5 | `AssetDetail.priceSource` (AC-022) added to the contract after A3 started; no "price via DexPaprika" note yet. | A4. |
| F6 | `fetchMultiPrices` lives in `worker/fallback.ts`; source clients belong in `src/modules/sources`. | A4 (Astra's path). |

## Verdict
A3 **accepted** with F1–F2 fixed; F3–F6 go to A4.
