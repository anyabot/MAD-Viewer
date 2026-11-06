import { test, expect } from '@playwright/test';

test.describe('/dps', () => {
  test('the unit list can shrink and grow', async ({ page }) => {
    await page.goto('/dps/');
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    const removes = page.getByRole('button', { name: '×', exact: true });
    await expect(removes.first()).toBeVisible();
    const before = await removes.count();
    await removes.first().click();
    await expect(removes).toHaveCount(before - 1);
    await page.getByRole('button', { name: 'Add unit' }).click();
    await expect(removes).toHaveCount(before);
  });

  test('a chosen unit enters the ranking and defence changes it', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/dps/');
    const ranking = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ranking', exact: true }) });
    await page.locator('select', { has: page.locator('option', { hasText: /^Lucia$/ }) }).first().selectOption({ label: 'Lucia' });
    await expect(ranking).toContainText('Lucia');
    const before = await ranking.innerText();
    await page.getByRole('button', { name: 'Heavy', exact: true }).click();
    await expect(ranking).not.toHaveText(before);
  });
});

test.describe('/gacha', () => {
  test('old banners expand', async ({ page }) => {
    await page.goto('/gacha/');
    const old = page.getByRole('button', { name: /Old banners/ });
    await expect(old).toContainText('▾');
    await old.click();
    await expect(old).toContainText('▴');
  });

  test('summons are tallied and reset clears them', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/gacha/');
    await page.getByRole('button', { name: 'Summon ×1', exact: true }).click();
    await expect(page.getByText('Mileage 1/200')).toBeVisible();
    await page.getByRole('button', { name: /^Summon ×10/ }).click();
    await expect(page.getByText('Mileage 11/200')).toBeVisible();
    await page.getByRole('button', { name: 'Reset history' }).click();
    await expect(page.getByText('Mileage 0/200')).toBeVisible();
  });
});

test.describe('tabbed pages', () => {
  const CASES: [string, string, RegExp][] = [
    ['/rewards/', 'Pass', /tab=pass/],
    ['/shop/', 'Memory', /tab=memory/],
    ['/shop/', 'Arena', /tab=arena/],
  ];
  for (const [path, tab, url] of CASES) {
    test(`${path} ${tab} tab is addressable`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page).toHaveURL(url);
      await page.reload();
      await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    });
  }
});

test.describe('/artists', () => {
  test('an artist links to the characters they drew', async ({ page }) => {
    await page.goto('/artists/');
    await expect(page.getByRole('heading', { name: 'SNOWBALL' })).toBeVisible();
    await page.locator('a[href^="/character/"]').first().click();
    await expect(page).toHaveURL(/\/character\/CH\d+\/$/);
  });
});

test.describe('/changelog', () => {
  test('releases are dated newest first', async ({ page }) => {
    await page.goto('/changelog/');
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
    const dates = (await page.getByRole('heading', { level: 3 }).allInnerTexts())
      .map((text) => text.match(/\d{4}-\d{2}-\d{2}/)?.[0]).filter(Boolean) as string[];
    expect(dates.length).toBeGreaterThan(1);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

test.describe('/field', () => {
  test('the guide shows its planner and checker', async ({ page }) => {
    await page.goto('/field/');
    for (const name of ['Formation planner', 'AoE checker', 'Start slots']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
  });
});

test.describe('/jukebox', () => {
  test('picking a track opens the player', async ({ page }) => {
    await page.goto('/jukebox/');
    await expect(page.getByRole('heading', { name: 'Battle', exact: true })).toBeVisible();
    await page.locator('button', { hasText: '▶' }).first().click();
    await expect(page.getByRole('button', { name: 'Next track' })).toBeVisible();
  });
});
