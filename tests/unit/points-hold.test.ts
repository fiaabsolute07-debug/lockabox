import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { holdsAnyMint } from '@/modules/points/service';

// A real getTokenAccountsByOwner response (recorded 2026-09-27): holds USDC (113.1), 0 JUP, 0 of WXMR…, 34.5 of ChDipwK4….
const accounts = readFileSync('tests/fixtures/solana-token-accounts.json', 'utf8');
const empty = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: [] } });
const OWNER = 'dyMyXM2EfVfMZWHBKfwrybSiPMsRLmas4ycrMRJDCg7';

/** Token-2022 program gets an empty list; the classic token program gets the recorded one. */
function chain(calls: string[]): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: [string, { programId: string }] };
    calls.push(`${body.method}:${body.params[0]}`);
    return new Response(body.params[1].programId.startsWith('Tokenkeg') ? accounts : empty);
  }) as typeof fetch;
}

describe('"hold a pulled coin" task reads the chain, not the client (AC-053)', () => {
  it('counts only a pulled mint the wallet holds a positive balance of', async () => {
    const calls: string[] = [];
    expect(await holdsAnyMint(OWNER, ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'], chain(calls))).toBe(true);
    expect(calls[0]).toBe(`getTokenAccountsByOwner:${OWNER}`);
    expect(await holdsAnyMint(OWNER, ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'], chain([]))).toBe(false); // account exists, balance 0
    expect(await holdsAnyMint(OWNER, ['So11111111111111111111111111111111111111112'], chain([]))).toBe(false); // not held
  });
});
