# Pair-age presets and seven-day default

Owner request: add quick pair-age filters (<1h, <6h, <24h, <3d, <7d, <14d, <30d, All) and select <7d by default.

Implemented in CaseWorkspace, i18n copy and styles:
- First roll sends `maxAgeHours: 168` through the existing roll filter API.
- Presets update the custom-hours input; All clears only the age filter. Other filters remain selected.
- Visible next-roll age summary, pressed states, labelled controls and a mobile wrapping layout.
- Copy identifies trading-pair age, and explicitly labels the pool count, contents and preview odds as before user filters.
- Kept Trending as the initial case and retained existing case-specific restrictions and the server minimum-pool check. The UI never retries without the chosen filter when the pool is too small.
- Existing English-only UI retained.

Validation (2026-09-27):
- `pnpm typecheck` passed.
- `pnpm exec eslint src/components/CaseWorkspace.tsx src/components/i18n.tsx tests/e2e/case.spec.ts`: 0 errors; 4 pre-existing hook/ref warnings in unchanged effects.
- `pnpm exec playwright test tests/e2e/case.spec.ts -g 'pair age|pool_too_small' --workers=1`: 4 passed. Covers the default request, every preset and All, preservation of liquidity, custom hours, no automatic unfiltered retry, and 390px mobile horizontal fit. API responses are fixtures; these tests create no live rolls.
- `git diff --check` passed.
- In-app browser inspected against the live local server: all eight choices visible, <7d selected, custom hours 168, next-roll summary and before-filter pool count present.

Limitations: the existing API returns an unfiltered contents preview, now labelled explicitly. Age filtering still happens server-side at roll time. Ingestion/address-normalisation issues from the separate audit are not changed by this UI task. No database mutations, dependency changes, commits or deployment.
