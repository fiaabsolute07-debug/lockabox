# Decisions (ADR-lite)

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-09-27 | Raw SQL migrations + `postgres.js` instead of Drizzle (LAB §5 said Drizzle) | Same stack as Spaca, fewer moving parts; immutability/append-only enforced by triggers in SQL. |
| 2 | 2026-09-27 | Embedded PostgreSQL on 127.0.0.1:55442 for local dev/tests | No system Postgres on this machine; Spaca uses 55432. |
| 3 | 2026-09-27 | Empty tiers: odds renormalised over non-empty tiers (basis points, sum 10 000) | Simple, public, verifiable; LAB §7.2 allowed "rule public". |
| 4 | 2026-09-27 | The filtered pool is stored on each roll (`rolls.items`, `items_hash`) | Filters use live snapshots; storing the exact list keeps every roll recomputable. |
| 5 | 2026-09-27 | Solana honeypot gate = quote round trip (buy 0.01 SOL, quote selling it back, keep ≥ 50 %) | No wallet/signing needed. Limitation: transfer-time tricks (freeze authority) are not seen by quotes; the swap flow re-checks right before building and quarantines on failure. |
| 6 | 2026-09-27 | Honeypot gate required only on chains with in-app swap (Solana now) | EVM chains show "View on DEX" only until an EVM sell simulation exists. |
| 7 | 2026-09-27 | `symbol_blocklist` (stables, wrapped natives, non-meme majors) excluded from all pools | Review of the first live ingest found WETH/WBTC/UNI/ONDO in pools. |
| 8 | 2026-09-27 | Guests roll with an httpOnly device cookie; wallet sign-in (SIWS) only for points/tasks | LAB-AC-028: rolling needs no signature. |
| 9 | 2026-09-27 | Anti-bot pacing 1 roll/second per device/user, no daily cap | LAB D9 (unlimited rolls). |
