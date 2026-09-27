import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { allow, resetRateLimits } from '@/lib/ratelimit';
import { bestPulls, setHideFromBoard } from '@/modules/board/service';
import { CHAIN_SCOPE_ALL, buildPool, getCase } from '@/modules/cases/pools';
import { health } from '@/modules/health/service';
import { acceptInvite, INVITE_DAILY_CAP, inviteSummary } from '@/modules/invites/service';
import { claim, tasksFor } from '@/modules/points/service';
import { activeSeed } from '@/modules/rolls/service';
import { prunePools } from '../../worker/ingest';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;

async function reset() {
  await sql.unsafe(`truncate worker_runs, invites, redemptions, sponsor_campaigns, trades, rolls, case_pools, gate_results, moderation, asset_snapshots, assets,
    points_ledger, task_completions, sessions, wallets, auth_nonces, devices, users, server_seeds restart identity cascade`);
  resetRateLimits();
}

async function user(opts: { ageHours?: number; wallet?: string } = {}) {
  const [u] = await sql<{ id: string }[]>`insert into users (created_at) values (now() - make_interval(hours => ${opts.ageHours ?? 0})) returning id`;
  if (opts.wallet) await sql`insert into wallets (user_id, chain_family, address) values (${u.id}, 'solana', ${opts.wallet})`;
  return u.id;
}

async function asset(symbol: string, price: number) {
  const [a] = await sql<{ id: number }[]>`insert into assets (chain_id, address, symbol, sources) values ('solana', ${`Addr${symbol}`}, ${symbol}, ${['ds:boost']}) returning id`;
  await sql`insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, liquidity_usd) values (${a.id}, now(), ${price}, 500000, 20000)`;
  await sql`insert into gate_results (asset_id, gate, passed, reason) values (${a.id}, 'liquidity', true, 'ok'), (${a.id}, 'honeypot', true, 'ok')`;
  return Number(a.id);
}

/** A roll row written directly (rolls are immutable, so the timestamp and price are set at insert). */
async function rollRow(p: { userId: string; assetId: number; priceAtRoll: number; daysAgo?: number; caseId?: string }) {
  const seed = await activeSeed();
  let [pool] = await sql<{ id: number }[]>`select id from case_pools limit 1`;
  if (!pool) [pool] = await sql<{ id: number }[]>`insert into case_pools (case_id, chain_scope, version, items, hash, size) values ('trending', 'all', 1, '[]', 'h', 0) returning id`;
  const [r] = await sql<{ id: number }[]>`
    insert into rolls (user_id, case_id, pool_id, server_seed_id, client_seed, nonce, items, items_hash, r_tier, r_item, tier, result_asset_id, price_usd_at_roll, created_at)
    values (${p.userId}, ${p.caseId ?? 'trending'}, ${pool.id}, ${seed.id}, 'c', 1, '[]', 'h', 0.1, 0.1, 'small', ${p.assetId}, ${p.priceAtRoll},
            now() - make_interval(days => ${p.daysAgo ?? 0}))
    returning id`;
  return Number(r.id);
}

run('invites (LAB-AC-054)', () => {
  beforeEach(reset);

  it('only new accounts accept, never their own code, once', async () => {
    const inviter = await user({ ageHours: 72, wallet: 'Inviter111111111111111111111111111111111111' });
    const { code } = await inviteSummary(inviter);
    await expect(acceptInvite(inviter, code)).rejects.toMatchObject({ code: 'self' });
    const old = await user({ ageHours: 48 });
    await expect(acceptInvite(old, code)).rejects.toMatchObject({ code: 'too_old' });
    const fresh = await user();
    await expect(acceptInvite(fresh, 'ffffffffff')).rejects.toMatchObject({ code: 'bad_code' });
    expect(await acceptInvite(fresh, code)).toEqual({ ok: true });
    await expect(acceptInvite(fresh, code)).rejects.toMatchObject({ code: 'already_invited' });
  });

  it('counts after the invitee signs in and rolls on 3 different days, capped at 10 a day', async () => {
    const inviter = await user({ ageHours: 72, wallet: 'Inviter111111111111111111111111111111111111' });
    const { code } = await inviteSummary(inviter);
    const a = await asset('AAA', 1);
    const friends: string[] = [];
    for (let i = 0; i < INVITE_DAILY_CAP + 1; i++) {
      const f = await user();
      await acceptInvite(f, code);
      friends.push(f);
    }
    // Two days of rolls and no wallet: not yet.
    for (const f of friends) for (const d of [0, 1]) await rollRow({ userId: f, assetId: a, priceAtRoll: 1, daysAgo: d });
    await expect(claim(inviter, 'invite-friend')).rejects.toMatchObject({ code: 'not_done' });
    // Third day, but still no wallet: not yet.
    for (const f of friends) await rollRow({ userId: f, assetId: a, priceAtRoll: 1, daysAgo: 2 });
    await expect(claim(inviter, 'invite-friend')).rejects.toMatchObject({ code: 'not_done' });
    // Everyone signs in: each claim pays 100 once, up to the daily cap.
    for (const [i, f] of friends.entries()) await sql`insert into wallets (user_id, chain_family, address) values (${f}, 'solana', ${`Friend${i}`.padEnd(44, '1')})`;
    const task = (await tasksFor(inviter)).find((t) => t.id === 'invite-friend')!;
    expect(task.progress).toBe(INVITE_DAILY_CAP + 1);
    for (let i = 0; i < INVITE_DAILY_CAP; i++) expect((await claim(inviter, 'invite-friend')).points).toBe(100);
    await expect(claim(inviter, 'invite-friend')).rejects.toMatchObject({ code: 'daily_cap' });
    const s = await inviteSummary(inviter);
    expect(s).toMatchObject({ invited: INVITE_DAILY_CAP + 1, rewarded: INVITE_DAILY_CAP, claimable: 1, rewardedToday: INVITE_DAILY_CAP });
    const [{ n }] = await sql<{ n: number }[]>`select sum(delta)::int as n from points_ledger where user_id = ${inviter}`;
    expect(n).toBe(100 * INVITE_DAILY_CAP);
  });
});

run('best pulls (LAB-AC-057)', () => {
  beforeEach(reset);

  it('ranks real pulls by change since the pull, one row per coin, opt-out shows anon', async () => {
    const alice = await user({ wallet: 'A1ice11111111111111111111111111111111111111' });
    const bob = await user({ wallet: 'Bob111111111111111111111111111111111111111' });
    const up = await asset('UP', 3);      // pulled at 1 → +200 %
    const down = await asset('DOWN', 0.5); // pulled at 1 → −50 %
    const killed = await asset('KILL', 10);
    await rollRow({ userId: alice, assetId: up, priceAtRoll: 1.5 });  // +100 %, beaten by bob's pull of the same coin
    await rollRow({ userId: bob, assetId: up, priceAtRoll: 1 });
    await rollRow({ userId: alice, assetId: down, priceAtRoll: 1 });
    await rollRow({ userId: alice, assetId: killed, priceAtRoll: 1 });
    await rollRow({ userId: alice, assetId: down, priceAtRoll: 0.1, caseId: 'sponsored' }); // sponsored rolls never count
    await rollRow({ userId: alice, assetId: down, priceAtRoll: 0.01, daysAgo: 3 });        // outside 24 h
    await sql`insert into moderation (asset_id, reason, actor) values (${killed}, 'rug', 'admin')`;
    const board = await bestPulls('24h');
    expect(board.map((r) => [r.symbol, r.changePct, r.who])).toEqual([['UP', 200, 'Bob1…1111'], ['DOWN', -50, 'A1ic…1111']]);
    await setHideFromBoard(bob, true);
    expect((await bestPulls('24h'))[0].who).toBe('anon');
    const week = await bestPulls('7d');
    expect(week.find((r) => r.symbol === 'DOWN')!.changePct).toBe(4900);
  });
});

run('health and retention (LAB-AC-080)', () => {
  beforeEach(reset);

  it('alerts when the worker is late or a free budget is close, ok otherwise', async () => {
    await activeSeed();
    expect((await health()).alerts.map((a) => a.code)).toContain('worker_late');
    await sql`insert into worker_runs (started_at, finished_at, ok, ds_calls, paprika_calls) values (now() - interval '20 seconds', now(), true, 20, 1)`;
    const ok = await health();
    expect(ok.status).toBe('ok');
    await sql`insert into worker_runs (started_at, finished_at, ok, paprika_calls) values (now() - interval '2 days', now() - interval '2 days', true, 8500)`;
    expect((await health()).alerts.map((a) => a.code)).toEqual(['paprika_budget']);
    expect((await health(undefined, { paprikaKey: true })).status).toBe('ok');
  });

  it('prunes old pool versions nobody rolled on, keeps rolled-on and latest ones', async () => {
    const u = await user();
    const a = await asset('P', 1);
    const [p1] = await sql<{ id: number }[]>`insert into case_pools (case_id, chain_scope, version, items, hash, size, created_at) values ('trending', 'all', 1, '[]', 'h1', 0, now() - interval '3 days') returning id`;
    await sql`insert into case_pools (case_id, chain_scope, version, items, hash, size, created_at) values ('trending', 'all', 2, '[]', 'h2', 0, now() - interval '3 days') returning id`;
    const [p3] = await sql<{ id: number }[]>`insert into case_pools (case_id, chain_scope, version, items, hash, size, created_at) values ('trending', 'all', 3, '[]', 'h3', 0, now() - interval '2 days') returning id`;
    const seed = await activeSeed();
    await sql`insert into rolls (user_id, case_id, pool_id, server_seed_id, client_seed, nonce, items, items_hash, r_tier, r_item, tier, result_asset_id)
              values (${u}, 'trending', ${p1.id}, ${seed.id}, 'c', 1, '[]', 'h', 0.1, 0.1, 'small', ${a})`;
    expect(await prunePools(sql)).toBe(1); // p2: old, unreferenced, not latest
    const left = (await sql<{ id: number }[]>`select id from case_pools order by id`).map((r) => Number(r.id));
    expect(left).toEqual([Number(p1.id), Number(p3.id)]);
    await expect(sql`delete from case_pools where id = ${p1.id}`).rejects.toThrow(/foreign key/);
    await expect(sql`update case_pools set size = 9 where id = ${p3.id}`).rejects.toThrow(/immutable/);
    const c = (await getCase('trending'))!;
    expect(c.id).toBe('trending');
    expect(CHAIN_SCOPE_ALL).toBe('all');
    expect(typeof buildPool).toBe('function');
  });
});

describe('rate limit (LAB-AC-058)', () => {
  it('allows up to the limit per window, per key', () => {
    resetRateLimits();
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) expect(allow('task-claim:u1', 10, 60_000, t + i)).toBe(true);
    expect(allow('task-claim:u1', 10, 60_000, t + 20)).toBe(false);
    expect(allow('task-claim:u2', 10, 60_000, t + 20)).toBe(true);
    expect(allow('task-claim:u1', 10, 60_000, t + 60_001)).toBe(true);
  });
});

afterAll(async () => { await sql.end(); });
