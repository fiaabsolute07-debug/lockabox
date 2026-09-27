import type postgres from 'postgres';
import { buildPool, CHAIN_SCOPE_ALL, listCases } from '@/modules/cases/pools';
import { liquidityGate, recordGate, solanaHoneypotGate } from '@/modules/gates';
import { activeSeed, rotateSeed } from '@/modules/rolls/service';
import { confirmSubmitted } from '@/modules/swap/service';
import { paprikaPriceFallback } from './fallback';
import {
  createDexPaprikaClient, createDexScreenerClient, pairsToAssets, paprikaPoolsToCandidates,
  type AssetSnapshot, type DexPaprikaClient, type DexScreenerClient,
} from '@/modules/sources';

/**
 * One ingest cycle (LAB §7.1). Server-side only; user requests never call a provider (LAB §3.5).
 * discover (DEX Screener feeds every run, DexPaprika new pools every 15 min) → enrich (tokens/v1, 30 per call)
 * → hidden gates → freeze pools → confirm trades → rotate the seed daily.
 */

export type IngestDeps = { sql: postgres.Sql; ds?: DexScreenerClient; dp?: DexPaprikaClient; log?: (m: string) => void; now?: () => Date };
type Discovered = { chainId: string; address: string; source: string };

const REFRESH_AFTER_MS = 4 * 60_000;
const PAPRIKA_EVERY_MS = 15 * 60_000;
const HONEYPOT_RECHECK_H = 6;
const MAX_ENRICH = 600;
const MAX_HONEYPOT = 40;
const TOP_METAS = 3;
let lastPaprika = 0;

async function enabledChains(sql: postgres.Sql) {
  return sql<{ id: string; family: string; dexpaprika_id: string | null }[]>`select id, family, dexpaprika_id from chains where enabled order by sort`;
}

export async function upsertDiscovered(sql: postgres.Sql, found: Discovered[], enabled: Set<string>) {
  const rows = found.filter((f) => enabled.has(f.chainId) && f.address);
  for (const f of rows) {
    await sql`
      insert into assets (chain_id, address, sources) values (${f.chainId}, ${f.address}, ${[f.source]})
      on conflict (chain_id, address) do update
        set sources = (select array(select distinct unnest(assets.sources || excluded.sources)))`;
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
  for (const p of profiles ?? []) found.push({ chainId: p.chainId, address: p.tokenAddress, source: 'ds:profile' });
  for (const b of boosts ?? []) found.push({ chainId: b.chainId, address: b.tokenAddress, source: 'ds:boost' });
  for (const b of top ?? []) found.push({ chainId: b.chainId, address: b.tokenAddress, source: 'ds:top' });
  for (const c of cto ?? []) found.push({ chainId: c.chainId, address: c.tokenAddress, source: 'ds:cto' });
  let metaSnaps = 0;
  const topMetas = (metas ?? []).slice(0, TOP_METAS);
  for (const m of topMetas) {
    const detail = await settle(`meta ${m.slug}`, ds.meta(m.slug));
    const snaps = pairsToAssets(detail?.pairs ?? []);
    metaSnaps += await saveSnapshots(sql, snaps, enabled);
    for (const s of snaps) { found.push({ chainId: s.chainId, address: s.address, source: 'ds:meta' }); found.push({ chainId: s.chainId, address: s.address, source: `ds:meta:${m.slug}` }); }
  }
  // Meta cases follow what's trending: the top metas get a case, older meta cases are switched off.
  if (topMetas.length) {
    for (const [i, m] of topMetas.entries()) {
      await sql`insert into cases (id, kind, title, meta_slug, sort) values (${`meta-${m.slug}`}, 'meta', ${m.name}, ${m.slug}, ${10 + i})
                on conflict (id) do update set active = true, title = excluded.title, sort = excluded.sort`;
    }
    await sql`update cases set active = false where kind = 'meta' and not (meta_slug = any(${topMetas.map((m) => m.slug)}))`;
  }
  let paprika = 0;
  if (Date.now() - lastPaprika > PAPRIKA_EVERY_MS) {
    lastPaprika = Date.now();
    for (const ch of chains) {
      if (!ch.dexpaprika_id) continue;
      const res = await settle(`paprika ${ch.id}`, dp.searchPools(ch.dexpaprika_id, { orderBy: 'created_at', sort: 'desc', limit: 100 }));
      const cands = paprikaPoolsToCandidates(res?.results ?? []).filter((c) => (c.liquidityUsd ?? 0) >= 1_000);
      for (const c of cands) found.push({ chainId: c.chainId, address: c.address, source: 'paprika:new' });
      paprika += cands.length;
    }
  }
  const upserted = await upsertDiscovered(sql, found, enabled);
  return { upserted, metaSnaps, paprika };
}

async function enrich(deps: Required<Pick<IngestDeps, 'sql' | 'ds' | 'log'>>, enabled: Set<string>) {
  const { sql, ds, log } = deps;
  const due = await sql<{ chain_id: string; address: string }[]>`
    select a.chain_id, a.address from assets a left join asset_snapshots s on s.asset_id = a.id
    where a.chain_id = any(${[...enabled]}) and not exists (select 1 from moderation m where m.asset_id = a.id)
      and (s.taken_at is null or s.taken_at < now() - make_interval(secs => ${REFRESH_AFTER_MS / 1000}))
      and a.first_seen_at > now() - interval '7 days'
    order by s.taken_at nulls first limit ${MAX_ENRICH}`;
  const byChain = new Map<string, string[]>();
  for (const d of due) byChain.set(d.chain_id, [...(byChain.get(d.chain_id) ?? []), d.address]);
  let saved = 0;
  for (const [chain, addrs] of byChain) {
    for (let i = 0; i < addrs.length; i += 30) {
      try {
        const pairs = await ds.tokens(chain, addrs.slice(i, i + 30));
        saved += await saveSnapshots(sql, pairsToAssets(pairs), enabled);
      } catch (e) { log(`enrich ${chain} failed: ${(e as Error).message}`); }
    }
  }
  return { due: due.length, saved };
}

async function honeypots(sql: postgres.Sql, log: (m: string) => void, fetchImpl: typeof fetch = fetch) {
  const due = await sql<{ id: number; address: string }[]>`
    select a.id, a.address from assets a
    join asset_snapshots s on s.asset_id = a.id
    join gate_results l on l.asset_id = a.id and l.gate = 'liquidity' and l.passed
    left join gate_results h on h.asset_id = a.id and h.gate = 'honeypot'
    where a.chain_id = 'solana' and s.taken_at > now() - interval '15 minutes'
      and (h.checked_at is null or h.checked_at < now() - make_interval(hours => ${HONEYPOT_RECHECK_H}))
    order by h.checked_at nulls first, s.liquidity_usd desc limit ${MAX_HONEYPOT}`;
  let checked = 0, failed = 0;
  for (const d of due) {
    try {
      const out = await solanaHoneypotGate(d.address, fetchImpl);
      await recordGate(Number(d.id), 'honeypot', out, sql);
      checked++; if (!out.passed) failed++;
    } catch (e) { log(`honeypot ${d.address} deferred: ${(e as Error).message}`); }
    await new Promise((r) => setTimeout(r, 1100)); // stay well inside Jupiter's free tier
  }
  return { checked, failed };
}

async function pools(sql: postgres.Sql, chains: { id: string }[]) {
  const cases = (await listCases(sql)).filter((c) => !c.cost_points);
  const out: string[] = [];
  for (const c of cases) {
    for (const scope of [CHAIN_SCOPE_ALL, ...chains.map((ch) => ch.id)]) {
      const p = await buildPool(c, scope, sql);
      if (p) out.push(`${c.id}/${scope}=v${p.version}(${p.size})`);
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

export async function runCycle(deps: IngestDeps) {
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
    const e = await enrich({ sql, ds, log }, enabled);
    const fb = await paprikaPriceFallback(sql, { fetchImpl: countingFetch(calls.dp), log, paprikaKey: !!process.env.DEXPAPRIKA_API_KEY });
    const h = await honeypots(sql, log, countingFetch(calls.jup));
    const p = await pools(sql, chains);
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
  await sql`insert into worker_runs (started_at, ok, ds_calls, paprika_calls, jupiter_calls, note)
            values (${started}, ${ok}, ${calls.ds.n}, ${calls.dp.n}, ${calls.jup.n}, ${note ?? null})`;
  await sql`delete from worker_runs where finished_at < now() - interval '35 days'`;
}
