import { handleError, json, problem, readJson } from '@/lib/api';
import { createNonce, isSolanaAddress } from '@/modules/auth/session';

export async function POST(req: Request) {
  try {
    const { address } = await readJson<{ address?: string }>(req);
    if (!address || !isSolanaAddress(address)) return problem(400, 'bad_address', 'a Solana address is required');
    return json(await createNonce(address));
  } catch (e) { return handleError(e); }
}
