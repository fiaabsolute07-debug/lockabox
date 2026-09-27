import { handleError, json, problem } from '@/lib/api';
import { isAdmin } from '@/modules/admin/guard';
import { AdminError, overview } from '@/modules/admin/service';

const STATUS: Record<AdminError['code'], number> = { not_found: 404, bad_input: 400 };

export const dynamic = 'force-dynamic';

/** Pending campaigns, killed coins and the latest audit entries. */
export async function GET(req: Request) {
  try {
    if (!isAdmin(req)) return problem(401, 'unauthorized', 'admin token required');
    return json(await overview());
  } catch (e) {
    if (e instanceof AdminError) return problem(STATUS[e.code], e.code, e.message);
    return handleError(e);
  }
}
