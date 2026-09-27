import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { verifySignIn } from '@/modules/auth/session';

export async function POST(req: Request) {
  try {
    const tooMany = await limited('auth-verify', null, 20);
    if (tooMany) return tooMany;
    const b = await readJson<{ address?: string; nonce?: string; issuedAt?: string; signature?: string }>(req);
    if (!b.address || !b.nonce || !b.issuedAt || !b.signature) return problem(400, 'missing_fields', 'address, nonce, issuedAt and signature are required');
    try {
      const userId = await verifySignIn({ address: b.address, nonce: b.nonce, issuedAt: b.issuedAt, signature: b.signature });
      return json({ userId });
    } catch (e) {
      return problem(401, 'sign_in_failed', (e as Error).message);
    }
  } catch (e) { return handleError(e); }
}
