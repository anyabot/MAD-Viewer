import { test, expect } from '@playwright/test';
import { SAMPLE, count, openSettled, showSpoilers, stored, withheldCode } from './fixtures';

const tile = (code: string) => `a[href="/character/${code}/"]`;

test.describe('/characters', () => {
  test.beforeEach(async ({ page }) => {
    await openSettled(page, '/characters/');
    await expect(page.locator(tile(SAMPLE.character.code)).first()).toBeVisible();
  });

  test('search narrows the list and clearing restores it', async ({ page }) => {
    const before = await count(page);
    await page.getByPlaceholder('search…').fill(SAMPLE.character.name);
    await expect.poll(async () => (await count(page)).shown).toBeLessThan(before.shown);
    await expect(page.locator(tile(SAMPLE.character.code)).first()).toBeVisible();

    await page.getByPlaceholder('search…').fill('zzz-no-such-unit');
    await expect(page.getByText('no match')).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByText('no match')).toBeHidden();
    expect((await count(page)).shown).toBe(before.shown);
  });

  test('element filter hides the other elements and toggles off', async ({ page }) => {
    const before = await count(page);
    await page.getByRole('button', { name: 'Passion', exact: true }).click();
    await expect.poll(async () => (await count(page)).shown).toBeLessThan(before.shown);
    await expect(page.locator(tile(SAMPLE.character.code))).toHaveCount(0);
    await page.getByRole('button', { name: 'Drive', exact: true }).click();
    await expect(page.locator(tile(SAMPLE.character.code)).first()).toBeVisible();
    await page.getByRole('button', { name: 'Drive', exact: true }).click();
    await expect.poll(async () => (await count(page)).shown).toBe(before.shown);
  });

  test('a tile opens the character page', { tag: '@smoke' }, async ({ page }) => {
    await page.locator(tile(SAMPLE.character.code)).first().click();
    await expect(page).toHaveURL(new RegExp(`/character/${SAMPLE.character.code}/`));
    await expect(page.getByRole('heading', { name: SAMPLE.character.name, level: 1 })).toBeVisible();
  });

  for (const [tab, param] of [['Stat comparison', 'stats'], ['Equipment use', 'equipment']]) {
    test(`${tab} tab is addressable`, async ({ page }) => {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${param}`));
      await page.reload();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    });
  }

  test.describe('share', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('stat comparison share keeps the tab', async ({ page }) => {
      await page.getByRole('tab', { name: 'Stat comparison' }).click();
      await page.getByRole('button', { name: 'Share link' }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('tab=stats');
    });
  });

  test('mark all collected persists', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Mark all collected/ }).click();
    await expect.poll(() => stored(page, 'mad.collection')).toContain(SAMPLE.character.code);
    await page.reload();
    await expect(page.locator(tile(SAMPLE.character.code)).first()).toBeVisible();
    expect(await stored(page, 'mad.collection')).toContain(SAMPLE.character.code);
  });

  test('spoilers reveal withheld units and the choice persists', async ({ page }) => {
    test.skip(!await withheldCode(page), 'no withheld units in this data');
    const before = await count(page);
    await expect(page.getByRole('button', { name: 'Include unreleased' })).toBeHidden();
    await showSpoilers(page);
    await page.getByRole('button', { name: 'Include unreleased' }).click();
    await expect.poll(async () => (await count(page)).total).toBeGreaterThan(before.total);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Spoilers shown' })).toBeVisible();
  });
});
