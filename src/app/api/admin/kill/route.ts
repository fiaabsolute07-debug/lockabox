import { handleError, json, problem, readJson } from '@/lib/api';
import { sql } from '@/lib/db';
import { isAdmin } from '@/modules/admin/guard';

/** Kill switch (LAB §7.6, AC-069): the asset leaves every roll immediately and swap is disabled; audit via moderation.actor. */
export async function POST(req: Request) {
  try {
    if (!isAdmin(req)) return problem(401, 'unauthorized', 'admin token required');
    const b = await readJson<{ assetId?: number; reason?: string; actor?: string }>(req);
    if (!Number.isSafeInteger(b.assetId) || !b.reason) return problem(400, 'missing_fields', 'assetId and reason are required');
    const [exists] = await sql`select 1 from assets where id = ${b.assetId!}`;
    if (!exists) return problem(404, 'not_found', 'unknown asset');
    const [row] = await sql`insert into moderation (asset_id, reason, actor) values (${b.assetId!}, ${b.reason}, ${b.actor ?? 'admin'})
                            on conflict (asset_id) do update set reason = excluded.reason returning asset_id`;
    return row ? json({ ok: true, assetId: b.assetId }) : problem(404, 'not_found', 'unknown asset');
  } catch (e) { return handleError(e); }
}
