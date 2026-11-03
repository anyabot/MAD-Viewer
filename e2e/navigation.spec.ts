import { test, expect } from '@playwright/test';
import { SAMPLE, openMenuIfCollapsed } from './fixtures';

test.describe('site navigation', () => {
  const LINKS: [string, RegExp][] = [
    ['Viewer', /\/viewer\/$/],
    ['Characters', /\/characters\/$/],
    ['Story', /\/story\/$/],
    ['Events & Stages', /\/stages\/$/],
    ['Items', /\/items\/$/],
    ['Planner', /\/farm\/$/],
    ['Party', /\/party\/$/],
  ];
  for (const [name, url] of LINKS) {
    test(`nav link ${name} navigates without a reload`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => { (window as any).__spa = true; });
      await openMenuIfCollapsed(page);
      await page.getByRole('link', { name, exact: true }).first().click();
      await expect(page).toHaveURL(url);
      expect(await page.evaluate(() => (window as any).__spa)).toBe(true);
    });
  }

  test('secondary pages are reachable from the menu', async ({ page }) => {
    await page.goto('/');
    await openMenuIfCollapsed(page);
    const etc = page.getByRole('button', { name: 'Etc.' });
    if (await etc.isVisible()) await etc.click();
    await page.getByRole('link', { name: 'Battle formulas', exact: true }).click();
    await expect(page).toHaveURL(/\/formula\/$/);
    await expect(page.getByRole('heading', { name: 'Battle formulas', exact: true })).toBeVisible();
  });

  test('back returns to the previous page', async ({ page }) => {
    await page.goto('/');
    await openMenuIfCollapsed(page);
    await page.getByRole('link', { name: 'Characters', exact: true }).first().click();
    await expect(page).toHaveURL(/\/characters\/$/);
    await page.goBack();
    await expect(page.getByText('Now running')).toBeVisible();
  });

  test('unknown path renders the 404 page', async ({ page }) => {
    const response = await page.goto('/no-such-page/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  });

  test('unknown character renders the 404 page', async ({ page }) => {
    const response = await page.goto('/character/CH9999/');
    expect(response?.status()).toBe(404);
  });

  const REDIRECTS: [string, RegExp][] = [
    [`/?skin=${SAMPLE.skin}`, new RegExp(`/viewer/\\?skin=${SAMPLE.skin}$`)],
    [`/character/?code=${SAMPLE.character.code}`, new RegExp(`/character/${SAMPLE.character.code}/$`)],
    ['/character/', /\/characters\/$/],
    [`/event/?id=${SAMPLE.event.id}`, new RegExp(`/event/${SAMPLE.event.id}/$`)],
    ['/events/', /\/stages\/\?mode=event$/],
  ];
  for (const [from, to] of REDIRECTS) {
    test(`old link ${from} forwards`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  }
});
