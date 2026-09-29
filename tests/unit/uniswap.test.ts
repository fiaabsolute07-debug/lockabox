import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertUniswapSafe, buildUniswapTx, getUniswapQuote, parseUniswapQuote, routeLabels, UNIVERSAL_ROUTERS, UniswapError, type UniswapTx } from '@/modules/swap/uniswap';

// Real responses recorded 2026-09-29 (Base, 0.01 ETH → XDP, swapper = burn address; nothing signed).
const fx = (p: string) => JSON.parse(readFileSync(`tests/fixtures/uniswap/${p}`, 'utf8'));
const quoteBody = fx('quote-base-native.json');
const swapBody = fx('swap-base-native.json');
const BUYER = '0x000000000000000000000000000000000000dEaD';
const TOKEN = '0x07b3D902783c3C12b077508c3B5c00113d1291D0';
const expectBuy = { chainId: 8453, fromAmount: 10n ** 16n, toToken: TOKEN, swapper: BUYER };
const tx = (): UniswapTx => ({ ...swapBody.swap, gasLimit: swapBody.swap.gasLimit ?? null, from: swapBody.swap.from ?? null });

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Uniswap API (DECISIONS #21)', () => {
  it('parses a CLASSIC quote and labels each pool hop', () => {
    const q = parseUniswapQuote(quoteBody);
    expect(q).toMatchObject({ routing: 'CLASSIC', chainId: 8453, fromAmount: '10000000000000000' });
    expect(q.route).toEqual(['Uniswap v3 0.05%', 'Uniswap v3 0.01%']);
    expect(routeLabels(undefined)).toEqual(['Uniswap']);
    expect(routeLabels('[v4] 100.00% = [838.8608%] [60] [0xabc]')).toEqual(['Uniswap v4 dynamic fee']);
  });

  it('accepts the recorded quote and its transaction to the published Universal Router', () => {
    const q = parseUniswapQuote(quoteBody);
    expect(UNIVERSAL_ROUTERS[8453]).toBe('0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40');
    expect(() => assertUniswapSafe(q, expectBuy, tx())).not.toThrow();
  });

  it('rejects anything that is not exactly the buy the user asked for', () => {
    const q = parseUniswapQuote(quoteBody);
    const bad = (mutate: (q: ReturnType<typeof parseUniswapQuote>, t: UniswapTx) => void, message: RegExp) => {
      const copy = parseUniswapQuote(structuredClone(quoteBody)); const t = tx(); mutate(copy, t);
      expect(() => assertUniswapSafe(copy, expectBuy, t)).toThrow(message);
    };
    bad((c) => { c.routing = 'DUTCH_V3'; }, /routing/);
    bad((c) => { c.toToken = '0x0000000000000000000000000000000000000001'; }, /different token/);
    bad((c) => { c.fromAmount = '1'; }, /different amount/);
    bad((c) => { c.raw.aggregatedOutputs = [...(c.raw.aggregatedOutputs ?? []), { recipient: '0x1111111111111111111111111111111111111111', bps: 25 }]; }, /someone else/);
    bad((_, t) => { t.to = '0x1111111111111111111111111111111111111111'; }, /Universal Router/);
    bad((_, t) => { t.value = '0x1'; }, /value/);
    bad((_, t) => { t.data = '0x095ea7b3'; }, /not a Universal Router swap/);
    bad((_, t) => { t.from = '0x1111111111111111111111111111111111111111'; }, /sender/);
    expect(() => assertUniswapSafe(q, { ...expectBuy, chainId: 1 })).toThrow(/another chain/);
  });

  it('asks for Uniswap pools only, pins the router version, sends no integrator fee, and keeps the key server-side', async () => {
    vi.stubEnv('UNISWAP_API_KEY', 'test-key');
    const calls: { url: string; init: RequestInit }[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(url.endsWith('/quote') ? quoteBody : swapBody)); });
    const q = await getUniswapQuote({ chainId: 8453, toToken: TOKEN, fromAmount: 10n ** 16n, swapper: BUYER, slippageBps: 300 }, f as unknown as typeof fetch);
    await buildUniswapTx(q, f as unknown as typeof fetch);
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent).toMatchObject({ protocols: ['V2', 'V3', 'V4'], tokenIn: '0x0000000000000000000000000000000000000000', slippageTolerance: 3, type: 'EXACT_INPUT' });
    expect(sent).not.toHaveProperty('integratorFees');
    expect(calls[0].init.headers).toMatchObject({ 'x-api-key': 'test-key', 'x-universal-router-version': '2.1.2' });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ quote: quoteBody.quote });
  });

  it('classifies failures: no route → fallback, timeout/429 → retry, missing key → unavailable', async () => {
    vi.stubEnv('UNISWAP_API_KEY', 'test-key');
    const noRoute = vi.fn(async () => new Response(JSON.stringify({ errorCode: 'NoRouteFoundError', detail: 'No route' }), { status: 404 }));
    await expect(getUniswapQuote({ chainId: 56, toToken: TOKEN, fromAmount: 1n, swapper: BUYER, slippageBps: 300 }, noRoute as unknown as typeof fetch))
      .rejects.toMatchObject({ kind: 'no_route' });
    const timeout = vi.fn(async () => new Response(JSON.stringify({ errorCode: 'UpstreamTimeoutError', detail: 'timed out' }), { status: 404 }));
    await expect(getUniswapQuote({ chainId: 56, toToken: TOKEN, fromAmount: 1n, swapper: BUYER, slippageBps: 300 }, timeout as unknown as typeof fetch))
      .rejects.toMatchObject({ kind: 'transient' });
    const busy = vi.fn(async () => new Response('{}', { status: 429 }));
    await expect(getUniswapQuote({ chainId: 56, toToken: TOKEN, fromAmount: 1n, swapper: BUYER, slippageBps: 300 }, busy as unknown as typeof fetch))
      .rejects.toMatchObject({ kind: 'transient' });
    vi.stubEnv('UNISWAP_API_KEY', '');
    await expect(getUniswapQuote({ chainId: 56, toToken: TOKEN, fromAmount: 1n, swapper: BUYER, slippageBps: 300 }, noRoute as unknown as typeof fetch))
      .rejects.toBeInstanceOf(UniswapError);
  });
});
