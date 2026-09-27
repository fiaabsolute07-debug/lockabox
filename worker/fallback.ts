import type postgres from 'postgres';
import { BUDGETS } from '@/modules/health/service';

/**
 * AC-022 price fallback. When DEX Screener has produced no fresh price for > 10 minutes, refresh the prices of the coins
 * that are in the current pools from DexPaprika's multi-price endpoint (10 tokens per call, 1 credit per token), at most
 * every 5 minutes and never past 80 % of the 30-day credit budget. If both sources are down, snapshots go stale and the
 * pool builder drops the coins (cases pause); a price older than 15 minutes is never shown.
 *
 * Market cap and FDV are scaled by the price ratio (supply unchanged); liquidity and volume keep their last DEX Screener value.
 * TODO(Astra): move `fetchMultiPrices` into src/modules/sources/dexpaprika.ts with a zod schema (requested in claude-review-A3).
 */

export const DS_DOWN_AFTER_MIN = 10;
export const FALLBACK_EVERY_MIN = 5;
export const FALLBACK_MAX_TOKENS = 60;
const BASE = 'https://api.dexpaprika.com';

type PriceRow = { chain: string; id: string; price_usd: number | null };

export async function fetchMultiPrices(network: string, tokens: string[], fetchImpl: typeof fetch = fetch, apiKey?: string): Promise<PriceRow[]> {
  const url = `${BASE}/networks/${encodeURIComponent(network)}/multi/prices?tokens=${tokens.map(encodeURIComponent).join(',')}`;
  const res = await fetchImpl(url, { headers: apiKey ? { Authorization: apiKey } : {}, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`dexpaprika multi/prices ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('dexpaprika multi/prices: unexpected body');
  return body.filter((r): r is PriceRow => !!r && typeof r === 'object' && typeof (r as PriceRow).id === 'string');
}

export async function dexScreenerDown(sql: postgres.Sql): Promise<boolean> {
  // Down = we have snapshots, but none from DEX Screener in the last 10 minutes (also when the fallback has replaced them all).
  const [r] = await sql<{ last: Date | null; n: number }[]>`
    select max(taken_at) filter (where price_source = 'dexscreener') as last, count(*)::int as n from asset_snapshots`;
  if (!r.n) return false;
  return !r.last || Date.now() - r.last.getTime() > DS_DOWN_AFTER_MIN * 60_000;
}

export async function paprikaPriceFallback(
  sql: postgres.Sql,
  opts: { fetchImpl?: typeof fetch; log?: (m: string) => void; paprikaKey?: boolean; apiKey?: string } = {},
): Promise<{ used: boolean; updated: number; reason?: string }> {
  if (!(await dexScreenerDown(sql))) return { used: false, updated: 0 };
  const [recent] = await sql<{ n: number }[]>`
    select count(*)::int as n from asset_snapshots where price_source = 'dexpaprika' and taken_at > now() - make_interval(mins => ${FALLBACK_EVERY_MIN})`;
  if (recent.n > 0) return { used: false, updated: 0, reason: 'ran recently' };
  const [spent] = await sql<{ calls: number }[]>`select coalesce(sum(paprika_calls), 0)::int as calls from worker_runs where finished_at > now() - interval '30 days'`;
  const budget = opts.paprikaKey ? BUDGETS.paprikaPer30dWithKey : BUDGETS.paprikaPer30d;
  if (spent.calls > budget * 0.8) { opts.log?.('paprika fallback skipped: 30-day budget above 80 %'); return { used: false, updated: 0, reason: 'budget' }; }

  // Coins in the latest pool of every free case/scope, most liquid first.
  const due = await sql<{ asset_id: number; address: string; network: string }[]>`
    with latest as (
      select distinct on (case_id, chain_scope) items from case_pools where case_id <> 'sponsored' order by case_id, chain_scope, version desc
    ), ids as (select distinct (e->>'a')::bigint as asset_id from latest, jsonb_array_elements(latest.items) e)
    select a.id as asset_id, a.address, c.dexpaprika_id as network
    from ids join assets a on a.id = ids.asset_id join chains c on c.id = a.chain_id join asset_snapshots s on s.asset_id = a.id
    where c.dexpaprika_id is not null and s.taken_at < now() - interval '4 minutes'
    order by s.liquidity_usd desc nulls last limit ${FALLBACK_MAX_TOKENS}`;
  const byNet = new Map<string, { asset_id: number; address: string }[]>();
  for (const d of due) byNet.set(d.network, [...(byNet.get(d.network) ?? []), d]);
  let updated = 0;
  for (const [network, list] of byNet) {
    for (let i = 0; i < list.length; i += 10) {
      const chunk = list.slice(i, i + 10);
      try {
        const prices = await fetchMultiPrices(network, chunk.map((c) => c.address), opts.fetchImpl, opts.apiKey ?? process.env.DEXPAPRIKA_API_KEY);
        for (const p of prices) {
          const hit = chunk.find((c) => c.address.toLowerCase() === p.id.toLowerCase());
          if (!hit || !(typeof p.price_usd === 'number' && p.price_usd > 0)) continue;
          await sql`
            update asset_snapshots set
              market_cap = case when price_usd > 0 then market_cap * (${p.price_usd} / price_usd) else market_cap end,
              fdv = case when price_usd > 0 then fdv * (${p.price_usd} / price_usd) else fdv end,
              price_usd = ${p.price_usd}, taken_at = now(), price_source = 'dexpaprika'
            where asset_id = ${hit.asset_id}`;
          updated++;
        }
      } catch (e) { opts.log?.(`paprika fallback ${network} failed: ${(e as Error).message}`); }
    }
  }
  opts.log?.(`DEX Screener down > ${DS_DOWN_AFTER_MIN} min: ${updated} prices from DexPaprika`);
  return { used: true, updated };
}
