import { describe, expect, it, vi } from 'vitest';
import { jupiterQuote } from '@/modules/swap/service';

const asset = { address: 'Mint111' } as Parameters<typeof jupiterQuote>[0];
const quoteBody = { inputMint: 'So11111111111111111111111111111111111111112', inAmount: '50000000', outputMint: 'Mint111', outAmount: '100', otherAmountThreshold: '97', swapMode: 'ExactIn', slippageBps: 300, platformFee: null, priceImpactPct: '0', routePlan: [] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Jupiter quotes for WalletConnect wallets (DECISIONS #23)', () => {
  it('asks for a legacy route first', async () => {
    const f = vi.fn(async () => reply(quoteBody));
    await expect(jupiterQuote(asset, 50_000_000n, 300, true, f as unknown as typeof fetch)).resolves.toMatchObject({ legacy: true });
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('asLegacyTransaction=true');
  });

  it('pump.fun coins have no legacy route: falls back to a v0 route instead of failing the quote', async () => {
    const f = vi.fn(async (url: string) => (url.includes('asLegacyTransaction') ? reply({ error: 'No routes found', errorCode: 'COULD_NOT_FIND_ANY_ROUTE' }, 400) : reply(quoteBody)));
    await expect(jupiterQuote(asset, 50_000_000n, 300, true, f as unknown as typeof fetch)).resolves.toMatchObject({ legacy: false, q: { outAmount: '100' } });
  });

  it('extension wallets never ask for legacy', async () => {
    const f = vi.fn(async () => reply({ error: 'No routes found' }, 400));
    await expect(jupiterQuote(asset, 50_000_000n, 300, false, f as unknown as typeof fetch)).rejects.toMatchObject({ code: 'quote_failed' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
