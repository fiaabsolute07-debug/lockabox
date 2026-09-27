import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { buildPool, CHAIN_SCOPE_ALL, eligibleItems, getCase, latestPool } from '@/modules/cases/pools';
import { feed } from '@/modules/cases/read';
import { claim, balance, TaskError } from '@/modules/points/service';
import { activeSeed, roll, RollError, rotateSeed, verifyRoll, MIN_POOL } from '@/modules/rolls/service';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;

async function reset() {
  await sql.unsafe(`truncate trades, rolls, case_pools, gate_results, moderation, asset_snapshots, assets, points_ledger, task_completions,
    sessions, wallets, auth_nonces, devices, users, server_seeds restart identity cascade`);
}

/** n Solana coins spread over market-cap tiers, all gates passed, fresh snapshots, trending source. */
async function seedAssets(n: number, opts: { chain?: string; symbolPrefix?: string } = {}) {
  const caps = [50_000, 500_000, 5_000_000, 50_000_000, 500_000_000];
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const [a] = await sql<{ id: number }[]>`
      insert into assets (chain_id, address, symbol, sources) values (${opts.chain ?? 'solana'}, ${`Addr${opts.symbolPrefix ?? ''}${i}`}, ${`${opts.symbolPrefix ?? 'C'}${i}`}, ${['ds:boost']})
      returning id`;
    const id = Number(a.id);
    ids.push(id);
    await sql`insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, liquidity_usd, volume_24h, change_h24, pair_created_at)
              values (${id}, now(), 0.001, ${caps[i % caps.length]}, 20000, 5000, ${i % 2 ? 5 : -5}, now() - interval '3 days')`;
    await sql`insert into gate_results (asset_id, gate, passed, reason) values (${id}, 'liquidity', true, 'ok'), (${id}, 'honeypot', true, 'ok')`;
  }
  return ids;
}

run('pools (LAB-AC-020/021)', () => {
  beforeEach(reset);

  it('freezes a version, reuses it when unchanged, and refuses updates', async () => {
    await seedAssets(30);
    const c = (await getCase('trending'))!;
    const p1 = await buildPool(c, CHAIN_SCOPE_ALL);
    const p2 = await buildPool(c, CHAIN_SCOPE_ALL);
    expect(p1!.version).toBe(1);
    expect(p2!.id).toBe(p1!.id);
    await expect(sql`update case_pools set size = 1 where id = ${p1!.id}`).rejects.toThrow(/immutable/);
    // Deleting is left to the pruner, which never touches a pool a roll points at (tests/integration/r3.db.test.ts).
  });

  it('excludes killed, failed-gate, stale and blocklisted assets', async () => {
    const ids = await seedAssets(25);
    await sql`insert into moderation (asset_id, reason, actor) values (${ids[0]}, 'test', 'test')`;
    await sql`update gate_results set passed = false where asset_id = ${ids[1]} and gate = 'honeypot'`;
    await sql`update asset_snapshots set taken_at = now() - interval '1 hour' where asset_id = ${ids[2]}`;
    await sql`update assets set symbol = 'WETH' where id = ${ids[3]}`;
    const items = await eligibleItems((await getCase('trending'))!, CHAIN_SCOPE_ALL);
    const got = new Set(items.map((i) => i.a));
    for (const bad of ids.slice(0, 4)) expect(got.has(bad)).toBe(false);
    expect(items.length).toBe(21);
  });
});

run('rolls (LAB-AC-028/030/031/032)', () => {
  beforeEach(async () => {
    await reset();
    await seedAssets(40);
    await buildPool((await getCase('trending'))!, CHAIN_SCOPE_ALL);
  });

  it('no roll ever uses a seed that was already revealed, even when a rotation races the rolls', async () => {
    const rolls = Array.from({ length: 30 }, (_, i) => roll({ deviceId: `device-race-${String(i).padStart(6, '0')}`, caseId: 'trending', chainScope: CHAIN_SCOPE_ALL }));
    const rotation = new Promise((r) => setTimeout(r, 5)).then(() => rotateSeed());
    const out = await Promise.all([...rolls, rotation]);
    expect(out).toHaveLength(31);
    const rows = await sql<{ roll: number; seed: number; created_at: Date; revealed_at: Date | null }[]>`
      select r.id as roll, s.id as seed, r.created_at, s.revealed_at from rolls r join server_seeds s on s.id = r.server_seed_id order by r.id`;
    const bad = rows.filter((x) => x.revealed_at && x.revealed_at <= x.created_at);
    if (bad.length) console.log(JSON.stringify(rows.slice(0, 5)), JSON.stringify(await sql`select id, active_from, revealed_at from server_seeds`));
    expect(bad).toHaveLength(0);
  });

  it('a guest rolls for free, nonce increments, the result is in the pool', async () => {
    const r1 = await roll({ deviceId: 'device-aaaaaaaaaaaa', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL });
    const pool = await latestPool('trending', CHAIN_SCOPE_ALL);
    expect(pool!.items.some((i) => i.a === r1.assetId)).toBe(true);
    expect(r1.nonce).toBe(1);
    await sql`update devices set nonce = nonce where id = 'device-aaaaaaaaaaaa'`;
    await new Promise((r) => setTimeout(r, 1050));
    const r2 = await roll({ deviceId: 'device-aaaaaaaaaaaa', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL });
    expect(r2.nonce).toBe(2);
  });

  it('anti-bot pacing: a second roll within 1 s is refused, never a daily cap', async () => {
    await roll({ deviceId: 'device-bbbbbbbbbbbb', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL });
    await expect(roll({ deviceId: 'device-bbbbbbbbbbbb', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL })).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('concurrent rolls from one device: exactly one wins the 1 s pacing window', async () => {
    const res = await Promise.allSettled(Array.from({ length: 8 }, () => roll({ deviceId: 'device-eeeeeeeeeeee', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL })));
    expect(res.filter((r) => r.status === 'fulfilled').length).toBe(1);
  });

  it('kill switch removes an asset from rolls immediately, before any pool rebuild (AC-069)', async () => {
    const pool = await latestPool('trending', CHAIN_SCOPE_ALL);
    const victim = pool!.items[0].a;
    await sql`insert into moderation (asset_id, reason, actor) values (${victim}, 'test kill', 'test')`;
    for (let i = 0; i < 15; i++) {
      const r = await roll({ deviceId: `device-kill-${String(i).padStart(4, '0')}`, caseId: 'trending', chainScope: CHAIN_SCOPE_ALL, filters: { tiers: [pool!.items[0].t, 'small', 'mid'] } }).catch((e) => e);
      if (!(r instanceof RollError)) {
        const [{ items }] = await sql<{ items: { a: number }[] }[]>`select items from rolls where id = ${r.rollId}`;
        expect(items.some((x) => x.a === victim)).toBe(false);
      }
    }
  });

  it('filters that leave fewer than MIN_POOL items are refused', async () => {
    const e = await roll({ deviceId: 'device-cccccccccccc', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL, filters: { tiers: ['top'] } }).catch((x) => x);
    expect(e).toBeInstanceOf(RollError);
    expect(e.code).toBe('pool_too_small');
    expect(e.detail.min).toBe(MIN_POOL);
  });

  it('pending before reveal, verified after rotation; rolls are immutable', async () => {
    const r = await roll({ deviceId: 'device-dddddddddddd', caseId: 'trending', chainScope: CHAIN_SCOPE_ALL });
    expect((await verifyRoll(r.rollId))!.status).toBe('pending');
    const seed = await activeSeed();
    expect(seed.hash).toBe(r.serverSeedHash);
    await rotateSeed();
    const v = await verifyRoll(r.rollId);
    expect(v!.status).toBe('verified');
    // A browser gets everything it needs to redo the roll and to check the pool hash itself.
    if (v!.status === 'pending') throw new Error('unreachable');
    expect(v!.nonce).toBe(r.nonce);
    expect(v!.clientSeed).toBe(r.clientSeed);
    const { sha256Hex } = await import('@/modules/rolls/fair');
    expect(sha256Hex(JSON.stringify(v!.items))).toBe(r.itemsHash);
    await expect(sql`update rolls set tier = 'top' where id = ${r.rollId}`).rejects.toThrow(/immutable/);
  });
});

run('points (LAB-AC-049/050/052/056)', () => {
  beforeEach(reset);

  it('only tasks add points; the ledger is append-only; claims are idempotent under concurrency', async () => {
    const [u] = await sql<{ id: string }[]>`insert into users default values returning id`;
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => claim(u.id, 'daily-checkin')));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(await balance(u.id)).toBe(50);
    await expect(sql`update points_ledger set delta = 999`).rejects.toThrow(/append-only/);
    await expect(sql`delete from points_ledger`).rejects.toThrow(/append-only/);
    const e = await claim(u.id, 'daily-10-rolls').catch((x) => x);
    expect(e).toBeInstanceOf(TaskError);
    expect(e.code).toBe('not_done');
  });

  it('no task kind can reward posting on X', async () => {
    await expect(sql`insert into tasks (id, title, points, kind) values ('post-on-x', 'Post on X', 10, 'x_post')`).rejects.toThrow();
  });
});

run('feed (LAB-AC-088)', () => {
  beforeEach(reset);
  it('is empty without real events and never invents activity', async () => {
    const f = await feed();
    expect(f.items).toEqual([]);
    expect(f.stats.rolls1h).toBe(0);
    expect(f.stats.buysToday).toBe(0);
  });
});

afterAll(async () => { await sql.end(); });
