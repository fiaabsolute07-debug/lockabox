import { handleError, json, problem } from '@/lib/api';
import { currentUserId } from '@/modules/auth/session';
import { balance, tasksFor } from '@/modules/points/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'connect and sign in with your wallet to earn points');
    return json({ balance: await balance(userId), tasks: await tasksFor(userId) });
  } catch (e) { return handleError(e); }
}
