import type postgres from 'postgres';
import { paprikaPoolsToCandidates, type DexPaprikaClient } from '@/modules/sources';

type Chain = { id: string; dexpaprika_id: string | null };
type State = { chain_id: string; cursor: string | null; watermark: Date | null; scan_head: Date | null; scan_started_at: Date | null; failures: number; last_head_at: Date | null; last_was_head: boolean };
export type Discovered = { chainId: string; address: string; source: string; pairCreatedAt?: Date; imageUrl?: string | null };
type Save = (sql: postgres.Sql, rows: Discovered[], enabled: Set<string>) => Promise<number>;

export function paprikaMonthlyBudget() {
  const configured = Number(process.env.LAB_PAPRIKA_MONTHLY_CREDITS);
  return Number.isFinite(configured) && configured >= 100 ? Math.floor(configured) : process.env.DEXPAPRIKA_API_KEY ? 100_000 : 10_000;
}

/** Durable, resumable newest-first scans. Allocation follows activity without starving quieter chains. */
export async function discoverNewPools(sql: postgres.Sql, dp: DexPaprikaClient, chains: Chain[], enabled: Set<string>, save: Save, log: (m: string) => void) {
  for (const c of chains.filter((c) => c.dexpaprika_id)) {
    await sql`insert into discovery_state(chain_id) values(${c.id}) on conflict do nothing`;
  }
  const allowance = Math.floor(paprikaMonthlyBudget() * 0.8); // reserve 20% for price fallback/other callers
  const [{ spent, today, last_request }] = await sql<{ spent: number; today: number; last_request: Date | null }[]>`
    select
      (coalesce((select sum(paprika_calls) from worker_runs where started_at>now()-interval '30 days'),0)
       + (select count(*) from discovery_requests where not accounted and requested_at>now()-interval '30 days'))::int as spent,
      (select count(*) from discovery_requests where requested_at>now()-interval '1 day')::int as today,
      (select max(requested_at) from discovery_requests) as last_request`;
  const spacing = 30 * 86400_000 / allowance;
  const slots = Math.max(0, Math.min(4, allowance-spent, Math.ceil(allowance/30)-today,
    last_request ? Math.floor((Date.now()-last_request.getTime())/spacing) : 4));
  let found = 0, pages = 0;
  for (let i=0; i<slots; i++) {
    const [state] = await sql<State[]>`
      select d.* from discovery_state d join chains ch on ch.id=d.chain_id
      where ch.enabled and ch.dexpaprika_id is not null and d.next_poll_at<=now()
      order by extract(epoch from (now()-coalesce(d.last_polled_at, now()-interval '1 day')))
        * (case when d.cursor is not null then 3 when d.last_page_size>=80 then 2 else 1 end) desc, ch.sort limit 1`;
    if (!state) break;
    const network = chains.find((c) => c.id===state.chain_id)?.dexpaprika_id;
    if (!network) break;
    await sql`insert into discovery_requests(chain_id) values(${state.chain_id})`;
    pages++;
    try {
      // Alternate a fresh head peek with continuation when a long catch-up scan is in progress.
      // The peek never advances the watermark: pages between it and the old cursor still get scanned.
      const peek = !!state.cursor && !state.last_was_head && Date.now()-(state.last_head_at?.getTime() ?? 0)>=5*60_000;
      const cursor = peek ? null : state.cursor;
      const res = await dp.searchPools(network, { orderBy:'created_at', sort:'desc', limit:100, ...(cursor ? {cursor} : {}) });
      // Use *all* page timestamps for pagination. Low-liquidity pools must not hide the watermark.
      const dates = res.results.map((p) => new Date(p.created_at)).filter((d) => Number.isFinite(d.getTime()));
      const now = Date.now();
      const newest = dates.length ? new Date(Math.max(...dates.map((d) => Math.min(d.getTime(), now)))) : null;
      const head = state.scan_head ?? newest;
      const boundary = state.watermark ?? new Date((state.scan_started_at?.getTime() ?? now)-7*86400_000);
      const reached = dates.some((d) => d<boundary);
      if (res.hasNextPage && res.nextCursor && res.nextCursor===cursor) throw new Error('provider repeated pagination cursor');
      const more = res.hasNextPage && !!res.nextCursor && res.results.length>0 && !reached;
      const candidates = paprikaPoolsToCandidates(res.results)
        .filter((c) => c.chainId===state.chain_id && c.createdAt<=new Date(now) && c.createdAt>=boundary)
        .map((c) => ({chainId:c.chainId,address:c.address,source:'paprika:new',pairCreatedAt:c.createdAt}));
      // Store even tiny new pools: hydration/backoff decides when they become eligible, not discovery.
      found += await save(sql, candidates, enabled);
      if (peek) {
        await sql`update discovery_state set last_head_at=now(),last_was_head=true,last_polled_at=now(),
          next_poll_at=now(),failures=0,last_error=null,pages=pages+1 where chain_id=${state.chain_id}`;
        continue;
      }
      await sql`update discovery_state set cursor=${more ? res.nextCursor : null}, scan_head=${more ? head : null},
        watermark=${more ? state.watermark : head ?? state.watermark},
        scan_started_at=${more ? state.scan_started_at ?? new Date(now) : null}, last_polled_at=now(),
        next_poll_at=now()+make_interval(secs=>${more ? 0 : candidates.length>=80 ? 60 : candidates.length>=20 ? 180 : 600}),
        failures=0,last_error=null,last_page_size=${res.results.length},pages=pages+1,
        last_head_at=${cursor ? state.last_head_at : new Date(now)},last_was_head=${!cursor} where chain_id=${state.chain_id}`;
    } catch (e) {
      const message = (e as Error).message;
      log(`new pools ${state.chain_id} deferred: ${message}`);
      // Expired cursors restart from the head while retaining the completed watermark (no permanent skip).
      await sql`update discovery_state set failures=failures+1,last_error=${message.slice(0,500)},last_polled_at=now(),
        next_poll_at=now()+make_interval(secs=>${Math.min(3600,60*2**Math.min(state.failures,6))}),
        cursor=${state.failures>=2 ? null : state.cursor}, scan_head=${state.failures>=2 ? null : state.scan_head},
        scan_started_at=${state.failures>=2 ? null : state.scan_started_at} where chain_id=${state.chain_id}`;
    }
  }
  await sql`delete from discovery_requests where requested_at<now()-interval '35 days'`;
  return { found, pages, budgetRemaining: Math.max(0,allowance-spent-pages) };
}
