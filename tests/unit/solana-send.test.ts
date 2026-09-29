import { describe, expect, it, vi } from 'vitest';
import type { Connection, VersionedTransaction } from '@solana/web3.js';
import { isNotSupported, sendSolanaTransaction } from '@/components/solanaSend';

const tx = {} as VersionedTransaction, connection = {} as Connection;
// Same text as Reown's WalletConnectMethodNotSupportedError, under a minified class name as in production.
class e extends Error {}
const notSupported = () => new e('The method "solana_signAndSendTransaction" is not supported by the wallet');

describe('sending a Solana buy through the connected wallet', () => {
  it('uses sign-and-send when the wallet offers it', async () => {
    const p = { signAndSendTransaction: vi.fn().mockResolvedValue('sig1'), sendTransaction: vi.fn() };
    await expect(sendSolanaTransaction(p, tx, connection)).resolves.toBe('sig1');
    expect(p.sendTransaction).not.toHaveBeenCalled();
  });

  it('WalletConnect session without sign-and-send: the wallet signs, we broadcast', async () => {
    const p = { signAndSendTransaction: vi.fn(), sendTransaction: vi.fn().mockResolvedValue('sig2'), session: { namespaces: { solana: { methods: ['solana_signTransaction', 'solana_signMessage'] } } } };
    await expect(sendSolanaTransaction(p, tx, connection)).resolves.toBe('sig2');
    expect(p.signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('falls back on a "not supported" error even when the class name is minified', async () => {
    expect(isNotSupported(notSupported())).toBe(true);
    const p = { signAndSendTransaction: vi.fn().mockRejectedValue(notSupported()), sendTransaction: vi.fn().mockResolvedValue('sig3') };
    await expect(sendSolanaTransaction(p, tx, connection)).resolves.toBe('sig3');
  });

  it('never retries a rejection or a transport error (could buy twice)', async () => {
    for (const error of [Object.assign(new Error('User rejected the request'), { code: 4001 }), new Error('socket hang up')]) {
      const p = { signAndSendTransaction: vi.fn().mockRejectedValue(error), sendTransaction: vi.fn() };
      await expect(sendSolanaTransaction(p, tx, connection)).rejects.toBe(error);
      expect(p.sendTransaction).not.toHaveBeenCalled();
    }
  });
});
