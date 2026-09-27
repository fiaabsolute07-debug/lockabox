# AC-077: LCP of the Cases page on emulated 4G, and server-side roll p95 (2026-09-27, Claude)

## Method
- Production build: `pnpm build && pnpm start` (next 16.3.5, 127.0.0.1:4310), Postgres 16 local.
- `scripts/lcp.ts`: Playwright Chromium + CDP. Each run is a new browser context (cold HTTP cache).
  `Network.emulateNetworkConditions` + `Emulation.setCPUThrottlingRate 4` (Lighthouse's mobile CPU factor):
  - **slow4g** = Chrome DevTools "Slow 4G": 1.44 Mbps down, 675 kbps up, 562.5 ms latency (150 ms RTT × 3.75).
  - **fast4g** = DevTools "Fast 4G": 8.1 Mbps down, 1.35 Mbps up, 165 ms latency.
  - LCP from a buffered `PerformanceObserver('largest-contentful-paint')`, read after `load` + network idle + 1.5 s, no input.
  - Mobile = 375×812 @2x touch; desktop = 1440×900. 5 runs per row. The server is warmed with one request first.
- Raw numbers: `docs/evidence/lcp-4g.json`. Re-run: `PW_EXECUTABLE=… pnpm exec tsx scripts/lcp.ts --url http://127.0.0.1:4310 --runs 5 --out docs/evidence/lcp-4g.json`.

## Result (target: LCP < 2.5 s)
| Network + CPU | Visitor | Viewport | LCP median | p75 | max | FCP | HTML done | Transfer | LCP element |
|---|---|---|---|---|---|---|---|---|---|
| Slow 4G, 4× CPU | returning (18+ confirmed) | mobile | **1.76 s** | 1.76 s | 1.77 s | 1.76 s | 0.60 s | 532 KB / 24 req | `h2` "Roll first, then inspect the market view" |
| Slow 4G, 4× CPU | first visit (18+ gate) | mobile | **1.77 s** | 1.78 s | 1.79 s | 1.77 s | 0.60 s | 533 KB / 25 req | same `h2` |
| Fast 4G, 4× CPU | returning | mobile | **0.74 s** | 0.76 s | 0.76 s | 0.74 s | 0.18 s | 533 KB / 25 req | same `h2` |
| Fast 4G, 4× CPU | first visit | mobile | **0.76 s** | 0.78 s | 0.78 s | 0.76 s | 0.17 s | 533 KB / 25 req | same `h2` |
| Fast 4G, 4× CPU | returning | desktop | **0.78 s** | 0.79 s | 0.80 s | 0.78 s | 0.18 s | 543 KB / 34 req | `h1` case title |

All rows pass. LCP = FCP everywhere: the largest element is server-rendered text, painted as soon as HTML + CSS + fonts arrive.

## Fixed on the way
The first measurement had **first visit, Slow 4G: LCP 4.76 s** (fail). The 18+ gate opened in a `useEffect`, i.e. only after the JS
bundle downloaded and hydrated, and its text became the LCP. The gate is now rendered by the server unless the `lab_age=1` cookie is
present (set on confirm; a confirmation stored before in localStorage sets the cookie on mount). e2e: "the 18+ gate is in the server
HTML on a first visit…" and "a confirmation stored before the cookie existed…" (`tests/e2e/a4.spec.ts`). Privacy text mentions the
two preference cookies (language, 18+). Known trade-off: on a slow network the gate's button only works once the page has hydrated
(about 4.7 s on Slow 4G + 4× CPU); before that a tap does nothing. Same interactivity as before, but the page no longer looks empty.

## Limits (be honest about what this is)
- This container cannot reach DEX Screener / DexPaprika (egress policy), so the local DB has **no market data**: the case shows
  "This case is filling up" instead of "N tokens in this pool…". No data was faked to get a number. Before a roll the above-the-fold
  content is text in both cases (token images only appear in the contents dialog and after a roll), so the LCP element is of the
  same kind; still, **re-run `scripts/lcp.ts` on staging with live data** (owner) before calling AC-077 staging-verified.
- Emulated throttling in Chromium, not a real phone. Headless Chromium build 1194 (`/opt/pw-browsers`).

## Server side: roll p95 < 300 ms
- New integration test (`tests/integration/core.db.test.ts` "roll latency"): 100-coin pool in the isolated test DB, 200 sequential
  rolls from distinct devices and 20 × 10 concurrent: **p50 2.5 ms, p95 4.3 ms sequential; p95 18.1 ms with 10 at a time** (service
  call incl. its transaction). The HTTP route measured earlier on `next start`: 23–25 ms per roll end to end (`claude-ops-drills.md`).
- Under 1 000 concurrent requests (AC-083) p95 was 507–658 ms on one laptop; that is the load-test case, re-run on staging.

Verdict: AC-077 **VERIFIED_LOCAL** (both parts), with the staging re-run noted above.
