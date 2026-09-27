import { handleError, json, problem, readJson } from '@/lib/api';
import { adminActor, isAdmin } from '@/modules/admin/guard';
import { AdminError, unkillAsset } from '@/modules/admin/service';

const STATUS: Record<AdminError['code'], number> = { not_found: 404, bad_input: 400 };

/** Undo a kill made by mistake (audited). */
export async function POST(req: Request) {
  try {
    if (!isAdmin(req)) return problem(401, 'unauthorized', 'admin token required');
    const b = await readJson<{ assetId?: number; reason?: string }>(req);
    if (!Number.isSafeInteger(b.assetId) || !b.reason) return problem(400, 'missing_fields', 'assetId and reason are required');
    return json(await unkillAsset(b.assetId!, b.reason, adminActor(req)));
  } catch (e) {
    if (e instanceof AdminError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
