import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { CHAIN_SCOPE_ALL, eligibleItems, getCase } from '@/modules/cases/pools';
import { assetDetail } from '@/modules/cases/read';
import { dexScreenerDown, paprikaPriceFallback } from '../../worker/fallback';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;

async function reset() {
  await sql.unsafe(`truncate worker_runs, rolls, case_pools, gate_results, moderation, asset_snapshots, assets, server_seeds restart identity cascade`);
}

/** Two Solana coins in a trending pool, last DEX Screener snapshot `minutesAgo` old. */
async function seed(minutesAgo: number) {
  const ids: number[] = [];
  for (const [addr, price] of [['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 0.000004], ['EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 0.2]] as const) {
    const [a] = await sql<{ id: number }[]>`insert into assets (chain_id, address, symbol, sources) values ('solana', ${addr}, ${addr.slice(0, 4)}, ${['ds:boost']}) returning id`;
    await sql`insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, fdv, liquidity_usd, price_source)
              values (${a.id}, now() - make_interval(mins => ${minutesAgo}), ${price}, 1000000, 1000000, 50000, 'dexscreener')`;
    await sql`insert into gate_results (asset_id, gate, passed, reason) values (${a.id}, 'liquidity', true, 'ok'), (${a.id}, 'honeypot', true, 'ok')`;
    ids.push(Number(a.id));
  }
  await sql`insert into case_pools (case_id, chain_scope, version, items, hash, size) values ('trending', 'all', 1, ${sql.json(ids.map((a) => ({ a, t: 'mid' })))}, 'h', 2)`;
  return ids;
}

// Recorded from https://api.dexpaprika.com/networks/solana/multi/prices on 2026-09-27.
const fixture = (await import('../fixtures/dexpaprika/multi-prices.json')).default as { id: string; price_usd: number }[];
function fakeFetch(calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(JSON.stringify(fixture), { status: 200 }); }) as typeof fetch;
}

run('DexPaprika price fallback (LAB-AC-022)', () => {
  beforeEach(reset);

  it('does nothing while DEX Screener is fresh', async () => {
    await seed(2);
    const calls: string[] = [];
    expect(await dexScreenerDown(sql)).toBe(false);
    expect(await paprikaPriceFallback(sql, { fetchImpl: fakeFetch(calls) })).toMatchObject({ used: false });
    expect(calls).toHaveLength(0);
  });

  it('after 10 min without DEX Screener: batch prices from DexPaprika, scale caps, mark the source, then wait 5 min', async () => {
    const [bonk] = await seed(12);
    const calls: string[] = [];
    const out = await paprikaPriceFallback(sql, { fetchImpl: fakeFetch(calls) });
    expect(out).toEqual({ used: true, updated: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/networks/solana/multi/prices?tokens=');
    const d = (await assetDetail(bonk))!;
    const expected = fixture.find((f) => f.id.startsWith('Dez'))!.price_usd;
    expect(d.priceUsd).toBeCloseTo(expected, 12);
    expect(d.marketCap).toBeCloseTo(1_000_000 * (expected / 0.000004), 3);
    expect(d.priceSource).toBe('dexpaprika');
    expect(d.stale).toBe(false);
    expect(await paprikaPriceFallback(sql, { fetchImpl: fakeFetch(calls) })).toMatchObject({ used: false, reason: 'ran recently' });
    expect(calls).toHaveLength(1);
  });

  it('stops at 80 % of the 30-day credit budget', async () => {
    await seed(12);
    await sql`insert into worker_runs (started_at, ok, paprika_calls) values (now() - interval '1 day', true, 8100)`;
    const calls: string[] = [];
    expect(await paprikaPriceFallback(sql, { fetchImpl: fakeFetch(calls) })).toMatchObject({ used: false, reason: 'budget' });
    expect(calls).toHaveLength(0);
  });

  it('both sources down: coins older than 15 min leave the pool and their price is hidden', async () => {
    const [bonk] = await seed(20);
    const failing = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    expect(await paprikaPriceFallback(sql, { fetchImpl: failing })).toEqual({ used: true, updated: 0 });
    expect(await eligibleItems((await getCase('trending'))!, CHAIN_SCOPE_ALL)).toHaveLength(0);
    const d = (await assetDetail(bonk))!;
    expect(d.stale).toBe(true);
    expect(d.priceUsd).toBeNull();
  });
});

afterAll(async () => { await sql.end(); });
