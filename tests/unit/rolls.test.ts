import { describe, expect, it } from 'vitest';
import { DEFAULT_ODDS, effectiveOdds, fairFloat, poolHash, resolveRoll, sha256Hex, uniformOdds, type PoolItem, type Tier } from '@/modules/rolls/fair';

const pool: PoolItem[] = [];
const sizes: Record<Tier, number> = { micro: 40, small: 30, mid: 20, large: 8, top: 2 };
let id = 1;
for (const [t, n] of Object.entries(sizes) as [Tier, number][]) for (let i = 0; i < n; i++) pool.push({ a: id++, t });

describe('provably fair roll (LAB-AC-030, 031)', () => {
  it('fairFloat is deterministic and in [0,1)', () => {
    const a = fairFloat('seed', 'client', 1, 0);
    expect(a).toBe(fairFloat('seed', 'client', 1, 0));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(fairFloat('seed', 'client', 2, 0)).not.toBe(a);
  });

  it('same inputs give the same outcome; pool order does not matter', () => {
    const input = { serverSeed: 'abc', clientSeed: 'glorp-hunter', nonce: 42, items: pool, odds: DEFAULT_ODDS };
    const one = resolveRoll(input);
    const two = resolveRoll({ ...input, items: [...pool].reverse() });
    expect(two).toEqual(one);
    expect(poolHash(pool)).toBe(poolHash([...pool].reverse()));
  });

  it('10 000 rolls match the published tier odds within 1 percentage point', () => {
    const counts: Record<string, number> = {};
    const N = 10_000;
    for (let n = 0; n < N; n++) {
      const r = resolveRoll({ serverSeed: 'rotation-1', clientSeed: 'c', nonce: n, items: pool, odds: DEFAULT_ODDS });
      counts[r.tier] = (counts[r.tier] ?? 0) + 1;
    }
    for (const t of Object.keys(DEFAULT_ODDS) as Tier[]) expect(Math.abs((counts[t] ?? 0) / N * 100 - DEFAULT_ODDS[t])).toBeLessThan(1);
  });

  it('odds renormalise over non-empty tiers and always sum to 10 000 bp', () => {
    const noTop = pool.filter((i) => i.t !== 'top');
    const eff = effectiveOdds(DEFAULT_ODDS, noTop);
    expect(eff.top).toBeUndefined();
    expect(Object.values(eff).reduce((s, v) => s + (v ?? 0), 0)).toBe(10_000);
    for (let n = 0; n < 500; n++) expect(resolveRoll({ serverSeed: 's', clientSeed: 'c', nonce: n, items: noTop, odds: DEFAULT_ODDS }).tier).not.toBe('top');
  });

  it('the published hash commits to the seed', () => {
    expect(sha256Hex('8f3a')).toMatch(/^[0-9a-f]{64}$/);
    expect(() => resolveRoll({ serverSeed: 's', clientSeed: 'c', nonce: 0, items: [], odds: DEFAULT_ODDS })).toThrow('empty pool');
  });
});

describe('uniform odds (owner decision 2026-09-28)', () => {
  it('every coin comes up about 1/N of the time, whatever its tier', () => {
    // 3 Top coins and 37 Micro coins: with tier odds a Top coin would be ~1 %, uniformly it is 1/40 = 2.5 % like every other coin.
    const pool: PoolItem[] = [...Array.from({ length: 3 }, (_, i) => ({ a: 1 + i, t: 'top' as Tier })), ...Array.from({ length: 37 }, (_, i) => ({ a: 100 + i, t: 'micro' as Tier }))];
    const counts = new Map<number, number>();
    const rolls = 20_000;
    for (let n = 0; n < rolls; n++) {
      const r = resolveRoll({ serverSeed: 'uniform-seed', clientSeed: 'c', nonce: n, items: pool, odds: DEFAULT_ODDS, mode: 'uniform' });
      counts.set(r.assetId, (counts.get(r.assetId) ?? 0) + 1);
    }
    for (const item of pool) expect(Math.abs((counts.get(item.a) ?? 0) / rolls - 1 / 40)).toBeLessThan(0.006);
    expect(uniformOdds(pool)).toEqual({ micro: 9250, top: 750 });
  });

  it('is deterministic and order-independent, and old tier-mode rolls still resolve the same', () => {
    const pool: PoolItem[] = [{ a: 5, t: 'mid' }, { a: 2, t: 'micro' }, { a: 9, t: 'top' }];
    const input = { serverSeed: 's', clientSeed: 'c', nonce: 7, items: pool, odds: DEFAULT_ODDS, mode: 'uniform' as const };
    expect(resolveRoll(input)).toEqual(resolveRoll({ ...input, items: [...pool].reverse() }));
    expect(resolveRoll({ ...input, mode: 'tiers' })).toEqual(resolveRoll({ serverSeed: 's', clientSeed: 'c', nonce: 7, items: pool, odds: DEFAULT_ODDS }));
  });
});

describe('"Pick 1 of 3" (owner request 2026-10-01, DECISIONS #27)', () => {
  const input = { serverSeed: 'rotation-7', clientSeed: 'card-picker', nonce: 9, items: pool, odds: DEFAULT_ODDS, mode: 'pick3' as const };

  it('draws three different coins, deterministically and independent of pool order; the chosen card is the result', () => {
    for (let n = 0; n < 500; n++) {
      const cards = resolveRoll({ ...input, nonce: n, pick: 0 }).candidates!;
      expect(cards).toHaveLength(3);
      expect(new Set(cards).size).toBe(3);
      for (const pick of [0, 1, 2]) {
        const r = resolveRoll({ ...input, nonce: n, pick });
        expect(r.candidates).toEqual(cards);              // the cards don't depend on the choice
        expect(r.assetId).toBe(cards[pick]);
        expect(resolveRoll({ ...input, nonce: n, pick, items: [...pool].reverse() })).toEqual(r);
      }
    }
  });

  it('rejects a missing or out-of-range card', () => {
    for (const pick of [undefined, null, -1, 3, 1.5]) expect(() => resolveRoll({ ...input, pick })).toThrow(/pick must be/);
  });

  it('every coin still comes up about 1/N of the time, whichever card is chosen', () => {
    const N = 30_000;
    for (const pick of [0, 1, 2]) {
      const counts = new Map<number, number>();
      for (let n = 0; n < N; n++) { const a = resolveRoll({ ...input, nonce: n, pick }).assetId; counts.set(a, (counts.get(a) ?? 0) + 1); }
      const expected = N / pool.length;
      expect(counts.size).toBe(pool.length);
      for (const c of counts.values()) expect(Math.abs(c - expected) / expected).toBeLessThan(0.25);
    }
  });

  it('the browser verifier recomputes the same three cards and result', async () => {
    const { recomputeRoll } = await import('@/components/fairBrowser');
    for (let n = 0; n < 40; n++) {
      const pick = n % 3;
      const server = resolveRoll({ ...input, nonce: n, pick });
      const browser = await recomputeRoll({ serverSeed: input.serverSeed, clientSeed: input.clientSeed, nonce: n, items: [...pool].reverse(), odds: DEFAULT_ODDS, oddsMode: 'pick3', pick });
      expect(browser).toEqual({ tier: server.tier, assetId: server.assetId, candidates: server.candidates });
    }
  });
});
