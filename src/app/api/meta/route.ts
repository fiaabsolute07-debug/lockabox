import { handleError, json } from '@/lib/api';
import { chainsAndCases } from '@/modules/cases/read';
import { activeSeed } from '@/modules/rolls/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await activeSeed();
    return json(await chainsAndCases());
  } catch (e) { return handleError(e); }
}
