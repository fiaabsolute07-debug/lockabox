import type postgres from 'postgres';
import { pairsToAssets, type AssetSnapshot, type DexScreenerClient } from '@/modules/sources';

type Due = { id: number; chain_id: string; family: string; address: string; refresh_failures: number; refresh_attempted_at: Date | null };
type Save = (sql: postgres.Sql, snapshots: AssetSnapshot[], enabled: Set<string>) => Promise<number>;
const addressKey = (family: string, address: string) => family === 'evm' ? address.toLowerCase() : address;

/** Empty provider results are retries, not success. Bounded delays avoid a permanently stuck head of queue. */
export function retrySeconds(failures: number, transportError = false) {
  return Math.min(transportError ? 900 : 21600, (transportError ? 60 : 300) * 2 ** Math.min(failures, 10));
}

/** Round-robin batches across chains; oldest attempted chain starts each round. */
export function fairBatches(rows: Due[], maxCalls: number): Due[][] {
  const chains = new Map<string, Due[]>();
  for (const row of rows) { const group = chains.get(row.chain_id) ?? []; group.push(row); chains.set(row.chain_id, group); }
  const queues = [...chains.values()].sort((a, b) =>
    (a[0].refresh_attempted_at?.getTime() ?? 0) - (b[0].refresh_attempted_at?.getTime() ?? 0) || a[0].chain_id.localeCompare(b[0].chain_id));
  const batches: Due[][] = [];
  while (queues.some((q) => q.length) && batches.length < maxCalls) {
    for (const q of queues) { if (q.length && batches.length < maxCalls) batches.push(q.splice(0, 30)); }
  }
  return batches;
}

export async function enrichAssets(sql: postgres.Sql, ds: DexScreenerClient, enabled: Set<string>, save: Save, log: (m: string) => void) {
  let calls = 0, due = 0, saved = 0, missing = 0, errors = 0;
  // Reserve 5 calls for brand-new candidates and 5 for the backlog. Unused calls flow to the next lane.
  for (const lane of ['refresh', 'new', 'hydrate'] as const) {
    const budget = lane === 'refresh' ? 20 : lane === 'new' ? 25 - calls : 30 - calls;
    const rows = await sql<Due[]>`
      with ranked as (
        select a.id, a.chain_id, ch.family, a.address, a.refresh_failures, a.refresh_attempted_at,
          row_number() over(partition by a.chain_id order by a.refresh_attempted_at nulls first, a.next_refresh_at, a.id) as rank
        from assets a join chains ch on ch.id=a.chain_id and ch.enabled
        left join asset_snapshots s on s.asset_id=a.id
        where a.merged_into is null and a.next_refresh_at <= now()
          and a.chain_id=any(${[...enabled]})
          and not exists(select 1 from moderation m where m.asset_id=a.id)
          and (s.taken_at is null or s.taken_at < now()-interval '4 minutes')
          and (${lane}='refresh') = (s.asset_id is not null and coalesce(s.liquidity_usd,0)>=1000 and coalesce(s.market_cap,0)>0)
          and (${lane}<>'new' or a.discovered_pair_at>now()-interval '7 days' or a.first_seen_at>now()-interval '15 minutes')
      ) select * from ranked where rank<=${budget * 30} order by rank, chain_id`;
    for (const batch of fairBatches(rows, budget)) {
      calls++; due += batch.length;
      // Claim before I/O so a crash cannot pin an unavailable batch at the front.
      await sql`update assets set refresh_attempted_at=now(), next_refresh_at=now()+interval '2 minutes'
                where id=any(${batch.map((r) => r.id)}::bigint[])`;
      let snapshots: AssetSnapshot[] = [];
      let error: string | null = null;
      const family = batch[0].family, chain = batch[0].chain_id;
      const requested = new Set(batch.map((r) => addressKey(family, r.address)));
      try {
        snapshots = pairsToAssets(await ds.tokens(chain, batch.map((r) => r.address)))
          .filter((s) => s.chainId === chain && requested.has(addressKey(family, s.address)));
        saved += await save(sql, snapshots, enabled);
      } catch (e) { error = (e as Error).message; errors++; log(`enrich ${chain} deferred: ${error}`); }
      const byAddress = new Map(snapshots.map((s) => [addressKey(family, s.address), s]));
      for (const row of batch) {
        const s = error ? undefined : byAddress.get(addressKey(family, row.address));
        const delay = s ? ((s.liquidityUsd ?? 0)>=1000 && (s.marketCap ?? 0)>0 ? 240 : 1800) : retrySeconds(row.refresh_failures, !!error);
        if (!s) missing++;
        await sql`update assets set refresh_failures=${s ? 0 : row.refresh_failures+1}, refresh_error=${s ? null : (error ?? 'no_pair_returned').slice(0,500)},
                  next_refresh_at=now()+make_interval(secs=>${delay}) where id=${row.id}`;
      }
    }
  }
  return { due, saved, calls, missing, errors };
}
