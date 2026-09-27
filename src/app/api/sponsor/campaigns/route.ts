import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { sql } from '@/lib/db';
import { currentUserId, isSolanaAddress } from '@/modules/auth/session';
import { sponsorProblem } from '@/modules/sponsors/errors';
import { createCampaign, listCampaigns, SponsorError, type CampaignInput } from '@/modules/sponsors/service';

/** A project submits a sponsored drop for review (signed in with the sponsor wallet). */
export async function POST(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with the sponsor wallet');
    const tooMany = await limited('sponsor-campaign', userId, 5);
    if (tooMany) return tooMany;
    const [w] = await sql<{ address: string }[]>`select address from wallets where user_id = ${userId} and chain_family = 'solana' limit 1`;
    const b = await readJson<Partial<CampaignInput>>(req);
    if (!b.projectName || !b.tokenAddress || !isSolanaAddress(b.tokenAddress) || !b.amountPerOpen || !Number.isInteger(b.totalOpens) || !b.startsAt || !b.endsAt) {
      return problem(400, 'missing_fields', 'projectName, tokenAddress, amountPerOpen, totalOpens, startsAt, endsAt are required');
    }
    return json(await createCampaign(userId, w.address, { chainId: 'solana', description: '', ...b } as CampaignInput), 201);
  } catch (e) {
    if (e instanceof SponsorError) return sponsorProblem(e);
    return handleError(e);
  }
}

export const dynamic = 'force-dynamic';

/** The signed-in sponsor's own campaigns (dashboard list, AC-068). */
export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with the sponsor wallet');
    return json({ items: await listCampaigns(userId) });
  } catch (e) { return handleError(e); }
}
