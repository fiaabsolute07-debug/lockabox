import { test, expect } from '@playwright/test';

test('Reown opens the real wallet catalog and WalletConnect QR without requesting a signature', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem('lab_age_confirmed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  const modal = page.locator('w3m-modal');
  await expect(modal).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('Connect Wallet', { exact: true }).last()).toBeVisible({ timeout: 45000 });
  await page.screenshot({ path: 'test-results/reown-catalog.png' });
  await modal.getByText('WalletConnect', { exact: true }).click();
  await expect(modal.locator('wui-qr-code')).toBeVisible({ timeout: 45000 });
  await expect.poll(() => modal.locator('wui-qr-code').evaluate((el: HTMLElement & { uri?: string }) => el.uri ?? ''), { timeout: 45000 }).toMatch(/^wc:/);
  await page.screenshot({ path: 'test-results/reown-qr.png' });
});
