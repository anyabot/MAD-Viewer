import { describe, it, expect } from 'vitest';
import { KIND_LABEL, KIND_ORDER, LATEST, RELEASES, latestKey } from '@/lib/changelog';

describe('changelog', () => {
  it('lists releases newest first with unique ISO dates', () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(LATEST).toBe(RELEASES[0]);
    const dates = RELEASES.map((r) => r.date);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('writes every title and line in en and ko', () => {
    const bad: string[] = [];
    for (const r of RELEASES) {
      if (Object.keys(r.title).sort().join() !== 'en,ko' || !r.title.en.trim() || !r.title.ko.trim()) bad.push(`${r.date} title`);
      if (!r.entries.length) bad.push(`${r.date} has no entries`);
      for (const e of r.entries) {
        if (Object.keys(e.text).sort().join() !== 'en,ko') bad.push(`${r.date}: ${e.text.en}`);
        for (const text of Object.values(e.text) as string[]) if (!text.trim() || text.trim() !== text) bad.push(`${r.date}: untrimmed "${text}"`);
        if (!/[가-힣]/.test(e.text.ko)) bad.push(`${r.date}: ko line is not Korean: ${e.text.ko}`);
        if (e.code && !/^CH\d{4}$/.test(e.code)) bad.push(`${r.date}: ${e.code}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('uses only declared, labelled kinds and reports units, scenes and features', () => {
    const kinds = new Set(RELEASES.flatMap((r) => r.entries.map((e) => e.kind)));
    for (const kind of kinds) {
      expect(KIND_ORDER).toContain(kind);
      expect(Object.keys(KIND_LABEL[kind]).sort()).toEqual(['en', 'ko']);
    }
    for (const kind of ['unit', 'scene', 'feature'] as const) expect(kinds.has(kind)).toBe(true);
  });

  it('keys the popup on the newest date', () => {
    expect(latestKey()).toBe(`changelog:${LATEST.date}`);
  });
});
