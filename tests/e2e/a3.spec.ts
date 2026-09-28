import { expect, test, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const feed = require('./fixtures/feed.json');
const caseSummary = require('./fixtures/case.json');
const asset = require('./fixtures/asset.json');
const rollRecord = require('./fixtures/roll-record.json');
const verification = require('./fixtures/verify.json');

const user = {
  user: {
    id: 'fixture-user', clientSeed: 'fixture-client', nonce: 7, points: 1200,
    inviteCode: 'abcdef1234', hideFromBoard: false,
    wallets: [{ family: 'solana', address: 'FixtureWallet1111111111111111111111111111111' }],
  },
};

const points = {
  balance: 1200,
  tasks: [
    { id: 'invite-friend', title: 'Invite a friend', points: 50, goal: 1, daily: false, progress: 1, claimed: false },
    { id: 'open-case', title: 'Open a case', points: 5, goal: 1, daily: true, progress: 0, claimed: false },
  ],
};

const invites = { code: 'abcdef1234', path: '/?ref=abcdef1234', invited: 3, rewarded: 2, claimable: 1, rewardedToday: 1, dailyCap: 10, daysRequired: 3 };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function setup(page: Page, options: { signedIn?: boolean; leaderboard?: unknown; sponsored?: unknown } = {}) {
  let signedIn = options.signedIn ?? false;
  let privacyBody: unknown = null;
  let logoutCalls = 0;
  let inviteAcceptCalls = 0;
  let taskClaimBody: unknown = null;
  let sponsoredOpenCalls = 0;
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, meta);
    if (url.pathname === '/api/feed') return json(route, feed);
    if (url.pathname === '/api/auth/me') return json(route, signedIn ? user : { user: null });
    if (url.pathname === '/api/auth/logout' && request.method() === 'POST') { logoutCalls += 1; signedIn = false; return json(route, { ok: true }); }
    if (url.pathname === '/api/me/privacy' && request.method() === 'POST') { privacyBody = request.postDataJSON(); return json(route, { hideFromBoard: privacyBody && (privacyBody as { hideFromBoard: boolean }).hideFromBoard }); }
    if (url.pathname === '/api/invites/accept' && request.method() === 'POST') { inviteAcceptCalls += 1; return json(route, { ok: true }); }
    if (url.pathname === '/api/invites') return json(route, invites);
    if (url.pathname === '/api/points') return json(route, points);
    if (url.pathname === '/api/tasks/invite-friend/claim' && request.method() === 'POST') { taskClaimBody = request.postDataJSON() ?? {}; return json(route, { taskId: 'invite-friend', points: 50, balance: 1250 }); }
    if (url.pathname === '/api/leaderboard') return json(route, options.leaderboard && url.searchParams.get('window') === '24h' ? options.leaderboard : { window: url.searchParams.get('window'), items: [] });
    if (url.pathname === '/api/sponsored/live') return json(route, options.sponsored ?? { label: 'Sponsored', items: [] });
    if (url.pathname === '/api/sponsored/open' && request.method() === 'POST') { sponsoredOpenCalls += 1; return json(route, { rollId: 77, redemptionId: 8, campaignId: 4, assetId: 3, tier: 'mid', amount: '1', cost: 25, serverSeedHash: 'seed', nonce: 1, sponsored: true, label: 'Sponsored', asset: { ...asset, symbol: 'SPON' } }, 201); }
    if (url.pathname === '/api/rolls/42') return json(route, rollRecord);
    if (url.pathname === '/api/rolls/42/verify') return json(route, verification);
    if (url.pathname === '/api/cases/trending') return json(route, caseSummary);
    if (url.pathname === '/api/assets/3') return json(route, asset);
    return json(route, {});
  });
  return { get signedIn() { return signedIn; }, get privacyBody() { return privacyBody; }, get logoutCalls() { return logoutCalls; }, get inviteAcceptCalls() { return inviteAcceptCalls; }, get taskClaimBody() { return taskClaimBody; }, get sponsoredOpenCalls() { return sponsoredOpenCalls; } };
}

test('Best pulls renders rows, empty state, and switches windows', async ({ page }) => {
  await setup(page, { leaderboard: { window: '24h', items: [{ rollId: 42, at: '2026-09-27T09:00:00.000Z', assetId: 3, chainId: 'solana', symbol: 'GLORP', imageUrl: null, tier: 'mid', priceAtPull: 0.004, priceNow: 0.005, changePct: 25, who: 'anon' }] } });
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: 'Best pulls' })).toBeVisible();
  await expect(page.getByText('$GLORP')).toBeVisible();
  await page.getByRole('button', { name: '7D' }).click();
  await expect(page.getByText('No pulls yet in this window')).toBeVisible();
});

test('account privacy toggle posts and sign out logs out', async ({ page }) => {
  const state = await setup(page, { signedIn: true });
  await page.goto('/');
  // The account button opens the wallet dialog, which holds privacy and sign out.
  await page.getByRole('button', { name: /^Fixt…/ }).click();
  const toggle = page.getByRole('checkbox', { name: /Hide my wallet/ });
  await toggle.click();
  await expect.poll(() => state.privacyBody).toEqual({ hideFromBoard: true });
  await page.getByRole('button', { name: 'Sign out / Disconnect' }).click();
  await expect.poll(() => state.logoutCalls).toBe(1);
});

test('ref is stored, stripped, and accepted once after sign in', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/?ref=ABCDEF1234&from=test');
  await expect.poll(() => page.url()).not.toContain('ref=');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('lab_ref'))).toBe('abcdef1234');
  await page.route('**/api/auth/me', async (route) => json(route, user));
  // A refresh with the signed-in response is enough to trigger the one-shot accept effect.
  await page.reload();
  await expect.poll(() => state.inviteAcceptCalls).toBe(1);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('lab_ref'))).toBeNull();
});

test('invite card shows link and stats, and invite task is claimable', async ({ page }) => {
  const state = await setup(page, { signedIn: true });
  await page.goto('/earn');
  await expect(page.getByRole('heading', { name: 'Invite friends' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveValue(/\?ref=abcdef1234/);
  await expect(page.getByText('ready to claim')).toBeVisible();
  await page.getByRole('button', { name: 'Claim' }).first().click();
  await expect.poll(() => state.taskClaimBody).toEqual({});
});

test('share fallback posts an X intent without a referral code', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
  });
  await setup(page);
  await page.goto('/verify/42');
  await page.getByRole('button', { name: 'Share' }).click();
  const href = await page.getByRole('link', { name: /Post on X/ }).getAttribute('href');
  expect(href).toContain('x.com/intent/post');
  expect(href).not.toContain('ref');
});

test('sponsored tab is hidden when empty and opens a live drop with a pending result', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sponsored', exact: true })).toHaveCount(0);

  const liveItem = { id: 4, projectName: 'Fixture Project', description: 'A sponsored fixture drop.', symbol: 'SPON', address: 'Mint', imageUrl: null, amountPerOpen: '1', remaining: 9, costPoints: 25, endsAt: '2026-09-28T00:00:00.000Z' };
  const state = await setup(page, { signedIn: true, sponsored: { label: 'Sponsored', items: [liveItem] } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sponsored', exact: true }).click();
  await expect(page.getByText('Sponsored', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$SPON')).toBeVisible();
  await page.getByRole('button', { name: 'Open for 25 pts' }).click();
  await expect(page.getByText(/Drop status: pending/)).toBeVisible();
  expect(state.sponsoredOpenCalls).toBe(1);
});

test('legal pages render and footer links include all documents', async ({ page }) => {
  await setup(page);
  for (const slug of ['terms', 'privacy', 'disclaimer', 'sponsored']) {
    await page.goto(`/legal/${slug}`);
    await expect(page.getByText('Draft — pending legal review')).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/legal/terms');
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/legal/privacy');
});

test('/verify/:id has the roll OG image metadata', async ({ page }) => {
  await setup(page);
  await page.goto('/verify/42');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/rolls\/42\/og$/);
});
