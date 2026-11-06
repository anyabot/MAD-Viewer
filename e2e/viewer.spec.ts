import { test, expect } from '@playwright/test';
import { SAMPLE, count } from './fixtures';

test.describe('/viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/viewer/');
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
  });

  test('kind filter narrows the skin list', async ({ page }) => {
    const all = await count(page);
    await page.getByRole('button', { name: 'Standing', exact: true }).click();
    await expect.poll(async () => (await count(page)).shown).toBeLessThan(all.shown);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect.poll(async () => (await count(page)).shown).toBe(all.shown);
  });

  test('search narrows the skin list', async ({ page }) => {
    await page.getByPlaceholder('search…').fill(SAMPLE.skin);
    await expect.poll(async () => (await count(page)).shown).toBe(1);
    await expect(page.getByRole('button', { name: new RegExp(SAMPLE.skin) })).toBeVisible();
  });
});

// Minimums only: the figure never fills the viewport, and an empty or flat canvas misses both.
const MIN_NON_BG = 0.05;
const MIN_COLORS = 500;

test('a shared viewer link draws the skin', { tag: '@smoke' }, async ({ page }) => {
  await page.goto(`/viewer/?skin=${SAMPLE.skin}`);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => {
    const png = (await canvas.screenshot()).toString('base64');
    const drawn = await page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const scratch = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      scratch.drawImage(bitmap, 0, 0);
      const { data: pixels } = scratch.getImageData(0, 0, bitmap.width, bitmap.height);
      const colors = new Map<number, number>();
      for (let i = 0; i < pixels.length; i += 4) {
        const key = (pixels[i] >> 3 << 10) | (pixels[i + 1] >> 3 << 5) | (pixels[i + 2] >> 3);
        colors.set(key, (colors.get(key) ?? 0) + 1);
      }
      const total = pixels.length / 4;
      return { colors: colors.size, nonBg: (total - Math.max(...colors.values())) / total };
    }, png);
    return drawn.colors >= MIN_COLORS && drawn.nonBg >= MIN_NON_BG;
  }, { timeout: 45_000, intervals: [1000] }).toBe(true);
});
