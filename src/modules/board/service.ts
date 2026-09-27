import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { SNAPSHOT_MAX_AGE_MINUTES } from '@/modules/cases/pools';

/**
 * Best pulls (AC-057): real rolls only, ranked by the price change from the moment of the pull to the latest fresh
 * snapshot. One row per coin (its best pull), so one coin can't fill the board. Users who opted out, and rolls made
 * before signing in, show as "anon". Sponsored-case rolls are left out (they were paid for with points).
 */

export type BoardWindow = '24h' | '7d';
export type BoardRow = {
  rollId: number; at: string; assetId: number; chainId: string; symbol: string | null; imageUrl: string | null; tier: string;
  priceAtPull: number; priceNow: number; changePct: number; who: string;
};

export async function bestPulls(window: BoardWindow, limit = 20, sql: postgres.Sql = defaultSql): Promise<BoardRow[]> {
  const interval = window === '7d' ? '7 days' : '24 hours';
  const rows = await sql<{
    roll_id: number; at: Date; asset_id: number; chain_id: string; symbol: string | null; image_url: string | null; tier: string;
    p0: number; p1: number; wallet: string | null; hidden: boolean | null;
  }[]>`
    select * from (
      select distinct on (r.result_asset_id)
             r.id as roll_id, r.created_at as at, r.result_asset_id as asset_id, a.chain_id, a.symbol, a.image_url, r.tier,
             r.price_usd_at_roll as p0, s.price_usd as p1, u.hide_from_board as hidden,
             (select w.address from wallets w where w.user_id = r.user_id order by w.id limit 1) as wallet
      from rolls r
      join assets a on a.id = r.result_asset_id
      join asset_snapshots s on s.asset_id = r.result_asset_id
      left join users u on u.id = r.user_id
      where r.created_at > now() - ${interval}::interval
        and r.case_id <> 'sponsored'
        and r.price_usd_at_roll > 0 and s.price_usd > 0
        and s.taken_at > now() - ${`${SNAPSHOT_MAX_AGE_MINUTES} minutes`}::interval
        and not exists (select 1 from moderation m where m.asset_id = r.result_asset_id)
      order by r.result_asset_id, s.price_usd / r.price_usd_at_roll desc, r.id
    ) best
    order by p1 / p0 desc, roll_id
    limit ${limit}`;
  return rows.map((r) => ({
    rollId: Number(r.roll_id), at: r.at.toISOString(), assetId: Number(r.asset_id), chainId: r.chain_id, symbol: r.symbol, imageUrl: r.image_url,
    tier: r.tier, priceAtPull: r.p0, priceNow: r.p1, changePct: Math.round(((r.p1 - r.p0) / r.p0) * 10_000) / 100,
    who: r.wallet && !r.hidden ? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}` : 'anon',
  }));
}

export async function setHideFromBoard(userId: string, hide: boolean, sql: postgres.Sql = defaultSql) {
  await sql`update users set hide_from_board = ${hide} where id = ${userId}`;
  return { hideFromBoard: hide };
}
