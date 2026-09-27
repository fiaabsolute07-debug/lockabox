import { handleError, json, problem } from '@/lib/api';
import { bestPulls } from '@/modules/board/service';

export const dynamic = 'force-dynamic';

/** Best pulls (AC-057): real rolls ranked by price change since the pull. */
export async function GET(req: Request) {
  try {
    const window = new URL(req.url).searchParams.get('window') ?? '24h';
    if (window !== '24h' && window !== '7d') return problem(400, 'bad_window', 'window must be 24h or 7d');
    return json({ window, items: await bestPulls(window) });
  } catch (e) { return handleError(e); }
}
