# Claude review of Astra A4 (en/vi UI, sponsor dashboard, `multiPrices`), 2026-09-27

Scope: commit `6741a8b` — `src/components/i18n.tsx` (EN + VI dictionary, error-code mapping), language cookie + server language,
legal pages in both languages, significant-digit prices, "price via DexPaprika" note, sponsor dashboard + CSV + form,
DexPaprika `multiPrices`, the full-screen reel + tier halo that landed in the same commit (`RollReel.tsx`, `globals.css`, `case.spec.ts`).

## How it was checked
- Fresh cloud container: Postgres 16 on 127.0.0.1:55442 (the embedded Postgres binary needs `libicuuc.so.60`, missing here; same
  port/credentials, no code change), Node 24.21, `pnpm install`, `pnpm db:migrate`, `pnpm db:test:prepare`, `next typegen`.
- Baseline on `6741a8b` before any change: typecheck clean · unit **39/39** · integration **41/41** · e2e **27/27**.
- Playwright uses the installed Google Chrome by default; `PW_EXECUTABLE=/opt/pw-browsers/chromium` now points it at another Chromium
  (containers without Chrome). Default behaviour on the owner's Mac is unchanged.
- Read every line of the VI dictionary against the glossary: hòm, mở hòm, lượt mở, điểm, nhiệm vụ, kiểm chứng, ví, trượt giá,
  thanh khoản, vốn hoá; sponsored label "Quảng cáo · Sponsored".

## Findings
| # | Sev | Finding | Status |
|---|---|---|---|
| F1 | high | `daily_cap` (10 invite rewards/day, 429) was mapped to "Complete the required fields" / "Hãy điền các trường bắt buộc". | Fixed: `dailyCap` "You've reached today's limit of invite rewards (10 a day)…" / "Bạn đã đạt giới hạn thưởng mời bạn bè hôm nay (10 lượt/ngày)…". e2e. |
| F2 | high | `locked` had no mapping, so a locked account saw the English server text. Worse, the server itself returned `insufficient_points` (sponsored open) and `too_old` (invite accept) for a locked account, so the UI said "not enough points". | Fixed server-side: `SponsorError('locked')` and `InviteError('locked')`, both 403 (contract updated); UI maps `locked` → "This account is locked…" / "Tài khoản này đang bị khoá…". Integration test asserts `code: 'locked'` for claim, sponsored open and invite accept. |
| F3 | med | `not_done` mapped to "Progress is checked when you claim" (a hint, not the error); `already_claimed` to the button label "Claimed"; `sign_in_required` to "Sign in with the sponsor wallet" on every page; `rate_limited` to the roll-only "one roll per second" (claims, invites, sponsor form get the generic 429 too). | Fixed: `taskNotDone`, `alreadyClaimed`, `signInFirst`, `rateLimited` ("try again in a minute"). The roll path keeps its own 429 copy. Added `bad_amount`, `quote_failed`. |
| F4 | med | `sell_check_failed` VI "Token này đã bị loại sau khi kiểm tra trước giao dịch" was vague; the meaning is "the test sale failed, the coin left every case". | Now "Bán thử không thành công nên token này đã bị gỡ khỏi mọi hòm. Hãy mở hòm khác." (no risk label, D3). |
| F5 | med | `locale === 'vi'` in `CaseWorkspace` never matched (`locale` is `vi-VN`), so the sound toggle and the contents dialog's close button stayed English in VI. `RollReel` used inline `lang === 'vi' ? … : …` strings. | All moved into the dictionary (`soundLabel/On/Off`, `close`, `reelOpening/Skip/Hint`). e2e in VI. |
| F6 | med | Case titles ("Trending", "New < 24h") and task titles come from the DB in English and were shown untranslated in VI. | `caseTitle()` / `taskTitle()` translate known ids and fall back to the API title for new ones. |
| F7 | med | "Hạng" was used for both Rank and Tier columns on Best pulls; "điểm" was used for "a point in [0,1)" on the verify page, clashing with points. | Rank → "Thứ hạng"; verify steps say "một số từ 0 đến 1". |
| F8 | low | Stiff or wrong VI copy: `sponsoredCaseIntro` said campaigns "đang được duyệt" (under review; EN says reviewed and live), `sponsorIntro` said campaigns were already approved, "Hòm đang được lấp đầy", "LƯỢT MỞ HOT", "Kiểm chứng roll", "Quay lại roll", nav "Roll"/"Best pulls" left in English, "snapshot cũ", "embed chính thức", "hàng ngày", "đơn vị raw". Footer repeated "not advice" twice (EN and VI). | Rewritten (see `i18n.tsx` VI block); footer "18+ · Random pick, not investment advice. Memecoins can go to zero." |
| F9 | low | Unused key `priceViaDexpaprikaVi`; hardcoded `aria-label="Invite link"`, `"SOL amount"`, link text "Explorer ↗". | Removed / moved to the dictionary. |
| F10 | low | VI legal copy (`src/content/legal.ts`) used "task", "roll", "Best pulls", "trang Verify". | Glossary terms (nhiệm vụ, lượt mở, Lượt mở nổi bật, trang Kiểm chứng). Wording only; still a draft for the lawyer. |
| F11 | med | `multiPrices` counted **1 credit per HTTP call**; DexPaprika bills one credit per token (up to 10 per call), so `creditsUsed` under-counted up to 10×. | `+= batch.length`. Unit tests: 2 tokens → 1 call, 2 credits; 23 tokens → calls of 10/10/3, 23 credits. (`worker/fallback.ts` already budgeted per token.) |
| F12 | low | e2e "tier-specific halo without a celebration overlay" asserted `.tier-celebration` count 0, a class that never exists, so it could not fail. | Now asserts the stage is back to `position: relative` after the reveal, the glow layer has `pointer-events: none`, and the result bar is visible. |

Found later in the session (while building A5), fixed in the A5 commit:

| # | Sev | Finding | Status |
|---|---|---|---|
| F13 | med | Switching language re-ran the case loader (effect depended on `t`) and **cleared the current pull**. | `t` read through a ref; e2e "switching language keeps the current pull on screen". |

## Full-screen reel and halo (tests in `tests/e2e/case.spec.ts`)
The UI matches the tests: while spinning, `.roll-stage` is `position: fixed; inset: 0` (full viewport, `body` scroll locked), with
"OPENING CASE" / "ĐANG MỞ HÒM", a skip button and the marker hint; on reveal it returns to the page. The winning card gets
`coin-halo` + `coin-halo-pulse` in its tier colour; `top-celebration` is only a glow animation on the stage (no overlay, no
confetti, no fake counters). Reduced motion reveals at once (global `prefers-reduced-motion` rule). No changes needed beyond F12.

## After the fixes
typecheck clean · unit **40/40** · integration **41/41** · e2e **29/29** (2 new VI tests: error codes `daily_cap`/`locked`/`not_done`;
sound toggle, close button, reel copy) · `pnpm build` green.

## Verdict
A4 **accepted** with F1–F12 fixed by Claude in this session. AC-076 (en/vi UI) → VERIFIED_LOCAL.
