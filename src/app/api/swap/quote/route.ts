import { handleError, json, problem, readJson } from '@/lib/api';
import { swapBlockedFor } from '@/modules/admin/guard';
import { quote, SwapError } from '@/modules/swap/service';

export const dynamic = 'force-dynamic';

const STATUS: Record<SwapError['code'], number> = { not_found: 404, swap_disabled: 409, bad_amount: 400, sell_check_failed: 409, quote_failed: 502 };

export async function POST(req: Request) {
  try {
    const blocked = swapBlockedFor(req);
    if (blocked) return problem(451, 'swap_unavailable_region', `in-app swap is not available in ${blocked}; View on DEX instead`);
    const b = await readJson<{ assetId?: number; amountSol?: string; slippageBps?: number }>(req);
    if (!Number.isSafeInteger(b.assetId) || typeof b.amountSol !== 'string') return problem(400, 'missing_fields', 'assetId and amountSol are required');
    return json(await quote({ assetId: b.assetId!, amountSol: b.amountSol, slippageBps: b.slippageBps }));
  } catch (e) {
    if (e instanceof SwapError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
