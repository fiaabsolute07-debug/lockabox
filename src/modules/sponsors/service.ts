import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { canonicalPool, DEFAULT_ODDS, poolHash, resolveRoll, type PoolItem, type Tier } from '@/modules/rolls/fair';
import { activeSeed } from '@/modules/rolls/service';
import { marketCapTier } from '@/modules/sources/tier';

/**
 * Sponsored cases (LAB §7.5). A campaign is reviewed by an admin (content policy + hidden gates + fee and deposit
 * transactions) before it can appear. Every sponsored asset is labelled "Sponsored" wherever it shows, and its tier
 * is its real market-cap tier — sponsorship never moves a coin up (LAB-AC-061, LAB §1.3 Tier rule).
 */

export class SponsorError extends Error {
  constructor(public code: 'bad_input' | 'policy' | 'not_found' | 'not_reviewable' | 'gates' | 'insufficient_points' | 'empty' | 'needs_wallet', message: string) { super(message); }
}

/** LAB-AC-070: no promised returns in anything a sponsor writes. */
const BANNED = [/\b\d+\s?x\b/i, /\bguarantee/i, /\bmoon/i, /\brisk[- ]?free\b/i, /\bsure (win|profit)/i, /\bpassive income\b/i, /\bfinancial freedom\b/i, /\bcan'?t lose\b/i, /\bprofit\b/i, /\breturns?\b/i, /\bpump\b/i];
export function policyViolations(text: string): string[] {
  return BANNED.filter((re) => re.test(text)).map((re) => re.source);
}

export type CampaignInput = {
  projectName: string; description: string; chainId: string; tokenAddress: string; amountPerOpen: string; totalOpens: number;
  startsAt: string; endsAt: string; feeTxHash?: string; depositTxHash?: string;
};

export async function createCampaign(userId: string, wallet: string, input: CampaignInput, sql: postgres.Sql = defaultSql) {
  const bad = policyViolations(`${input.projectName} ${input.description}`);
  if (bad.length) throw new SponsorError('policy', 'descriptions may not promise returns or price moves');
  if (input.chainId !== 'solana') throw new SponsorError('bad_input', 'sponsored drops are Solana-only for now');
  if (!/^[1-9][0-9]{0,30}$/.test(input.amountPerOpen)) throw new SponsorError('bad_input', 'amountPerOpen must be a positive integer in raw token units');
  const [asset] = await sql<{ id: number }[]>`
    insert into assets (chain_id, address, sources) values (${input.chainId}, ${input.tokenAddress}, ${['sponsored']})
    on conflict (chain_id, address) do update set sources = (select array(select distinct unnest(assets.sources || excluded.sources)))
    returning id`;
  const [row] = await sql<{ id: number; status: string }[]>`
    insert into sponsor_campaigns (sponsor_user_id, sponsor_wallet, project_name, description, chain_id, asset_id, amount_per_open, total_opens, starts_at, ends_at, fee_tx_hash, deposit_tx_hash)
    values (${userId}, ${wallet}, ${input.projectName}, ${input.description}, ${input.chainId}, ${asset.id}, ${input.amountPerOpen}, ${input.totalOpens},
            ${input.startsAt}, ${input.endsAt}, ${input.feeTxHash ?? null}, ${input.depositTxHash ?? null})
    returning id, status`;
  return { id: Number(row.id), status: row.status };
}

/** Admin review (LAB-AC-060): approval requires both transactions recorded and the hidden gates passed. */
export async function reviewCampaign(id: number, decision: 'approve' | 'reject', reviewer: string, note: string, sql: postgres.Sql = defaultSql) {
  const [c] = await sql<{ status: string; asset_id: number; fee_tx_hash: string | null; deposit_tx_hash: string | null }[]>`
    select status, asset_id, fee_tx_hash, deposit_tx_hash from sponsor_campaigns where id = ${id}`;
  if (!c) throw new SponsorError('not_found', 'unknown campaign');
  if (c.status !== 'pending_review') throw new SponsorError('not_reviewable', `campaign is ${c.status}`);
  if (decision === 'approve') {
    if (!c.fee_tx_hash || !c.deposit_tx_hash) throw new SponsorError('bad_input', 'fee and deposit transactions must be recorded before approval');
    const gates = await sql<{ gate: string; passed: boolean }[]>`select gate, passed from gate_results where asset_id = ${c.asset_id}`;
    const ok = (g: string) => gates.some((x) => x.gate === g && x.passed);
    if (!ok('liquidity') || !ok('honeypot')) throw new SponsorError('gates', 'the token has not passed the hidden gates yet (wait for the next worker cycle)');
  }
  await sql`update sponsor_campaigns set status = ${decision === 'approve' ? 'approved' : 'rejected'}, review_note = ${note}, reviewed_by = ${reviewer}, reviewed_at = now() where id = ${id}`;
  return { id, status: decision === 'approve' ? 'approved' : 'rejected' };
}

type LiveRow = { campaign_id: number; asset_id: number; market_cap: number | null; amount_per_open: string; cost_points: number };

/** Campaigns that can pay out right now, as pool items (real market-cap tiers; unknown cap → micro, never higher). */
export async function liveSponsoredItems(sql: postgres.Sql = defaultSql): Promise<{ items: PoolItem[]; rows: LiveRow[] }> {
  const rows = await sql<LiveRow[]>`
    select c.id as campaign_id, c.asset_id, s.market_cap, c.amount_per_open, c.cost_points
    from sponsor_campaigns c left join asset_snapshots s on s.asset_id = c.asset_id
    where c.status = 'approved' and now() between c.starts_at and c.ends_at and c.opens_used < c.total_opens
      and not exists (select 1 from moderation m where m.asset_id = c.asset_id)`;
  const items = canonicalPool(rows.map((r) => ({ a: Number(r.asset_id), t: (marketCapTier(r.market_cap) ?? 'micro') as Tier })));
  return { items, rows };
}

/**
 * Open the sponsored case with points (LAB-AC-062/064/065). One transaction: spend points, provably-fair pick among
 * live campaigns, reserve one open of that campaign, create the redemption. The token transfer itself happens later
 * in the vault job, which is off unless the owner enables it.
 */
export async function openSponsored(userId: string, sql: postgres.Sql = defaultSql) {
  const [wallet] = await sql<{ address: string }[]>`select address from wallets where user_id = ${userId} and chain_family = 'solana' limit 1`;
  if (!wallet) throw new SponsorError('needs_wallet', 'sign in with a Solana wallet first');
  const seed = await activeSeed(sql);
  return sql.begin(async (tx) => {
    const [age] = await tx<{ young: boolean }[]>`select created_at > now() - interval '24 hours' as young from users where id = ${userId} for update`;
    if (age?.young) throw new SponsorError('insufficient_points', 'new accounts can spend points after 24 hours'); // LAB-AC-055 anti-sybil
    const { items, rows } = await liveSponsoredItems(tx as unknown as postgres.Sql);
    if (!items.length) throw new SponsorError('empty', 'no sponsored drops are live right now');
    const cost = Math.max(...rows.map((r) => r.cost_points), 500);
    const [{ bal }] = await tx<{ bal: number }[]>`select coalesce(sum(delta), 0)::int as bal from points_ledger where user_id = ${userId}`;
    if (bal < cost) throw new SponsorError('insufficient_points', `this case costs ${cost} points; you have ${bal}`);
    const [actor] = await tx<{ client_seed: string; nonce: number }[]>`update users set nonce = nonce + 1 where id = ${userId} returning client_seed, nonce`;
    const out = resolveRoll({ serverSeed: seed.seed, clientSeed: actor.client_seed, nonce: actor.nonce, items, odds: DEFAULT_ODDS });
    const campaign = rows.filter((r) => Number(r.asset_id) === out.assetId).sort((a, b) => Number(a.campaign_id) - Number(b.campaign_id))[0];
    const [used] = await tx`update sponsor_campaigns set opens_used = opens_used + 1 where id = ${campaign.campaign_id} and opens_used < total_opens returning id`;
    if (!used) throw new SponsorError('empty', 'that drop just ran out; try again');
    // The sponsored case keeps an immutable pool snapshot like any other case.
    const hash = poolHash(items);
    let [pool] = await tx<{ id: number }[]>`select id from case_pools where case_id = 'sponsored' and chain_scope = 'solana' and hash = ${hash} order by version desc limit 1`;
    if (!pool) {
      const [{ v }] = await tx<{ v: number }[]>`select coalesce(max(version), 0)::int + 1 as v from case_pools where case_id = 'sponsored' and chain_scope = 'solana'`;
      [pool] = await tx<{ id: number }[]>`insert into case_pools (case_id, chain_scope, version, items, hash, size) values ('sponsored', 'solana', ${v}, ${tx.json(items)}, ${hash}, ${items.length}) returning id`;
    }
    const [r] = await tx<{ id: number }[]>`
      insert into rolls (user_id, case_id, pool_id, filters, server_seed_id, client_seed, nonce, items, items_hash, r_tier, r_item, tier, result_asset_id)
      values (${userId}, 'sponsored', ${pool.id}, '{}', ${seed.id}, ${actor.client_seed}, ${actor.nonce}, ${tx.json(items)}, ${hash}, ${out.rTier}, ${out.rItem}, ${out.tier}, ${out.assetId})
      returning id`;
    await tx`insert into points_ledger (user_id, delta, reason, ref) values (${userId}, ${-cost}, 'case:sponsored', ${String(r.id)})`;
    const [red] = await tx<{ id: number }[]>`
      insert into redemptions (campaign_id, roll_id, user_id, wallet, amount) values (${campaign.campaign_id}, ${r.id}, ${userId}, ${wallet.address}, ${campaign.amount_per_open}) returning id`;
    return { rollId: Number(r.id), redemptionId: Number(red.id), campaignId: Number(campaign.campaign_id), assetId: out.assetId, tier: out.tier, amount: campaign.amount_per_open, cost, serverSeedHash: seed.hash, nonce: actor.nonce };
  });
}

/** Sponsor dashboard (LAB-AC-068). */
export async function campaignStats(campaignId: number, sponsorUserId: string, sql: postgres.Sql = defaultSql) {
  const [c] = await sql`select id, project_name, status, total_opens, opens_used, starts_at, ends_at, amount_per_open from sponsor_campaigns where id = ${campaignId} and sponsor_user_id = ${sponsorUserId}`;
  if (!c) throw new SponsorError('not_found', 'unknown campaign');
  const [s] = await sql<{ opens: number; wallets: number; sent: number; buys: number }[]>`
    select count(*)::int as opens, count(distinct r.wallet)::int as wallets, count(*) filter (where r.status = 'sent')::int as sent,
           (select count(*)::int from trades t join sponsor_campaigns sc on sc.asset_id = t.asset_id where sc.id = ${campaignId} and t.status = 'confirmed' and t.created_at >= sc.starts_at) as buys
    from redemptions r where r.campaign_id = ${campaignId}`;
  return { campaign: c, stats: s };
}
