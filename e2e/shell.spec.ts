import { test, expect } from '@playwright/test';
import { SAMPLE, openSettled, stored } from './fixtures';

test.describe('language', () => {
  test('switching to Korean relabels the site and persists', { tag: '@smoke' }, async ({ page }) => {
    await openSettled(page, '/characters/');
    await page.getByRole('button', { name: '한국어', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(page.getByRole('link', { name: '캐릭터', exact: true }).first()).toBeVisible();
    expect(await stored(page, 'mad.lang')).toContain('ko');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('game text language is separate from the site language', async ({ page }) => {
    await openSettled(page, `/character/${SAMPLE.character.code}/`);
    await expect(page.getByRole('heading', { name: SAMPLE.character.name, level: 1 })).toBeVisible();
    await page.getByLabel('Game text').selectOption({ label: '한국어' });
    await expect(page.getByRole('heading', { name: SAMPLE.character.ko, level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('spoiler dialog', () => {
  test('opens focused on cancel and cancelling changes nothing', async ({ page }) => {
    await openSettled(page, '/');
    await page.getByRole('button', { name: 'Spoilers hidden' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Spoilers hidden' })).toBeVisible();
  });
});

test.describe('home', () => {
  test('section cards link to their pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Now running')).toBeVisible();
    await page.locator('a[href="/characters/"]').last().click();
    await expect(page).toHaveURL(/\/characters\/$/);
  });

  test('server and local time switch', async ({ page }) => {
    await openSettled(page, '/');
    await page.getByRole('button', { name: 'Local time' }).click();
    await expect(page.getByText(/KST/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Server time' }).click();
    await expect(page.getByText(/KST/).first()).toBeVisible();
  });
});
