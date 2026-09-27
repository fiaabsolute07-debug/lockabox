import { handleError, json, problem, readJson } from '@/lib/api';
import { limited } from '@/lib/ratelimit';
import { createNonce, isEvmAddress, isSolanaAddress } from '@/modules/auth/session';

export async function POST(req: Request) {
  try {
    const tooMany = await limited('auth-nonce', null, 20);
    if (tooMany) return tooMany;
    // Solana by default; EVM wallets send `family: 'evm'` and the chain the wallet is on (an enabled EVM chain).
    const { address, family = 'solana', chainId } = await readJson<{ address?: string; family?: 'solana' | 'evm'; chainId?: number }>(req);
    if (family === 'evm') {
      if (!address || !isEvmAddress(address) || !Number.isInteger(chainId)) return problem(400, 'bad_address', 'an EVM address and chainId are required');
      try { return json(await createNonce(address, undefined, { family, chainId })); }
      catch { return problem(400, 'unsupported_chain', 'sign in from one of the supported chains'); }
    }
    if (!address || !isSolanaAddress(address)) return problem(400, 'bad_address', 'a Solana address is required');
    return json(await createNonce(address));
  } catch (e) { return handleError(e); }
}
