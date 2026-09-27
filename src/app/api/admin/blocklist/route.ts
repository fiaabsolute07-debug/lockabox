import { handleError, json, problem, readJson } from '@/lib/api';
import { adminActor, isAdmin } from '@/modules/admin/guard';
import { AdminError, setBlocklist } from '@/modules/admin/service';

const STATUS: Record<AdminError['code'], number> = { not_found: 404, bad_input: 400 };

/** Add or remove a symbol from the pool blocklist (stables, wrapped natives, majors…); audited. */
export async function POST(req: Request) {
  try {
    if (!isAdmin(req)) return problem(401, 'unauthorized', 'admin token required');
    const b = await readJson<{ symbol?: string; op?: 'add' | 'remove'; reason?: string }>(req);
    if (!b.symbol || (b.op !== 'add' && b.op !== 'remove')) return problem(400, 'missing_fields', 'symbol and op (add|remove) are required');
    return json(await setBlocklist(b.symbol, b.op, b.reason ?? '', adminActor(req)));
  } catch (e) {
    if (e instanceof AdminError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
