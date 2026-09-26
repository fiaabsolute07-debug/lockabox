import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { liquidityGate, solanaHoneypotGate } from '@/modules/gates';
import { getQuote, JupiterError } from '@/modules/swap/jupiter';
import { solToLamports } from '@/modules/swap/service';

const buy = JSON.parse(readFileSync('tests/fixtures/jupiter-quote-buy.json', 'utf8'));
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** fetch stub: first call answers the buy quote, second the sell quote. */
function jupiter(sellOutLamports: string | null) {
  let n = 0;
  return (async () => {
    n++;
    if (n === 1) return respond(buy);
    if (sellOutLamports === null) return respond({ error: 'The token is not tradable', errorCode: 'TOKEN_NOT_TRADABLE' }, 400);
    return respond({ ...buy, inputMint: buy.outputMint, outputMint: buy.inputMint, inAmount: buy.outAmount, outAmount: sellOutLamports, otherAmountThreshold: sellOutLamports });
  }) as typeof fetch;
}

describe('hidden gates (LAB §2.3, AC-016/017)', () => {
  it('liquidity floor at $1,000', () => {
    expect(liquidityGate(999).passed).toBe(false);
    expect(liquidityGate(1000).passed).toBe(true);
    expect(liquidityGate(null).passed).toBe(false);
  });

  it('honeypot: a healthy round trip passes', async () => {
    const out = await solanaHoneypotGate('Mint1111111111111111111111111111111111111', jupiter('9800000'));
    expect(out.passed).toBe(true);
  });

  it('honeypot: a heavy sell tax fails', async () => {
    const out = await solanaHoneypotGate('Mint1111111111111111111111111111111111111', jupiter('3000000'));
    expect(out).toMatchObject({ passed: false });
    expect(out.reason).toMatch(/keeps only 30.0%/);
  });

  it('honeypot: no sell route fails', async () => {
    const out = await solanaHoneypotGate('Mint1111111111111111111111111111111111111', jupiter(null));
    expect(out.passed).toBe(false);
    expect(out.reason).toMatch(/TOKEN_NOT_TRADABLE/);
  });

  it('network errors are not treated as a verdict', async () => {
    const boom = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(solanaHoneypotGate('Mint1111111111111111111111111111111111111', boom)).rejects.toThrow('fetch failed');
  });
});

describe('swap (LAB §0.4.6, AC-037/043)', () => {
  it('refuses any quote that carries a platform fee', async () => {
    const withFee = (async () => respond({ ...buy, platformFee: { amount: '1', feeBps: 50 } })) as typeof fetch;
    await expect(getQuote({ inputMint: 'a', outputMint: 'b', amount: '1', slippageBps: 300 }, withFee)).rejects.toBeInstanceOf(JupiterError);
  });

  it('never sends a fee parameter to Jupiter', async () => {
    let url = '';
    const spy = (async (u: string) => { url = u; return respond(buy); }) as unknown as typeof fetch;
    await getQuote({ inputMint: 'a', outputMint: 'b', amount: '1', slippageBps: 300 }, spy);
    expect(url).not.toMatch(/platformFee|feeBps|feeAccount/);
  });

  it('parses SOL amounts exactly into lamports', () => {
    expect(solToLamports('0.05')).toBe(50_000_000n);
    expect(solToLamports('1')).toBe(1_000_000_000n);
    expect(solToLamports('0.000000001')).toBe(1n);
    expect(() => solToLamports('0')).toThrow();
    expect(() => solToLamports('-1')).toThrow();
    expect(() => solToLamports('0.0000000001')).toThrow();
  });
});
