import { test, expect } from '@playwright/test';
import { SAMPLE, openSettled, showSpoilers, stored, withheldCode } from './fixtures';

const path = `/character/${SAMPLE.character.code}/`;

test.describe('/character', () => {
  test('shows the profile for a released unit', { tag: '@smoke' }, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: SAMPLE.character.name, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Date venues', exact: true })).toBeVisible();
  });

  for (const [tab, param] of [['Skills', 'skills'], ['Stats', 'stats'], ['Voice', 'voice'], ['Skins', 'skins']]) {
    test(`${tab} tab is addressable`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${param}`));
      await page.reload();
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true');
    });
  }

  test.describe('share', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('share button copies the page without UI state', async ({ page, baseURL }) => {
      await page.goto(`${path}?tab=stats`);
      await page.getByRole('button', { name: 'Share link' }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(path, baseURL).href);
    });
  });

  test('skills tab lists the kit', async ({ page }) => {
    await page.goto(`${path}?tab=skills`);
    await expect(page.getByText('NORMAL ATTACK').first()).toBeVisible();
    await expect(page.getByText('Readable', { exact: true })).toBeVisible();
  });

  test('stat calculator follows the star rating', async ({ page }) => {
    await page.goto(`${path}?tab=stats`);
    const attack = page.getByRole('row', { name: /Attack Power/ });
    await expect(attack).toBeVisible();
    const before = await attack.innerText();
    await page.getByRole('button', { name: '2★', exact: true }).click();
    await expect(attack).not.toHaveText(before);
    await expect(page.getByText(/2★ · Lv \d+/)).toBeVisible();
  });

  test('collected and favorite marks persist', async ({ page }) => {
    await openSettled(page, path);
    await page.getByRole('button', { name: 'Mark collected' }).click();
    await page.getByRole('button', { name: 'Add favorite' }).click();
    await expect.poll(() => stored(page, 'mad.collection')).toContain(SAMPLE.character.code);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Mark collected' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add favorite' })).toBeHidden();
  });

  test('add to farm lands in the planner', async ({ page }) => {
    await openSettled(page, path);
    await page.getByRole('button', { name: 'Add to farm' }).click();
    await expect.poll(() => stored(page, 'mad.farm')).toContain(SAMPLE.character.code);
  });

  test('withheld unit leaves for the list until spoilers are on', async ({ page }) => {
    const code = await withheldCode(page);
    test.skip(!code, 'no withheld units in this data');
    await page.goto(`/character/${code}/`);
    await expect(page.getByText('That page is a spoiler.', { exact: false }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/characters\/$/);

    await showSpoilers(page);
    await page.goto(`/character/${code}/`);
    await expect(page).toHaveURL(new RegExp(`/character/${code}/$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
