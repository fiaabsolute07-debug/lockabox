import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { authOrigin, createNonce, isEvmAddress, isSolanaAddress } from '@/modules/auth/session';

export async function POST(req: Request) {
  try {
    let origin: string;
    try { origin = authOrigin(req); } catch { return problem(403, 'bad_origin', 'sign in from the configured Lockabox website'); }
    const tooMany = await limited('auth-nonce', null, 20);
    if (tooMany) return tooMany;
    // Solana by default; EVM wallets send `family: 'evm'` and the chain the wallet is on (an enabled EVM chain).
    const { address, family = 'solana', chainId } = await readJson<{ address?: string; family?: 'solana' | 'evm'; chainId?: number }>(req);
    if (typeof address !== 'string' || !['solana','evm'].includes(family)) return problem(400, 'bad_address', 'a valid wallet address and family are required');
    if (family === 'evm') {
      if (!address || !isEvmAddress(address) || !Number.isInteger(chainId)) return problem(400, 'bad_address', 'an EVM address and chainId are required');
      try { return json(await createNonce(address, undefined, { family, chainId, origin })); }
      catch { return problem(400, 'unsupported_chain', 'sign in from one of the supported chains'); }
    }
    if (!address || !isSolanaAddress(address)) return problem(400, 'bad_address', 'a Solana address is required');
    return json(await createNonce(address, undefined, { origin }));
  } catch (e) { return handleError(e); }
}
