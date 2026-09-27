import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { killAsset, overview, setBlocklist, setUserLock, unkillAsset } from '@/modules/admin/service';
import { CHAIN_SCOPE_ALL, eligibleItems, getCase } from '@/modules/cases/pools';
import { acceptInvite, inviteSummary } from '@/modules/invites/service';
import { claim } from '@/modules/points/service';
import { createCampaign, openSponsored, reviewCampaign } from '@/modules/sponsors/service';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;

async function reset() {
  await sql.unsafe(`truncate audit_log, invites, redemptions, sponsor_campaigns, trades, rolls, case_pools, gate_results, moderation, asset_snapshots, assets,
    points_ledger, task_completions, sessions, wallets, auth_nonces, devices, users, server_seeds restart identity cascade`);
  await sql`delete from symbol_blocklist where symbol = 'GLORP'`;
}

async function coin(symbol: string) {
  const [a] = await sql<{ id: number }[]>`insert into assets (chain_id, address, symbol, sources) values ('solana', ${`Addr${symbol}`}, ${symbol}, ${['ds:boost']}) returning id`;
  await sql`insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, liquidity_usd) values (${a.id}, now(), 1, 500000, 20000)`;
  await sql`insert into gate_results (asset_id, gate, passed, reason) values (${a.id}, 'liquidity', true, 'ok'), (${a.id}, 'honeypot', true, 'ok')`;
  return Number(a.id);
}

async function user(ageHours = 72, wallet?: string) {
  const [u] = await sql<{ id: string }[]>`insert into users (created_at) values (now() - make_interval(hours => ${ageHours})) returning id`;
  if (wallet) await sql`insert into wallets (user_id, chain_family, address) values (${u.id}, 'solana', ${wallet})`;
  return u.id;
}

const audits = () => sql<{ actor: string; action: string; target: string }[]>`select actor, action, target from audit_log order by id`;

run('admin actions and audit log (LAB §7.6, AC-069)', () => {
  beforeEach(reset);

  it('kill and unkill are written to the audit log; the log cannot be edited', async () => {
    const id = await coin('GLORP');
    await killAsset(id, 'rug', 'owner');
    expect((await eligibleItems((await getCase('trending'))!, CHAIN_SCOPE_ALL)).some((i) => i.a === id)).toBe(false);
    await expect(killAsset(999_999, 'x', 'owner')).rejects.toMatchObject({ code: 'not_found' });
    await unkillAsset(id, 'mistake', 'owner');
    await expect(unkillAsset(id, 'again', 'owner')).rejects.toMatchObject({ code: 'not_found' });
    expect(await audits()).toEqual([{ actor: 'owner', action: 'kill', target: String(id) }, { actor: 'owner', action: 'unkill', target: String(id) }]);
    await expect(sql`update audit_log set actor = 'someone else'`).rejects.toThrow(/append-only|immutable/);
    await expect(sql`delete from audit_log`).rejects.toThrow(/append-only|immutable/);
  });

  it('blocklist changes take a symbol out of every pool, audited', async () => {
    const id = await coin('GLORP');
    await setBlocklist('glorp', 'add', 'not a meme', 'owner');
    expect((await eligibleItems((await getCase('trending'))!, CHAIN_SCOPE_ALL)).some((i) => i.a === id)).toBe(false);
    await setBlocklist('GLORP', 'remove', '', 'owner');
    expect((await eligibleItems((await getCase('trending'))!, CHAIN_SCOPE_ALL)).some((i) => i.a === id)).toBe(true);
    await expect(setBlocklist('bad symbol!', 'add', '', 'owner')).rejects.toMatchObject({ code: 'bad_input' });
    expect((await audits()).map((a) => a.action)).toEqual(['blocklist.add', 'blocklist.remove']);
  });

  it('a locked account cannot claim tasks, spend points or accept invites; unlocking restores it', async () => {
    const u = await user(72, 'Locked11111111111111111111111111111111111111');
    await setUserLock(u, true, 'farm ring', 'owner');
    await expect(claim(u, 'daily-checkin')).rejects.toMatchObject({ code: 'locked' });
    await expect(openSponsored(u)).rejects.toMatchObject({ code: 'locked' });
    const inviter = await user(72);
    const young = await user(1);
    await setUserLock(young, true, 'farm ring', 'owner');
    await expect(acceptInvite(young, (await inviteSummary(inviter)).code)).rejects.toMatchObject({ code: 'locked' });
    await setUserLock(u, false, 'appeal ok', 'owner');
    expect((await claim(u, 'daily-checkin')).points).toBe(50);
    expect((await audits()).map((a) => a.action)).toEqual(['user.lock', 'user.lock', 'user.unlock']);
  });

  it('campaign reviews are audited and show up in the overview', async () => {
    const sponsor = await user(72, 'Sponsor1111111111111111111111111111111111111');
    const c = await createCampaign(sponsor, 'Sponsor1111111111111111111111111111111111111', {
      projectName: 'Glorp', description: 'Community drop', chainId: 'solana', tokenAddress: 'GLoRPmint1111111111111111111111111111111111',
      amountPerOpen: '1000', totalOpens: 5, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect((await overview()).pendingCampaigns.map((p) => Number(p.id))).toEqual([c.id]);
    await reviewCampaign(c.id, 'reject', 'owner', 'no fee tx');
    const o = await overview();
    expect(o.pendingCampaigns).toHaveLength(0);
    expect(o.audit.map((a) => [a.actor, a.action, a.target])).toEqual([['owner', 'campaign.reject', String(c.id)]]);
  });
});

afterAll(async () => { await sql.end(); });
