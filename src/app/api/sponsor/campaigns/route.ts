import { handleError, json, problem, readJson } from '@/lib/api';
import { sql } from '@/lib/db';
import { currentUserId, isSolanaAddress } from '@/modules/auth/session';
import { sponsorProblem } from '@/modules/sponsors/errors';
import { createCampaign, SponsorError, type CampaignInput } from '@/modules/sponsors/service';

/** A project submits a sponsored drop for review (signed in with the sponsor wallet). */
export async function POST(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return problem(401, 'sign_in_required', 'sign in with the sponsor wallet');
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
