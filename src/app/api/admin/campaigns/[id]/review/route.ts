import { handleError, json, problem, readJson } from '@/lib/api';
import { adminActor, isAdmin } from '@/modules/admin/guard';
import { sponsorProblem } from '@/modules/sponsors/errors';
import { reviewCampaign, SponsorError } from '@/modules/sponsors/service';

export async function POST(req: Request, ctx: RouteContext<'/api/admin/campaigns/[id]/review'>) {
  try {
    if (!isAdmin(req)) return problem(401, 'unauthorized', 'admin token required');
    const b = await readJson<{ decision?: 'approve' | 'reject'; note?: string; reviewer?: string }>(req);
    if (b.decision !== 'approve' && b.decision !== 'reject') return problem(400, 'bad_decision', 'decision must be approve or reject');
    return json(await reviewCampaign(Number((await ctx.params).id), b.decision, b.reviewer ?? adminActor(req), b.note ?? ''));
  } catch (e) {
    if (e instanceof SponsorError) return sponsorProblem(e);
    return handleError(e);
  }
}
