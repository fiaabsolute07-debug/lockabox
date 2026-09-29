import { KNOWN_CHAINS } from '@/modules/sources/chains';
import type postgres from 'postgres';
import { buildPool, CHAIN_SCOPE_ALL, listCases } from '@/modules/cases/pools';
import { liquidityGate, recordGate, solanaHoneypotGate } from '@/modules/gates';
import { evmSellGate, SellCheckUnavailable, type SwapProvider } from '@/modules/gates/evm';
import { evmProbe } from '@/modules/swap/service';
import { activeSeed, rotateSeed } from '@/modules/rolls/service';
import { confirmSubmitted } from '@/modules/swap/service';
import { paprikaPriceFallback } from './fallback';
import { discoverNewPools, type Discovered } from './discovery';
import { enrichAssets } from './enrichment';
import { tokenImageUrl } from '@/modules/sources/images';
import { enrichImages } from './images';
import { cacheAvatars } from './image-cache';
import {
  createDexPaprikaClient, createDexScreenerClient, pairsToAssets,
  type AssetSnapshot, type DexPaprikaClient, type DexScreenerClient,
} from '@/modules/sources';

/**
 * One ingest cycle (LAB §7.1). Server-side only; user requests never call a provider (LAB §3.5).
 * discover (feeds + budget-paced paginated new pools) → separate refresh/hydration queues (30 tokens/call)
 * → hidden gates → freeze pools → confirm trades → rotate the seed daily.
 */

export type IngestDeps = { sql: postgres.Sql; ds?: DexScreenerClient; dp?: DexPaprikaClient; log?: (m: string) => void; now?: () => Date };
const HONEYPOT_RECHECK_H = 6;
// A Solana probe uses two quote requests; 20 probes leaves room under our 60/min provider ceiling.
const MAX_HONEYPOT = 20;
const TOP_METAS = 3;

async function enabledChains(sql: postgres.Sql) {
  return sql<{ id: string; family: string; dexpaprika_id: string | null }[]>`select id, family, dexpaprika_id from chains where enabled order by sort`;
}

export async function upsertDiscovered(sql: postgres.Sql, found: Discovered[], enabled: Set<string>) {
  const rows = found.filter((f) => enabled.has(f.chainId) && f.address);
  for (const f of rows) {
    await sql`
      insert into assets (chain_id, address, sources, discovered_pair_at, image_url) values (${f.chainId}, ${f.address}, ${[f.source]}, ${f.pairCreatedAt ?? null}, ${tokenImageUrl(f.imageUrl)})
      on conflict (chain_id, address) do update
        set sources = (select array(select distinct unnest(assets.sources || excluded.sources))),
          discovered_pair_at = greatest(assets.discovered_pair_at, excluded.discovered_pair_at),
          image_url = coalesce(nullif(assets.image_url, ''), excluded.image_url)`;
  }
  return rows.length;
}

export async function saveSnapshots(sql: postgres.Sql, snaps: AssetSnapshot[], enabled: Set<string>) {
  let n = 0;
  for (const s of snaps) {
    if (!enabled.has(s.chainId)) continue;
    const [a] = await sql<{ id: number }[]>`
      insert into assets (chain_id, address, symbol, name, image_url) values (${s.chainId}, ${s.address}, ${s.symbol}, ${s.name}, ${s.imageUrl})
      on conflict (chain_id, address) do update set symbol = excluded.symbol, name = excluded.name, image_url = coalesce(excluded.image_url, assets.image_url)
      returning id`;
    await sql`
      insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, fdv, liquidity_usd, volume_24h, change_m5, change_h1, change_h6, change_h24,
                                   pair_address, dex_id, pair_created_at, boosts_active, dexscreener_url, websites, socials, price_source)
      values (${a.id}, now(), ${s.priceUsd}, ${s.marketCap}, ${s.fdv}, ${s.liquidityUsd}, ${s.volume24h}, ${s.priceChange.m5}, ${s.priceChange.h1},
              ${s.priceChange.h6}, ${s.priceChange.h24}, ${s.pairAddress}, ${s.dexId}, ${s.pairCreatedAt}, ${s.boostsActive}, ${s.dexscreenerUrl},
              ${sql.json(s.websites)}, ${sql.json(s.socials as never)}, 'dexscreener')
      on conflict (asset_id) do update set taken_at = excluded.taken_at, price_usd = excluded.price_usd, market_cap = excluded.market_cap, fdv = excluded.fdv,
        liquidity_usd = excluded.liquidity_usd, volume_24h = excluded.volume_24h, change_m5 = excluded.change_m5, change_h1 = excluded.change_h1,
        change_h6 = excluded.change_h6, change_h24 = excluded.change_h24, pair_address = excluded.pair_address, dex_id = excluded.dex_id,
        pair_created_at = excluded.pair_created_at, boosts_active = excluded.boosts_active, dexscreener_url = excluded.dexscreener_url,
        websites = excluded.websites, socials = excluded.socials, price_source = 'dexscreener'`;
    await recordGate(Number(a.id), 'liquidity', liquidityGate(s.liquidityUsd), sql);
    n++;
  }
  return n;
}

async function discover(deps: Required<Pick<IngestDeps, 'sql' | 'ds' | 'dp' | 'log'>>, enabled: Set<string>, chains: { id: string; dexpaprika_id: string | null }[]) {
  const { sql, ds, dp, log } = deps;
  const found: Discovered[] = [];
  const settle = async <T>(label: string, p: Promise<T>) => p.catch((e) => { log(`discover ${label} failed: ${(e as Error).message}`); return null; });
  const [profiles, boosts, top, cto, metas] = await Promise.all([
    settle('profiles', ds.tokenProfilesLatest()), settle('boosts', ds.tokenBoostsLatest()), settle('top', ds.tokenBoostsTop()),
    settle('cto', ds.communityTakeoversLatest()), settle('metas', ds.metasTrending()),
  ]);
  // Any chain DEX Screener lists is welcome (owner request): unknown ids in the feeds become enabled, swap-off chains.
  const feedChains = [...(profiles ?? []), ...(boosts ?? []), ...(top ?? []), ...(cto ?? [])].map((x) => x.chainId);
  for (const id of await registerChains(sql, feedChains, enabled)) { enabled.add(id); log(`new chain from DEX Screener feeds: ${id}`); }
  for (const p of profiles ?? []) found.push({ chainId: p.chainId, address: p.tokenAddress, source: 'ds:profile', imageUrl: p.icon });
  for (const b of boosts ?? []) found.push({ chainId: b.chainId, address: b.tokenAddress, source: 'ds:boost', imageUrl: b.icon });
  for (const b of top ?? []) found.push({ chainId: b.chainId, address: b.tokenAddress, source: 'ds:top', imageUrl: b.icon });
  for (const c of cto ?? []) found.push({ chainId: c.chainId, address: c.tokenAddress, source: 'ds:cto', imageUrl: c.icon });
  let metaSnaps = 0;
  const topMetas = (metas ?? []).slice(0, TOP_METAS);
  for (const m of topMetas) {
    const detail = await settle(`meta ${m.slug}`, ds.meta(m.slug));
    const snaps = pairsToAssets(detail?.pairs ?? []);
    metaSnaps += await saveSnapshots(sql, snaps, enabled);
    for (const s of snaps) { found.push({ chainId: s.chainId, address: s.address, source: 'ds:meta' }); found.push({ chainId: s.chainId, address: s.address, source: `ds:meta:${m.slug}` }); }
  }
  // Meta tokens still feed Discover, but meta cases no longer get their own tab (DECISIONS #19).
  const upserted = await upsertDiscovered(sql, found, enabled);
  const discovery = await discoverNewPools(sql, dp, chains, enabled, upsertDiscovered, log);
  return { upserted: upserted + discovery.found, metaSnaps, paprika: discovery.found, pages: discovery.pages };
}

/** Registers DEX Screener chain ids we have not seen before (enabled, swap off). Returns the ids it added. */
export async function registerChains(sql: postgres.Sql, ids: string[], known: Set<string>) {
  const fresh = [...new Set(ids)].filter((id) => /^[a-z0-9][a-z0-9_-]{1,31}$/.test(id) && !known.has(id));
  const added: string[] = [];
  for (const id of fresh) {
    const k = KNOWN_CHAINS[id];
    const name = k?.name ?? id.replace(/(^|[-_])(\w)/g, (_m, sep: string, c: string) => `${sep ? ' ' : ''}${c.toUpperCase()}`);
    // A chain the owner switched off stays off: `do nothing` keeps its row as it is.
    const [row] = await sql`insert into chains (id, name, family, enabled, swap_enabled, sort) values (${id}, ${name}, ${k?.family === 'evm' ? 'evm' : 'other'}, true, false, 900)
                            on conflict (id) do nothing returning id`;
    if (row) added.push(id);
  }
  return added;
}

async function honeypots(sql: postgres.Sql, log: (m: string) => void, fetchImpl: typeof fetch = fetch) {
  // Solana always (its pools need the gate); EVM chains only once in-app swap is switched on for them (DECISIONS #6/#10).
  const due = await sql<{ id: number; address: string; family: string; evm_chain_id: number | null; native_decimals: number; swap_provider: SwapProvider | null }[]>`
    select a.id, a.address, ch.family, ch.evm_chain_id, ch.native_decimals, ch.swap_provider from assets a
    join chains ch on ch.id = a.chain_id
    join asset_snapshots s on s.asset_id = a.id
    join gate_results l on l.asset_id = a.id and l.gate = 'liquidity' and l.passed
    left join gate_results h on h.asset_id = a.id and h.gate = 'honeypot'
    where (a.chain_id = 'solana' or (ch.family = 'evm' and ch.swap_enabled and ch.evm_chain_id is not null))
      and a.merged_into is null and ch.enabled and not exists(select 1 from moderation m where m.asset_id=a.id)
      and s.taken_at > now() - interval '15 minutes'
      and (h.checked_at is null or h.checked_at < now() - make_interval(hours => ${HONEYPOT_RECHECK_H}))
      and not exists (select 1 from sell_check_skips k where k.asset_id = a.id and k.checked_at > now() - make_interval(hours => ${HONEYPOT_RECHECK_H}))
    order by h.checked_at nulls first, s.liquidity_usd desc limit ${MAX_HONEYPOT}`;
  let checked = 0, failed = 0;
  for (const d of due) {
    try {
      const out = d.family === 'solana'
        ? await solanaHoneypotGate(d.address, fetchImpl)
        : await evmSellGate(d.evm_chain_id!, d.address, evmProbe(d.native_decimals), fetchImpl, d.swap_provider);
      await recordGate(Number(d.id), 'honeypot', out, sql);
      checked++; if (!out.passed) failed++;
    } catch (e) {
      const message = (e as Error).message;
      // No verdict (no Uniswap pool path, API timeout): park it for a while instead of retrying it first every cycle.
      if (e instanceof SellCheckUnavailable && !e.retryable) await sql`insert into sell_check_skips (asset_id, reason) values (${d.id}, ${message})
        on conflict (asset_id) do update set reason = excluded.reason, checked_at = now()`;
      log(`honeypot ${d.address} deferred: ${message}`);
      if (/429|rate.?limit/i.test(message)) break; // leave unknown gates unknown; retry on a later cycle
    }
    await new Promise((r) => setTimeout(r, 1100)); // stay well inside the free tiers (Jupiter, honeypot.is, LI.FI)
  }
  return { checked, failed };
}

async function pools(sql: postgres.Sql, chains: { id: string }[]) {
  const cases = (await listCases(sql)).filter((c) => !c.cost_points);
  const out: string[] = [];
  for (const c of cases) {
    for (const scope of [CHAIN_SCOPE_ALL, ...chains.map((ch) => ch.id)]) {
      const p = await buildPool(c, scope, sql);
      if (p && scope === CHAIN_SCOPE_ALL) out.push(`${c.id}/${scope}=v${p.version}(${p.size})`);
    }
  }
  return out;
}

/** Counts outbound calls per provider so /api/health can alert before a free budget runs out (AC-080). */
export function countingFetch(counter: { n: number }, base: typeof fetch = fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => { counter.n++; return base(input, init); }) as typeof fetch;
}

/** Old pool versions nobody rolled on are dropped after a day; the latest version of every case/scope is kept. */
export async function prunePools(sql: postgres.Sql, keepHours = 24) {
  const gone = await sql`
    delete from case_pools p
    where p.created_at < now() - make_interval(hours => ${keepHours})
      and not exists (select 1 from rolls r where r.pool_id = p.id)
      and p.version < (select max(version) from case_pools q where q.case_id = p.case_id and q.chain_scope = p.chain_scope)
    returning p.id`;
  return gone.length;
}

/** A dedicated connection holds the session lock; never lock/unlock different pooled connections. */
export async function runCycle(deps: IngestDeps) {
  const connection = await deps.sql.reserve();
  let locked = false;
  try {
    const [row] = await connection<{ locked: boolean }[]>`select pg_try_advisory_lock(hashtext('lockabox:ingest')) as locked`;
    locked = row.locked;
    if (!locked) {
      (deps.log ?? ((m: string) => console.log(`[worker] ${m}`)))('cycle skipped: another worker owns ingest');
      return { skipped: true as const };
    }
    return await runLockedCycle(deps);
  } finally {
    try { if (locked) await connection`select pg_advisory_unlock(hashtext('lockabox:ingest'))`; }
    finally { connection.release(); }
  }
}

async function runLockedCycle(deps: IngestDeps) {
  const log = deps.log ?? ((m: string) => console.log(`[worker] ${m}`));
  const calls = { ds: { n: 0 }, dp: { n: 0 }, jup: { n: 0 } };
  const ds = deps.ds ?? createDexScreenerClient({ fetch: countingFetch(calls.ds) });
  const dp = deps.dp ?? createDexPaprikaClient({ apiKey: process.env.DEXPAPRIKA_API_KEY || undefined, fetch: countingFetch(calls.dp) });
  const { sql } = deps;
  const started = new Date();
  try {
    const chains = await enabledChains(sql);
    const enabled = new Set(chains.map((c) => c.id));
    const t0 = Date.now();
    const d = await discover({ sql, ds, dp, log }, enabled, chains);
    const e = await enrichAssets(sql, ds, enabled, saveSnapshots, log);
    const fb = await paprikaPriceFallback(sql, { fetchImpl: countingFetch(calls.dp), log, paprikaKey: !!process.env.DEXPAPRIKA_API_KEY });
    calls.dp.n += fb.credits - fb.batches; // batches bill one credit per token; the counting fetch saw one call per batch
    const h = await honeypots(sql, log, countingFetch(calls.jup));
    const p = await pools(sql, chains);
    await enrichImages(sql).then(r => log(`avatar fallback: ${r.updated}/${r.checked} filled`)).catch(err => log(`avatar fallback deferred: ${(err as Error).message}`));
    await cacheAvatars(sql).then(r => log(`avatar storage: ${r.cached}/${r.checked} cached`)).catch(() => log('avatar storage deferred'));
    const confirmed = await confirmSubmitted(sql).catch((err) => { log(`confirm failed: ${(err as Error).message}`); return 0; });
    const seed = await activeSeed(sql);
    const [{ old }] = await sql<{ old: boolean }[]>`select active_from < now() - interval '24 hours' as old from server_seeds where id = ${seed.id}`;
    if (old) { const r = await rotateSeed(sql); log(`seed rotated; revealed ${r.revealedHash?.slice(0, 12)}…`); }
    const pruned = await prunePools(sql);
    log(`cycle ${Date.now() - t0} ms · discovered ${d.upserted} (+${d.paprika} paprika, ${d.metaSnaps} meta snaps) · enriched ${e.saved}/${e.due} · honeypot ${h.checked} (${h.failed} failed) · confirmed ${confirmed} · pruned ${pruned}${fb.used ? ` · paprika fallback ${fb.updated}` : ''} · calls ds ${calls.ds.n} dp ${calls.dp.n} jup ${calls.jup.n} · pools ${p.join(' ')}`);
    await recordRun(sql, started, true, calls);
    return { d, e, fb, h, p, confirmed, pruned, calls: { ds: calls.ds.n, dp: calls.dp.n, jup: calls.jup.n } };
  } catch (err) {
    await recordRun(sql, started, false, calls, (err as Error).message).catch(() => undefined);
    throw err;
  }
}

async function recordRun(sql: postgres.Sql, started: Date, ok: boolean, calls: { ds: { n: number }; dp: { n: number }; jup: { n: number } }, note?: string) {
  await sql.begin(async (tx) => {
    await tx`insert into worker_runs (started_at, ok, ds_calls, paprika_calls, jupiter_calls, note)
            values (${started}, ${ok}, ${calls.ds.n}, ${calls.dp.n}, ${calls.jup.n}, ${note ?? null})`;
    await tx`update discovery_requests set accounted=true where not accounted and requested_at>=${started}`;
  });
  await sql`delete from worker_runs where finished_at < now() - interval '35 days'`;
}
