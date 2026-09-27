import { handleError, json, problem } from '@/lib/api';
import { currentUserId } from '@/modules/auth/session';
import { inviteSummary } from '@/modules/invites/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with your wallet first');
    return json(await inviteSummary(userId));
  } catch (e) { return handleError(e); }
}
