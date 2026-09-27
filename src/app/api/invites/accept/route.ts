import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { currentUserId } from '@/modules/auth/session';
import { acceptInvite, InviteError } from '@/modules/invites/service';

const STATUS: Record<InviteError['code'], number> = { bad_code: 404, self: 409, already_invited: 409, too_old: 409 };

export async function POST(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with your wallet first');
    const tooMany = await limited('invite-accept', userId, 5);
    if (tooMany) return tooMany;
    const { code } = await readJson<{ code?: string }>(req);
    return json(await acceptInvite(userId, String(code ?? '').toLowerCase()));
  } catch (e) {
    if (e instanceof InviteError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
