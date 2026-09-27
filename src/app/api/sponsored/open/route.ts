import { handleError, json, problem } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { assetDetail } from '@/modules/cases/read';
import { currentUserId } from '@/modules/auth/session';
import { sponsorProblem } from '@/modules/sponsors/errors';
import { openSponsored, SponsorError } from '@/modules/sponsors/service';

/** Open the sponsored case with points. The asset is always labelled Sponsored in the UI (LAB-AC-061). */
export async function POST() {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in to open the sponsored case');
    const tooMany = await limited('sponsored-open', userId, 10);
    if (tooMany) return tooMany;
    const r = await openSponsored(userId);
    return json({ ...r, sponsored: true, label: 'Sponsored', asset: await assetDetail(r.assetId, r.tier) }, 201);
  } catch (e) {
    if (e instanceof SponsorError) return sponsorProblem(e);
    return handleError(e);
  }
}
