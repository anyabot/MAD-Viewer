import { test, expect } from '@playwright/test';
import { count, openSettled, stored } from './fixtures';

test.describe('/items', () => {
  test('search narrows and a nonsense query empties', async ({ page }) => {
    await openSettled(page, '/items/');
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
    const before = await count(page);
    await page.getByPlaceholder('search…').fill('Dumbbell');
    await expect.poll(async () => (await count(page)).shown).toBeLessThan(before.shown);
    await page.getByPlaceholder('search…').fill('zzz-no-such-item');
    await expect(page.getByText('no match')).toBeVisible();
  });

  test('category filter narrows the list', async ({ page }) => {
    await openSettled(page, '/items/');
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
    const before = await count(page);
    await page.getByRole('button', { name: 'Gifts', exact: true }).click();
    await expect.poll(async () => (await count(page)).shown).toBeLessThan(before.shown);
  });

  test('held count persists and feeds the held filter', async ({ page }) => {
    await openSettled(page, '/items/');
    await page.getByRole('button', { name: 'plus one' }).first().click();
    await expect.poll(() => stored(page, 'mad.farm')).toBeTruthy();
    await page.reload();
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
    await page.getByRole('button', { name: 'Held or needed', exact: true }).click();
    await expect.poll(async () => (await count(page)).shown).toBe(1);
  });

  test('an item opens its detail page', async ({ page }) => {
    await page.goto('/items/');
    await page.locator('a[href^="/item/?ref="]').first().click();
    await expect(page).toHaveURL(/\/item\/\?ref=/);
    await expect(page).toHaveTitle(/MAD Viewer/);
  });

  test('unknown item shows the empty state', async ({ page }) => {
    await page.goto('/item/?ref=item%3A999999');
    await expect(page.getByText('no match')).toBeVisible();
  });
});
