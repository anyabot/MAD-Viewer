import { test, expect } from '@playwright/test';
import { count, openSettled } from './fixtures';

test.describe('/effects', () => {
  test.beforeEach(async ({ page }) => {
    await openSettled(page, '/effects/');
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
  });

  test('an effect chip narrows to units that have it', async ({ page }) => {
    const before = await count(page);
    await page.getByRole('button', { name: /^Stun/ }).click();
    await expect.poll(async () => (await count(page)).shown).toBeLessThan(before.shown);
    await page.getByRole('button', { name: /^Stun/ }).click();
    await expect.poll(async () => (await count(page)).shown).toBe(before.shown);
  });

  test('search and clear', async ({ page }) => {
    await page.getByPlaceholder('search…').fill('zzz-no-such-unit');
    await expect(page.getByText('no match')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByText('no match')).toBeHidden();
  });

  test('a result links to its character', async ({ page }) => {
    await page.locator('a[href^="/character/"]').first().click();
    await expect(page).toHaveURL(/\/character\/CH\d+\/$/);
  });
});
