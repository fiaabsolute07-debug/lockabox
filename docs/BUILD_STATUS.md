# BUILD_STATUS

Updated 2026-09-27 by Claude (cloud session). Statuses: SPEC · BUILT (code, no acceptance evidence) · PARTIAL · VERIFIED_LOCAL (test or live-local evidence) · NEEDS_OWNER (a human must act).

Totals: BUILT 1 · NEEDS_OWNER 4 · PARTIAL 9 · SPEC 1 · VERIFIED_LOCAL 74 (of 89)
| Case | Status | Evidence / note |
|---|---|---|
| LAB-AC-001 | VERIFIED_LOCAL | GitHub Actions ci.yml on every push/PR (macOS): typecheck, unit, DB integration, lint, next build, Playwright e2e; green on this branch, e.g. run 36302762147 (e2e 39/39); lint config added (DECISIONS #11) |
| LAB-AC-002 | VERIFIED_LOCAL | scripts/test-db.ts recreates and migrates; no down-migrations (forward-only by design) |
| LAB-AC-003 | VERIFIED_LOCAL | SIWS nonce/verify (auth.db.test); e2e real round trip with a Wallet Standard wallet signing with a throwaway ed25519 key through the real wallet adapter, API and DB; same wallet → same account (tests/e2e/solana.spec.ts) |
| LAB-AC-004 | VERIFIED_LOCAL | SIWE (EIP-4361) nonce/verify, EOA + ERC-1271/6492 (tests/integration/auth.db.test.ts); UI: EIP-6963 wallet chooser, switch to Base when on an unsupported chain; e2e real round trip through the local API + DB with a throwaway key, same wallet → same account (tests/e2e/a5.spec.ts, claude-A5.md) |
| LAB-AC-005 | VERIFIED_LOCAL | nonce once, 5 min expiry, old nonce refused, issuedAt bound (tests/integration/auth.db.test.ts, Solana + EVM) |
| LAB-AC-006 | VERIFIED_LOCAL | chains table flags; integration uses them |
| LAB-AC-007 | VERIFIED_LOCAL | Astra A1 limiter/backoff tests; worker is the only caller |
| LAB-AC-008 | VERIFIED_LOCAL | A1 tests: 402 no retry |
| LAB-AC-009 | VERIFIED_LOCAL | no HTML parser/scraper in repo (grep) |
| LAB-AC-010 | VERIFIED_LOCAL | .env.example; no secrets committed |
| LAB-AC-011 | VERIFIED_LOCAL | docs/spikes/R0.md |
| LAB-AC-012 | NEEDS_OWNER | draft in docs/evidence/dexscreener-email-draft.md; owner sends |
| LAB-AC-013 | VERIFIED_LOCAL | live worker cycles |
| LAB-AC-014 | VERIFIED_LOCAL | live worker (paprika) |
| LAB-AC-015 | VERIFIED_LOCAL | live worker, ≤5 min refresh |
| LAB-AC-016 | VERIFIED_LOCAL | tests/unit/gates.test.ts + live 60 checks |
| LAB-AC-017 | VERIFIED_LOCAL | gates.test.ts |
| LAB-AC-018 | VERIFIED_LOCAL | LAB_DISABLED_GATES=liquidity,honeypot brings those assets back into pools; pre-trade sell check still runs (core.db.test) |
| LAB-AC-019 | VERIFIED_LOCAL | no risk fields in read models; e2e "no prohibited risk-label language" (tests/e2e/case.spec.ts) |
| LAB-AC-020 | VERIFIED_LOCAL | marketCapTier tests |
| LAB-AC-021 | VERIFIED_LOCAL | core.db.test: immutable trigger |
| LAB-AC-022 | VERIFIED_LOCAL | DEX Screener > 10 min stale → DexPaprika multi-price every 5 min within 80 % credit budget; both down → pool drops coins, price hidden (tests/integration/fallback.db.test.ts); UI note in A4 |
| LAB-AC-023 | VERIFIED_LOCAL | read models return only LAB fields |
| LAB-AC-024 | VERIFIED_LOCAL | filters in roll service + test |
| LAB-AC-025 | VERIFIED_LOCAL | pool_too_small test |
| LAB-AC-026 | VERIFIED_LOCAL | effectiveOdds test |
| LAB-AC-027 | VERIFIED_LOCAL | robinhood/arc pools built live |
| LAB-AC-028 | VERIFIED_LOCAL | guest roll test, no signature |
| LAB-AC-029 | VERIFIED_LOCAL | no payment route exists |
| LAB-AC-030 | VERIFIED_LOCAL | verify test after rotation |
| LAB-AC-031 | VERIFIED_LOCAL | 10 000-roll odds test |
| LAB-AC-032 | VERIFIED_LOCAL | pacing + concurrency tests |
| LAB-AC-033 | VERIFIED_LOCAL | result card fields: token header + rail + DEX Screener/explorer links, live-local on real data + e2e (claude-review-A2.md) |
| LAB-AC-034 | VERIFIED_LOCAL | disclaimer "Random pick, not investment advice. Memecoins can go to zero." in the footer of the roll screen and under the swap box (e2e ac.spec.ts) |
| LAB-AC-035 | VERIFIED_LOCAL | 18+ gate on first visit, rendered by the server until the lab_age cookie is set; confirmation remembered (e2e a4.spec.ts; claude-review-A2.md) |
| LAB-AC-036 | PARTIAL | Solana wallet adapter (A2); injected EVM wallets via EIP-6963 + viem, connect/sign-in/sign-out e2e (a5.spec.ts); WalletConnect needs a project id from the owner |
| LAB-AC-037 | BUILT | no platformFee in quote/build (unit fee guard), live Jupiter quotes; M: owner signs one small real swap |
| LAB-AC-038 | PARTIAL | EVM buy via LI.FI built + guarded, off by default (DECISIONS #10); approve exactly the amount, swap only after the approval is mined (server: unit swap-evm + integration swap-evm.db; UI: e2e call order in a5.spec.ts); M: owner decision + one real swap |
| LAB-AC-039 | VERIFIED_LOCAL | sell check before quote/build quarantines (code) + gate tests |
| LAB-AC-040 | VERIFIED_LOCAL | no build/sign after a roll or a quote; build only on the Buy click; Solana via a Wallet Standard wallet and EVM via EIP-1193 both asserted in e2e (solana.spec.ts, a5.spec.ts, ac.spec.ts); M (real signature) is the owner's staging check |
| LAB-AC-041 | VERIFIED_LOCAL | server never receives keys; build returns unsigned tx |
| LAB-AC-042 | PARTIAL | E: GET /api/trades/:id + the buy box follows submitted → confirmed/failed with the explorer link (e2e: EVM confirmed in a5.spec.ts, Solana failed in solana.spec.ts; integration swap-evm.db); M: one real tx by the owner |
| LAB-AC-043 | VERIFIED_LOCAL | no fee param + fee guard tests |
| LAB-AC-044 | VERIFIED_LOCAL | slippage 3 % default, confirmation above 10 %, clamp at 49 % (UI e2e ac.spec.ts); server clamps to 4900 bps |
| LAB-AC-045 | VERIFIED_LOCAL | swap_disabled for non-Solana chains |
| LAB-AC-046 | VERIFIED_LOCAL | OG image route (no referral link, no price/gain) + Share button (URL /verify/:id, no ref) + og:image meta; e2e a3.spec.ts |
| LAB-AC-047 | VERIFIED_LOCAL | 375×812: no horizontal overflow, OPEN CASE first (claude-review-A2.md) |
| LAB-AC-048 | VERIFIED_LOCAL | GEO_BLOCK_SWAP flag, off by default |
| LAB-AC-049 | VERIFIED_LOCAL | ledger tests |
| LAB-AC-050 | VERIFIED_LOCAL | no buy/transfer route; append-only trigger |
| LAB-AC-051 | VERIFIED_LOCAL | no points on swap (no code path) |
| LAB-AC-052 | VERIFIED_LOCAL | check constraint test |
| LAB-AC-053 | VERIFIED_LOCAL | hold task reads getTokenAccountsByOwner server-side; positive balance of a pulled mint only (tests/unit/points-hold.test.ts, real RPC response) |
| LAB-AC-054 | VERIFIED_LOCAL | invites + repeatable invite task, wallet + 3 distinct days, cap 10/day (r3.db.test) + ref capture/accept/invite card (e2e a3.spec.ts) |
| LAB-AC-055 | VERIFIED_LOCAL | unique wallet; accounts < 24 h cannot spend points (sponsors.db.test); invites accepted only by accounts < 24 h (r3.db.test) |
| LAB-AC-056 | VERIFIED_LOCAL | concurrent claim test |
| LAB-AC-057 | VERIFIED_LOCAL | % since pull, real rolls, one per coin, opt-out anon (r3.db.test) + /leaderboard page + hide toggle (e2e a3.spec.ts, live local) |
| LAB-AC-058 | VERIFIED_LOCAL | per-route limiter on every write endpoint (src/lib/ratelimit.ts; limiter test in r3.db.test) |
| LAB-AC-059 | VERIFIED_LOCAL | sponsor create |
| LAB-AC-060 | VERIFIED_LOCAL | review requires txs + gates |
| LAB-AC-061 | VERIFIED_LOCAL | Sponsored label in API and on every sponsored item in the UI (e2e a3.spec.ts); vi shows "Quảng cáo · Sponsored" on tab, badges and result (e2e a4.spec.ts) |
| LAB-AC-062 | VERIFIED_LOCAL | sponsored only with points |
| LAB-AC-063 | PARTIAL | approval checks the deposit tx on-chain: campaign token into SPONSOR_VAULT ≥ amount × opens; one tx per campaign (unit sponsor-verify with a real mainnet tx, sponsors.db.test); M: first real deposit by the owner |
| LAB-AC-064 | VERIFIED_LOCAL | one open per roll, unique redemption |
| LAB-AC-065 | VERIFIED_LOCAL | stops when used |
| LAB-AC-066 | SPEC | refund needs the vault job (off) |
| LAB-AC-067 | VERIFIED_LOCAL | approval checks the fee tx on-chain: USDC into SPONSOR_TREASURY ≥ SPONSOR_FEE_USDC; unset config = no approvals (unit sponsor-verify, sponsors.db.test) |
| LAB-AC-068 | VERIFIED_LOCAL | sponsor dashboard: own campaigns, stats (opens, unique wallets, sent, confirmed buys after start), CSV (e2e a4.spec.ts; stats numbers in sponsors.db.test) |
| LAB-AC-069 | VERIFIED_LOCAL | kill switch at roll time + audit_log (append-only), unkill, system quarantines audited (core.db.test, admin.db.test) |
| LAB-AC-070 | VERIFIED_LOCAL | policy test |
| LAB-AC-071 | VERIFIED_LOCAL | per-chain flags (AC-006); swap only on an enabled chain with its route configured, enforced by DB checks (migration 0012, swap-evm.db.test); sell check per family (Jupiter round trip / honeypot.is / LI.FI round trip); turning a chain on stays the owner's decision (RUNBOOKS §8) |
| LAB-AC-072 | PARTIAL | Robinhood + Arc: data yes; swap route via LI.FI verified live (quotes only), off until the owner enables it |
| LAB-AC-073 | VERIFIED_LOCAL | meta cases live |
| LAB-AC-074 | VERIFIED_LOCAL | cto case live |
| LAB-AC-075 | VERIFIED_LOCAL | new<24h case live |
| LAB-AC-076 | VERIFIED_LOCAL | en/vi dictionary for every UI string incl. legal pages, case/task titles and API error codes; server picks the language from cookie/Accept-Language (e2e a4.spec.ts, 6 tests; claude-review-A4.md) |
| LAB-AC-077 | VERIFIED_LOCAL | production build, emulated Slow 4G + 4× CPU, mobile: LCP median 1.76 s returning / 1.77 s first visit (was 4.76 s before the 18+ gate moved server-side); Fast 4G 0.74–0.78 s; roll service p95 4.3 ms sequential, 18 ms at 10 concurrent (claude-lcp-4g.md, scripts/lcp.ts, core.db.test); re-run on staging with live data |
| LAB-AC-078 | VERIFIED_LOCAL | Terms, Privacy, Disclaimer, Sponsored policy at /legal/[slug] in en + vi, draft notice, footer links (e2e a3/a4); lawyer sign-off is AC-079 |
| LAB-AC-079 | NEEDS_OWNER | lawyer sign-off |
| LAB-AC-080 | VERIFIED_LOCAL | /api/health alerts: worker late >10 min, DS/DexPaprika budget >80 %, swap failures >5 % (r3.db.test); pointing an uptime checker at it is the owner's ops step |
| LAB-AC-081 | PARTIAL | docs/RUNBOOKS.md (kill switch, sources, abuse, sponsor dispute, seed, backup, deploy) with local drills; staging drills NEEDS_OWNER |
| LAB-AC-082 | PARTIAL | scripts/backup.ts dump/restore; local drill: 23 tables/9 866 rows restored, hashes match, 28 FKs re-checked (claude-ops-drills.md); prod daily backups + PITR NEEDS_OWNER |
| LAB-AC-083 | PARTIAL | 1 000 concurrent: 0 errors; p95 507–658 ms with 2 instances on one laptop (target 500); re-run on staging (claude-ops-drills.md) |
| LAB-AC-084 | PARTIAL | CSP + nosniff + frame-ancestors none + X-Frame-Options; no keys in code; pnpm audit: 2 moderate transitive via @solana/web3.js (uuid, stream-json), not reachable from our code; full review before LIVE |
| LAB-AC-085 | NEEDS_OWNER | wallet domain verification: owner |
| LAB-AC-086 | VERIFIED_LOCAL | every LAB §0.4 rule has at least one case at VERIFIED_LOCAL (table below); AC-037 (one real Jupiter swap without platform fee) stays for the owner |
| LAB-AC-087 | NEEDS_OWNER | owner approval of staging |
| LAB-AC-088 | VERIFIED_LOCAL | feed only real rows; empty test |
| LAB-AC-089 | VERIFIED_LOCAL | DEX Screener embed + GeckoTerminal fallback; live candles from localhost (docs/evidence/img/chart-embeds-localhost.png); e2e fallback tests |

## Prohibitions → cases (AC-086, generated from the rows above)

| LAB §0.4 | Rule | Cases | Status |
|---|---|---|---|
| 0.4.1 | Roll is always free, no signature | AC-028, AC-029 | VERIFIED_LOCAL · VERIFIED_LOCAL |
| 0.4.2 | Points not sold, transferred or cashed out; only from tasks | AC-049, AC-050 | VERIFIED_LOCAL · VERIFIED_LOCAL |
| 0.4.3 | No reward for posting on X, no X API | AC-052 | VERIFIED_LOCAL |
| 0.4.4 | No HTML crawling, official APIs only | AC-009, AC-089 | VERIFIED_LOCAL · VERIFIED_LOCAL |
| 0.4.5 | No custody, user signs every swap | AC-040, AC-041 | VERIFIED_LOCAL · VERIFIED_LOCAL |
| 0.4.6 | No swap fee, quote shown as returned | AC-037, AC-043 | BUILT · VERIFIED_LOCAL |
| 0.4.7 | No pay-then-see-value case | AC-028, AC-040 | VERIFIED_LOCAL · VERIFIED_LOCAL |
| 0.4.8 | No promised returns anywhere | AC-070 | VERIFIED_LOCAL |
| 0.4.9 | No API proxy of raw provider data | AC-023 | VERIFIED_LOCAL |
| 0.4.10 | No fake FOMO | AC-088 | VERIFIED_LOCAL |

All ten rules have a case at VERIFIED_LOCAL. The only BUILT one left is AC-037 (a real Jupiter swap without platform fee), which needs one small swap signed by the owner.
