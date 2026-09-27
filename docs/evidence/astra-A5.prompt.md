You are Astra, second engineer on Lockabox (~/Lockabox). Read docs/COLLABORATION.md, docs/UI_CONTRACT.md (sections "EVM buys",
"EVM sign-in", "Admin"), docs/DECISIONS.md #10 and the current UI (incl. your A4 i18n) before starting. Task **A5**.
Every string goes through the A4 dictionary in both en and vi. Keep all LAB §0 rules (no risk labels, no gain promises, no fake FOMO).

## Paths you may edit (and only these)
src/components/**, src/app/** except src/app/api/**, src/styles/**, tests/e2e/**, tests/unit/ui*.test.ts, playwright.config.ts,
docs/evidence/astra-A5.md. Do not commit. Need a dependency? Write the request in your report (Claude installs it); `viem` is
already installed and may be imported in client code.

## 1. EVM wallets: connect + sign in (AC-036, AC-004)
- No new wallet SDK: use the injected EIP-1193 provider (`window.ethereum`, EIP-6963 discovery for several wallets: MetaMask, Rabby,
  Coinbase Wallet extension…) with viem's `createWalletClient({ transport: custom(provider) })`. WalletConnect is out of scope (needs a
  project id from the owner): say so in the report.
- The wallet button becomes a small chooser: "Solana wallet" (existing adapter flow) / "EVM wallet". EVM: `eth_requestAccounts`,
  read `eth_chainId`; sign-in flow per the contract (`family: 'evm'`, `chainId` = the wallet's current chain; if that chain isn't an
  enabled EVM chain from `/api/meta` (chains now carry `evmChainId`, `nativeSymbol`, `explorerTxUrl`), ask to switch to Base 8453).
  `personal_sign` the exact `message`. Handle user rejection quietly.
- Signed-in state shows the short address of whichever wallet signed in. Sign out works for both.

## 2. EVM buy box (AC-038) — rendered only when `asset.swapEnabled` is true for an EVM coin
(Today every EVM chain has `swapEnabled: false`, so users keep seeing "View on DEX Screener"; build it anyway, tested with fixtures.)
- Amount in the chain coin (`quote.inputSymbol`: ETH / BNB / USDC on Arc) with quick amounts; slippage as today.
- Quote rows: receive at least, route, **every `routeFees` entry on its own line** ("LI.FI fee 0.25 %"), "Lockabox fee 0", sell check.
  Under the box: "Routed by LI.FI, an independent non-custodial service; Lockabox adds no fee." (+ vi).
- Buy: `POST /api/swap/build` with `userAddress`; if the wallet is on another chain, `wallet_switchEthereumChain` to `evm.chainId` first;
  if `evm.approval` is present, send it (`eth_sendTransaction`), wait for its receipt (poll `eth_getTransactionReceipt` through the wallet
  provider), then send `evm.transaction`; then `PATCH /api/trades/:id { txHash, wallet }`. Show pending/submitted with the chain's
  explorer link (`/api/meta` or asset links). Never send anything without the user's click; never auto after a roll (AC-040).

## 3. Admin page `/admin` (owner only)
- A token field (kept only in React state, never storage/URL) + "your name" field (sent as `x-admin-actor`).
- `GET /api/admin/overview`: pending campaigns with Approve/Reject (+ note) → `POST /api/admin/campaigns/:id/review`, showing the server's
  error text when the on-chain check fails; killed coins with Unkill; a Kill form (asset id + reason); blocklist add/remove; lock/unlock a
  user id; the audit log (latest 100). Every action asks for a reason. Not linked from the public UI; `noindex` metadata.

## 4. Review items from A4 (Claude will list any in claude-review-A4.md; fix those too if present when you start)

## 5. e2e with fixtures
EVM sign-in (mock `window.ethereum` in `addInitScript`: accounts, chainId, personal_sign → canned signature; assert nonce/verify bodies);
EVM buy with approval then swap (assert the order of `eth_sendTransaction` calls and the PATCH); route fee lines visible; admin page:
401 without token, overview renders, kill/unkill/review/lock send the right bodies and the `x-admin-actor` header. Keep all existing tests green.

## Checks (no network in your sandbox)
`pnpm exec tsc --noEmit -p tsconfig.json --incremental false` · `pnpm exec vitest run tests/unit` · `pnpm exec playwright test --list`.

## Report
docs/evidence/astra-A5.md: item → files → tests; not done; requests for Claude.
