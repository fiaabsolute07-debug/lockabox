import { handleError, json, problem, readJson } from '@/lib/api';
import { markSubmitted, SwapError } from '@/modules/swap/service';

/** PATCH { txHash, wallet }: the client reports the signature after the wallet sent it; the worker confirms on-chain. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/trades/[id]'>) {
  try {
    const id = Number((await ctx.params).id);
    const b = await readJson<{ txHash?: string; wallet?: string }>(req);
    if (!Number.isSafeInteger(id) || !b.txHash || !b.wallet) return problem(400, 'missing_fields', 'txHash and wallet are required');
    const ok = await markSubmitted(id, b.txHash, b.wallet);
    return ok ? json({ ok: true, status: 'submitted' }) : problem(409, 'not_updatable', 'trade not found for this wallet or already submitted');
  } catch (e) {
    if (e instanceof SwapError) return problem(400, e.code, e.message);
    return handleError(e);
  }
}
