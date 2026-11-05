import { test, expect, Page } from '@playwright/test';
import { SAMPLE, openSettled, stored } from './fixtures';

const skipTutorial = async (page: Page) => {
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeHidden();
};

test.describe('/farm', () => {
  test.beforeEach(async ({ page }) => {
    await openSettled(page, '/farm/');
  });

  test('the tutorial shows once', async ({ page }) => {
    await skipTutorial(page);
    await page.reload();
    await expect(page.getByPlaceholder('Add a unit to plan…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeHidden();
  });

  test('a searched unit is tracked and survives a reload', async ({ page }) => {
    await skipTutorial(page);
    await expect(page.getByText('no units tracked')).toBeVisible();
    await page.getByPlaceholder('Add a unit to plan…').fill(SAMPLE.character.name);
    await page.getByRole('button', { name: new RegExp(SAMPLE.character.name) }).first().click();
    await expect(page.getByText('no units tracked')).toBeHidden();
    await expect.poll(() => stored(page, 'mad.farm')).toContain(SAMPLE.character.code);
    await page.reload();
    await expect(page.getByText(SAMPLE.character.name).first()).toBeVisible();
    await expect(page.getByText('no units tracked')).toBeHidden();
  });

  test('an edited row can be banked without saving, and other edits stay pending', async ({ page }) => {
    await skipTutorial(page);
    await page.getByPlaceholder('Add a unit to plan…').fill(SAMPLE.character.name);
    await page.getByRole('button', { name: new RegExp(SAMPLE.character.name) }).first().click();
    await expect.poll(() => stored(page, 'mad.farm')).toContain(SAMPLE.character.code);
    await page.evaluate(async () => {
      const growth = await (await fetch('/data/growth.json')).json();
      const raw = JSON.parse(localStorage.getItem('mad.farm')!);
      const holder = raw.state ?? raw.data ?? raw;
      const refs = [...Object.keys(growth.materials), ...Object.keys(growth.unit.expItems), ...Object.keys(growth.equipment.expItems)];
      holder.inventory = Object.fromEntries(refs.map((r) => [r, 99_999_999]));
      localStorage.setItem('mad.farm', JSON.stringify(raw));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByText(SAMPLE.character.name).first().click();
    const dialog = page.getByRole('dialog');
    const checks = dialog.getByRole('button', { name: 'Complete this goal' });
    await expect(checks.first()).toBeVisible();
    const ready = () => dialog.locator('button[aria-label="Complete this goal"]:not([aria-disabled])').count();
    expect(await ready()).toBe(0);
    await dialog.getByRole('button', { name: 'plus one' }).nth(1).click();
    await expect.poll(ready).toBe(1);
    await dialog.getByRole('button', { name: 'plus one' }).nth(3).click();
    await expect.poll(ready).toBe(2);
    await dialog.locator('button[aria-label="Complete this goal"]:not([aria-disabled])').first().click();
    await expect.poll(ready).toBe(1);
    await expect(dialog.getByText('unsaved', { exact: true })).toBeVisible();
  });

  test('tabs switch', async ({ page }) => {
    await skipTutorial(page);
    await page.getByRole('tab', { name: /^Clears/ }).click();
    await expect(page.getByRole('tab', { name: /^Clears/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: /^Plan/ }).click();
    await expect(page.getByRole('tab', { name: /^Plan/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('export hands over a file', async ({ page }) => {
    await skipTutorial(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
  });
});
