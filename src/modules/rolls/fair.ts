import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Provably fair roll (LAB_MASTER §7.2).
 *
 * The server commits to sha256(serverSeed) before any roll. A roll draws two numbers in [0, 1) from
 * HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`), cursor 0 for the tier and 1 for the item.
 * Tiers are chosen by the case odds renormalised over the tiers that are non-empty after the user's filters;
 * the item is chosen uniformly inside the tier, in the pool's canonical order. Anyone holding the revealed
 * seed, the client seed, the nonce, the pool items and the filters can recompute the result with `resolveRoll`.
 */

export const TIERS = ['micro', 'small', 'mid', 'large', 'top'] as const;
export type Tier = (typeof TIERS)[number];
export type TierOdds = Record<Tier, number>;
export type PoolItem = { a: number; t: Tier };

export const DEFAULT_ODDS: TierOdds = { micro: 35, small: 30, mid: 20, large: 12, top: 3 };

export function newServerSeed(): { seed: string; hash: string } {
  const seed = randomBytes(32).toString('hex');
  return { seed, hash: sha256Hex(seed) };
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** 52 bits of HMAC output → a double in [0, 1) with no modulo bias. */
export function fairFloat(serverSeed: string, clientSeed: string, nonce: number, cursor: number): number {
  const digest = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest();
  const hi = digest.readUIntBE(0, 6); // 48 bits
  const lo = digest[6] >> 4; // 4 more bits
  return (hi * 16 + lo) / 2 ** 52;
}

/** Canonical JSON for a pool: items sorted by tier order then asset id, so the hash never depends on insertion order. */
export function canonicalPool(items: PoolItem[]): PoolItem[] {
  const rank = (t: Tier) => TIERS.indexOf(t);
  return [...items].sort((x, y) => rank(x.t) - rank(y.t) || x.a - y.a).map(({ a, t }) => ({ a, t }));
}

export function poolHash(items: PoolItem[]): string {
  return sha256Hex(JSON.stringify(canonicalPool(items)));
}

/** Odds renormalised over the tiers that actually have items, as integer basis points summing to 10 000. */
export function effectiveOdds(odds: TierOdds, items: PoolItem[]): Partial<Record<Tier, number>> {
  const present = TIERS.filter((t) => odds[t] > 0 && items.some((i) => i.t === t));
  const total = present.reduce((s, t) => s + odds[t], 0);
  const out: Partial<Record<Tier, number>> = {};
  if (!total) return out;
  let assigned = 0;
  present.forEach((t, i) => {
    const bp = i === present.length - 1 ? 10_000 - assigned : Math.round((odds[t] / total) * 10_000);
    out[t] = bp;
    assigned += bp;
  });
  return out;
}

/** 'uniform': every coin in the pool has the same chance, 1/N (owner decision 2026-09-28). 'tiers': the older two-step roll
 * (tier by the case's tier odds, then a coin inside that tier), kept so earlier rolls still verify. 'pick3': "Pick 1 of 3"
 * (owner request 2026-10-01): three different coins are drawn and the user's face-down card choice decides which is theirs. */
export type OddsMode = 'tiers' | 'uniform' | 'pick3';

export const PICK_CARDS = 3;
const PICK_MAX_CURSORS = 64;

/**
 * "Pick 1 of 3": draws `PICK_CARDS` different positions of the canonical pool, one HMAC float per cursor (0, 1, 2, …), skipping
 * a position already drawn. The user sends the card index before anything is drawn, and the seed is committed, so the server
 * cannot steer which coin sits under which card. Drawing without replacement keeps every coin at exactly 1/N for any card.
 */
export function drawThree(serverSeed: string, clientSeed: string, nonce: number, poolSize: number): { positions: number[]; floats: number[] } {
  if (poolSize < PICK_CARDS) throw new Error('pool too small for three cards');
  const positions: number[] = [];
  const floats: number[] = [];
  for (let cursor = 0; positions.length < PICK_CARDS; cursor++) {
    if (cursor >= PICK_MAX_CURSORS) throw new Error('could not draw three different coins');
    const r = fairFloat(serverSeed, clientSeed, nonce, cursor);
    const position = Math.floor(r * poolSize);
    if (!positions.includes(position)) { positions.push(position); floats.push(r); }
  }
  return { positions, floats };
}

/** Share of the pool in each tier, in basis points summing to 10 000: the real chance of each tier when every coin is equal. */
export function uniformOdds(items: PoolItem[]): Partial<Record<Tier, number>> {
  const out: Partial<Record<Tier, number>> = {};
  const present = TIERS.filter((t) => items.some((i) => i.t === t));
  let assigned = 0;
  present.forEach((t, i) => {
    const bp = i === present.length - 1 ? 10_000 - assigned : Math.round((items.filter((x) => x.t === t).length / items.length) * 10_000);
    out[t] = bp;
    assigned += bp;
  });
  return out;
}

export type RollInput = { serverSeed: string; clientSeed: string; nonce: number; items: PoolItem[]; odds: TierOdds; mode?: OddsMode; pick?: number | null };
export type RollOutcome = { tier: Tier; assetId: number; rTier: number; rItem: number; odds: Partial<Record<Tier, number>>; candidates?: number[] };

/** Deterministic: same input, same outcome. `items` must already be the filtered pool. */
export function resolveRoll({ serverSeed, clientSeed, nonce, items, odds, mode = 'tiers', pick: card }: RollInput): RollOutcome {
  if (!items.length) throw new Error('empty pool');
  const pool = canonicalPool(items);
  if (mode === 'pick3') {
    if (card == null || !Number.isInteger(card) || card < 0 || card >= PICK_CARDS) throw new Error('pick must be 0, 1 or 2');
    const { positions, floats } = drawThree(serverSeed, clientSeed, nonce, pool.length);
    const chosen = pool[positions[card]];
    return { tier: chosen.t, assetId: chosen.a, rTier: floats[card], rItem: floats[card], odds: uniformOdds(pool), candidates: positions.map((p) => pool[p].a) };
  }
  if (mode === 'uniform') {
    // One draw over the canonical pool: coin i wins when floor(r × N) = i, so each coin has exactly 1/N.
    const rTier = fairFloat(serverSeed, clientSeed, nonce, 0);
    const pick = pool[Math.floor(rTier * pool.length)];
    return { tier: pick.t, assetId: pick.a, rTier, rItem: rTier, odds: uniformOdds(pool) };
  }
  const eff = effectiveOdds(odds, pool);
  const rTier = fairFloat(serverSeed, clientSeed, nonce, 0);
  const rItem = fairFloat(serverSeed, clientSeed, nonce, 1);
  const point = rTier * 10_000;
  let acc = 0;
  let tier: Tier | undefined;
  for (const t of TIERS) {
    const bp = eff[t];
    if (!bp) continue;
    acc += bp;
    if (point < acc) { tier = t; break; }
  }
  tier ??= TIERS.filter((t) => eff[t]).at(-1)!;
  const inTier = pool.filter((i) => i.t === tier);
  const pick = inTier[Math.floor(rItem * inTier.length)];
  return { tier, assetId: pick.a, rTier, rItem, odds: eff };
}
