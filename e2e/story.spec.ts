import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SAMPLE } from './fixtures';

test.describe('/story', () => {
  test('a chapter opens with its scenes and speaker links', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/story/');
    await page.getByRole('link', { name: new RegExp(SAMPLE.chapter) }).click();
    await expect(page).toHaveURL(/chapter=/);
    await expect(page).toHaveTitle(new RegExp(SAMPLE.chapter));
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
    await page.locator('a[href^="/character/"]').first().click();
    await expect(page).toHaveURL(/\/character\/CH\d+\/$/);
  });

  test('Activity Log lists the side stories and opens one', async ({ page }) => {
    const index = JSON.parse(readFileSync('public/data/story/index.json', 'utf8'));
    const chapters: { kind: string; name: { en: string }; scenes: { name: { en: string } }[] }[] =
      Object.values(index.chapters);
    const side = chapters.find((c) => c.kind === 'side')!;
    await page.goto('/story/');
    await expect(page.getByText(index.labels.side.en, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: side.name.en }).click();
    await expect(page).toHaveURL(/chapter=/);
    await expect(page.getByText(side.scenes[0].name.en).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
  });

  test('unknown chapter does not crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/story/?chapter=999999');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
