import { expect, test, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

/**
 * A Solana wallet registered through the Wallet Standard (what Phantom/Solflare/Backpack do), driven by the real wallet adapter.
 * It signs with a throwaway ed25519 key held by the test process; nothing reaches a chain.
 * AC-003 (real SIWS round trip against the local API + DB), AC-040/042 (buy only on click, status followed to failed).
 */
const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const feed = require('./fixtures/feed.json');
const caseSummary = require('./fixtures/case.json');
const baseAsset = require('./fixtures/asset.json');
const roll = require('./fixtures/roll.json');

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function standardWallet(page: Page) {
  const keys = nacl.sign.keyPair();
  const address = bs58.encode(keys.publicKey);
  const sent: string[] = [];
  await page.exposeFunction('__solSign', (bytes: number[]) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), keys.secretKey)));
  await page.exposeFunction('__solSend', (bytes: number[]) => { sent.push(Buffer.from(bytes).toString('base64')); return Array.from(nacl.sign.detached(Uint8Array.from(bytes), keys.secretKey)); });
  await page.addInitScript(({ address, publicKey }) => {
    const w = window as unknown as { __solSign: (b: number[]) => Promise<number[]>; __solSend: (b: number[]) => Promise<number[]> };
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const account = { address, publicKey: new Uint8Array(publicKey), chains: ['solana:mainnet'], features: ['solana:signAndSendTransaction', 'solana:signMessage'], label: 'fixture', icon: undefined };
    const wallet = {
      version: '1.0.0', name: 'Fixture Solana Wallet', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      chains: ['solana:mainnet'], accounts: [] as typeof account[],
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => { wallet.accounts = [account]; for (const l of listeners.change ?? []) l({ accounts: wallet.accounts }); return { accounts: wallet.accounts }; } },
        'standard:disconnect': { version: '1.0.0', disconnect: async () => { wallet.accounts = []; for (const l of listeners.change ?? []) l({ accounts: [] }); } },
        'standard:events': { version: '1.0.0', on: (event: string, listener: (...args: unknown[]) => void) => { (listeners[event] ??= []).push(listener); return () => { listeners[event] = listeners[event].filter((x) => x !== listener); }; } },
        'solana:signMessage': { version: '1.0.0', signMessage: async (...inputs: { message: Uint8Array }[]) => Promise.all(inputs.map(async ({ message }) => ({ signedMessage: message, signature: new Uint8Array(await w.__solSign(Array.from(message))) }))) },
        'solana:signAndSendTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0],
          signAndSendTransaction: async (...inputs: { transaction: Uint8Array }[]) => Promise.all(inputs.map(async ({ transaction }) => ({ signature: new Uint8Array(await w.__solSend(Array.from(transaction))) }))) },
      },
    };
    const callback = ({ register }: { register: (wallet: unknown) => void }) => register(wallet);
    window.addEventListener('wallet-standard:app-ready', (event) => callback((event as CustomEvent).detail));
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: callback }));
  }, { address, publicKey: Array.from(keys.publicKey) });
  return { address, sent };
}

async function connectSolana(page: Page) {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.locator('w3m-modal').getByRole('button', { name: /Fixture Solana Wallet/ }).click();
}

test('AC-003: real SIWS round trip against the local API and database; same wallet → same account', async ({ page, request }) => {
  const live = await request.get('/api/meta').then((response) => response.ok()).catch(() => false);
  test.skip(!live, 'needs the local database: pnpm db:start && pnpm db:migrate');
  const { address } = await standardWallet(page);
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.goto('/');
  await connectSolana(page);
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click({ timeout: 20_000 });
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  await expect(page.getByRole('button', { name: short, exact: true })).toBeVisible({ timeout: 20_000 });
  const me = await page.evaluate(() => fetch('/api/auth/me').then((response) => response.json()));
  expect(me.user.wallets).toEqual([{ family: 'solana', address }]);
  await page.getByRole('button', { name: short, exact: true }).click();
  await page.getByRole('button', { name: 'Sign out / Disconnect' }).click();
  await connectSolana(page);
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  await expect(page.getByRole('button', { name: short, exact: true })).toBeVisible({ timeout: 20_000 });
  const again = await page.evaluate(() => fetch('/api/auth/me').then((response) => response.json()));
  expect(again.user.id).toBe(me.user.id);
});

test('AC-040/042: a Solana buy is built only on the click, sent through the wallet, reported, and followed to failed', async ({ page }) => {
  const { address, sent } = await standardWallet(page);
  const coin = { ...baseAsset, swapEnabled: true };
  const quote = { assetId: 3, symbol: 'GLORP', inputSymbol: 'SOL', inputAmount: '0.05', outAmount: '5471930000', outAmountMin: '5307772100', decimals: 6,
    priceImpactPct: 0.1, slippageBps: 300, route: ['Raydium CLMM'], provider: 'jupiter', routeFees: [], lockaboxFee: 0, sellCheck: 'passed' };
  const payer = new PublicKey(address);
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 1 })] }).compileToV0Message();
  const unsigned = Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
  const state = { builds: [] as unknown[], patch: null as unknown, polls: 0 };
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, meta);
    if (url.pathname === '/api/feed') return json(route, feed);
    if (url.pathname === '/api/auth/me') return json(route, { user: null });
    if (url.pathname === '/api/sponsored/live') return json(route, { label: 'Sponsored', items: [] });
    if (url.pathname === '/api/cases/trending') return json(route, caseSummary);
    if (url.pathname === '/api/assets/3') return json(route, coin);
    if (url.pathname === '/api/assets/3/buys') return json(route, { items: [] });
    if (url.pathname === '/api/rolls' && request.method() === 'POST') return json(route, { ...roll, asset: coin }, 201);
    if (url.pathname === '/api/swap/quote') return json(route, quote);
    if (url.pathname === '/api/swap/build') { state.builds.push(request.postDataJSON()); return json(route, { tradeId: 88, swapTransaction: unsigned, lastValidBlockHeight: 1, quote }, 201); }
    if (url.pathname === '/api/trades/88' && request.method() === 'PATCH') { state.patch = request.postDataJSON(); return json(route, { ok: true, status: 'submitted' }); }
    if (url.pathname === '/api/trades/88') { state.polls += 1; return json(route, { id: 88, status: state.polls > 1 ? 'failed' : 'submitted', txHash: null, chainId: 'solana' }); }
    return json(route, {});
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await connectSolana(page);
  await page.getByRole('button', { name: 'Continue without signing' }).click();
  await page.getByRole('button', { name: /OPEN CASE/ }).click();
  const box = page.locator('.swap-card');
  await expect(box.getByRole('button', { name: /Buy GLORP · review in wallet/ })).toBeEnabled();
  await page.waitForTimeout(500);
  expect(state.builds).toHaveLength(0);
  expect(sent).toHaveLength(0);
  await box.getByRole('button', { name: /Buy GLORP · review in wallet/ }).click();
  await expect(box.getByRole('status')).toContainText('Swap submitted');
  expect(state.builds).toEqual([{ assetId: 3, amountSol: '0.05', slippageBps: 300, userPublicKey: address, rollId: 42 }]);
  expect(sent).toEqual([unsigned]);
  const signature = (state.patch as { txHash: string }).txHash;
  expect(state.patch).toEqual({ txHash: signature, wallet: address });
  expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
  await expect(box.getByRole('status')).toContainText('The transaction failed on-chain; nothing was bought', { timeout: 15_000 });
  await expect(box.getByRole('link', { name: 'View on Solscan ↗' })).toHaveAttribute('href', `https://solscan.io/tx/${signature}`);
});
