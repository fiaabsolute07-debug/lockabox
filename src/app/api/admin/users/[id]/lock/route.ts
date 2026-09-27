import { handleError, json, problem, readJson } from '@/lib/api';
import { adminActor, isAdmin } from '@/modules/admin/guard';
import { AdminError, setUserLock } from '@/modules/admin/service';

const STATUS: Record<AdminError['code'], number> = { not_found: 404, bad_input: 400 };

/** Lock or unlock an account (points abuse, RUNBOOKS §3); audited. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/users/[id]/lock'>) {
  try {
    if (!isAdmin(req)) return problem(401, 'unauthorized', 'admin token required');
    const id = (await ctx.params).id;
    if (!/^[0-9a-f-]{36}$/.test(id)) return problem(400, 'bad_id', 'invalid user id');
    const b = await readJson<{ lock?: boolean; reason?: string }>(req);
    if (typeof b.lock !== 'boolean' || !b.reason) return problem(400, 'missing_fields', 'lock (true|false) and reason are required');
    return json(await setUserLock(id, b.lock, b.reason, adminActor(req)));
  } catch (e) {
    if (e instanceof AdminError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
