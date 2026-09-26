import { handleError, json, problem } from '@/lib/api';
import { assetDetail } from '@/modules/cases/read';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/assets/[id]'>) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id)) return problem(400, 'bad_id', 'invalid asset id');
    const a = await assetDetail(id);
    return a ? json(a) : problem(404, 'not_found', 'unknown asset');
  } catch (e) { return handleError(e); }
}
