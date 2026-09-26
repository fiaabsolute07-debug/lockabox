import { handleError, json, problem } from '@/lib/api';
import { verifyRoll } from '@/modules/rolls/service';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/rolls/[id]/verify'>) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id)) return problem(400, 'bad_id', 'invalid roll id');
    const v = await verifyRoll(id);
    return v ? json(v) : problem(404, 'not_found', 'unknown roll');
  } catch (e) { return handleError(e); }
}
