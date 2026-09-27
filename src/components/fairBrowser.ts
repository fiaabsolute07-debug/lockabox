import { TIERS, type Tier } from './api';

export type BrowserPoolItem = { a: number; t: Tier };

function canonicalPool(items: BrowserPoolItem[]) {
  return [...items].sort((left, right) => TIERS.indexOf(left.t) - TIERS.indexOf(right.t) || left.a - right.a);
}

function effectiveOdds(odds: Partial<Record<Tier, number>>, items: BrowserPoolItem[]) {
  const present = TIERS.filter((tier) => (odds[tier] ?? 0) > 0 && items.some((item) => item.t === tier));
  const total = present.reduce((sum, tier) => sum + (odds[tier] ?? 0), 0);
  const result: Partial<Record<Tier, number>> = {};
  let assigned = 0;
  present.forEach((tier, index) => {
    const basisPoints = index === present.length - 1 ? 10_000 - assigned : Math.round(((odds[tier] ?? 0) / total) * 10_000);
    result[tier] = basisPoints;
    assigned += basisPoints;
  });
  return result;
}

async function hmacFloat(serverSeed: string, clientSeed: string, nonce: number, cursor: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${clientSeed}:${nonce}:${cursor}`)));
  let firstSix = 0n;
  for (let index = 0; index < 6; index += 1) firstSix = (firstSix << 8n) | BigInt(bytes[index]);
  const fiftyTwoBits = firstSix * 16n + BigInt(bytes[6] >> 4);
  return Number(fiftyTwoBits) / 2 ** 52;
}

export async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function recomputeRoll(input: {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  items: BrowserPoolItem[];
  odds: Partial<Record<Tier, number>>;
}) {
  const pool = canonicalPool(input.items);
  const odds = effectiveOdds(input.odds, pool);
  const tierPoint = (await hmacFloat(input.serverSeed, input.clientSeed, input.nonce, 0)) * 10_000;
  const itemPoint = await hmacFloat(input.serverSeed, input.clientSeed, input.nonce, 1);
  let cursor = 0;
  let tier = TIERS.find((candidate) => {
    cursor += odds[candidate] ?? 0;
    return tierPoint < cursor;
  });
  tier ??= [...TIERS].reverse().find((candidate) => odds[candidate] !== undefined) ?? 'micro';
  const inTier = pool.filter((item) => item.t === tier);
  return { tier, assetId: inTier[Math.floor(itemPoint * inTier.length)]?.a ?? 0 };
}
