import { handleError, json, readJson } from '@/lib/api';
import { CHAIN_SCOPE_ALL } from '@/modules/cases/pools';
import { assetCards, assetDetail, reelFor } from '@/modules/cases/read';
import { currentUserId, deviceId } from '@/modules/auth/session';
import { rollDetailed } from '@/modules/rolls/service';

export const dynamic = 'force-dynamic';

/**
 * POST { caseId, chain?, filters?, pick? } → the roll, the pulled asset and a cosmetic reel. Free, unlimited, no signature (LAB-AC-028).
 * `pick` (0–2) is "Pick 1 of 3": the face-down card the user chose; the reply then carries all three cards (DECISIONS #27).
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ caseId?: string; chain?: string; filters?: unknown; pick?: unknown }>(req);
    const userId = await currentUserId();
    const device = userId ? null : await deviceId();
    const pick = body.pick === undefined || body.pick === null ? null : (body.pick as number);
    const { result, items } = await rollDetailed({ userId, deviceId: device, caseId: String(body.caseId ?? 'trending'), chainScope: body.chain || CHAIN_SCOPE_ALL, filters: body.filters, pick });
    if (result.candidates) {
      const [asset, cards] = await Promise.all([assetDetail(result.assetId, result.tier), assetCards(result.candidates, items)]);
      return json({ roll: result, asset, reel: { winIndex: 0, cards: [] }, picks: { index: result.pick, cards } }, 201);
    }
    const [asset, reel] = await Promise.all([assetDetail(result.assetId, result.tier), reelFor(items, result.assetId)]);
    return json({ roll: result, asset, reel }, 201);
  } catch (e) { return handleError(e); }
}
