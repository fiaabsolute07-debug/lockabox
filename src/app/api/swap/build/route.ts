import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { swapBlockedFor } from '@/modules/admin/guard';
import { currentUserId } from '@/modules/auth/session';
import { build, SwapError } from '@/modules/swap/service';

export const dynamic = 'force-dynamic';

const STATUS: Record<SwapError['code'], number> = { not_found: 404, swap_disabled: 409, bad_amount: 400, sell_check_failed: 409, quote_failed: 502 };

/** Returns an unsigned transaction. Lockabox never signs, never holds funds, never adds a fee (LAB §0.4.5–6). */
export async function POST(req: Request) {
  try {
    const tooMany = await limited('swap-build', null, 20);
    if (tooMany) return tooMany;
    const blocked = swapBlockedFor(req);
    if (blocked) return problem(451, 'swap_unavailable_region', `in-app swap is not available in ${blocked}; View on DEX instead`);
    // Solana sends `userPublicKey`, EVM sends `userAddress`; the service checks the format against the coin's chain.
    const b = await readJson<{ assetId?: number; amount?: string; amountSol?: string; slippageBps?: number; userPublicKey?: string; userAddress?: string; rollId?: number }>(req);
    const amount = b.amount ?? b.amountSol;
    const wallet = b.userAddress ?? b.userPublicKey;
    if (!Number.isSafeInteger(b.assetId) || typeof amount !== 'string' || !wallet) {
      return problem(400, 'missing_fields', 'assetId, amount and the wallet address are required');
    }
    return json(await build({ assetId: b.assetId!, amount, slippageBps: b.slippageBps, wallet, rollId: b.rollId ?? null, userId: await currentUserId() }), 201);
  } catch (e) {
    if (e instanceof SwapError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
