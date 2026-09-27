# A5 (done by Claude, not Astra), 2026-09-27

Task: `docs/evidence/astra-A5.prompt.md`. The owner asked Claude to work alone this session, so A5 was built and tested by Claude;
there is no Astra report for it.

## What was built
| Item | Files | Tests |
|---|---|---|
| EVM wallets without a wallet SDK: EIP-6963 discovery (any injected wallet that announces itself: MetaMask, Rabby, Coinbase Wallet…), `window.ethereum` fallback, viem `createWalletClient({ transport: custom(provider) })`; follows `accountsChanged` / `chainChanged` | `src/components/EvmWallet.tsx`, `WalletProviders.tsx` | e2e `a5.spec.ts` |
| Wallet chooser in the header ("Solana wallet" → existing adapter modal; "EVM wallet" → announced wallets, or "No EVM wallet found") | `AppShell.tsx` (`WalletChooser`) | e2e |
| SIWE sign-in: `POST /api/auth/nonce { address, family: 'evm', chainId }` with the wallet's current chain; if it is not an enabled EVM chain from `/api/meta`, `wallet_switchEthereumChain` to Base (8453) first; `personal_sign` of the exact message; `POST /api/auth/verify`. User rejection (4001) is silent. Header shows the address of the wallet the account signed in with; sign out forgets both wallets | `AppShell.tsx` | e2e: bodies + `personal_sign` params; switch-to-Base; silent rejection; **real round trip** against the local API + DB with a throwaway key (same wallet → same account) |
| EVM buy box, only when the coin's chain is EVM and `asset.swapEnabled` (today all EVM chains are off, so users still see "View on DEX Screener"): amount in the chain coin (ETH/BNB/USDC) with quick amounts, slippage + >10 % confirmation, receive-at-least, route, **one line per `routeFees` entry** (e.g. "LIFI Fixed Fee 0.25 % · $0.0674"), "Lockabox fee 0", sell check, LI.FI note (en/vi) | `EvmSwapBox.tsx`, `SwapBox.tsx` routes by chain family | e2e |
| Buy flow: build with `userAddress` → switch the wallet to `evm.chainId` → if `approval`: send it, poll `eth_getTransactionReceipt` until mined (reverted → stop, nothing bought) → send `transaction` → `PATCH /api/trades/:id { txHash, wallet }` → "Swap submitted" + explorer link from `/api/meta` `explorerTxUrl`. Nothing is sent before the Buy click (AC-040) | `EvmSwapBox.tsx`, `EvmWallet.tsx` | e2e asserts the exact order `switch → send(approval to USDC) → receipt → send(swap to LI.FI diamond)`, gas/value passed through, PATCH body, no `eth_sendTransaction` after roll/quote |
| `/admin`: token (React state only: never storage, never URL; password field) + "your name" (`x-admin-actor`); overview; approve/reject with a required note (server error text shown, e.g. `gates: …`); killed coins with restore (reason); kill form; blocklist add/remove; lock/unlock user; audit log (latest 100). `robots: noindex, nofollow`; not linked from the public UI | `src/app/admin/page.tsx`, `AdminConsole.tsx` | e2e: 401 on a wrong token, overview renders, six writes with exact bodies + `Authorization` + `x-admin-actor`, token absent from storage/cookies/URL, robots meta |
| Every new string in en + vi | `i18n.tsx` | e2e (VI LI.FI note) |

## Found while doing A5
- Switching language re-ran the case loader (its effect depended on `t`), which **cleared the current pull**. Fixed with a ref;
  e2e "switching language keeps the current pull on screen".
- `tests/e2e/case.spec.ts` "a loaded DEX Screener embed…": advanced the fake clock 9 s before the iframe had loaded, so on a cold
  `next dev` the 8 s fallback fired (seen once in a cold run). Test now waits for the frame's `load` first. Product behaviour unchanged.
- The real SIWE test hits real routes that `next dev` compiles on first use; its first assertion waits up to 20 s.

## Not done / out of scope
- **WalletConnect** (mobile wallets without an injected provider): needs a WalletConnect/Reown project id from the owner.
- EVM swaps stay **off** (`chains.swap_enabled = false`, DECISIONS #10) until the owner decides; no real transaction was sent.
- An `approval` receipt is polled for up to 3 min; after that the user sees an error and can retry (the approval, if mined, is reused
  by the server's allowance check).

## Checks
typecheck clean · unit 40/40 · integration 41/41 · e2e 37/37 (also 37/37 from a cold `.next`; A5 file ×4 repeat 28/28) · build green.
