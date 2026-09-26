import { handleError, json, problem } from '@/lib/api';
import { assetBuys } from '@/modules/cases/read';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/assets/[id]/buys'>) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id)) return problem(400, 'bad_id', 'invalid asset id');
    return json({ items: await assetBuys(id) });
  } catch (e) { return handleError(e); }
}
