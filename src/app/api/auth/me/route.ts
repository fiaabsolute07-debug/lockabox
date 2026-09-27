import { handleError, json } from '@/lib/api';
import { sql } from '@/lib/db';
import { currentUserId } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return json({ user: null });
    const [u] = await sql<{ client_seed: string; nonce: number; points: number; invite_code: string; hide_from_board: boolean }[]>`
      select u.client_seed, u.nonce, u.invite_code, u.hide_from_board, coalesce((select sum(delta)::int from points_ledger p where p.user_id = u.id), 0) as points from users u where u.id = ${userId}`;
    const wallets = await sql<{ chain_family: string; address: string }[]>`select chain_family, address from wallets where user_id = ${userId}`;
    return json({ user: { id: userId, clientSeed: u.client_seed, nonce: u.nonce, points: u.points, inviteCode: u.invite_code, hideFromBoard: u.hide_from_board, wallets: wallets.map((w) => ({ family: w.chain_family, address: w.address })) } });
  } catch (e) { return handleError(e); }
}
