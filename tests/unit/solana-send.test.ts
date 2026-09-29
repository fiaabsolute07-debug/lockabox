import { describe, expect, it, vi } from 'vitest';
import type { VersionedTransaction } from '@solana/web3.js';
import { isNotSupported, sendSolanaTransaction, viaWalletConnect, WalletTimeoutError, withWalletTimeout, type SolanaSender } from '@/components/solanaSend';

const tx = {} as VersionedTransaction;
const signed = { serialize: () => new Uint8Array([1, 2, 3]) };
const connection = () => ({ sendRawTransaction: vi.fn().mockResolvedValue('broadcast-sig') });
// Same text as Reown's WalletConnectMethodNotSupportedError, under a minified class name as in production.
class e extends Error {}
const notSupported = () => new e('The method "solana_signAndSendTransaction" is not supported by the wallet');
const wallet = (over: Partial<Record<keyof SolanaSender, unknown>> = {}) =>
  ({ signAndSendTransaction: vi.fn().mockResolvedValue('wallet-sig'), signTransaction: vi.fn().mockResolvedValue(signed), ...over }) as unknown as SolanaSender & { signAndSendTransaction: ReturnType<typeof vi.fn>; signTransaction: ReturnType<typeof vi.fn> };
const okxSession = { namespaces: { solana: { methods: ['solana_signTransaction', 'solana_signMessage'] } } }; // recorded from OKX Web3 Wallet, 2026-09-29

describe('sending a Solana buy through the connected wallet', () => {
  it('uses sign-and-send when the wallet offers it', async () => {
    const p = wallet(), c = connection();
    await expect(sendSolanaTransaction(p, tx, c)).resolves.toBe('wallet-sig');
    expect(c.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('OKX over WalletConnect (no sign-and-send): the wallet signs, we broadcast', async () => {
    const p = wallet({ session: okxSession }), c = connection();
    expect(viaWalletConnect(p)).toBe(true);
    await expect(sendSolanaTransaction(p, tx, c)).resolves.toBe('broadcast-sig');
    expect(p.signAndSendTransaction).not.toHaveBeenCalled();
    expect(c.sendRawTransaction).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it('falls back on a "not supported" error even when the class name is minified', async () => {
    expect(isNotSupported(notSupported())).toBe(true);
    const p = wallet({ signAndSendTransaction: vi.fn().mockRejectedValue(notSupported()) });
    await expect(sendSolanaTransaction(p, tx, connection())).resolves.toBe('broadcast-sig');
  });

  it('never retries a rejection or a transport error (could buy twice)', async () => {
    for (const error of [Object.assign(new Error('User rejected the request'), { code: 4001 }), new Error('socket hang up')]) {
      const p = wallet({ signAndSendTransaction: vi.fn().mockRejectedValue(error) }), c = connection();
      await expect(sendSolanaTransaction(p, tx, c)).rejects.toBe(error);
      expect(p.signTransaction).not.toHaveBeenCalled();
      expect(c.sendRawTransaction).not.toHaveBeenCalled();
    }
  });

  it('a wallet that never answers times out, and a signature arriving after that is not broadcast', async () => {
    let release!: (value: unknown) => void;
    const p = wallet({ session: okxSession, signTransaction: vi.fn(() => new Promise((resolve) => { release = resolve; })) }), c = connection();
    const run = withWalletTimeout((signal) => sendSolanaTransaction(p, tx, c, signal), 50);
    await expect(run).rejects.toBeInstanceOf(WalletTimeoutError);
    release(signed);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(c.sendRawTransaction).not.toHaveBeenCalled();
  });
});
