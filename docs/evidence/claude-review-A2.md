# Claude review of Astra A2 (UI) and A2-fix, 2026-09-27

Scope: `src/app/**` (non-api), `src/components/**`, `src/styles/**`, `tests/e2e/**`, `playwright.config.ts`, per `docs/UI_CONTRACT.md` and `docs/design-v11-reference.html`.

## How it was checked
- `pnpm typecheck` clean · `pnpm test` 25/25 · `pnpm test:integration` 24/24 · `pnpm build` green · `pnpm exec playwright test` **11/11** (contract fixtures, Chrome).
- Live local: embedded Postgres + ingest worker on real APIs + `next dev` on 127.0.0.1:4310, driven in the in-app browser at 1440×900 and 375×812.
  - Real rolls on Trending/Solana (51 coins): reel → reveal → token header, DEX Screener chart, rail, real Jupiter quotes
    (e.g. 0.05 SOL → 5,471.93 DOG via Raydium CLMM; SOL → Byreal → Manifest → STONK), sell check passed, Lockabox fee 0.
  - Proof box and `/verify/:id` show commitment, client seed, nonce, pool hash.
  - Mobile 375 px: no horizontal overflow (`scrollWidth == clientWidth`), OPEN CASE first, tabs scroll.
- Chart embeds (AC-089): headless Chrome gets "No data here" from both DEX Screener and GeckoTerminal (bot detection, same at top level),
  so headless screenshots can't prove the chart. A real Chrome window (off-screen) loading both embeds from `http://127.0.0.1:4310`
  shows live candles in both: `docs/evidence/img/chart-embeds-localhost.png`. No origin restriction on our side.

## Findings on A2 (all fixed in A2-fix unless noted)
| # | Finding | Fix |
|---|---|---|
| F1 | Chart switched to GeckoTerminal after 8 s even when DEX Screener had loaded (timer never cancelled). | Track iframe `onLoad`; fall back only without a load in 8 s or with no DEX URL. Verified live: DEX Screener stays after 9 s. |
| F2 | Result bar, market view and rail appeared while the reel was still spinning (spoils the pull). | Reveal gated on reel settle; OPEN CASE shows "REVEALING…"; click reel to skip; reduced motion reveals at once. Callback kept in a ref so the animation can't restart on re-render. |
| F3 | Space after clicking OPEN CASE rolled twice (focused button click + window shortcut) → second call 429. | Shortcut ignores buttons/links/inputs/repeat/open modals. e2e counts exactly one POST. |
| F4 | `$$WIF`: some DEX symbols already start with `$`. | `displaySymbol()` used everywhere. |
| F5 | "refreshed 0h ago". | Shared `formatAge` with minutes. |
| F6 | "Price SOL" always "—"; rail numbers truncated. | Volume 24h; compact USD with full value in `title`. |
| F7 | Two e2e tests failed on strict locators (`role=alert` also matches Next's route announcer). | Scoped locators + 7 new tests. |
| F8 | (Claude) e2e "roll flow" raced the 5 s reel against the 5 s default expect timeout. | Timeout 10 s on that assertion (Claude edited `tests/e2e/case.spec.ts:52`). |

## Contract change made by Claude during review (Astra's files touched, recorded here)
- `GET /api/rolls/:id/verify` now returns `clientSeed, nonce, items, odds` when revealed (Astra's A2 request). `src/components/api.ts`
  `VerificationResponse` fields made required; `src/components/VerifyRoll.tsx` also checks `sha256(JSON.stringify(items)) == itemsHash`
  in the browser (pool hash row). Fixtures `verify.json` / `roll-record.json` updated to real hashes. Integration test asserts the hash.

## Open items for A3
- The wallet adapter's stylesheet loads DM Sans from Google Fonts; our CSP blocks it (console error, harmless). Set the
  `.wallet-adapter-*` font to our font so nothing is requested from Google.
- "SPACE" hint shows on touch devices; hide it on `(hover: none)`.
- No sign-out control and no settings (hide wallet, invite link) yet → A3.

## Verdict
A2 + A2-fix **accepted**. Committed by Claude with the backend changes of the same session.
