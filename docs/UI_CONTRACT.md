# UI contract (Claude → Astra)

Every endpoint returns JSON. Errors are `{ "error": { "code", "message", "detail"? } }` with the HTTP status noted.
Cookies (`lab_device`, `lab_session`) are httpOnly and set by the server; the UI never reads them. All money actions
are signed in the user's wallet; the UI never sees a key. Demo/fixture data must never be shown as live.

## Read

| Method & path | Returns |
|---|---|
| `GET /api/meta` | `{ chains: [{id,name,family,swapEnabled,evmChainId|null,nativeSymbol,explorerTxUrl|null ('…/tx/{tx}')}], cases: [{id,title,kind}], activeSeedHash }` |
| `GET /api/cases/:id?chain=<chainId|all>` | `{ case:{id,title,kind}, chainScope, pool:{id,version,hash,size,createdAt}|null, tierCounts:{micro,small,mid,large,top}, odds:{tier: basisPoints}, contents: AssetCard[] (≤32, rarest first) }`. `odds` is in basis points (10 000 = 100 %) and already renormalised over non-empty tiers. `pool:null` → show "this case is filling up". |
| `GET /api/assets/:id` | `AssetDetail` (below) |
| `GET /api/assets/:id/buys` | `{ items: [{at, maker, inputAmount, inputSymbol, outAmountMin, txHash, txUrl}] }`: confirmed buys made through Lockabox only (default tab "Buys via Lockabox") |
| `GET /api/feed` | `{ items: [{kind:'buy'|'pull', at, ref, who, assetId, symbol, chainId, tier, amount, inputSymbol}], stats: {rolls1h, buysToday, lastTopPullAt} }`. Only real events (LAB-AC-088). `kind:'pull'` ref = roll id (link to `/verify/<ref>`); `kind:'buy'` ref = tx hash. Empty list → hide the ticker/toasts, never show placeholders. |
| `GET /api/rolls/:id` | `{ roll: {id, caseId, poolId, clientSeed, nonce, tier, itemsHash, poolSize, filters, serverSeedHash, seedRevealed, createdAt}, asset: AssetDetail }` |
| `GET /api/rolls/:id/verify` | `{status:'pending', serverSeedHash, message}` or `{status:'verified'|'mismatch', serverSeed, serverSeedHash, hashMatches, recomputed:{tier,assetId}, recorded:{tier,assetId}, clientSeed, nonce, items:[{a,t}] (filtered pool, canonical order), odds:{tier: weight} (case odds before renormalising)}`. The browser recomputes from these and checks `sha256(JSON.stringify(items)) == itemsHash`. |
| `GET /api/auth/me` | `{ user: null }` or `{ user: {id, clientSeed, nonce, points, wallets:[{family,address}]} }` |
| `GET /api/points` (signed in) | `{ balance, tasks: [{id,title,points,goal,daily,progress|null,claimed}] }`; 401 `sign_in_required` when signed out |

`AssetCard = { id, chainId, address, symbol, name, imageUrl, tier: 'micro'|'small'|'mid'|'large'|'top'|null, priceUsd, marketCap, liquidityUsd }`

`AssetDetail = AssetCard & { fdv, volume24h, change:{m5,h1,h6,h24}, pairAddress, dexId, pairCreatedAt, snapshotAt, stale, links:{dexscreener, explorer, websites[], socials[{platform,handle}]}, chart:{dexscreenerEmbed, geckoterminalEmbed}, swapEnabled, lockaboxBuys24h }`
- `stale:true` → price shown as "—" and swap disabled.
- `priceSource: 'dexscreener' | 'dexpaprika'`: when `dexpaprika`, DEX Screener has been down > 10 min; show a small "price via DexPaprika" note next to the price (AC-022).
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

Every write endpoint is rate limited: 429 `rate_limited` → "too many requests, try again in a minute" (no counters shown).

## R3–R6 additions (2026-09-27)

| Method & path | Body / query | Result |
|---|---|---|
| `GET /api/auth/me` | — | `user` now also has `inviteCode` (10 hex chars) and `hideFromBoard` (boolean). |
| `GET /api/leaderboard?window=24h\|7d` | — | `{ window, items: [{rollId, at, assetId, chainId, symbol, imageUrl, tier, priceAtPull, priceNow, changePct, who}] }`, best first, ≤ 20, one row per coin. `who` is a short wallet or `"anon"`. Real rolls only; sponsored-case rolls excluded. Empty list → "No pulls yet", never placeholders. |
| `POST /api/me/privacy` (signed in) | `{ hideFromBoard: boolean }` | `{ hideFromBoard }` |
| `GET /api/invites` (signed in) | — | `{ code, path: '/?ref=<code>', invited, rewarded, claimable, rewardedToday, dailyCap: 10, daysRequired: 3 }` |
| `POST /api/invites/accept` (signed in) | `{ code }` | `{ ok: true }`; 404 `bad_code`, 409 `self` / `already_invited` / `too_old` (only accounts < 24 h can accept), 403 `locked`. |
| `POST /api/tasks/invite-friend/claim` | — | Same as other tasks; repeatable once per qualified friend. 409 `not_done`, 429 `daily_cap` (10 invite rewards per day). Any task claim: 403 `locked` when the owner locked the account. The task is never `claimed: true`; `progress` = friends ready to claim. |
| `GET /api/rolls/:id/og` | — | 1200×630 PNG share image (coin, tier, case, chain, verify link). Use it as `og:image`/`twitter:image` of `/verify/:id`. |
| `GET /api/health` | — | 200 `{status:'ok', …}` or 503 `{status:'degraded', alerts:[{code,message}], …}`. Ops only; the UI doesn't call it. |
| `GET /api/sponsored/live` | — | live sponsored drops (see route). Every item is labelled **Sponsored** (vi: **Quảng cáo · Sponsored**). |
| `POST /api/sponsored/open` (signed in) | — | 201 `{ rollId, redemptionId, campaignId, assetId, tier, amount, cost, serverSeedHash, nonce, sponsored: true, label: 'Sponsored', asset }`; 402-style errors via `error.code`: `insufficient_points` (also for accounts < 24 h), `empty`, `needs_wallet`, 403 `locked` (account locked by the owner). |

### Sponsor dashboard (AC-068), signed in with the sponsor's Solana wallet

| Method & path | Body | Result |
|---|---|---|
| `GET /api/sponsor/campaigns` | — | `{ items: [{id, projectName, status: 'pending_review'|'approved'|'rejected'|'ended', totalOpens, opensUsed, startsAt, endsAt, createdAt}] }` (own campaigns only) |
| `GET /api/sponsor/campaigns/:id` | — | `{ campaign: {id, project_name, status, total_opens, opens_used, starts_at, ends_at, amount_per_open}, stats: {opens, wallets, sent, buys} }`; 404 for someone else's campaign. CSV export is built client-side from this. |
| `POST /api/sponsor/campaigns` | `{ projectName (2–60), description (≤ 280), tokenAddress (Solana mint), amountPerOpen (raw integer string), totalOpens, startsAt, endsAt, feeTxHash?, depositTxHash? }` | 201 `{ id, status: 'pending_review' }`; 422 `policy` when the text promises returns/price moves; 400 `bad_input`. Copy on the form: "Reviewed before it goes live. Your token always shows as Sponsored and at its real market-cap tier." |

### EVM buys (DECISIONS #10; off until `chains.swap_enabled`, so `/api/meta` shows `swapEnabled: false` for EVM today)

- `POST /api/swap/quote` takes `amount` (in the chain's input coin: SOL, ETH, BNB, or USDC on Arc); `amountSol` still works for Solana.
- `QuoteView` now also has `provider: 'jupiter' | 'lifi'`, `inputSymbol` (any coin), `priceImpactPct: number | null` and
  `routeFees: [{name, percentage, amountUsd}]`. Show every route fee on its own line (e.g. "LI.FI fee 0.25 %") next to "Lockabox fee 0";
  never fold it into the price. Solana has `routeFees: []`.
- `POST /api/swap/build` for EVM: body `{ assetId, amount, slippageBps?, userAddress, rollId? }` →
  201 `{ tradeId, evm: { chainId, approval: EvmTx | null, transaction: EvmTx }, quote }` with `EvmTx = { to, data, value (hex), gasLimit (hex) | null, chainId }`.
  The wallet must be on `chainId` (ask it to switch). If `approval` is present, send it first (it approves exactly the amount), wait for it,
  then send `transaction`; then `PATCH /api/trades/:id { txHash, wallet }` as on Solana (hash `0x…64 hex`).
- **EVM sign-in (AC-004)**: `POST /api/auth/nonce { address, family: 'evm', chainId }` (the chain the wallet is on; any enabled EVM chain) →
  `{ nonce, issuedAt, message }` (EIP-4361); `personal_sign` the exact message; `POST /api/auth/verify { address, nonce, issuedAt, signature, family: 'evm', chainId }`.
  Smart wallets (ERC-1271/6492) work. Same wallet on any EVM chain = same account; `/api/auth/me` lists `{ family: 'evm', address (lowercase) }`.
- Copy under the EVM swap box: "Routed by LI.FI, an independent non-custodial service; Lockabox adds no fee."

### Admin (owner only; header `Authorization: Bearer <ADMIN_TOKEN>` + `x-admin-actor: <name>`)

| Method & path | Body | Result |
|---|---|---|
| `GET /api/admin/overview` | — | `{ pendingCampaigns: [...], killed: [{asset_id, chain_id, symbol, reason, actor, created_at}], audit: [{at, actor, action, target, detail}] }` |
| `POST /api/admin/campaigns/:id/review` | `{ decision: 'approve'|'reject', note }` | `{ id, status }`; approval needs fee + deposit tx and passed gates (`gates` error otherwise) |
| `POST /api/admin/kill` / `POST /api/admin/unkill` | `{ assetId, reason }` | `{ ok, assetId }` |
| `POST /api/admin/blocklist` | `{ symbol, op: 'add'|'remove', reason }` | `{ ok, symbol }` |
| `POST /api/admin/users/:id/lock` | `{ lock: boolean, reason }` | `{ ok, userId, locked }` |
401 `unauthorized` without the token. The admin page keeps the token only in memory (never localStorage, never a URL).

Invites: the invite link is `https://lockabox.fun/?ref=<code>`. The UI stores `ref` (localStorage `lab_ref`) and calls `POST /api/invites/accept` once right after the user signs in, then forgets it. **Share links for pulls never carry `?ref=`** (AC-046): sharing is not rewarded.
