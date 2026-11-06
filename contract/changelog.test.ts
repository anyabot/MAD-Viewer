import { it, expect } from 'vitest';
import { RELEASES } from '@/lib/changelog';
import * as S from './schemas';
import { read } from './source';

it('every unit the changelog names is a released, playable unit', () => {
  const { characters } = read('characters.json', S.characters);
  const bad = RELEASES.flatMap((r) => r.entries.filter((e) => e.code).flatMap((e) => {
    const unit = characters[e.code!] as { unreleased?: boolean; defaultStar?: number } | undefined;
    if (!unit) return [`${r.date}: ${e.code} is not in characters.json`];
    if (unit.unreleased) return [`${r.date}: ${e.code} is withheld and must not be named`];
    if (e.kind === 'unit' && !unit.defaultStar) return [`${r.date}: ${e.code} is not playable`];
    return [];
  }));
  expect(bad).toEqual([]);
});
