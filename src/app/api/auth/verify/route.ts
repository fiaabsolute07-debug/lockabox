import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { authOrigin, verifySignIn } from '@/modules/auth/session';

export async function POST(req: Request) {
  try {
    let origin: string;
    try { origin = authOrigin(req); } catch { return problem(403, 'bad_origin', 'sign in from the configured Lockabox website'); }
    const tooMany = await limited('auth-verify', null, 20);
    if (tooMany) return tooMany;
    const b = await readJson<{ address?: string; nonce?: string; issuedAt?: string; signature?: string; family?: 'solana' | 'evm'; chainId?: number }>(req);
    if ([b.address,b.nonce,b.issuedAt,b.signature].some(v => typeof v !== 'string' || !v)) return problem(400, 'missing_fields', 'address, nonce, issuedAt and signature are required');
    if (b.family !== undefined && !['solana','evm'].includes(b.family)) return problem(400, 'bad_family', 'unsupported wallet family');
    try {
      const userId = await verifySignIn({ address: b.address!, nonce: b.nonce!, issuedAt: b.issuedAt!, signature: b.signature!, family: b.family === 'evm' ? 'evm' : 'solana', chainId: b.chainId, origin });
      return json({ userId });
    } catch (e) {
      return problem(401, 'sign_in_failed', (e as Error).message);
    }
  } catch (e) { return handleError(e); }
}
