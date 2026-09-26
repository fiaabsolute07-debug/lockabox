import { handleError, json } from '@/lib/api';
import { signOut } from '@/modules/auth/session';

export async function POST() {
  try { await signOut(); return json({ ok: true }); } catch (e) { return handleError(e); }
}
