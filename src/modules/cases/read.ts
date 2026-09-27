import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { effectiveOdds, TIERS, type PoolItem, type Tier, type TierOdds } from '@/modules/rolls/fair';
import { getCase, latestPool, listCases, SNAPSHOT_MAX_AGE_MINUTES } from './pools';

/** Read models for the UI (documented in docs/UI_CONTRACT.md). Only fields Lockabox needs, never raw provider payloads (LAB-AC-023). */

export type AssetCard = {
  id: number; chainId: string; address: string; symbol: string | null; name: string | null; imageUrl: string | null;
  tier: Tier | null; priceUsd: number | null; marketCap: number | null; liquidityUsd: number | null;
};

export type AssetDetail = AssetCard & {
  fdv: number | null; volume24h: number | null; change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  pairAddress: string | null; dexId: string | null; pairCreatedAt: string | null; snapshotAt: string | null; stale: boolean;
  links: { dexscreener: string | null; explorer: string | null; websites: string[]; socials: { platform: string; handle: string }[] };
  chart: { dexscreenerEmbed: string | null; geckoterminalEmbed: string | null };
  swapEnabled: boolean; lockaboxBuys24h: number;
};

type SnapRow = {
  id: number; chain_id: string; address: string; symbol: string | null; name: string | null; image_url: string | null;
  price_usd: number | null; market_cap: number | null; fdv: number | null; liquidity_usd: number | null; volume_24h: number | null;
  change_m5: number | null; change_h1: number | null; change_h6: number | null; change_h24: number | null; pair_address: string | null;
  dex_id: string | null; pair_created_at: Date | null; taken_at: Date | null; dexscreener_url: string | null; websites: unknown; socials: unknown;
  swap_enabled: boolean; explorer_token_url: string | null; family: string;
};

function tierFor(items: PoolItem[] | undefined, id: number): Tier | null {
  return items?.find((i) => i.a === id)?.t ?? null;
}

export async function chainsAndCases(sql: postgres.Sql = defaultSql) {
  const chains = await sql<{ id: string; name: string; family: string; swap_enabled: boolean }[]>`select id, name, family, swap_enabled from chains where enabled order by sort`;
  const cases = await listCases(sql);
  const [seed] = await sql<{ hash: string; active_from: Date }[]>`select hash, active_from from server_seeds where revealed_at is null`;
  return {
    chains: chains.map((c) => ({ id: c.id, name: c.name, family: c.family, swapEnabled: c.swap_enabled })),
    cases: cases.filter((c) => !c.cost_points).map((c) => ({ id: c.id, title: c.title, kind: c.kind })),
    activeSeedHash: seed?.hash ?? null,
  };
}

export async function caseSummary(caseId: string, chainScope: string, opts: { contents?: number } = {}, sql: postgres.Sql = defaultSql) {
  const c = await getCase(caseId, sql);
  if (!c) return undefined;
  const pool = await latestPool(caseId, chainScope, sql);
  const items = pool?.items ?? [];
  const counts = Object.fromEntries(TIERS.map((t) => [t, items.filter((i) => i.t === t).length])) as Record<Tier, number>;
  // Contents preview: a spread across tiers, rarest first, so the grid shows what is inside.
  const limit = opts.contents ?? 32;
  const byTier = [...TIERS].reverse().map((t) => items.filter((i) => i.t === t));
  const preview: PoolItem[] = [];
  for (let k = 0; preview.length < Math.min(limit, items.length); k++) for (const list of byTier) if (list[k] && preview.length < limit) preview.push(list[k]);
  const cards = await assetCards(preview.map((p) => p.a), items, sql);
  return {
    case: { id: c.id, title: c.title, kind: c.kind },
    chainScope,
    pool: pool ? { id: pool.id, version: pool.version, hash: pool.hash, size: pool.size, createdAt: pool.created_at.toISOString() } : null,
    tierCounts: counts,
    odds: effectiveOdds(c.tier_odds as TierOdds, items),
    contents: cards,
  };
}

export async function assetCards(ids: number[], poolItems: PoolItem[] | undefined, sql: postgres.Sql = defaultSql): Promise<AssetCard[]> {
  if (!ids.length) return [];
  const rows = await sql<SnapRow[]>`
    select a.id, a.chain_id, a.address, a.symbol, a.name, a.image_url, s.price_usd, s.market_cap, s.liquidity_usd
    from assets a left join asset_snapshots s on s.asset_id = a.id where a.id = any(${ids}::bigint[])`;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [{ id, chainId: r.chain_id, address: r.address, symbol: r.symbol, name: r.name, imageUrl: r.image_url, tier: tierFor(poolItems, id),
      priceUsd: r.price_usd, marketCap: r.market_cap, liquidityUsd: r.liquidity_usd }];
  });
}

export async function assetDetail(id: number, tier: Tier | null = null, sql: postgres.Sql = defaultSql): Promise<AssetDetail | undefined> {
  const [r] = await sql<SnapRow[]>`
    select a.id, a.chain_id, a.address, a.symbol, a.name, a.image_url, s.price_usd, s.market_cap, s.fdv, s.liquidity_usd, s.volume_24h,
           s.change_m5, s.change_h1, s.change_h6, s.change_h24, s.pair_address, s.dex_id, s.pair_created_at, s.taken_at,
           s.dexscreener_url, s.websites, s.socials, ch.swap_enabled, ch.explorer_token_url, ch.family
    from assets a join chains ch on ch.id = a.chain_id left join asset_snapshots s on s.asset_id = a.id where a.id = ${id}`;
  if (!r) return undefined;
  const [buys] = await sql<{ n: number }[]>`select count(*)::int as n from trades where asset_id = ${id} and status = 'confirmed' and created_at > now() - interval '24 hours'`;
  const [killed] = await sql`select 1 from moderation where asset_id = ${id}`;
  const stale = !r.taken_at || Date.now() - r.taken_at.getTime() > SNAPSHOT_MAX_AGE_MINUTES * 60_000;
  const pair = r.pair_address;
  return {
    id: Number(r.id), chainId: r.chain_id, address: r.address, symbol: r.symbol, name: r.name, imageUrl: r.image_url, tier,
    priceUsd: stale ? null : r.price_usd, marketCap: r.market_cap, liquidityUsd: r.liquidity_usd, fdv: r.fdv, volume24h: r.volume_24h,
    change: { m5: r.change_m5, h1: r.change_h1, h6: r.change_h6, h24: r.change_h24 },
    pairAddress: pair, dexId: r.dex_id, pairCreatedAt: r.pair_created_at?.toISOString() ?? null, snapshotAt: r.taken_at?.toISOString() ?? null, stale,
    links: {
      dexscreener: r.dexscreener_url, explorer: r.explorer_token_url?.replace('{address}', r.address) ?? null,
      websites: Array.isArray(r.websites) ? (r.websites as string[]) : [], socials: Array.isArray(r.socials) ? (r.socials as { platform: string; handle: string }[]) : [],
    },
    // LAB §3.4: official embeds only (DEX Screener first, GeckoTerminal fallback). Never our own chart from their data.
    chart: {
      dexscreenerEmbed: pair ? `https://dexscreener.com/${r.chain_id}/${pair}?embed=1&theme=dark&trades=0&info=0` : null,
      geckoterminalEmbed: pair ? `https://www.geckoterminal.com/${r.chain_id === 'bsc' ? 'bsc' : r.chain_id === 'ethereum' ? 'eth' : r.chain_id}/pools/${pair}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0` : null,
    },
    swapEnabled: r.swap_enabled && !killed && !stale,
    lockaboxBuys24h: buys?.n ?? 0,
  };
}

/** LAB-AC-088: every FOMO element comes from real rows (rolls, confirmed trades) and carries its proof/tx reference. */
export async function feed(limit = 20, sql: postgres.Sql = defaultSql) {
  const rows = await sql<{ kind: string; at: Date; ref: string; who: string | null; asset_id: number; symbol: string | null; chain_id: string; tier: string | null; amount: string | null; input_symbol: string | null }[]>`
    (select 'buy' as kind, t.created_at as at, t.tx_hash as ref, case when u.hide_from_board then null else t.wallet end as who, t.asset_id, a.symbol, a.chain_id,
            null as tier, t.input_amount as amount, t.input_symbol
       from trades t join assets a on a.id = t.asset_id left join users u on u.id = t.user_id where t.status = 'confirmed' and t.tx_hash is not null order by t.created_at desc limit ${limit})
    union all
    (select 'pull' as kind, r.created_at, r.id::text, null, r.result_asset_id, a.symbol, a.chain_id, r.tier, null, null
       from rolls r join assets a on a.id = r.result_asset_id where r.tier in ('large','top') order by r.created_at desc limit ${limit})
    order by at desc limit ${limit}`;
  const [stats] = await sql<{ rolls_1h: number; buys_today: number; last_top: Date | null }[]>`
    select (select count(*)::int from rolls where created_at > now() - interval '1 hour') as rolls_1h,
           (select count(*)::int from trades where status = 'confirmed' and created_at > date_trunc('day', now())) as buys_today,
           (select max(created_at) from rolls where tier = 'top') as last_top`;
  return {
    items: rows.map((r) => ({ kind: r.kind, at: r.at.toISOString(), ref: r.ref, who: r.who ? `${r.who.slice(0, 4)}…${r.who.slice(-4)}` : null,
      assetId: Number(r.asset_id), symbol: r.symbol, chainId: r.chain_id, tier: r.tier, amount: r.amount, inputSymbol: r.input_symbol })),
    stats: { rolls1h: stats.rolls_1h, buysToday: stats.buys_today, lastTopPullAt: stats.last_top?.toISOString() ?? null },
  };
}

/** Lockabox buys of one asset (the default tab of the trades table; LAB §3.4). */
export async function assetBuys(assetId: number, limit = 30, sql: postgres.Sql = defaultSql) {
  // A user who hid their wallet (POST /api/me/privacy) shows as "anon" here too.
  const rows = await sql<{ created_at: Date; wallet: string | null; input_amount: string; input_symbol: string; out_amount_min: string; tx_hash: string | null; explorer_tx_url: string | null }[]>`
    select t.created_at, case when u.hide_from_board then null else t.wallet end as wallet, t.input_amount, t.input_symbol, t.out_amount_min, t.tx_hash, ch.explorer_tx_url
    from trades t join chains ch on ch.id = t.chain_id left join users u on u.id = t.user_id where t.asset_id = ${assetId} and t.status = 'confirmed' order by t.created_at desc limit ${limit}`;
  return rows.map((r) => ({ at: r.created_at.toISOString(), maker: r.wallet ? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}` : 'anon', inputAmount: r.input_amount,
    inputSymbol: r.input_symbol, outAmountMin: r.out_amount_min, txHash: r.tx_hash, txUrl: r.tx_hash && r.explorer_tx_url ? r.explorer_tx_url.replace('{tx}', r.tx_hash) : null }));
}

/** A reel for the spinner animation: filler cards from the rolled pool around the winner at a fixed index. Cosmetic only. */
export async function reelFor(items: PoolItem[], winner: number, length = 48, winIndex = 40, sql: postgres.Sql = defaultSql) {
  const ids: number[] = [];
  let x = winner * 2654435761 % 2 ** 32;
  for (let i = 0; i < length; i++) {
    if (i === winIndex) { ids.push(winner); continue; }
    x = (x * 1103515245 + 12345) % 2 ** 31;
    ids.push(items[x % items.length].a);
  }
  const cards = await assetCards([...new Set(ids)], items, sql);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return { winIndex, cards: ids.map((id) => byId.get(id)!).filter(Boolean) };
}
