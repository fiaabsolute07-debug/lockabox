import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const summary = require('./fixtures/case.json');
const roll = require('./fixtures/roll.json');
const asset = require('./fixtures/asset.json');

for (const recover of [true, false]) test(`avatar retry ${recover ? 'recovers' : 'stops after two retries'}`, async ({page}) => {
  let calls = 0;
  await page.addInitScript(() => localStorage.setItem('lab_age_confirmed','1'));
  await page.emulateMedia({reducedMotion:'reduce'});
  const imageUrl = 'https://avatar.fixture.test/retry.svg';
  await page.route(imageUrl, async route => {
    calls++;
    if (!recover || calls === 1) return route.fulfill({status:503,headers:{'cache-control':'no-store'},body:''});
    return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>'});
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/meta' ? meta : path === '/api/auth/me' ? {user:null} : path === '/api/feed' ? {items:[],stats:{rolls1h:0,buysToday:0,lastTopPullAt:null}} : path.startsWith('/api/cases/') ? summary : path === '/api/rolls' ? {...roll,asset:{...asset,imageUrl}} : path === '/api/assets/3' ? {...asset,imageUrl} : {items:[]};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');
  await page.getByRole('button',{name:/OPEN CASE/}).click();
  await expect(page.locator('.token-avatar-large')).toBeVisible();
  if (recover) {
    await expect.poll(()=>page.locator('.token-avatar-large img').evaluateAll(imgs=>(imgs[0] as HTMLImageElement)?.naturalWidth ?? 0),{timeout:10000}).toBeGreaterThan(0);
    expect(calls).toBe(2);
  } else {
    await expect.poll(()=>calls,{timeout:10000}).toBe(3);
    await expect(page.locator('.token-avatar-large')).toHaveText('G');
    await page.waitForTimeout(2000);
    expect(calls).toBe(3);
  }
});
