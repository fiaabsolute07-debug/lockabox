import { handleError, json, problem } from '@/lib/api';
import { CHAIN_SCOPE_ALL } from '@/modules/cases/pools';
import { caseSummary } from '@/modules/cases/read';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: RouteContext<'/api/cases/[id]'>) {
  try {
    const { id } = await ctx.params;
    const chain = new URL(req.url).searchParams.get('chain') || CHAIN_SCOPE_ALL;
    const summary = await caseSummary(id, chain);
    return summary ? json(summary) : problem(404, 'case_not_found', 'unknown case');
  } catch (e) { return handleError(e); }
}
