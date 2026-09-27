import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { canonicalPool, poolHash, type PoolItem, type Tier, type TierOdds } from '@/modules/rolls/fair';
import { marketCapTier } from '@/modules/sources/tier';

/** A snapshot older than this never enters a pool and never shows as current (LAB §2.2). */
export const SNAPSHOT_MAX_AGE_MINUTES = 15;
export const CHAIN_SCOPE_ALL = 'all';

export type CaseRow = {
  id: string; kind: 'trending' | 'new' | 'meta' | 'cto' | 'sponsored'; title: string; meta_slug: string | null;
  tier_odds: TierOdds; cost_points: number | null; active: boolean; sort: number;
};
export type PoolRow = { id: number; case_id: string; chain_scope: string; version: number; items: PoolItem[]; hash: string; size: number; created_at: Date };

const TRENDING_SOURCES = ['ds:boost', 'ds:top', 'ds:profile', 'ds:meta'];

export async function listCases(sql: postgres.Sql = defaultSql): Promise<CaseRow[]> {
  return sql<CaseRow[]>`select id, kind, title, meta_slug, tier_odds, cost_points, active, sort from cases where active order by sort, id`;
}

export async function getCase(id: string, sql: postgres.Sql = defaultSql): Promise<CaseRow | undefined> {
  const [row] = await sql<CaseRow[]>`select id, kind, title, meta_slug, tier_odds, cost_points, active, sort from cases where id = ${id}`;
  return row;
}

/**
 * AC-018: a hidden gate can be switched off by config (`LAB_DISABLED_GATES=liquidity,honeypot`); its assets come back at the
 * next pool build. Pool membership only: the pre-trade sell check before any swap always runs.
 */
export function disabledGates(env: string | undefined = process.env.LAB_DISABLED_GATES): string[] {
  return (env ?? '').split(',').map((g) => g.trim()).filter((g) => g === 'liquidity' || g === 'honeypot');
}

/**
 * Assets eligible for a case right now: fresh snapshot, not killed, liquidity gate passed, and — on chains where
 * swapping is enabled — the honeypot gate passed too (LAB §2.3). Tier = market-cap bucket (LAB option A).
 */
export async function eligibleItems(c: CaseRow, chainScope: string, sql: postgres.Sql = defaultSql, off: string[] = disabledGates()): Promise<PoolItem[]> {
  const liquidityOn = !off.includes('liquidity');
  const honeypotOn = !off.includes('honeypot');
  const rows = await sql<{ id: number; market_cap: number | null }[]>`
    select a.id, s.market_cap
    from assets a
    join asset_snapshots s on s.asset_id = a.id
    join chains ch on ch.id = a.chain_id and ch.enabled
    where s.taken_at > now() - make_interval(mins => ${SNAPSHOT_MAX_AGE_MINUTES})
      and (${chainScope} = ${CHAIN_SCOPE_ALL} or a.chain_id = ${chainScope})
      and not exists (select 1 from moderation m where m.asset_id = a.id)
      and not exists (select 1 from symbol_blocklist b where b.symbol = upper(coalesce(a.symbol, '')))
      and (not ${liquidityOn} or exists (select 1 from gate_results g where g.asset_id = a.id and g.gate = 'liquidity' and g.passed))
      and not exists (select 1 from gate_results g where g.asset_id = a.id and not g.passed and g.gate <> all(${off}::text[]))
      and (not ${honeypotOn} or not ch.swap_enabled or exists (select 1 from gate_results g where g.asset_id = a.id and g.gate = 'honeypot' and g.passed))
      and case ${c.kind}
            when 'trending' then a.sources && ${TRENDING_SOURCES}::text[]
            when 'new' then s.pair_created_at > now() - interval '24 hours'
            when 'cto' then 'ds:cto' = any(a.sources)
            when 'meta' then ('ds:meta:' || ${c.meta_slug ?? ''}) = any(a.sources)
            else false
          end`;
  const items: PoolItem[] = [];
  for (const r of rows) {
    const t = marketCapTier(r.market_cap);
    if (t) items.push({ a: Number(r.id), t: t as Tier });
  }
  return canonicalPool(items);
}

export async function latestPool(caseId: string, chainScope: string, sql: postgres.Sql = defaultSql): Promise<PoolRow | undefined> {
  const [row] = await sql<PoolRow[]>`
    select id, case_id, chain_scope, version, items, hash, size, created_at from case_pools
    where case_id = ${caseId} and chain_scope = ${chainScope} order by version desc limit 1`;
  return row ? { ...row, id: Number(row.id) } : undefined;
}

/** Freezes a new immutable pool version when the eligible set changed; otherwise returns the current one. */
export async function buildPool(c: CaseRow, chainScope: string, sql: postgres.Sql = defaultSql): Promise<PoolRow | undefined> {
  const items = await eligibleItems(c, chainScope, sql);
  if (!items.length) return latestPool(c.id, chainScope, sql);
  const hash = poolHash(items);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`pool:${c.id}:${chainScope}`}))`;
    const current = await latestPool(c.id, chainScope, tx as unknown as postgres.Sql);
    if (current?.hash === hash) return current;
    const [row] = await tx<PoolRow[]>`
      insert into case_pools (case_id, chain_scope, version, items, hash, size)
      values (${c.id}, ${chainScope}, ${(current?.version ?? 0) + 1}, ${tx.json(items)}, ${hash}, ${items.length})
      returning id, case_id, chain_scope, version, items, hash, size, created_at`;
    return { ...row, id: Number(row.id) };
  });
}
