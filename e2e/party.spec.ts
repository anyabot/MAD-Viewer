import { test, expect } from '@playwright/test';
import { openSettled, stored } from './fixtures';

test.describe('/party', () => {
  test.beforeEach(async ({ page }) => {
    await openSettled(page, '/party/');
    await expect(page.getByText('No teams yet')).toBeVisible();
  });

  test('a new team persists across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'New team' }).click();
    await expect(page.getByText('No teams yet')).toBeHidden();
    await expect.poll(() => stored(page, 'mad.party')).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('button', { name: 'New team' })).toBeVisible();
    await expect(page.getByText('No teams yet')).toBeHidden();
  });

  test('a team can be duplicated and deleted', async ({ page }) => {
    await page.getByRole('button', { name: 'New team' }).click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(2);
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(1);
  });

  test('tabs keep separate teams', async ({ page }) => {
    await page.getByRole('button', { name: 'New team' }).click();
    await page.getByRole('tab', { name: 'Arena' }).click();
    await expect(page).toHaveURL(/tab=arena/);
    await expect(page.getByText('No teams yet')).toBeVisible();
  });

  test.describe('codes', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('a copied code imports as a new team', { tag: '@smoke' }, async ({ page }) => {
      await page.getByRole('button', { name: 'New team' }).click();
      await page.getByRole('button', { name: 'Copy code', exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBeTruthy();
      const code = await page.evaluate(() => navigator.clipboard.readText());
      await page.getByPlaceholder('Paste a team code').fill(code);
      await page.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(page.getByText('Not a valid code')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toHaveCount(2);
    });
  });

  test('a bad code is rejected', async ({ page }) => {
    const importButton = page.getByRole('button', { name: 'Import', exact: true });
    await expect(importButton).toBeDisabled();
    await page.getByPlaceholder('Paste a team code').fill('not-a-code');
    await importButton.click();
    await expect(page.getByText('Not a valid code')).toBeVisible();
    await expect(page.getByText('No teams yet')).toBeVisible();
  });
});
