import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { claim } from '@/modules/points/service';
import { createCampaign, listCampaigns, openSponsored, policyViolations, reviewCampaign, SponsorError } from '@/modules/sponsors/service';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;

async function reset() {
  await sql.unsafe(`truncate redemptions, sponsor_campaigns, trades, rolls, case_pools, gate_results, moderation, asset_snapshots, assets, points_ledger,
    task_completions, sessions, wallets, auth_nonces, devices, users, server_seeds restart identity cascade`);
}

async function userWithWallet(address: string) {
  const [u] = await sql<{ id: string }[]>`insert into users (created_at) values (now() - interval '2 days') returning id`;
  await sql`insert into wallets (user_id, chain_family, address) values (${u.id}, 'solana', ${address})`;
  return u.id;
}

const campaign = {
  projectName: 'Glorp', description: 'Community drop for Glorp holders', chainId: 'solana', tokenAddress: 'GLoRPmint1111111111111111111111111111111111',
  amountPerOpen: '1000000', totalOpens: 2, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
  feeTxHash: 'fee-tx', depositTxHash: 'deposit-tx',
};

// Stand-in for the on-chain check (covered in tests/unit/sponsor-verify.test.ts with a real mainnet transaction).
const verified = { config: { treasury: 'Treasury111', vault: 'Vault111', feeUsdcRaw: 500_000_000n, rpcUrl: 'http://rpc.invalid' }, check: async () => ({ feeOk: true, depositOk: true, reasons: [] }) };

async function passGates() {
  const [a] = await sql<{ id: number }[]>`select id from assets where address = ${campaign.tokenAddress}`;
  await sql`insert into gate_results (asset_id, gate, passed, reason) values (${a.id}, 'liquidity', true, 'ok'), (${a.id}, 'honeypot', true, 'ok')`;
  await sql`insert into asset_snapshots (asset_id, taken_at, market_cap) values (${a.id}, now(), 2000000)`;
}

run('sponsored cases (LAB R4)', () => {
  beforeEach(reset);

  it('content policy blocks promised returns (AC-070)', async () => {
    expect(policyViolations('Guaranteed 100x moon')).not.toHaveLength(0);
    expect(policyViolations('Community drop for holders')).toHaveLength(0);
    const sponsor = await userWithWallet('Sponsor1111111111111111111111111111111111111');
    await expect(createCampaign(sponsor, 'Sponsor1111111111111111111111111111111111111', { ...campaign, description: 'Guaranteed 10x returns' })).rejects.toMatchObject({ code: 'policy' });
  });

  it('bad campaign forms are refused with a reason, not a database error', async () => {
    const sponsor = await userWithWallet('Sponsor1111111111111111111111111111111111111');
    const w = 'Sponsor1111111111111111111111111111111111111';
    const bad = [
      { projectName: 'G' }, { description: 'x'.repeat(281) }, { totalOpens: 0 }, { totalOpens: 1.5 },
      { endsAt: campaign.startsAt }, { startsAt: 'soon' }, { startsAt: new Date(Date.now() - 172_800_000).toISOString(), endsAt: new Date(Date.now() - 86_400_000).toISOString() },
    ];
    for (const patch of bad) await expect(createCampaign(sponsor, w, { ...campaign, ...patch, feeTxHash: undefined, depositTxHash: undefined })).rejects.toMatchObject({ code: 'bad_input' });
  });

  it('only reviewed campaigns with passed gates go live (AC-060)', async () => {
    const sponsor = await userWithWallet('Sponsor1111111111111111111111111111111111111');
    const c = await createCampaign(sponsor, 'Sponsor1111111111111111111111111111111111111', campaign);
    await expect(reviewCampaign(c.id, 'approve', 'admin', '')).rejects.toMatchObject({ code: 'gates' });
    await passGates();
    await expect(reviewCampaign(c.id, 'approve', 'admin', 'ok', sql, { ...verified, config: null })).rejects.toThrow(/SPONSOR_TREASURY/);
    const unpaid = { ...verified, check: async () => ({ feeOk: false, depositOk: true, reasons: ['fee: transaction not found or not confirmed yet'] }) };
    await expect(reviewCampaign(c.id, 'approve', 'admin', 'ok', sql, unpaid)).rejects.toThrow(/on-chain check failed: fee/);
    expect((await reviewCampaign(c.id, 'approve', 'admin', 'ok', sql, verified)).status).toBe('approved');
    await expect(reviewCampaign(c.id, 'approve', 'admin', '', sql, verified)).rejects.toMatchObject({ code: 'not_reviewable' });
    // One fee payment backs one campaign.
    await expect(createCampaign(sponsor, 'Sponsor1111111111111111111111111111111111111', { ...campaign, depositTxHash: 'other-deposit' })).rejects.toThrow(/sponsor_campaigns_fee_tx|unique/);
    // The dashboard lists only the sponsor's own campaigns.
    expect((await listCampaigns(sponsor)).map((x) => [x.id, x.status])).toEqual([[c.id, 'approved']]);
    const other = await userWithWallet('Other11111111111111111111111111111111111111');
    expect(await listCampaigns(other)).toEqual([]);
  });

  it('opening spends points, reserves one open, stops when the budget is used (AC-062/064/065)', async () => {
    const sponsor = await userWithWallet('Sponsor1111111111111111111111111111111111111');
    const c = await createCampaign(sponsor, 'Sponsor1111111111111111111111111111111111111', campaign);
    await passGates();
    await reviewCampaign(c.id, 'approve', 'admin', 'ok', sql, verified);
    const player = await userWithWallet('Player11111111111111111111111111111111111111');
    await expect(openSponsored(player)).rejects.toMatchObject({ code: 'insufficient_points' });
    // Earn points only through tasks (checkin 50/day) — seed ledger rows as if claimed on earlier days.
    for (let d = 0; d < 30; d++) await sql`insert into points_ledger (user_id, delta, reason, ref) values (${player}, 50, 'task:daily-checkin', ${`2026-08-${String(d + 1).padStart(2, '0')}`})`;
    const r1 = await openSponsored(player);
    expect(r1.cost).toBe(500);
    const [{ bal }] = await sql<{ bal: number }[]>`select sum(delta)::int as bal from points_ledger where user_id = ${player}`;
    expect(bal).toBe(1000);
    const r2 = await openSponsored(player);
    expect(r2.redemptionId).not.toBe(r1.redemptionId);
    await expect(openSponsored(player)).rejects.toMatchObject({ code: 'empty' });
    const [{ used }] = await sql<{ used: number }[]>`select opens_used as used from sponsor_campaigns where id = ${c.id}`;
    expect(used).toBe(2);
    const reds = await sql`select status from redemptions`;
    expect(reds.every((r) => r.status === 'pending')).toBe(true); // distribution is a separate, default-off job
    expect(await claim(player, 'daily-checkin')).toMatchObject({ points: 50 });
  });

  it('accounts younger than 24 h cannot spend points (AC-055)', async () => {
    const sponsor = await userWithWallet('Sponsor1111111111111111111111111111111111111');
    const c = await createCampaign(sponsor, 'Sponsor1111111111111111111111111111111111111', campaign);
    await passGates();
    await reviewCampaign(c.id, 'approve', 'admin', 'ok', sql, verified);
    const [u] = await sql<{ id: string }[]>`insert into users default values returning id`;
    await sql`insert into wallets (user_id, chain_family, address) values (${u.id}, 'solana', 'Young1111111111111111111111111111111111111111')`;
    for (let d = 0; d < 12; d++) await sql`insert into points_ledger (user_id, delta, reason, ref) values (${u.id}, 50, 'task:daily-checkin', ${`d${d}`})`;
    await expect(openSponsored(u.id)).rejects.toThrow(/24 hours/);
  });

  it('the sponsored case is never rolled for free', async () => {
    const { roll } = await import('@/modules/rolls/service');
    await expect(roll({ deviceId: 'device-sponsored01', caseId: 'sponsored', chainScope: 'solana' })).rejects.toMatchObject({ code: 'case_needs_points' });
    expect(SponsorError).toBeDefined();
  });
});

afterAll(async () => { await sql.end(); });
