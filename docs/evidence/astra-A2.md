# Astra A2 evidence

Implemented the A2 UI in the paths assigned to Astra. No commit was created.

## Files

- `src/app/layout.tsx`: root metadata, Inter/JetBrains Mono/Caveat fonts, wallet providers and shared app shell.
- `src/app/page.tsx`: case route entry point.
- `src/app/verify/page.tsx`, `src/app/verify/[id]/page.tsx`: roll-id form and dynamic proof route.
- `src/app/earn/page.tsx`: points route entry point.
- `src/components/api.ts`: typed UI contract shapes, fetch/error helper, formatting helpers.
- `src/components/AppShell.tsx`, `LockyLogo.tsx`, `WalletProviders.tsx`: chrome, metadata/feed polling, chain selection, 18+ gate, wallet connect/SIWS, footer.
- `src/components/CaseWorkspace.tsx`, `RollReel.tsx`: case hero/tabs/filters, free roll, keyboard shortcut, reel animation, contents/odds, unboxed bar.
- `src/components/MarketView.tsx`: token header, official chart iframe toggle/fallback, Lockabox buys table, token info/copy/links.
- `src/components/SwapBox.tsx`, `ProofBox.tsx`: Solana quote/build/sign/submit flow and roll proof card.
- `src/components/VerifyRoll.tsx`, `fairBrowser.ts`: verify list/detail and WebCrypto HMAC/52-bit browser recomputation when canonical pool data is present.
- `src/components/EarnClient.tsx`: signed-in task list and claim flow.
- `src/styles/globals.css`: v11 dark tokens, density, rarity colours, focus states, responsive layouts and mobile sticky open button.
- `tests/e2e/fixtures/*.json`: small contract fixtures, including revealed-seed expected values.
- `tests/e2e/case.spec.ts`: four Playwright contract-intercepted tests.
- `playwright.config.ts`: `http://127.0.0.1:4310`, `pnpm dev`, Chrome channel.

## Contract endpoint usage

- `GET /api/meta`: shared app shell loads chains, cases and active seed hash; selected chain drives the case query.
- `GET /api/cases/:id?chain=...`: case pool metadata, contents preview, tier counts and basis-point odds.
- `POST /api/rolls`: sends case, chain and filter payload; maps `pool_too_small`, `no_pool`, and 429 messages; consumes the returned reel/result.
- `GET /api/assets/:id`: refreshes the rolled asset detail before rendering the market header, chart, rail and swap box.
- `GET /api/assets/:id/buys`: powers the default “Buys via Lockabox” table; empty response stays empty.
- `GET /api/feed`: shared shell polls every 15 seconds; only real feed items render in the ticker/sidebar and non-zero stats render in the case hero.
- `GET /api/rolls/:id` and `GET /api/rolls/:id/verify`: verify detail loads the committed fields and pending/revealed result.
- `GET /api/auth/me`: shared shell shows the signed-in points pill and `/earn` signed-in state.
- `POST /api/auth/nonce`, `POST /api/auth/verify`: SIWS flow signs the exact server message and encodes the signature with `bs58`.
- `GET /api/points`, `POST /api/tasks/:id/claim`: signed-in task loading and claims.
- `POST /api/swap/quote`: debounced SOL quote with default 3% slippage, max 49%, output decimals, route, zero fee and sell-check status.
- `POST /api/swap/build`: builds the unsigned VersionedTransaction; the client deserializes it and sends it through the connected wallet.
- `PATCH /api/trades/:id`: records wallet signature and renders pending/submitted Solscan status.
- `POST /api/auth/logout` is not called because the assigned UI has no sign-out control; no undocumented endpoint was added.

## Verification fixture calculation

Using Node `node:crypto` with server seed `astra-fixture-seed`, client seed `fixture-client`, nonce `7`, and the fixture pool, the expected commitment is:

`8c6664b8e4db9383ad2f34c9b4dfa847eb3500c197e3eeeffd53fc8765c0c803`

The 52-bit cursors select `micro`, asset id `1`. The same values are pasted into `tests/e2e/fixtures/verify.json`; the browser verifier uses WebCrypto HMAC-SHA256 and canonical tier/asset ordering when those optional fields are supplied.

## Checks

- `pnpm exec tsc --noEmit -p tsconfig.json --incremental false`: passed.
- `pnpm exec vitest run tests/unit`: passed, 3 files / 25 tests.
- `pnpm exec playwright test --list`: passed, 4 tests discovered.
- `pnpm lint`: not runnable because the repository has no `eslint.config.js|mjs|cjs`; this is outside Astra’s owned paths.
- Browser execution, real wallet signing, real iframe rendering, and live swap submission were not verified in the sandbox. The task explicitly notes that Claude runs the browser suite, and no network/live transaction was used.

## Requests for Claude

The current UI contract does not provide the canonical filtered pool items (`{ a, t }[]`) or the effective tier odds needed for an independent browser recomputation on the production verify page. The UI supports optional `items` and `odds` fields on the existing `GET /api/rolls/:id/verify` response and falls back to the contract’s revealed `status/hashMatches/recomputed` result when they are absent. Please extend an existing documented response (preferably `/api/rolls/:id/verify`, without inventing a new endpoint) with the exact stored filtered canonical items and basis-point odds so production can show the browser-side HMAC result, not only the server result.
