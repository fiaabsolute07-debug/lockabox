import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';

/** Points (LAB §7.4): only tasks add points, the ledger is append-only, points can't be bought or transferred (LAB-AC-049/050). */

export class TaskError extends Error {
  constructor(public code: 'unknown_task' | 'not_done' | 'already_claimed' | 'needs_wallet', message: string) { super(message); }
}

type TaskRow = { id: string; title: string; points: number; kind: string; goal: number; daily: boolean };

const today = () => new Date().toISOString().slice(0, 10);

export async function balance(userId: string, sql: postgres.Sql = defaultSql) {
  const [r] = await sql<{ n: number }[]>`select coalesce(sum(delta), 0)::int as n from points_ledger where user_id = ${userId}`;
  return r.n;
}

async function progress(userId: string, t: TaskRow, sql: postgres.Sql): Promise<number> {
  if (t.kind === 'checkin') return 1;
  if (t.kind === 'rolls') {
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from rolls where user_id = ${userId} and created_at >= date_trunc('day', now())`;
    return r.n;
  }
  if (t.kind === 'hold') {
    // Holding a pulled coin, read on-chain (LAB-AC-053). Solana only for now.
    const wallets = await sql<{ address: string }[]>`select address from wallets where user_id = ${userId} and chain_family = 'solana'`;
    const mints = await sql<{ address: string }[]>`
      select distinct a.address from rolls r join assets a on a.id = r.result_asset_id where r.user_id = ${userId} and a.chain_id = 'solana' limit 50`;
    if (!wallets.length || !mints.length) return 0;
    const held = await holdsAnyMint(wallets[0].address, mints.map((m) => m.address));
    return held ? 1 : 0;
  }
  return 0;
}

export async function holdsAnyMint(owner: string, mints: string[], fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  for (const programId of ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']) {
    const res = await fetchImpl(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { programId }, { encoding: 'jsonParsed' }] }) });
    const body = (await res.json()) as { result?: { value?: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } } }[] } };
    for (const acc of body.result?.value ?? []) {
      const info = acc.account.data.parsed.info;
      if (mints.includes(info.mint) && (info.tokenAmount.uiAmount ?? 0) > 0) return true;
    }
  }
  return false;
}

export async function tasksFor(userId: string, sql: postgres.Sql = defaultSql) {
  const tasks = await sql<TaskRow[]>`select id, title, points, kind, goal, daily from tasks where active order by points, id`;
  const done = await sql<{ task_id: string; period: string }[]>`select task_id, period from task_completions where user_id = ${userId}`;
  const out = [];
  for (const t of tasks) {
    const period = t.daily ? today() : 'once';
    const claimed = done.some((d) => d.task_id === t.id && d.period === period);
    // 'hold' hits the chain; only evaluate it on claim to keep this read cheap.
    const p = t.kind === 'hold' ? null : await progress(userId, t, sql);
    out.push({ id: t.id, title: t.title, points: t.points, goal: t.goal, daily: t.daily, progress: p, claimed });
  }
  return out;
}

export async function claim(userId: string, taskId: string, sql: postgres.Sql = defaultSql) {
  const [t] = await sql<TaskRow[]>`select id, title, points, kind, goal, daily from tasks where id = ${taskId} and active`;
  if (!t) throw new TaskError('unknown_task', 'unknown task');
  const p = await progress(userId, t, sql);
  if (p < t.goal) throw new TaskError('not_done', `progress ${p}/${t.goal}`);
  const period = t.daily ? today() : 'once';
  return sql.begin(async (tx) => {
    const [c] = await tx`insert into task_completions (user_id, task_id, period) values (${userId}, ${t.id}, ${period}) on conflict do nothing returning task_id`;
    if (!c) throw new TaskError('already_claimed', 'already claimed');
    await tx`insert into points_ledger (user_id, delta, reason, ref) values (${userId}, ${t.points}, ${`task:${t.id}`}, ${period})`;
    const [b] = await tx<{ n: number }[]>`select coalesce(sum(delta), 0)::int as n from points_ledger where user_id = ${userId}`;
    return { taskId: t.id, points: t.points, balance: b.n };
  });
}
