import { test, expect } from '@playwright/test';
import { SAMPLE } from './fixtures';

test.describe('/stages', () => {
  test('a mode card opens that mode and all modes returns', async ({ page }) => {
    await page.goto('/stages/');
    await page.getByRole('link', { name: /^Arena/ }).first().click();
    await expect(page).toHaveURL(/mode=arena/);
    await page.getByRole('link', { name: 'All modes' }).click();
    await expect(page).toHaveURL(/\/stages\/$/);
    await expect(page.getByText('Supply run')).toBeVisible();
  });

  test('story mode lists groups that lead to a stage', async ({ page }) => {
    await page.goto('/stages/?mode=story');
    await page.locator('a[href*="group="]').first().click();
    await expect(page).toHaveURL(/group=/);
    await page.locator('a[href*="/stage/?id="]').first().click();
    await expect(page).toHaveURL(/\/stage\/\?id=\d+/);
    await expect(page.getByRole('heading', { name: 'Drops' })).toBeVisible();
  });
});

test.describe('/stage', () => {
  test('shows missions, drops and waves', async ({ page }) => {
    await page.goto(`/stage/?id=${SAMPLE.stage.id}`);
    await expect(page.getByRole('heading', { name: SAMPLE.stage.title })).toBeVisible();
    for (const name of ['Mission', 'Drops', 'Field', 'Wave 1']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
  });

  test.describe('share', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('share link names the stage', async ({ page }) => {
      await page.goto(`/stage/?id=${SAMPLE.stage.id}`);
      await page.getByRole('button', { name: 'Share link' }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`id=${SAMPLE.stage.id}`);
    });
  });

  test('enemy stats toggle opens', async ({ page }) => {
    await page.goto(`/stage/?id=${SAMPLE.stage.id}`);
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Hide stats' })).toBeVisible();
  });

  test('missing and unknown ids show an empty state', async ({ page }) => {
    await page.goto('/stage/');
    await expect(page.getByText('no stage selected')).toBeVisible();
    await page.goto('/stage/?id=999');
    await expect(page.getByText('no stage 999')).toBeVisible();
    await page.getByRole('link', { name: /All stages/ }).click();
    await expect(page).toHaveURL(/\/stages\/$/);
  });
});

test.describe('/event', () => {
  test('shows the event page and links its bonus units', async ({ page }) => {
    await page.goto(`/event/${SAMPLE.event.id}/`);
    await expect(page.getByText(SAMPLE.event.name).first()).toBeVisible();
    await expect(page.getByText('Bonus units')).toBeVisible();
    await page.locator('a[href^="/character/"]').first().click();
    await expect(page).toHaveURL(/\/character\/CH\d+\/$/);
  });

  test('read story opens the event chapter', async ({ page }) => {
    await page.goto(`/event/${SAMPLE.event.id}/`);
    await page.getByRole('link', { name: /Read story/ }).click();
    await expect(page).toHaveURL(/\/story\/\?chapter=/);
  });
});

test('Ascent lists Basic first and ended seasons under Past seasons', async ({ page }) => {
  await page.goto('/stages/?mode=ascent');
  const main = page.locator('main');
  await expect(main.getByText('Past seasons')).toBeVisible();
  await expect(main.getByText('Infinity Archive', { exact: false }).first()).toBeVisible();
  const text = await main.innerText();
  expect(text.indexOf('Basic Archive')).toBeLessThan(text.indexOf('Past seasons'));
  expect(text.slice(text.indexOf('Past seasons'))).toContain('Ended');
  expect(text.slice(text.indexOf('Past seasons'))).not.toContain('Basic Archive');
});
