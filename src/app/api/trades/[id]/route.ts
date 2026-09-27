import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { markSubmitted, SwapError, tradeStatus } from '@/modules/swap/service';

/** PATCH { txHash, wallet }: the client reports the signature after the wallet sent it; the worker confirms on-chain. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/trades/[id]'>) {
  try {
    const tooMany = await limited('trade-patch', null, 30);
    if (tooMany) return tooMany;
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

/** GET: status of one trade for the buy box (AC-042): built → submitted → confirmed | failed. No wallet, no quote, no amounts. */
export async function GET(_req: Request, ctx: RouteContext<'/api/trades/[id]'>) {
  try {
    const tooMany = await limited('trade-status', null, 120);
    if (tooMany) return tooMany;
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id)) return problem(400, 'bad_id', 'invalid trade id');
    const t = await tradeStatus(id);
    return t ? json(t) : problem(404, 'not_found', 'unknown trade');
  } catch (e) { return handleError(e); }
}
