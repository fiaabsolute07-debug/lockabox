# BUILD_STATUS

Updated 2026-09-27 by Claude. Statuses: SPEC · BUILT (code, no acceptance evidence) · PARTIAL · VERIFIED_LOCAL (test or live-local evidence) · NEEDS_OWNER (a human must act).

Totals: BUILT 10 · NEEDS_OWNER 4 · PARTIAL 14 · SPEC 8 · VERIFIED_LOCAL 53 (of 89)
| Case | Status | Evidence / note |
|---|---|---|
| LAB-AC-001 | PARTIAL | unit+integration+tsc+build+e2e green locally; CI workflow in .github/workflows/ci.yml, not run on a remote yet |
| LAB-AC-002 | VERIFIED_LOCAL | scripts/test-db.ts recreates and migrates; no down-migrations (forward-only by design) |
| LAB-AC-003 | BUILT | SIWS verify route; UI flow in A2 |
| LAB-AC-004 | SPEC | EVM sign-in not built (EVM chains are View-on-DEX only) |
| LAB-AC-005 | BUILT | nonce single-use + 5 min expiry in SQL; needs dedicated test |
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
| LAB-AC-018 | PARTIAL | gates are data-driven; per-gate config flag not yet exposed |
| LAB-AC-019 | VERIFIED_LOCAL | no risk fields in read models; e2e "no prohibited risk-label language" (tests/e2e/case.spec.ts) |
| LAB-AC-020 | VERIFIED_LOCAL | marketCapTier tests |
| LAB-AC-021 | VERIFIED_LOCAL | core.db.test: immutable trigger |
| LAB-AC-022 | PARTIAL | stale → price hidden + pool excluded; DexPaprika price fallback not implemented |
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
| LAB-AC-033 | VERIFIED_LOCAL | token header/rail live-local on real data + e2e (claude-review-A2.md) |
| LAB-AC-034 | VERIFIED_LOCAL | chart/buys/rail live-local + e2e (claude-review-A2.md) |
| LAB-AC-035 | VERIFIED_LOCAL | swap box with real Jupiter quotes live-local, fee 0, sell check shown (claude-review-A2.md) |
| LAB-AC-036 | BUILT | Solana wallet adapter in A2; EVM not built |
| LAB-AC-037 | BUILT | quote/build with fee guard (unit); real signing needs the owner |
| LAB-AC-038 | SPEC | EVM swap not built |
| LAB-AC-039 | VERIFIED_LOCAL | sell check before quote/build quarantines (code) + gate tests |
| LAB-AC-040 | BUILT | swap only on explicit build + wallet send (A2) |
| LAB-AC-041 | VERIFIED_LOCAL | server never receives keys; build returns unsigned tx |
| LAB-AC-042 | BUILT | confirmSubmitted via RPC; needs a real tx |
| LAB-AC-043 | VERIFIED_LOCAL | no fee param + fee guard tests |
| LAB-AC-044 | BUILT | clamp in service; UI confirm in A2 |
| LAB-AC-045 | VERIFIED_LOCAL | swap_disabled for non-Solana chains |
| LAB-AC-046 | PARTIAL | GET /api/rolls/:id/og renders (Inter, no referral link, no price/gain); share button + og meta in A3 |
| LAB-AC-047 | VERIFIED_LOCAL | 375×812: no horizontal overflow, OPEN CASE first (claude-review-A2.md) |
| LAB-AC-048 | VERIFIED_LOCAL | GEO_BLOCK_SWAP flag, off by default |
| LAB-AC-049 | VERIFIED_LOCAL | ledger tests |
| LAB-AC-050 | VERIFIED_LOCAL | no buy/transfer route; append-only trigger |
| LAB-AC-051 | VERIFIED_LOCAL | no points on swap (no code path) |
| LAB-AC-052 | VERIFIED_LOCAL | check constraint test |
| LAB-AC-053 | BUILT | getTokenAccountsByOwner on claim; needs a real wallet |
| LAB-AC-054 | PARTIAL | invites + invite-friend task, 3 distinct days + wallet, cap 10/day (tests/integration/r3.db.test.ts); UI in A3 |
| LAB-AC-055 | VERIFIED_LOCAL | unique wallet; accounts < 24 h cannot spend points (sponsors.db.test); invites accepted only by accounts < 24 h (r3.db.test) |
| LAB-AC-056 | VERIFIED_LOCAL | concurrent claim test |
| LAB-AC-057 | PARTIAL | GET /api/leaderboard: % since pull, real rolls, one per coin, opt-out anon (r3.db.test); UI in A3 |
| LAB-AC-058 | VERIFIED_LOCAL | per-route limiter on every write endpoint (src/lib/ratelimit.ts; limiter test in r3.db.test) |
| LAB-AC-059 | VERIFIED_LOCAL | sponsor create |
| LAB-AC-060 | VERIFIED_LOCAL | review requires txs + gates |
| LAB-AC-061 | BUILT | label in API; UI in A2 |
| LAB-AC-062 | VERIFIED_LOCAL | sponsored only with points |
| LAB-AC-063 | PARTIAL | tx hash recorded; on-chain deposit verification by admin |
| LAB-AC-064 | VERIFIED_LOCAL | one open per roll, unique redemption |
| LAB-AC-065 | VERIFIED_LOCAL | stops when used |
| LAB-AC-066 | SPEC | refund needs the vault job (off) |
| LAB-AC-067 | PARTIAL | fee tx recorded, verified manually by admin |
| LAB-AC-068 | BUILT | stats endpoint; UI not built |
| LAB-AC-069 | VERIFIED_LOCAL | kill switch at roll time test |
| LAB-AC-070 | VERIFIED_LOCAL | policy test |
| LAB-AC-071 | PARTIAL | chain flags; EVM gates missing |
| LAB-AC-072 | PARTIAL | data yes, swap no (spike R0) |
| LAB-AC-073 | VERIFIED_LOCAL | meta cases live |
| LAB-AC-074 | VERIFIED_LOCAL | cto case live |
| LAB-AC-075 | VERIFIED_LOCAL | new<24h case live |
| LAB-AC-076 | SPEC | en only for now |
| LAB-AC-077 | SPEC | not measured |
| LAB-AC-078 | PARTIAL | Terms/Privacy/Disclaimer/Sponsored policy drafted en+vi in src/content/legal.ts (DRAFT); pages in A3; lawyer review NEEDS_OWNER |
| LAB-AC-079 | NEEDS_OWNER | lawyer sign-off |
| LAB-AC-080 | PARTIAL | /api/health: worker late >10 min, DS/DexPaprika budget >80 %, swap failures >5 % (r3.db.test); owner must point an uptime checker at it |
| LAB-AC-081 | SPEC | runbooks not written |
| LAB-AC-082 | SPEC | no backups (local only) |
| LAB-AC-083 | SPEC | load test not run |
| LAB-AC-084 | PARTIAL | CSP + nosniff + frame-ancestors none + X-Frame-Options; no keys in code; pnpm audit: 2 moderate transitive via @solana/web3.js (uuid, stream-json), not reachable from our code; full review before LIVE |
| LAB-AC-085 | NEEDS_OWNER | wallet domain verification: owner |
| LAB-AC-086 | PARTIAL | most prohibitions covered, see mapping |
| LAB-AC-087 | NEEDS_OWNER | owner approval of staging |
| LAB-AC-088 | VERIFIED_LOCAL | feed only real rows; empty test |
| LAB-AC-089 | VERIFIED_LOCAL | DEX Screener embed + GeckoTerminal fallback; live candles from localhost (docs/evidence/img/chart-embeds-localhost.png); e2e fallback tests |
