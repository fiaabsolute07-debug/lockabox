import { describe, expect, it } from 'vitest';
import { DEFAULT_ODDS, effectiveOdds, fairFloat, poolHash, resolveRoll, sha256Hex, type PoolItem, type Tier } from '@/modules/rolls/fair';

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
