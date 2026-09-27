import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';

/**
 * Invites (LAB §8, AC-054). An invite counts only when the invitee has signed in with a wallet and opened cases on
 * at least 3 different days; an inviter is rewarded for at most 10 invites per day. The reward is the
 * 'invite-friend' task, so points still come only from tasks.
 */

export const INVITE_DAYS_REQUIRED = 3;
export const INVITE_DAILY_CAP = 10;
export const INVITE_TASK_ID = 'invite-friend';

export class InviteError extends Error {
  constructor(public code: 'bad_code' | 'self' | 'already_invited' | 'too_old', message: string) { super(message); }
}

/** Binds the signed-in user to an inviter. Only accounts younger than 24 h can accept, so old accounts can't be farmed. */
export async function acceptInvite(inviteeUserId: string, code: string, sql: postgres.Sql = defaultSql) {
  if (!/^[0-9a-f]{10}$/.test(code)) throw new InviteError('bad_code', 'unknown invite code');
  const [inviter] = await sql<{ id: string }[]>`select id from users where invite_code = ${code}`;
  if (!inviter) throw new InviteError('bad_code', 'unknown invite code');
  if (inviter.id === inviteeUserId) throw new InviteError('self', 'you cannot invite yourself');
  const [me] = await sql<{ young: boolean }[]>`select created_at > now() - interval '24 hours' as young from users where id = ${inviteeUserId}`;
  if (!me?.young) throw new InviteError('too_old', 'invites can only be accepted by new accounts');
  const [row] = await sql`insert into invites (invitee_user_id, inviter_user_id) values (${inviteeUserId}, ${inviter.id}) on conflict do nothing returning invitee_user_id`;
  if (!row) throw new InviteError('already_invited', 'this account already has an inviter');
  return { ok: true };
}

/** Invitees that qualify and have not been rewarded yet, oldest first. */
export async function claimableInvitees(inviterUserId: string, sql: postgres.Sql = defaultSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select i.invitee_user_id as id
    from invites i
    where i.inviter_user_id = ${inviterUserId}
      and exists (select 1 from wallets w where w.user_id = i.invitee_user_id)
      and (select count(distinct date_trunc('day', r.created_at)) from rolls r where r.user_id = i.invitee_user_id) >= ${INVITE_DAYS_REQUIRED}
      and not exists (select 1 from task_completions t where t.user_id = ${inviterUserId} and t.task_id = ${INVITE_TASK_ID} and t.period = 'invitee:' || i.invitee_user_id::text)
    order by i.created_at`;
  return rows.map((r) => r.id);
}

export async function rewardedToday(inviterUserId: string, sql: postgres.Sql = defaultSql) {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from task_completions where user_id = ${inviterUserId} and task_id = ${INVITE_TASK_ID} and created_at >= date_trunc('day', now())`;
  return r.n;
}

export async function inviteSummary(userId: string, sql: postgres.Sql = defaultSql) {
  const [u] = await sql<{ invite_code: string }[]>`select invite_code from users where id = ${userId}`;
  const [c] = await sql<{ invited: number; rewarded: number }[]>`
    select (select count(*)::int from invites where inviter_user_id = ${userId}) as invited,
           (select count(*)::int from task_completions where user_id = ${userId} and task_id = ${INVITE_TASK_ID}) as rewarded`;
  const claimable = await claimableInvitees(userId, sql);
  return {
    code: u.invite_code, path: `/?ref=${u.invite_code}`, invited: c.invited, rewarded: c.rewarded, claimable: claimable.length,
    rewardedToday: await rewardedToday(userId, sql), dailyCap: INVITE_DAILY_CAP, daysRequired: INVITE_DAYS_REQUIRED,
  };
}
