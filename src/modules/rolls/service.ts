import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { disabledGates, getCase, latestPool, SNAPSHOT_MAX_AGE_MINUTES } from '@/modules/cases/pools';
import { canonicalPool, DEFAULT_ODDS, newServerSeed, poolHash, resolveRoll, TIERS, type PoolItem, type Tier, type TierOdds, type OddsMode } from './fair';

/** Below this many items after filters, rolling is refused so a filter can't turn the roll into a hand pick (LAB §2.2). */
export const MIN_POOL = 20;
/** Anti-bot only; rolls are unlimited (LAB D9). */
export const MIN_MS_BETWEEN_ROLLS = 1000;

export type RollFilters = {
  tiers?: Tier[];
  minLiquidityUsd?: number;
  minVolume24h?: number;
  maxAgeHours?: number;
  minAgeHours?: number;
  change24h?: 'up' | 'down';
};

export class RollError extends Error {
  constructor(public code: 'case_not_found' | 'case_needs_points' | 'no_pool' | 'pool_too_small' | 'rate_limited' | 'no_actor', message: string, public detail?: unknown) {
    super(message);
  }
}

type Actor = { userId?: string | null; deviceId?: string | null };

/**
 * Pools change at most once a minute (worker), so a roll may read one from a 3 s in-process cache (the roll still records the
 * exact pool id and items it used). Never the seed: it is read under a lock inside the roll transaction.
 */
const POOL_CACHE_MS = Number(process.env.POOL_CACHE_MS ?? (process.env.NODE_ENV === 'test' ? 0 : 3000));
const poolCache = new Map<string, { at: number; pool: Awaited<ReturnType<typeof latestPool>> }>();
async function cachedLatestPool(caseId: string, chainScope: string, sql: postgres.Sql) {
  if (!POOL_CACHE_MS || sql !== defaultSql) return latestPool(caseId, chainScope, sql);
  const key = `${caseId}:${chainScope}`;
  const hit = poolCache.get(key);
  if (hit && Date.now() - hit.at < POOL_CACHE_MS) return hit.pool;
  const pool = await latestPool(caseId, chainScope, sql);
  if (pool) poolCache.set(key, { at: Date.now(), pool });
  return pool;
}

const caseCache = new Map<string, { at: number; c: Awaited<ReturnType<typeof getCase>> }>();
async function cachedCase(id: string, sql: postgres.Sql) {
  if (!POOL_CACHE_MS || sql !== defaultSql) return getCase(id, sql);
  const hit = caseCache.get(id);
  if (hit && Date.now() - hit.at < 10 * POOL_CACHE_MS) return hit.c;
  const c = await getCase(id, sql);
  caseCache.set(id, { at: Date.now(), c });
  return c;
}

/**
 * postgres.js 3.4.9 can raise UNSAFE_TRANSACTION when a pool is saturated and a pipelined BEGIN loses its reservation
 * (seen at 1 000 concurrent rolls). The transaction never started, so it is safe to try again.
 */
async function beginWithRetry<T>(sql: postgres.Sql, fn: (tx: postgres.TransactionSql) => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return (await sql.begin(fn)) as T; } catch (e) {
      if ((e as { code?: string }).code !== 'UNSAFE_TRANSACTION' || i >= attempts) throw e;
    }
  }
}

export function sanitizeFilters(input: unknown): RollFilters {
  const f = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const out: RollFilters = {};
  if (Array.isArray(f.tiers)) {
    const tiers = f.tiers.filter((t): t is Tier => TIERS.includes(t as Tier));
    if (tiers.length && tiers.length < TIERS.length) out.tiers = [...new Set(tiers)];
  }
  if (num(f.minLiquidityUsd)) out.minLiquidityUsd = num(f.minLiquidityUsd);
  if (num(f.minVolume24h)) out.minVolume24h = num(f.minVolume24h);
  if (num(f.maxAgeHours)) out.maxAgeHours = num(f.maxAgeHours);
  if (num(f.minAgeHours)) out.minAgeHours = num(f.minAgeHours);
  if (f.change24h === 'up' || f.change24h === 'down') out.change24h = f.change24h;
  return out;
}

/** Applies user filters to a frozen pool using the current snapshots; the result is stored on the roll for verification. */
export async function filterPool(items: PoolItem[], filters: RollFilters, sql: postgres.Sql = defaultSql): Promise<PoolItem[]> {
  let pool = filters.tiers ? items.filter((i) => filters.tiers!.includes(i.t)) : items;
  if (!pool.length) return [];
  const off = disabledGates();
  const ids = pool.map((i) => i.a);
  const rows = await sql<{ asset_id: number; liquidity_usd: number | null; volume_24h: number | null; pair_created_at: Date | null; change_h24: number | null }[]>`
    select s.asset_id, s.liquidity_usd, s.volume_24h, s.pair_created_at, s.change_h24 from asset_snapshots s
    join assets a on a.id=s.asset_id join chains ch on ch.id=a.chain_id and ch.enabled
    where s.asset_id = any(${ids}::bigint[]) and s.taken_at > now() - make_interval(mins => ${SNAPSHOT_MAX_AGE_MINUTES})
      and a.merged_into is null and coalesce(s.market_cap,0)>0
      and not exists(select 1 from moderation m where m.asset_id=a.id)
      and not exists(select 1 from symbol_blocklist b where b.symbol=upper(coalesce(a.symbol,'')))
      and (${off.includes('liquidity')} or exists(select 1 from gate_results g where g.asset_id=a.id and g.gate='liquidity' and g.passed))
      and not exists(select 1 from gate_results g where g.asset_id=a.id and not g.passed and g.gate<>all(${off}::text[]))
      -- Same rule as eligibleItems: Solana needs a passed sell check, EVM only must not have failed one (DECISIONS #21).
      and (${off.includes('honeypot')} or not ch.swap_enabled or ch.family = 'evm' or exists(select 1 from gate_results g where g.asset_id=a.id and g.gate='honeypot' and g.passed))`;
  const byId = new Map(rows.map((r) => [Number(r.asset_id), r]));
  const now = Date.now();
  pool = pool.filter(({ a }) => {
    const s = byId.get(a);
    if (!s) return false;
    if (filters.minLiquidityUsd && (s.liquidity_usd ?? 0) < filters.minLiquidityUsd) return false;
    if (filters.minVolume24h && (s.volume_24h ?? 0) < filters.minVolume24h) return false;
    const ageH = s.pair_created_at ? (now - s.pair_created_at.getTime()) / 3.6e6 : null;
    if (filters.maxAgeHours && (ageH === null || ageH < 0 || ageH > filters.maxAgeHours)) return false;
    if (filters.minAgeHours && (ageH === null || ageH < filters.minAgeHours)) return false;
    if (filters.change24h === 'up' && !((s.change_h24 ?? 0) > 0)) return false;
    if (filters.change24h === 'down' && !((s.change_h24 ?? 0) < 0)) return false;
    return true;
  });
  return canonicalPool(pool);
}

export async function activeSeed(sql: postgres.Sql = defaultSql): Promise<{ id: number; hash: string; seed: string }> {
  const [row] = await sql<{ id: number; hash: string; seed: string }[]>`select id, hash, seed from server_seeds where revealed_at is null`;
  if (row) return { ...row, id: Number(row.id) };
  const s = newServerSeed();
  const [created] = await sql<{ id: number; hash: string; seed: string }[]>`
    insert into server_seeds (seed, hash) values (${s.seed}, ${s.hash})
    on conflict do nothing returning id, hash, seed`;
  return created ? { ...created, id: Number(created.id) } : activeSeed(sql);
}

/**
 * The active seed, read under a share lock inside a roll transaction. A rotation that wins the race makes the first read
 * come back empty (the row no longer matches); a second statement sees the new seed.
 */
export async function lockedActiveSeed(tx: postgres.TransactionSql): Promise<{ id: number; hash: string; seed: string } | undefined> {
  for (let i = 0; i < 2; i++) {
    const [row] = await tx<{ id: number; hash: string; seed: string }[]>`select id, hash, seed from server_seeds where revealed_at is null for share`;
    if (row) return { ...row, id: Number(row.id) };
  }
  return undefined;
}

/** Reveals the current seed (so every roll made with it becomes verifiable) and commits a new one. */
export async function rotateSeed(sql: postgres.Sql = defaultSql): Promise<{ revealedHash: string | null; newHash: string }> {
  return sql.begin(async (tx) => {
    // Rolls read the seed FOR SHARE. Take the row lock first (waits until every roll holding it has committed), then stamp the
    // reveal with clock_timestamp(): an UPDATE computes its values before waiting, which would record a too-early time.
    const [cur] = await tx<{ id: number }[]>`select id from server_seeds where revealed_at is null for update`;
    const [old] = cur
      ? await tx<{ hash: string }[]>`update server_seeds set revealed_at = clock_timestamp() where id = ${cur.id} returning hash`
      : [];
    const s = newServerSeed();
    await tx`insert into server_seeds (seed, hash) values (${s.seed}, ${s.hash})`;
    return { revealedHash: old?.hash ?? null, newHash: s.hash };
  });
}

export type RollResult = {
  rollId: number; caseId: string; chainScope: string; poolId: number; poolVersion: number; poolHash: string;
  itemsHash: string; poolSize: number; tier: Tier; assetId: number; serverSeedHash: string; clientSeed: string; nonce: number;
  odds: Partial<Record<Tier, number>>; createdAt: string;
};

export async function roll(input: Actor & { caseId: string; chainScope: string; filters?: unknown }, sql: postgres.Sql = defaultSql): Promise<RollResult> {
  return (await rollDetailed(input, sql)).result;
}

/** Same as `roll`, plus the filtered pool items the roll used (for the cosmetic reel), without another query. */
export async function rollDetailed(input: Actor & { caseId: string; chainScope: string; filters?: unknown }, sql: postgres.Sql = defaultSql): Promise<{ result: RollResult; items: PoolItem[] }> {
  if (!input.userId && !input.deviceId) throw new RollError('no_actor', 'a user or a device is required');
  const c = await cachedCase(input.caseId, sql);
  if (!c || !c.active) throw new RollError('case_not_found', 'unknown case');
  if (c.cost_points) throw new RollError('case_needs_points', 'this case opens with points'); // sponsored cases: R4
  const pool = await cachedLatestPool(c.id, input.chainScope, sql);
  if (!pool) throw new RollError('no_pool', 'this case has no coins yet');
  const filters = sanitizeFilters(input.filters);
  if (c.kind === 'new') filters.maxAgeHours = Math.min(filters.maxAgeHours ?? 24, 24);
  const items = await filterPool(pool.items, filters, sql);
  if (items.length < MIN_POOL) throw new RollError('pool_too_small', `only ${items.length} coins match these filters; loosen them`, { size: items.length, min: MIN_POOL });

  return beginWithRetry(sql, async (tx) => {
    // Read the seed under a share lock: a rotation (which reveals it) waits until this roll commits, so no roll ever uses a revealed seed.
    let seed = await lockedActiveSeed(tx);
    if (!seed) { await activeSeed(sql); seed = await lockedActiveSeed(tx); } // first roll ever
    if (!seed) throw new RollError('no_pool', 'the fairness seed is rotating, try again');
    // One statement creates the device if needed, takes its row lock (so concurrent rolls from one device/user serialise before
    // the pacing check) and draws the next nonce. If the pacing check fails, the transaction rolls all of it back.
    const [actor] = input.userId
      ? await tx<{ client_seed: string; nonce: number }[]>`update users set nonce = nonce + 1 where id = ${input.userId} returning client_seed, nonce`
      : await tx<{ client_seed: string; nonce: number }[]>`
          insert into devices (id, nonce) values (${input.deviceId!}, 1)
          on conflict (id) do update set nonce = devices.nonce + 1 returning client_seed, nonce`;
    if (!actor) throw new RollError('no_actor', 'unknown user or device');
    // Anti-bot pacing (not a limit on the number of rolls).
    const [last] = input.userId
      ? await tx<{ created_at: Date }[]>`select created_at from rolls where user_id = ${input.userId} order by created_at desc limit 1`
      : await tx<{ created_at: Date }[]>`select created_at from rolls where device_id = ${input.deviceId!} order by created_at desc limit 1`;
    if (last && Date.now() - last.created_at.getTime() < MIN_MS_BETWEEN_ROLLS) throw new RollError('rate_limited', 'slow down a little');
    const odds = (c.tier_odds ?? DEFAULT_ODDS) as TierOdds;
    const out = resolveRoll({ serverSeed: seed.seed, clientSeed: actor.client_seed, nonce: actor.nonce, items, odds, mode: 'uniform' });
    const [snap] = await tx<{ price_usd: number | null }[]>`select price_usd from asset_snapshots where asset_id = ${out.assetId}`;
    const itemsHash = poolHash(items);
    const [row] = await tx<{ id: number; created_at: Date }[]>`
      insert into rolls (user_id, device_id, case_id, pool_id, filters, server_seed_id, client_seed, nonce, items, items_hash,
                         r_tier, r_item, tier, result_asset_id, price_usd_at_roll, odds_mode)
      values (${input.userId ?? null}, ${input.deviceId ?? null}, ${c.id}, ${pool.id}, ${tx.json(filters)}, ${seed.id},
              ${actor.client_seed}, ${actor.nonce}, ${tx.json(items)}, ${itemsHash}, ${out.rTier}, ${out.rItem}, ${out.tier},
              ${out.assetId}, ${snap?.price_usd ?? null}, 'uniform')
      returning id, created_at`;
    const result: RollResult = {
      rollId: Number(row.id), caseId: c.id, chainScope: input.chainScope, poolId: pool.id, poolVersion: pool.version, poolHash: pool.hash,
      itemsHash, poolSize: items.length, tier: out.tier, assetId: out.assetId, serverSeedHash: seed.hash, clientSeed: actor.client_seed,
      nonce: actor.nonce, odds: out.odds, createdAt: row.created_at.toISOString(),
    };
    return { result, items };
  });
}

export type Verification =
  | { status: 'pending'; serverSeedHash: string; message: string }
  | { status: 'verified' | 'mismatch'; serverSeed: string; serverSeedHash: string; hashMatches: boolean; recomputed: { tier: Tier; assetId: number }; recorded: { tier: Tier; assetId: number };
      clientSeed: string; nonce: number; items: PoolItem[]; odds: TierOdds; oddsMode: OddsMode };

/** LAB-AC-030: after the seed is revealed anyone can recompute the roll; before that we only show the committed hash. */
export async function verifyRoll(rollId: number, sql: postgres.Sql = defaultSql): Promise<Verification | undefined> {
  const [r] = await sql<{ items: PoolItem[]; client_seed: string; nonce: number; tier: Tier; result_asset_id: number; seed: string; hash: string; revealed_at: Date | null; tier_odds: TierOdds; odds_mode: OddsMode }[]>`
    select r.items, r.client_seed, r.nonce, r.tier, r.result_asset_id, s.seed, s.hash, s.revealed_at, c.tier_odds, r.odds_mode
    from rolls r join server_seeds s on s.id = r.server_seed_id join cases c on c.id = r.case_id where r.id = ${rollId}`;
  if (!r) return undefined;
  if (!r.revealed_at) return { status: 'pending', serverSeedHash: r.hash, message: 'The server seed for this roll is revealed at the next rotation.' };
  const out = resolveRoll({ serverSeed: r.seed, clientSeed: r.client_seed, nonce: r.nonce, items: r.items, odds: r.tier_odds, mode: r.odds_mode });
  const { sha256Hex } = await import('./fair');
  const hashMatches = sha256Hex(r.seed) === r.hash;
  const recorded = { tier: r.tier, assetId: Number(r.result_asset_id) };
  const ok = hashMatches && out.tier === recorded.tier && out.assetId === recorded.assetId;
  // Everything a browser needs to redo the roll without trusting us (the filtered canonical pool and the case odds).
  return {
    status: ok ? 'verified' : 'mismatch', serverSeed: r.seed, serverSeedHash: r.hash, hashMatches, recomputed: { tier: out.tier, assetId: out.assetId }, recorded,
    clientSeed: r.client_seed, nonce: Number(r.nonce), items: canonicalPool(r.items), odds: r.tier_odds, oddsMode: r.odds_mode,
  };
}
