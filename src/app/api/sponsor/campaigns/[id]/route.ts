import { handleError, json, problem } from '@/lib/api';
import { currentUserId } from '@/modules/auth/session';
import { sponsorProblem } from '@/modules/sponsors/errors';
import { campaignStats, SponsorError } from '@/modules/sponsors/service';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/sponsor/campaigns/[id]'>) {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with the sponsor wallet');
    return json(await campaignStats(Number((await ctx.params).id), userId));
  } catch (e) {
    if (e instanceof SponsorError) return sponsorProblem(e);
    return handleError(e);
  }
}
