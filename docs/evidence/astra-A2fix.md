# Astra A2-fix evidence

No commit was created. Changes are limited to the permitted UI, style, e2e, and evidence paths.

The referenced `docs/evidence/claude-review-A2.md` was not present in the workspace, so the authoritative findings in the task prompt were used.

## Findings

- F1 — Chart fallback: `src/components/MarketView.tsx:28-54` tracks the DEX iframe `onLoad`, waits eight seconds only when the DEX URL exists and has not loaded, preserves manual tab selection, and starts GeckoTerminal immediately when the DEX URL is null. Covered by the DEX-loaded timeout test and the null-DEX GeckoTerminal test in `tests/e2e/case.spec.ts:97-119`.
- F2 — Reveal timing: `src/components/CaseWorkspace.tsx:40-120` gates the unboxed bar, market view, buys, and right rail on reel settlement; `src/components/RollReel.tsx:6-50` handles reduced motion, keeps the latest settle callback in a ref, avoids callback-driven effect restarts, and supports click-to-skip. Covered by `tests/e2e/case.spec.ts:61-94`.
- F3 — Double roll: `src/components/CaseWorkspace.tsx:67-96` ignores Space from controls/editable elements, repeats, and open dialogs/modals, while the roll guard also blocks input during a spinning reel. Covered by the exact-one-POST test at `tests/e2e/case.spec.ts:88-96`.
- F4 — Symbols: `src/components/api.ts:235-238` adds `displaySymbol`; reel, contents, unboxed bar, ticker/sidebar, token header, swap box, proof box, and verify display use it at their respective component call sites. Covered by the `$WIF` no-`$$` test at `tests/e2e/case.spec.ts:120-130`.
- F5 — Ages: `src/components/api.ts:240-248` provides the shared minute/hour/day formatter, used by the case hero/stats in `src/components/CaseWorkspace.tsx:107-111` and the detailed token-header age in `src/components/MarketView.tsx:17-20`.
- F6 — Token rail: `src/components/MarketView.tsx:77-80` replaces Price SOL with Volume 24h and uses compact USD values with full `formatUsd` values on the metric `title` attributes; `src/components/api.ts:219-227` provides the compact/full formatting helpers.
- F7 — E2E: strict locators are scoped in `tests/e2e/case.spec.ts:52-59`; coverage was added for reduced/normal reveal timing, reel skip, one Space roll, loaded-chart retention, null-DEX fallback, and `$WIF` symbol normalization. The existing no-risk-label test remains at `tests/e2e/case.spec.ts:139-143`.

## Checks

- `pnpm exec tsc --noEmit -p tsconfig.json --incremental false` — passed.
- `pnpm exec vitest run tests/unit` — passed, 3 files / 25 tests.
- `pnpm exec playwright test --list` — passed, 11 tests discovered.

## Not run / blocked

- The full Playwright browser run was not executed in this sandbox; Claude’s workflow runs it against the dev server and real database. No additional request to Claude is needed.
