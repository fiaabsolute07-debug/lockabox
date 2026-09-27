You are Astra, second engineer on Lockabox (~/Lockabox). Read docs/COLLABORATION.md (rules), docs/UI_CONTRACT.md (all of it, including
"Sponsor dashboard" and `priceSource`), docs/evidence/claude-review-A3.md (findings F3–F6) and the current UI before starting.
Task **A4**. Keep the v11 look and every LAB §0 rule (no risk labels, no gain promises, no fake FOMO, sponsored always labelled, sharing never rewarded).

## Paths you may edit (and only these)
- src/components/**, src/app/** except src/app/api/**, src/styles/**
- src/modules/sources/** and tests/unit/sources*.test.ts (item 5 only)
- tests/e2e/**, tests/unit/ui*.test.ts, playwright.config.ts
- docs/evidence/astra-A4.md (your report; create it)
Read-only: src/content/legal.ts (it already has `en` and `vi`), everything else. Do not commit. Requests for other paths go in your report.

## 1. English / Vietnamese UI (AC-076)
- Every user-facing string in both languages via one small dictionary module (e.g. `src/components/i18n.ts`) and a `useT()` hook. No new dependency.
- Language: cookie `lab_lang` (`en` | `vi`, not httpOnly, 1 year, set by the switch). The root layout reads it (Next 16 `cookies()` is async)
  to set `<html lang>` and the initial language, so the server renders the right language (no flash, no hydration mismatch).
  No cookie → `Accept-Language` starting with `vi` → `vi`, else `en`. An EN/VI switch in the header; switching re-renders without a reload.
- Legal pages render `legal.ts` in the current language; the draft note is translated too.
- Sponsored label: English "Sponsored", Vietnamese **"Quảng cáo · Sponsored"** everywhere a sponsored item appears (AC-061, Luật Quảng cáo).
- Glossary (keep consistent): case = hòm · open case = mở hòm · pull = lượt mở · roll again = mở tiếp · points = điểm · task = nhiệm vụ ·
  verify = kiểm chứng · wallet = ví · connect wallet = kết nối ví · sign in = đăng nhập · slippage = trượt giá · liquidity = thanh khoản ·
  market cap = vốn hoá · volume = khối lượng · buy = mua · Best pulls = Best pulls (keep) · tiers stay Micro/Small/Mid/Large/Top.
  Disclaimer: "Chọn ngẫu nhiên, không phải lời khuyên. Memecoin có thể về 0." · 18+ gate: "Bạn đủ 18 tuổi?" / "Tôi đủ 18 tuổi".
  Best pulls line: "Lượt mở ngẫu nhiên từ roll thật. Biến động trong quá khứ không dự báo điều gì."
- Numbers and dates: `Intl` with `vi-VN` / `en-US` from the current language.
- API error messages come in English from the server; map the known `error.code`s you already handle to translated text; unknown codes may show the server text.

## 2. Prices (review F3)
One `formatPrice(usd)` helper: ≥ 1 → 2 decimals; < 1 → 4 significant digits (e.g. 0.01552 → $0.01552, 0.0000036407 → $0.000003641);
use it for every token price (rail, header, Best pulls, swap box). Keep compact USD for caps/liquidity/volume. Unit-test it in tests/unit/ui*.test.ts.

## 3. Price source note (AC-022)
When `asset.priceSource === 'dexpaprika'`, show a small muted note next to the price in the token header and rail: "price via DexPaprika" /
"giá từ DexPaprika". Nothing when `dexscreener`.

## 4. Sponsor dashboard `/sponsor` (AC-068)
Signed out → "Sign in with the sponsor wallet". Signed in: list of own campaigns (`GET /api/sponsor/campaigns`), each opening its stats
(`GET /api/sponsor/campaigns/:id`: opens, unique wallets, drops sent, buys after start) with **Export CSV** (client-side, one row per campaign
with those numbers + dates). A submit form (`POST /api/sponsor/campaigns`) with client checks mirroring the contract, the copy
"Reviewed before it goes live. Your token always shows as Sponsored and at its real market-cap tier.", and the server's `policy` error shown
as "Descriptions can't promise returns or price moves." Link it from the footer ("For projects" / "Dành cho dự án"). No sponsor sees another's data.

## 5. DexPaprika multi-price in the sources module (review F6)
Add `multiPrices(network: string, tokens: string[]): Promise<{ address: string; priceUsd: number | null; lastUpdated: string | null }[]>` to the
DexPaprika client: `GET /networks/{network}/multi/prices?tokens=a,b,…` (max 10 tokens per call; split larger lists), zod-validated, through the
existing limiter/retry, `Authorization` header when an API key is set. Unit test from `tests/fixtures/dexpaprika/multi-prices.json` (real
response, 2 Solana tokens). Claude will switch `worker/fallback.ts` to it afterwards.

## 6. e2e
Language switch (EN → VI changes the OPEN CASE button, footer disclaimer and a legal page; cookie set; reload keeps VI; `<html lang="vi">`);
Accept-Language vi default; sponsored label in VI; formatPrice on the rail; DexPaprika note shown only for `priceSource: 'dexpaprika'`;
sponsor dashboard list/stats/CSV download/submit + policy error. Keep all 19 existing tests passing (update their fixtures if needed).

## Checks (no network in your sandbox)
`pnpm exec tsc --noEmit -p tsconfig.json --incremental false` · `pnpm exec vitest run tests/unit` · `pnpm exec playwright test --list`.
Claude runs the browser suite and the Vietnamese copy review.

## Report
docs/evidence/astra-A4.md: item → files (file:line) → tests; anything not done; contract gaps.
