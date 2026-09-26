# UI contract (Claude → Astra)

Every endpoint returns JSON. Errors are `{ "error": { "code", "message", "detail"? } }` with the HTTP status noted.
Cookies (`lab_device`, `lab_session`) are httpOnly and set by the server; the UI never reads them. All money actions
are signed in the user's wallet; the UI never sees a key. Demo/fixture data must never be shown as live.

## Read

| Method & path | Returns |
|---|---|
| `GET /api/meta` | `{ chains: [{id,name,family,swapEnabled}], cases: [{id,title,kind}], activeSeedHash }` |
| `GET /api/cases/:id?chain=<chainId|all>` | `{ case:{id,title,kind}, chainScope, pool:{id,version,hash,size,createdAt}|null, tierCounts:{micro,small,mid,large,top}, odds:{tier: basisPoints}, contents: AssetCard[] (≤32, rarest first) }`. `odds` is in basis points (10 000 = 100 %) and already renormalised over non-empty tiers. `pool:null` → show "this case is filling up". |
| `GET /api/assets/:id` | `AssetDetail` (below) |
| `GET /api/assets/:id/buys` | `{ items: [{at, maker, inputAmount, inputSymbol, outAmountMin, txHash, txUrl}] }`: confirmed buys made through Lockabox only (default tab "Buys via Lockabox") |
| `GET /api/feed` | `{ items: [{kind:'buy'|'pull', at, ref, who, assetId, symbol, chainId, tier, amount, inputSymbol}], stats: {rolls1h, buysToday, lastTopPullAt} }`. Only real events (LAB-AC-088). `kind:'pull'` ref = roll id (link to `/verify/<ref>`); `kind:'buy'` ref = tx hash. Empty list → hide the ticker/toasts, never show placeholders. |
| `GET /api/rolls/:id` | `{ roll: {id, caseId, poolId, clientSeed, nonce, tier, itemsHash, poolSize, filters, serverSeedHash, seedRevealed, createdAt}, asset: AssetDetail }` |
| `GET /api/rolls/:id/verify` | `{status:'pending', serverSeedHash, message}` or `{status:'verified'|'mismatch', serverSeed, serverSeedHash, hashMatches, recomputed:{tier,assetId}, recorded:{tier,assetId}}` |
| `GET /api/auth/me` | `{ user: null }` or `{ user: {id, clientSeed, nonce, points, wallets:[{family,address}]} }` |
| `GET /api/points` (signed in) | `{ balance, tasks: [{id,title,points,goal,daily,progress|null,claimed}] }`; 401 `sign_in_required` when signed out |

`AssetCard = { id, chainId, address, symbol, name, imageUrl, tier: 'micro'|'small'|'mid'|'large'|'top'|null, priceUsd, marketCap, liquidityUsd }`

`AssetDetail = AssetCard & { fdv, volume24h, change:{m5,h1,h6,h24}, pairAddress, dexId, pairCreatedAt, snapshotAt, stale, links:{dexscreener, explorer, websites[], socials[{platform,handle}]}, chart:{dexscreenerEmbed, geckoterminalEmbed}, swapEnabled, lockaboxBuys24h }`
- `stale:true` → price shown as "—" and swap disabled.
- Chart: iframe `chart.dexscreenerEmbed`; if it fails to load within 8 s or is null, use `chart.geckoterminalEmbed` (LAB §3.4, AC-089). Never draw our own chart from DEX Screener data. Keep their "Tracked by DEX Screener" footer; no DEX Screener logo of ours.
- No risk labels anywhere (LAB D3). Tiers are market-cap buckets (LAB option A): Micro < $100K · Small $100K–1M · Mid $1M–10M · Large $10M–100M · ★ Top > $100M.

## Commands

| Method & path | Body | Result |
|---|---|---|
| `POST /api/rolls` | `{ caseId, chain?: chainId|'all', filters?: { tiers?: Tier[], minLiquidityUsd?, minVolume24h?, maxAgeHours?, minAgeHours?, change24h?: 'up'|'down' } }` | 201 `{ roll: RollResult, asset: AssetDetail, reel: { winIndex, cards: AssetCard[] } }`. Errors: 422 `pool_too_small` (detail `{size,min}`), 409 `no_pool`, 429 `rate_limited` (anti-bot: ≥1 s between rolls; rolls are otherwise unlimited, never show a counter), 404 `case_not_found`. The reel is cosmetic: animate so `cards[winIndex]` stops under the marker. |
| `POST /api/auth/nonce` | `{ address }` (Solana) | `{ nonce, issuedAt, message }` → ask the wallet to `signMessage(message)` |
| `POST /api/auth/verify` | `{ address, nonce, issuedAt, signature }` (signature base58) | `{ userId }` + session cookie; 401 `sign_in_failed` |
| `POST /api/auth/logout` | — | `{ ok }` |
| `POST /api/swap/quote` | `{ assetId, amountSol: "0.05", slippageBps? }` | `QuoteView = { assetId, symbol, inputSymbol:'SOL', inputAmount, outAmount, outAmountMin, decimals|null, priceImpactPct, slippageBps, route: string[], lockaboxFee: 0, sellCheck:'passed' }`. 409 `swap_disabled` → show "View on DEX" only; 409 `sell_check_failed` → coin removed, tell the user and offer Roll again. |
| `POST /api/swap/build` | `{ assetId, amountSol, slippageBps?, userPublicKey, rollId? }` | 201 `{ tradeId, swapTransaction (base64 unsigned VersionedTransaction), lastValidBlockHeight, quote: QuoteView }` → deserialize with `VersionedTransaction.deserialize`, `wallet.sendTransaction(tx, connection)`, then PATCH the trade. |
| `PATCH /api/trades/:id` | `{ txHash, wallet }` | `{ ok, status:'submitted' }`; the worker marks it confirmed/failed on-chain. |
| `POST /api/tasks/:id/claim` | — | `{ taskId, points, balance }`; 409 `not_done` / `already_claimed` |

Amounts: `outAmount`/`outAmountMin` are raw integer strings; divide by `10**decimals` when `decimals` is not null.
Slippage default 300 bps; above 1000 bps ask for confirmation; max 4900.
