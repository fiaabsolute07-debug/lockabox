# Shared token avatars — 2026-09-28

Owner authorized image ingestion/UI fixes, then expanded scope to every case, not just Discover.

- Preserve profile/boost/top/CTO icons on discovery; empty feed metadata does not erase an image.
- Keep the highest-liquidity market snapshot, but fill its missing image from another pair with the same chain + canonical base-token address. Never match by ticker; Solana remains case-sensitive.
- Shared TokenImage renders images in case contents, reel, reveal, unboxed bar, token header, sponsored cards, Hot Pulls and leaderboard; load errors fall back to initials and preserve rarity halos.
- Official GeckoTerminal multi-token endpoint is a secondary source, keyed by provider network/id/address. No arbitrary server-side image fetching, signing or transactions.
- Additive migration 0015 stores retry state. All canonical tokens on enabled mapped networks are candidates, independent of case membership. Recent snapshots receive priority. One batch of up to 30/minute under the existing ingest lock; six-hour empty-result cache and one-hour error backoff persist across restarts. Secondary requests have a 10s timeout; failure cannot fail normal ingest.
- Mapped secondary networks: Solana, Ethereum, Base, BSC, Arbitrum, Polygon, Avalanche, Optimism. Other chains still receive DEX Screener feed/pair images. No guessed network IDs or invented logos. This does not promise every token has an original logo upstream.
- Does not modify price fields, liquidity/honeypot gates, eligibility, odds or frozen proof history.

Validation: TypeScript passes after Next typegen; targeted ESLint passes; 59 unit/DB tests pass against isolated lockabox_ingest_fix_test. Four browser tests pass: valid avatar, failed-image fallback, ordinary roll, Discover/Trending selection. Browser tests mock all application API writes.

Local application: scoped files compared with the live working tree before copying; pre-apply copies preserved in the thread work/avatar-before-apply directory. Existing ingest fixes retained; unfinished wallet-flow staging not applied. Migration applied locally and prior worker gracefully restarted. First secondary batch: 29 images filled out of 30, zero lookup errors. Remaining tokens enrich gradually; images absent from all sources retain initials. No commit or deployment.

Provider reference: https://api.geckoterminal.com/docs/index.html
