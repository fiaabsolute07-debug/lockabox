# Connect Wallet flow — 2026-09-28

- Header and both swap panels share one accessible native dialog.
- Detect injected EVM wallets (EIP-6963) and Solana Wallet Standard adapters.
- Connection and sign-in are separate explicit actions; never automatically sign or submit a transaction.
- Handle rejected signatures, unsupported EVM networks, disconnect/change wallet, and stale connection attempts.
- Account changes revoke the previous server session; failed revocation is shown without an automatic retry loop.
- No-extension/mobile guidance; QR WalletConnect is not implemented and is explicitly labeled unavailable.
- Nonce/verification routes enforce server-configured sign-in origin. Set `AUTH_ORIGIN` to the exact public HTTPS origin when deploying on a domain other than `https://lockabox.fun`. Local loopback origins include their port.
- Preserved current Locky logo and shared token avatars. No deploy or Git push performed in this wallet task.

## Validation

- TypeScript: passed; diff whitespace check passed.
- Targeted ESLint: no errors; six hook warnings remain.
- 116 unit/integration tests passed against isolated `lockabox_ingest_fix_test`, after applying missing repository migrations there only.
- 8 browser tests passed: EVM login/logout, account-change invalidation, mobile/no extension, network switch, signature rejection, EVM swap, disabled-chain swap, Solana connection/swap.
- Browser tests mock wallets/APIs; no real-wallet signing or on-chain transaction was performed. Real-DB browser sign-in tests were deliberately excluded.
