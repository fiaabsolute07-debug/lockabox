import { handleError, json, readJson } from '@/lib/api';
import { CHAIN_SCOPE_ALL } from '@/modules/cases/pools';
import { assetDetail, reelFor } from '@/modules/cases/read';
import { currentUserId, deviceId } from '@/modules/auth/session';
import { rollDetailed } from '@/modules/rolls/service';

export const dynamic = 'force-dynamic';

/** POST { caseId, chain?, filters? } → the roll, the pulled asset and a cosmetic reel. Free, unlimited, no signature (LAB-AC-028). */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ caseId?: string; chain?: string; filters?: unknown }>(req);
    const userId = await currentUserId();
    const device = userId ? null : await deviceId();
    const { result, items } = await rollDetailed({ userId, deviceId: device, caseId: String(body.caseId ?? 'trending'), chainScope: body.chain || CHAIN_SCOPE_ALL, filters: body.filters });
    const [asset, reel] = await Promise.all([assetDetail(result.assetId, result.tier), reelFor(items, result.assetId)]);
    return json({ roll: result, asset, reel }, 201);
  } catch (e) { return handleError(e); }
}
