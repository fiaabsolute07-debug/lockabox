import { handleError, json } from '@/lib/api';
import { feed } from '@/modules/cases/read';

export const dynamic = 'force-dynamic';

export async function GET() {
  try { return json(await feed()); } catch (e) { return handleError(e); }
}
