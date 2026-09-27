import { handleError, json, problem } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { currentUserId } from '@/modules/auth/session';
import { claim, TaskError } from '@/modules/points/service';

const STATUS: Record<TaskError['code'], number> = { unknown_task: 404, not_done: 409, already_claimed: 409, needs_wallet: 401, daily_cap: 429, locked: 403 };

export async function POST(_req: Request, ctx: RouteContext<'/api/tasks/[id]/claim'>) {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with your wallet first');
    const tooMany = await limited('task-claim', userId, 10);
    if (tooMany) return tooMany;
    return json(await claim(userId, (await ctx.params).id));
  } catch (e) {
    if (e instanceof TaskError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
