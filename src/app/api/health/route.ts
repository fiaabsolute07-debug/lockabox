import { handleError, json } from '@/lib/api';
import { health } from '@/modules/health/service';

export const dynamic = 'force-dynamic';

/** 200 when healthy, 503 with alerts otherwise (AC-080). No secrets, no user data. */
export async function GET() {
  try {
    const h = await health(undefined, { paprikaKey: !!process.env.DEXPAPRIKA_API_KEY });
    return json(h, h.status === 'ok' ? 200 : 503);
  } catch (e) { return handleError(e); }
}
