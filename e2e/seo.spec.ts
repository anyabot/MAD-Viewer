import { test, expect } from '@playwright/test';
import { SAMPLE } from './fixtures';

const SITE = 'https://mad.altterisk.cc';

test.describe('SEO', () => {
  const ROUTES = [
    '/', '/viewer/', '/characters/', `/character/${SAMPLE.character.code}/`, '/effects/', '/stages/', '/items/',
    '/farm/', '/party/', '/story/', '/artists/', '/changelog/', '/formula/', '/field/', '/dps/', '/jukebox/',
    '/chibis/', '/rewards/', '/shop/', '/gacha/', '/archive/', `/event/${SAMPLE.event.id}/`,
  ];
  for (const route of ROUTES) {
    test(`${route} is prerendered with its own metadata`, async ({ request }) => {
      const html = await (await request.get(route)).text();
      expect(html).toContain(`<link rel="canonical" href="${SITE}${route}"`);
      expect(html).toMatch(/<meta name="description" content="[^"]+"/);
      expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
      expect(html.match(/<h1[\s>]/g)?.length ?? 0).toBeLessThanOrEqual(1);
    });
  }

  const SETTLED = [
    ...ROUTES, `/stage/?id=${SAMPLE.stage.id}`, '/stage/', '/item/', '/item/?ref=item%3A10024',
    '/story/?chapter=101', '/stages/?mode=event', '/stages/?mode=story', '/stages/?mode=nemesis',
  ];
  for (const route of SETTLED) {
    test(`${route} has exactly one h1`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1')).toHaveCount(1);
      expect((await page.locator('h1').textContent())?.trim()).toBeTruthy();
    });
  }

  for (const route of ['/stage/', '/item/', '/events/', '/character/']) {
    test(`${route} stays out of the index`, async ({ request }) => {
      const html = await (await request.get(route)).text();
      expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/);
    });
  }

  test('canonical drops UI state', async ({ page }) => {
    await page.goto(`/character/${SAMPLE.character.code}/?tab=stats`);
    await expect(page.locator('link[rel="canonical"]'))
      .toHaveAttribute('href', `${SITE}/character/${SAMPLE.character.code}/`);
  });

  test('home carries structured data', async ({ page }) => {
    await page.goto('/');
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? '{}');
    expect(data['@type']).toBe('WebSite');
  });

  test('sitemap lists indexable pages only', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain(`<loc>${SITE}/characters/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/character/${SAMPLE.character.code}/</loc>`);
    expect(xml).not.toContain(`<loc>${SITE}/stage/</loc>`);
    expect(xml).not.toContain(`<loc>${SITE}/item/</loc>`);
    expect(xml).not.toContain('/404/');
  });

  test('robots.txt points at the sitemap', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test('character tiles are real links a crawler can follow', async ({ page }) => {
    await page.goto('/characters/');
    await expect(page.locator(`a[href="/character/${SAMPLE.character.code}/"]`).first()).toBeAttached();
  });
});
