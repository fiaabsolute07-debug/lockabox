import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';

/** Admin actions (LAB §7.6). Each one writes `audit_log` in the same transaction as the change it records. */

export class AdminError extends Error {
  constructor(public code: 'not_found' | 'bad_input', message: string) { super(message); }
}

type Tx = postgres.Sql | postgres.TransactionSql;

export async function audit(tx: Tx, actor: string, action: string, target: string | number, detail: Record<string, unknown> = {}) {
  await (tx as postgres.Sql)`insert into audit_log (actor, action, target, detail) values (${actor}, ${action}, ${String(target)}, ${(tx as postgres.Sql).json(detail as never)})`;
}

/** Kill switch (AC-069): out of every case at roll time and swap locked immediately. */
export async function killAsset(assetId: number, reason: string, actor: string, sql: postgres.Sql = defaultSql) {
  return sql.begin(async (tx) => {
    const [a] = await tx`select 1 from assets where id = ${assetId}`;
    if (!a) throw new AdminError('not_found', 'unknown asset');
    await tx`insert into moderation (asset_id, reason, actor) values (${assetId}, ${reason}, ${actor})
             on conflict (asset_id) do update set reason = excluded.reason, actor = excluded.actor`;
    await audit(tx, actor, 'kill', assetId, { reason });
    return { ok: true, assetId };
  });
}

/** Undo a kill made by mistake. The coin comes back at the next pool rebuild (≤ 60 s) if it still passes the gates. */
export async function unkillAsset(assetId: number, reason: string, actor: string, sql: postgres.Sql = defaultSql) {
  return sql.begin(async (tx) => {
    const [m] = await tx`delete from moderation where asset_id = ${assetId} returning reason`;
    if (!m) throw new AdminError('not_found', 'that asset is not killed');
    await audit(tx, actor, 'unkill', assetId, { reason, previous: m.reason });
    return { ok: true, assetId };
  });
}

export async function setBlocklist(symbol: string, op: 'add' | 'remove', reason: string, actor: string, sql: postgres.Sql = defaultSql) {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.$_-]{1,20}$/.test(s)) throw new AdminError('bad_input', 'invalid symbol');
  return sql.begin(async (tx) => {
    if (op === 'add') await tx`insert into symbol_blocklist (symbol, reason) values (${s}, ${reason || 'admin'}) on conflict (symbol) do update set reason = excluded.reason`;
    else await tx`delete from symbol_blocklist where symbol = ${s}`;
    await audit(tx, actor, `blocklist.${op}`, s, { reason });
    return { ok: true, symbol: s };
  });
}

export async function setUserLock(userId: string, lock: boolean, reason: string, actor: string, sql: postgres.Sql = defaultSql) {
  return sql.begin(async (tx) => {
    const [u] = lock
      ? await tx`update users set locked_at = now(), locked_reason = ${reason} where id = ${userId} returning id`
      : await tx`update users set locked_at = null, locked_reason = null where id = ${userId} returning id`;
    if (!u) throw new AdminError('not_found', 'unknown user');
    await audit(tx, actor, lock ? 'user.lock' : 'user.unlock', userId, { reason });
    return { ok: true, userId, locked: lock };
  });
}

export async function isLocked(userId: string, sql: postgres.Sql | postgres.TransactionSql = defaultSql) {
  const [u] = await (sql as postgres.Sql)<{ locked: boolean }[]>`select locked_at is not null as locked from users where id = ${userId}`;
  return !!u?.locked;
}

/** What the owner needs on one screen: campaigns waiting, recent kills, recent audit entries. */
export async function overview(sql: postgres.Sql = defaultSql) {
  const pending = await sql`select id, project_name, chain_id, total_opens, starts_at, ends_at, fee_tx_hash, deposit_tx_hash, created_at
                            from sponsor_campaigns where status = 'pending_review' order by created_at limit 50`;
  const killed = await sql`select m.asset_id, a.chain_id, a.symbol, m.reason, m.actor, m.created_at from moderation m join assets a on a.id = m.asset_id
                           order by m.created_at desc limit 50`;
  const recent = await sql`select at, actor, action, target, detail from audit_log order by at desc limit 100`;
  return { pendingCampaigns: pending, killed, audit: recent };
}
