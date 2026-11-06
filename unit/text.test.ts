import { describe, it, expect } from 'vitest';
import { UI, fill, pick, text } from '@/lib/i18n';
import { gameText, resolveGameLang } from '@/lib/gameText';
import { characterHref, eventHref } from '@/lib/routes';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('UI strings', () => {
  it('every key is written in en and ko', () => {
    const bad = Object.entries(UI).filter(([, v]) => !v.en?.trim() || !v.ko?.trim()).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('en and ko take the same placeholders', () => {
    const bad = Object.entries(UI).filter(([, v]) => placeholders(v.en).join() !== placeholders(v.ko).join()).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('fill replaces known names and keeps unknown ones', () => {
    expect(fill('{a} of {b} {c}', { a: 1, b: 'x' })).toBe('1 of x {c}');
    expect(text('en', 'language')).toBe('Language');
    expect(pick({ en: 'A', ko: '가' }, 'ko')).toBe('가');
    expect(pick(null, 'en')).toBe('');
  });
});

describe('game text', () => {
  it('falls back to en, then ko', () => {
    expect(gameText({ ja: 'J', en: 'E', ko: 'K' }, 'ja')).toBe('J');
    expect(gameText({ en: 'E', ko: 'K' }, 'th')).toBe('E');
    expect(gameText({ ko: 'K' }, 'es')).toBe('K');
    expect(gameText(undefined, 'en')).toBe('');
  });

  it('auto follows the UI language', () => {
    expect(resolveGameLang('auto', 'ko')).toBe('ko');
    expect(resolveGameLang('ja', 'en')).toBe('ja');
  });
});

describe('routes', () => {
  it('build slashed paths and drop empty query values', () => {
    expect(characterHref('CH0001')).toBe('/character/CH0001/');
    expect(characterHref('CH0001', { tab: 'skills', x: '', y: undefined })).toBe('/character/CH0001/?tab=skills');
    expect(eventHref(1011, { chapter: 3 })).toBe('/event/1011/?chapter=3');
  });
});
