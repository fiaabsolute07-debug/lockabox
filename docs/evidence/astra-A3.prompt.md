You are Astra, second engineer on Lockabox (~/Lockabox). Read docs/COLLABORATION.md (rules), docs/UI_CONTRACT.md (especially
"R3–R6 additions"), docs/evidence/claude-review-A2.md ("Open items for A3") and the existing UI in src/components before you start.
Task **A3**: build the UI for Claude's C4 backend. Keep the v11 look (dense, dark, trustworthy tool; orange accent; Inter/JetBrains Mono).

## Paths you may edit (and only these)
- src/components/**
- src/app/** except src/app/api/**
- src/styles/**
- tests/e2e/** (fixtures included)
- tests/unit/ui*.test.ts
- playwright.config.ts
- docs/evidence/astra-A3.md (your report; create it)

Read-only for you: src/content/legal.ts (import it, don't edit), everything else. Do not commit. Requests for other paths go in your report.

## Hard rules (LAB_MASTER §0, never break)
- No risk labels, no "safe/scam/rug" wording. Tiers are market-cap buckets only.
- No fake FOMO: render only what the API returns; empty lists show an honest empty state, never placeholders.
- Sharing is never rewarded: share links/text must NOT contain `ref`/invite codes.
- Every sponsored item is labelled **Sponsored** (Vietnamese label later: "Quảng cáo · Sponsored"). Sponsored case opens with points only; never call `POST /api/rolls` with `caseId: 'sponsored'`.
- No wording that promises gains ("moon", "x100", "profit", "guaranteed"). Best pulls must say past pulls don't predict anything.

## Build
1. **Best pulls** page `/leaderboard` + sidebar nav item "Best pulls". `GET /api/leaderboard?window=24h|7d` with a 24H/7D toggle.
   Table: rank · coin (image or letter avatar, `displaySymbol`) · tier · price at pull → now · change % (green/red) · who · "Verify ↗" to `/verify/:rollId`.
   Line under the title: "Random pulls from real rolls. Past moves don't predict anything." Empty → "No pulls yet in this window".
2. **Account menu** on the wallet button when signed in: points, invite link shortcut, a toggle "Hide my wallet from Best pulls, feed and buys"
   (`POST /api/me/privacy`, initial value `user.hideFromBoard` from `/api/auth/me`), and **Sign out** (`POST /api/auth/logout`, then
   `refreshUser()` and `wallet.disconnect()`). Closes on outside click / Escape; keyboard accessible.
3. **Invites**:
   - On app load, if the URL has `?ref=<10 hex>`, store it in localStorage `lab_ref` (try/catch) and remove `ref` from the URL with `history.replaceState`.
   - When a user becomes signed in and `lab_ref` exists, call `POST /api/invites/accept {code}` once, then delete `lab_ref` on any HTTP response
     (keep it only on a network error). Show a small toast: accepted → "Invite linked"; `too_old`/`already_invited`/`self`/`bad_code` → no toast.
   - `/earn`: an "Invite friends" card: full link `${location.origin}${path}` with Copy, and stats from `GET /api/invites`
     (invited · rewarded · ready to claim · today rewardedToday/dailyCap) and the rule "Counts after your friend signs in and opens cases on 3 different days · max 10 a day".
     The `invite-friend` task row: Claim enabled when `progress > 0`; it is repeatable (never shows "Claimed"); map 429 `daily_cap` to its message.
4. **Share a pull**: "Share" button in the unboxed bar and on `/verify/:id`. Uses `navigator.share({ title, text, url })` when available, else
   copies the link and offers "Post on X" (`https://x.com/intent/post?text=…&url=…`). URL = `${origin}/verify/${rollId}`, text = `I unboxed $SYMBOL on Lockabox`.
   `/verify/[id]/page.tsx`: `generateMetadata` with `openGraph.images` and `twitter` (`summary_large_image`) = `/api/rolls/${id}/og`,
   `metadataBase` from `process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:4310'`. Check the Next 16 docs in node_modules/next/dist/docs
   (params is a Promise in Next 16).
5. **Sponsored case**: when `GET /api/sponsored/live` returns items, show a "Sponsored" tab after the free case tabs (hidden when empty).
   The panel lists the live drops (project, symbol, description, remaining opens, ends) each with a clear **Sponsored** badge, and one button
   "Open for {costPoints} pts" (signed out → "Sign in to open"). `POST /api/sponsored/open` → show the result card (Sponsored badge, symbol,
   tier, "Drop status: pending — sent to your wallet after the project's vault is verified", link to `/verify/:rollId`) and refresh points.
   Errors: `insufficient_points` → its message; `empty` → "No sponsored drops are live right now"; `needs_wallet` → "Sign in with a Solana wallet first".
6. **Legal pages** `/legal/[slug]` for `terms | privacy | disclaimer | sponsored` from `src/content/legal.ts` (use `en` for now; A4 adds vi).
   Show the title, "Last updated {updated}", and a visible "Draft — pending legal review" note when `status === 'draft'`. 404 for unknown slugs.
   Footer: links to all four + existing links. Keep the 18+ / not-advice line.
7. **Review leftovers**: set the wallet adapter modal/button font to our font (`.wallet-adapter-*`), so its Google Fonts stylesheet isn't needed
   (our CSP blocks it). Hide the "SPACE" hint on touch devices (`@media (hover: none)`).
8. **e2e** (Playwright, contract fixtures, extend `tests/e2e`): leaderboard renders rows + empty state + window switch; privacy toggle posts the
   right body; sign out calls logout; `?ref=` is stored, stripped from the URL, accepted once after sign-in (mock `/api/auth/me` to switch
   from null to a user); invite card shows the link and stats; share: X intent URL has no `ref`; sponsored tab hidden when empty and shown with
   the Sponsored badge when live, open shows the pending result; each legal page renders and the footer links work; `/verify/:id` HTML has
   `og:image` pointing at `/api/rolls/:id/og`. Keep all existing tests passing.

## Checks (no network in your sandbox)
- `pnpm exec tsc --noEmit -p tsconfig.json --incremental false`
- `pnpm exec vitest run tests/unit`
- `pnpm exec playwright test --list` (Claude runs the browser suite against the dev server and real DB)

## Report
docs/evidence/astra-A3.md: per item → files (file:line) → tests. List anything not done and any contract gaps.
