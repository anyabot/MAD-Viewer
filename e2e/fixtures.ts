import { expect, Page } from '@playwright/test';

export const SAMPLE = {
  character: { code: 'CH0001', name: 'Lucia', ko: '루시아' },
  stage: { id: 1001101, title: 'NORMAL 1 - 1' },
  event: { id: 1010, name: 'Trick or Trouble' },
  chapter: 'Conquering the Panoticon',
  skin: 'st_ch0001',
};

// Stored state and the spoiler filter apply after hydration, so earlier clicks and counts are stale.
export const openSettled = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
};

export const count = async (page: Page) => {
  const text = await page.getByText(/^\d[\d,]* of \d[\d,]*$/).first().innerText();
  const [shown, total] = text.replace(/,/g, '').split(' of ').map(Number);
  return { shown, total };
};

export const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

export const openMenuIfCollapsed = async (page: Page) => {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
};

export const showSpoilers = async (page: Page) => {
  await page.getByRole('button', { name: 'Spoilers hidden' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Show spoilers' }).click();
  await expect(page.getByRole('button', { name: 'Spoilers shown' })).toBeVisible();
};

export const withheldCode = async (page: Page) => {
  const data = await (await page.request.get('/data/characters.json')).json();
  return Object.keys(data.characters).find((c) => data.characters[c].unreleased);
};
