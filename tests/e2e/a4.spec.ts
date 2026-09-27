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
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
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
    if (url.pathname === '/api/rolls' && request.method() === 'POST') return json(route, roll, 201);
    if (url.pathname === '/api/sponsor/campaigns' && request.method() === 'GET') return json(route, options.campaigns ?? { items: [] });
    if (url.pathname === '/api/sponsor/campaigns' && request.method() === 'POST') return json(route, { error: { code: 'policy', message: 'descriptions may not promise returns or price moves' } }, 422);
    if (url.pathname === '/api/sponsor/campaigns/12') return json(route, { campaign: { id: 12, project_name: 'Fixture Project', status: 'approved', total_opens: 100, opens_used: 12, starts_at: '2026-09-27T00:00:00.000Z', ends_at: '2026-10-01T00:00:00.000Z', amount_per_open: '1' }, stats: { opens: 12, wallets: 9, sent: 10, buys: 3 } });
    return json(route, {});
  });
}

test('language switch updates controls, footer, legal copy, cookie, html lang, and survives reload', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'OPEN CASE' })).toBeVisible();
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MỞ HÒM' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByText(/Chọn ngẫu nhiên, không phải lời khuyên/)).toBeVisible();
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'lab_lang')?.value).toBe('vi');
  await page.goto('/legal/disclaimer');
  await expect(page.getByText('Bản nháp — chờ duyệt pháp lý')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('link', { name: 'Tuyên bố miễn trừ' })).toBeVisible();
});

test.describe('with a Vietnamese browser', () => {
  // The browser locale sets Accept-Language; an extra header doesn't override Chrome's own.
  test.use({ locale: 'vi-VN' });
  test('Vietnamese Accept-Language is the initial server language', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('button', { name: 'MỞ HÒM' })).toBeVisible();
  });
});

test('sponsored labels and DexPaprika price note follow the selected language', async ({ page }) => {
  const asset = { ...baseAsset, priceSource: 'dexpaprika' };
  const liveItem = { id: 4, projectName: 'Fixture Project', description: 'A reviewed fixture drop.', symbol: 'SPON', address: 'Mint', imageUrl: null, amountPerOpen: '1', remaining: 9, costPoints: 25, endsAt: '2026-09-28T00:00:00.000Z' };
  await setup(page, { user: true, asset, sponsored: { label: 'Sponsored', items: [liveItem] } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quảng cáo · Sponsored', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Quảng cáo · Sponsored', exact: true }).click();
  await expect(page.getByText('Quảng cáo · Sponsored', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: meta.cases[0].title, exact: true }).click();
  await page.getByRole('button', { name: 'MỞ HÒM' }).click();
  await expect(page.locator('.right-rail .info-card')).toBeVisible();
  await expect(page.locator('.right-rail .info-card .metric').first()).toContainText('$0,004821');
  await expect(page.getByText('giá từ DexPaprika', { exact: true })).toHaveCount(2);
  const dexscreenerAsset = { ...baseAsset, priceSource: 'dexscreener' };
  await page.unroute('**/api/**');
  await setup(page, { user: true, asset: dexscreenerAsset });
  await page.goto('/');
  await page.getByRole('button', { name: 'MỞ HÒM' }).click();
  await expect(page.getByText('giá từ DexPaprika', { exact: true })).toHaveCount(0);
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
