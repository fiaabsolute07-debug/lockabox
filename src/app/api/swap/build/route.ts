import { handleError, json, problem, readJson } from '@/lib/api';
import { currentUserId, isSolanaAddress } from '@/modules/auth/session';
import { build, SwapError } from '@/modules/swap/service';

export const dynamic = 'force-dynamic';

const STATUS: Record<SwapError['code'], number> = { not_found: 404, swap_disabled: 409, bad_amount: 400, sell_check_failed: 409, quote_failed: 502 };

/** Returns an unsigned transaction. Lockabox never signs, never holds funds, never adds a fee (LAB §0.4.5–6). */
export async function POST(req: Request) {
  try {
    const b = await readJson<{ assetId?: number; amountSol?: string; slippageBps?: number; userPublicKey?: string; rollId?: number }>(req);
    if (!Number.isSafeInteger(b.assetId) || typeof b.amountSol !== 'string' || !b.userPublicKey || !isSolanaAddress(b.userPublicKey)) {
      return problem(400, 'missing_fields', 'assetId, amountSol and a Solana userPublicKey are required');
    }
    return json(await build({ assetId: b.assetId!, amountSol: b.amountSol, slippageBps: b.slippageBps, userPublicKey: b.userPublicKey, rollId: b.rollId ?? null, userId: await currentUserId() }), 201);
  } catch (e) {
    if (e instanceof SwapError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
