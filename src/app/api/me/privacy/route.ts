import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { currentUserId } from '@/modules/auth/session';
import { setHideFromBoard } from '@/modules/board/service';

export async function POST(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with your wallet first');
    const tooMany = await limited('me-privacy', userId, 10);
    if (tooMany) return tooMany;
    const { hideFromBoard } = await readJson<{ hideFromBoard?: unknown }>(req);
    if (typeof hideFromBoard !== 'boolean') return problem(400, 'bad_input', 'hideFromBoard must be true or false');
    return json(await setHideFromBoard(userId, hideFromBoard));
  } catch (e) { return handleError(e); }
}
