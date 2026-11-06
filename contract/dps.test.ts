import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dropPlaceholderTiers, type CharacterData, type SkillTiming } from '@/lib/data';
import { skillLevelCaps, unitStats, unitYield, type Build, type Target } from '@/lib/dps';
import { DATA } from './source';

const load = <T>(file: string): T => JSON.parse(readFileSync(path.join(DATA, file), 'utf8'));
const data = dropPlaceholderTiers(load<CharacterData>('characters.json'));
const timingDoc = load<{ characters: Record<string, Record<string, SkillTiming>>; appear?: Record<string, number> }>('skilltiming.json');
const timing: Record<string, SkillTiming> = Object.assign({}, ...Object.values(timingDoc.characters));
const levels = skillLevelCaps(data);
const BUILD: Build = {
  level: data.statCaps.level, star: data.statCaps.star, skillLevel: levels.skill, burstLevel: levels.burst,
  gearTier: 0, gearLevel: 1, infusion: true, love: true,
};
const TARGET: Target = {
  defense: 300, evasion: 50, critResist: 0, critDamageResist: 0, penetrationResist: 0,
  levelGap: 0, advantage: false, maxLife: 10000, hpRate: 1, marked: false, seconds: 120,
};
const playable = Object.entries(data.characters).filter(([, c]) => c.defaultStar && !c.unreleased).map(([code]) => code);
const SAMPLE = 'CH0058';

describe('dps', () => {
  it('every playable unit yields finite, non-negative output', () => {
    const bad = playable.flatMap((code) => {
      const y = unitYield(code, data, BUILD, TARGET, timing, undefined, 'full', {}, timingDoc.appear ?? {});
      if (!y) return [`${code}: no yield`];
      return Number.isFinite(y.dps) && Number.isFinite(y.hps) && y.dps >= 0 && y.hps >= 0 ? [] : [`${code}: ${y.dps} / ${y.hps}`];
    });
    expect(bad).toEqual([]);
  });

  it('more defence never raises damage', () => {
    const at = (defense: number) => unitYield(SAMPLE, data, BUILD, { ...TARGET, defense }, timing)!.dps;
    expect(at(0)).toBeGreaterThan(0);
    expect(at(1200)).toBeLessThan(at(0));
  });

  it('a higher star never lowers attack', () => {
    const attack = (star: number) => unitStats(data.characters[SAMPLE], data, { ...BUILD, star }).PHYSICS_ATTACK;
    expect(attack(data.statCaps.star)).toBeGreaterThanOrEqual(attack(1));
  });
});
