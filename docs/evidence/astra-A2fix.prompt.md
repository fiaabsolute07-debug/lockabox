You are Astra, second engineer on Lockabox (~/Lockabox). Read AGENTS-style rules in docs/COLLABORATION.md first.
Task **A2-fix**: fix the findings from Claude's review of A2 (docs/evidence/claude-review-A2.md will list them; the list below is authoritative).

## Paths you may edit (and only these)
- src/components/**
- src/app/** except src/app/api/**
- src/styles/**
- tests/e2e/**
- playwright.config.ts
- docs/evidence/astra-A2fix.md (your report; create it)

Do NOT edit anything else (no docs/COLLABORATION.md, no package.json, no src/modules, no src/app/api). If you need a change elsewhere, write it as a request in your report. Do not commit.

## Note: Claude changed two of your files for a contract change (keep these changes)
- `GET /api/rolls/:id/verify` now always returns `clientSeed, nonce, items, odds` when revealed (see docs/UI_CONTRACT.md). `VerificationResponse` in src/components/api.ts has them as required fields.
- src/components/VerifyRoll.tsx now also checks `sha256(JSON.stringify(items)) === roll.itemsHash` (pool hash row). tests/e2e/fixtures/{verify,roll-record}.json were updated to match.

## Findings to fix
F1 (chart fallback, AC-089). `ChartEmbed` switches to GeckoTerminal after 8 s even when the DEX Screener iframe loaded. Track the iframe `onLoad`; fall back only if no load event within 8 s (or the embed URL is null). Manual tab switching stays.

F2 (reveal timing, CS:GO feel). The "YOU UNBOXED" bar, token header, chart, buys table and the right rail (TokenInfo, SwapBox, ProofBox) render immediately, while the reel is still spinning, which spoils the pull. Show them only after the reel settles (`prefers-reduced-motion: reduce` → reveal immediately). While a reel spins: OPEN CASE is disabled and Space does nothing. Clicking the spinning reel skips to the end (instant settle). CAREFUL: `RollReel`'s `useLayoutEffect` depends on `onSettled`; an inline callback would restart the animation on every render. Keep the latest callback in a ref and depend only on `cards`/`winIndex` (or a roll id).

F3 (double roll). After clicking OPEN CASE the button keeps focus; pressing Space fires the button click AND the window shortcut → two POST /api/rolls → second one 429. Ignore the shortcut when the event target is a button/link/input/select/textarea/contenteditable or when `event.repeat`, and when the age gate or any modal is open.

F4 (symbols). Some DEX symbols already start with `$` (e.g. `$WIF` shows as `$$WIF`). Add one `displaySymbol(asset)` helper in api.ts that strips a leading `$` and falls back to name/"TOKEN"; use it everywhere a `$` is prefixed (reel, contents grid, unboxed bar, buy buttons, ticker, sidebar, token header, swap box, proof box).

F5 (ages). `formatAge` shows "0h ago". Use: < 1 min "just now", < 60 min "Nm ago", < 24 h "Nh ago", else "Nd ago". One shared helper in api.ts, used by the case hero, stats line and token header (token header may keep "Nd Nh ago").

F6 (token rail). "Price SOL" is always "—": replace it with "Volume 24h" (`asset.volume24h`). Liquidity / FDV / Mkt cap / Volume are truncated in the rail: show compact USD ($42.7K, $107.4M, $1.2B) with the full value in a `title` attribute.

F7 (e2e). Two tests fail on strict mode: `getByRole('alert')` also matches Next's `#__next-route-announcer__`, and `$GLORP` matches several elements. Scope the locators (e.g. `.roll-error`, or the unboxed bar). Add tests:
  - reveal after settle: with `reducedMotion: 'reduce'` the unboxed bar appears right after the roll; with normal motion it is NOT visible 1 s after clicking and IS visible after the transition (use `page.clock` or wait for `.reel-strip.settled`).
  - Space after clicking OPEN CASE sends exactly one POST /api/rolls (count route hits).
  - chart: route `https://dexscreener.com/**` to a tiny HTML 200 page; after 9 s (use `page.clock.install()` + `runFor`) the iframe src is still dexscreener. With `chart.dexscreenerEmbed: null` in a fixture copy, the iframe is the GeckoTerminal URL.
  - `$$` never appears in the page text for a fixture whose symbol is `$WIF`.
  Keep the existing no-risk-label test.

## Checks to run (no network in your sandbox)
- `pnpm exec tsc --noEmit -p tsconfig.json --incremental false`
- `pnpm exec vitest run tests/unit`
- `pnpm exec playwright test --list` (Claude runs the browser suite against the dev server and real DB)

## Report
Write docs/evidence/astra-A2fix.md: each finding → what changed (file:line) → how it is tested. List anything you could not do.
