import { expect, test, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const feed = require('./fixtures/feed.json');
const caseSummary = require('./fixtures/case.json');
const baseAsset = require('./fixtures/asset.json');
const roll = require('./fixtures/roll.json');

const signedIn = { user: { id: 'sponsor-user', clientSeed: 'fixture-client', nonce: 7, points: 1200, inviteCode: 'abcdef1234', hideFromBoard: false, wallets: [{ family: 'solana', address: 'FixtureWallet1111111111111111111111111111111' }] } };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function setup(page: Page, options: { user?: boolean; asset?: Record<string, unknown>; sponsored?: unknown; campaigns?: unknown } = {}) {
  await page.addInitScript(() => window.localStorage.setItem('lab_disclaimer_seen', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, meta);
    if (url.pathname === '/api/feed') return json(route, feed);
    if (url.pathname === '/api/auth/me') return json(route, options.user ? signedIn : { user: null });
    if (url.pathname === '/api/sponsored/live') return json(route, options.sponsored ?? { label: 'Sponsored', items: [] });
    if (url.pathname === '/api/cases/trending') return json(route, caseSummary);
    if (url.pathname === '/api/assets/3') return json(route, options.asset ?? baseAsset);
    if (url.pathname === '/api/assets/3/buys') return json(route, { items: [] });
    if (url.pathname === '/api/rolls' && request.method() === 'POST') return json(route, { ...roll, asset: options.asset ?? baseAsset }, 201);
    if (url.pathname === '/api/sponsor/campaigns' && request.method() === 'GET') return json(route, options.campaigns ?? { items: [] });
    if (url.pathname === '/api/sponsor/campaigns' && request.method() === 'POST') return json(route, { error: { code: 'policy', message: 'descriptions may not promise returns or price moves' } }, 422);
    if (url.pathname === '/api/sponsor/campaigns/12') return json(route, { campaign: { id: 12, project_name: 'Fixture Project', status: 'approved', total_opens: 100, opens_used: 12, starts_at: '2026-09-27T00:00:00.000Z', ends_at: '2026-10-01T00:00:00.000Z', amount_per_open: '1' }, stats: { opens: 12, wallets: 9, sent: 10, buys: 3 } });
    return json(route, {});
  });
}

test.describe('English only (owner decision 2026-09-27)', () => {
  // Even a Vietnamese browser gets the English UI; there is no language switch any more.
  test.use({ locale: 'vi-VN' });
  test('no language switch, html lang is en, legal pages in English', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: /^OPEN CASE/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'VI', exact: true })).toHaveCount(0);
    await page.goto('/legal/disclaimer');
    await expect(page.getByText('Draft — pending legal review')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Disclaimer' })).toBeVisible();
  });
});

test('sponsored labels and the DexPaprika price note', async ({ page }) => {
  const asset = { ...baseAsset, priceSource: 'dexpaprika' };
  const liveItem = { id: 4, projectName: 'Fixture Project', description: 'A reviewed fixture drop.', symbol: 'SPON', address: 'Mint', imageUrl: null, amountPerOpen: '1', remaining: 9, costPoints: 25, endsAt: '2026-09-28T00:00:00.000Z' };
  await setup(page, { user: true, asset, sponsored: { label: 'Sponsored', items: [liveItem] } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sponsored', exact: true }).click();
  await expect(page.locator('.sponsored-badge').first()).toHaveText('Sponsored');
  await page.getByRole('button', { name: 'Trending', exact: true }).click();
  await page.getByRole('button', { name: /^OPEN CASE/ }).click();
  await expect(page.locator('.right-rail .info-card .metric').first()).toContainText('$0.004821');
  await expect(page.getByText('price via DexPaprika', { exact: true })).toHaveCount(2);
  const dexscreenerAsset = { ...baseAsset, priceSource: 'dexscreener' };
  await page.unroute('**/api/**');
  await setup(page, { user: true, asset: dexscreenerAsset });
  await page.goto('/');
  await page.getByRole('button', { name: /^OPEN CASE/ }).click();
  await expect(page.getByText('price via DexPaprika', { exact: true })).toHaveCount(0);
});

test('sponsor dashboard lists own campaigns, opens stats, exports CSV, and maps policy errors', async ({ page }) => {
  await setup(page, { user: true, campaigns: { items: [{ id: 12, projectName: 'Fixture Project', status: 'approved', totalOpens: 100, opensUsed: 12, startsAt: '2026-09-27T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-09-26T00:00:00.000Z' }] } });
  await page.goto('/sponsor');
  await expect(page.getByRole('heading', { name: 'Sponsor dashboard' })).toBeVisible();
  await expect(page.getByText('Fixture Project')).toBeVisible();
  await page.getByRole('button', { name: 'View stats' }).click();
  await expect(page.getByText('unique wallets')).toBeVisible();
  await expect(page.getByText('9')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect((await download).suggestedFilename()).toBe('lockabox-campaigns.csv');
  await page.getByLabel('Description').fill('This token will 10x');
  await page.getByLabel('Project name').fill('Fixture Project');
  await page.getByLabel('Token address').fill('11111111111111111111111111111111');
  await page.getByLabel('Amount per open (raw units)').fill('1');
  await page.getByLabel('Total opens').fill('10');
  await page.getByLabel('Starts at').fill('2030-01-01T00:00');
  await page.getByLabel('Ends at').fill('2030-01-02T00:00');
  await page.getByRole('button', { name: 'Submit campaign' }).click();
  // Next's route announcer is also role=alert; match ours by its text.
  await expect(page.getByRole('alert').filter({ hasText: "Descriptions can't promise" })).toHaveText("Descriptions can't promise returns or price moves.");
});

test('error codes keep their meaning (daily_cap, locked, not_done)', async ({ page }) => {
  await setup(page, { user: true });
  const tasks = { balance: 1200, tasks: [
    { id: 'invite-friend', title: 'Invite a friend', points: 100, goal: 1, daily: false, progress: 1, claimed: false },
    { id: 'daily-checkin', title: 'Daily check-in', points: 50, goal: 1, daily: true, progress: 1, claimed: false },
    { id: 'hold-a-pull', title: 'Hold a coin you pulled', points: 150, goal: 1, daily: false, progress: null, claimed: false },
  ] };
  const errors: Record<string, [number, string]> = { 'invite-friend': [429, 'daily_cap'], 'daily-checkin': [403, 'locked'], 'hold-a-pull': [409, 'not_done'] };
  await page.route('**/api/points', (route) => json(route, tasks));
  await page.route('**/api/invites', (route) => json(route, { code: 'abcdef1234', path: '/?ref=abcdef1234', invited: 12, rewarded: 10, claimable: 1, rewardedToday: 10, dailyCap: 10, daysRequired: 3 }));
  await page.route('**/api/tasks/*/claim', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    const [status, code] = errors[id];
    return json(route, { error: { code, message: `server text for ${code}` } }, status);
  });
  await page.goto('/earn');
  await expect(page.getByRole('heading', { name: 'Daily check-in' })).toBeVisible();
  const card = (title: string) => page.locator('.task-card').filter({ hasText: title });
  const alert = page.locator('.inline-error[role="alert"]');
  await card('Invite a friend').getByRole('button', { name: 'Claim' }).click();
  await expect(alert).toHaveText(/today's limit of invite rewards/);
  await card('Daily check-in').getByRole('button', { name: 'Claim' }).click();
  await expect(alert).toHaveText(/This account is locked/);
  await card('Hold a coin you pulled').getByRole('button', { name: 'Claim' }).click();
  await expect(alert).toHaveText("This task isn't complete yet.");
  await expect(page.locator('body')).not.toContainText('server text for');
});

test('sound toggle, contents close button and reel copy', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Case opening sound' })).toContainText('Sound: On');
  await page.getByRole('button', { name: 'Case opening sound' }).click();
  await expect(page.getByRole('button', { name: 'Case opening sound' })).toContainText('Sound: Off');
  await page.locator('.case-contents-trigger').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /^OPEN CASE/ }).click();
  await expect(page.getByText('OPENING CASE', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Skip animation/ })).toBeVisible();
});

test('first visit: Locky’s "not financial advice" screen replaces the 18+ gate (DECISIONS #20), is in the server HTML, and Got it is remembered by cookie', async ({ page, context, request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('id="nfa-title"');
  expect(html).not.toContain('18 or older');
  await context.clearCookies();
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body: Record<string, unknown> = { '/api/meta': meta, '/api/feed': feed, '/api/cases/trending': caseSummary, '/api/auth/me': { user: null }, '/api/sponsored/live': { label: 'Sponsored', items: [] } };
    return json(route, body[path] ?? {});
  });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Not financial advice' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Locky' })).toBeVisible();
  await expect(dialog).toContainText('not financial advice. i am a box.');
  await dialog.getByRole('button', { name: 'Got it, let me roll' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await context.cookies()).find((cookie) => cookie.name === 'lab_nfa')?.value).toBe('1');
  expect(await (await page.request.get('/')).text()).not.toContain('id="nfa-title"');
  await expect(page.locator('footer')).toContainText('18+');
});

test('a disclaimer already seen (stored in the browser) does not show again', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /OPEN CASE/i })).toBeVisible();
});
