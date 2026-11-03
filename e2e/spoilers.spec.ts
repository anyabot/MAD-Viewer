import { test, expect } from '@playwright/test';

// Records every "N of M" count the page ever shows, so a list that briefly holds withheld entries is caught.
const COUNTS = () => {
  const seen: string[] = [];
  (window as any).__counts = seen;
  new MutationObserver(() => {
    for (const m of document.body.innerText.matchAll(/\d[\d,]* of \d[\d,]*/g)) seen.push(m[0]);
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

for (const path of ['/viewer/', '/characters/', '/effects/']) {
  test(`${path} never lists hidden entries while spoilers load`, async ({ page }) => {
    await page.addInitScript(COUNTS);
    // the spoiler facts need events.json; holding it back opens the window a slow network gives
    await page.route('**/data/events.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await page.goto(path);
    await expect(page.getByText(/^\d+ of \d+$/).first()).toBeVisible();
    await page.waitForTimeout(3000);
    const seen: string[] = await page.evaluate(() => (window as any).__counts);
    expect(seen.length).toBeGreaterThan(0);
    expect([...new Set(seen)]).toHaveLength(1);
  });
}
