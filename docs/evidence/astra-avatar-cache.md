# Avatar recovery and durable storage — 2026-09-28

Owner authorized the full image fix and supplied server-only Supabase Storage access. Secrets are in ignored .env.storage.local (0600), never frontend or Git. Rotate the exposed service-role key after handoff. No database move, deployment, commit or push in this task.

## Changes

- Shared TokenImage retries transient load failures twice, after 1.5s and 4s; URL/identity changes remount its state; cleanup prevents stale timers. Generated colored initials remain visible when no original logo exists, with an explicit placeholder title, keyed by asset identity where available.
- Secondary lookup now covers verified GeckoTerminal network mappings beyond the original eight. Robinhood/Arc and any other unmapped networks are not guessed. Match chain and address, never symbol.
- Additive migration 0016: per-asset cache queue, source/cached URL, byte size, state, failures, checked time, retry time, last error. Known broken/unsupported URLs join the secondary lookup queue.
- Server-only cache fetches from five explicit trusted CDN hosts, HTTPS only, no userinfo/custom ports/redirects. Streaming input capped at 512 KiB; raster signatures checked; SVG/HTML rejected. Unrecognized hosts are not fetched and are marked unsupported for later metadata fallback.
- Dedicated public bucket lockabox-token-avatars contains only token artwork; upload restricted to server credentials, image MIME types and 512 KiB/file. No broad anonymous upload policy added.
- Worker caches up to 20 logos/cycle, prioritizes recent market snapshots, retries failed sources with exponential delay capped at six hours, unsupported URLs daily, and refreshes successful sources weekly. Last cached image remains available during failures and while changed source metadata is being downloaded. A database trigger prevents snapshot/feed writes from overwriting a good cached URL.
- Stable object paths bound version growth; versioned public URLs refresh browser cache. Local accounting caps cached bytes at 128 MiB, stopping uploads on quota/storage errors. Bucket egress is still subject to the provider's normal plan limits.
- Normal discovery, market data, gates, odds and frozen proofs unchanged. Missing Storage configuration leaves source URLs intact.

## Checks

- 110 unit/integration tests pass against lockabox_ingest_fix_test, including malicious URL/format/size rejection, cached image preservation, broken URL fallback, and Storage failure.
- Six browser tests pass: retry recovery, retry cap, image render, broken-image placeholder, roll flow, Discover/Trending selection.
- TypeScript and targeted ESLint pass; no credentials in Git candidate files.

## Runtime / limitations

Local worker start: `node --env-file=.env.storage.local --import tsx worker/index.ts`. Only Storage uses Supabase; market database remains local. Run one worker; existing advisory lock protects overlapping restarts. Migration 0016 must precede this worker version on other environments.

Not a promise of 100% original logos. Sources may not publish artwork. No arbitrary token URI/IPFS fetching or unaudited chain metadata expansion; unsupported hosts/chains are recorded/left on their existing source path. Artwork already held in page state may need refresh to pick up a newly cached URL.

Useful read-only monitoring: `select state,count(*),sum(bytes) from asset_image_cache group by state;` and `select last_error,count(*) from asset_image_cache where last_error is not null group by last_error;`.
