import { test, expect } from '@playwright/test';
import { SAMPLE } from './fixtures';

test.describe('/story', () => {
  test('a chapter opens with its scenes and speaker links', async ({ page }) => {
    await page.goto('/story/');
    await page.getByRole('link', { name: new RegExp(SAMPLE.chapter) }).click();
    await expect(page).toHaveURL(/chapter=/);
    await expect(page).toHaveTitle(new RegExp(SAMPLE.chapter));
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
    await page.locator('a[href^="/character/"]').first().click();
    await expect(page).toHaveURL(/\/character\/CH\d+\/$/);
  });

  test('unknown chapter does not crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/story/?chapter=999999');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
