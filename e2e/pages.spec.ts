import { test, expect } from '@playwright/test';
import { SAMPLE } from './fixtures';

type PageCase = { path: string; title: string | RegExp; text: string };

const full = (title: string) => `${title} — Make Drama | MAD Viewer`;

const CASES: PageCase[] = [
  { path: '/', title: /MAD Viewer/, text: 'Now running' },
  { path: '/viewer/', title: full('Viewer'), text: 'Store diff' },
  { path: '/characters/', title: full('Characters'), text: 'Stat comparison' },
  { path: `/character/${SAMPLE.character.code}/`, title: full(SAMPLE.character.name), text: SAMPLE.character.name },
  { path: '/effects/', title: full('Effects'), text: 'Guaranteed critical' },
  { path: '/stages/', title: full('Events & Stages'), text: 'Supply run' },
  { path: `/stage/?id=${SAMPLE.stage.id}`, title: full('Events & Stages'), text: SAMPLE.stage.title },
  { path: '/items/', title: full('Items'), text: 'Held or needed' },
  { path: '/farm/', title: full('Planner'), text: 'Inventory' },
  { path: '/party/', title: full('Party'), text: 'New team' },
  { path: '/story/', title: full('Story'), text: SAMPLE.chapter },
  { path: '/artists/', title: full('Artists'), text: 'SNOWBALL' },
  { path: '/changelog/', title: full('Changelog'), text: 'Changelog' },
  { path: '/formula/', title: full('Battle formulas'), text: 'Raw value (I)' },
  { path: '/field/', title: full('Battle field'), text: 'Formation planner' },
  { path: '/dps/', title: full('DPS comparison'), text: 'Ranking' },
  { path: '/jukebox/', title: full('Jukebox'), text: 'Menus' },
  { path: '/chibis/', title: full('Chibis'), text: 'Chibis' },
  { path: '/rewards/', title: full('Rewards'), text: 'Daily Quest' },
  { path: '/shop/', title: full('Shop'), text: 'Memory' },
  { path: '/gacha/', title: full('Summon Simulator'), text: 'Summon Simulator' },
  { path: '/archive/', title: full('Infinity Archive'), text: 'Infinity Archive' },
  { path: `/event/${SAMPLE.event.id}/`, title: full(SAMPLE.event.name), text: SAMPLE.event.name },
];

for (const c of CASES) {
  test(`page ${c.path} renders`, { tag: '@smoke' }, async ({ page, baseURL }) => {
    const errors: string[] = [];
    const bad: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().startsWith(baseURL!)) bad.push(`${r.status()} ${r.url()}`);
    });

    const response = await page.goto(c.path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(c.title);
    await expect(page.getByText(c.text).filter({ visible: true }).first()).toBeVisible();

    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return Math.max(el.scrollWidth, document.body.scrollWidth) - el.clientWidth;
    });
    expect(overflow, 'page body scrolls horizontally').toBeLessThanOrEqual(1);
    expect(errors, errors.join('\n')).toHaveLength(0);
    expect(bad, bad.join('\n')).toHaveLength(0);
  });
}
