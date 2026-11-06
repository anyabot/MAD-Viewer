import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CharacterData, CharacterEntry, SkillBehaviour } from '@/lib/data';
import { skillGrades, skillsAtGrade } from '@/lib/characters';
import { behaviourSentences, kitSkills, kitStates } from '@/lib/skillProse';
import { kitFacts, resolveBehaviour } from '@/lib/skillResolve';
import { DATA } from './source';

const data = JSON.parse(readFileSync(path.join(DATA, 'characters.json'), 'utf8')) as CharacterData;

function proseAt(code: string, grade: number) {
  const entry = data.characters[code] as CharacterEntry;
  const kit = kitSkills(entry.skillSetGroup, data);
  const skills = skillsAtGrade(entry, data, grade);
  const facts = kitFacts(kit, skills.map((s) => data.skills[String(s.id)]), data);
  const states = kitStates(kit, 'en');
  const lines = (b: SkillBehaviour | undefined, period: number) =>
    (b ? behaviourSentences(resolveBehaviour(b, facts), 1, period, data, 'en', states) : []);
  return new Map(skills.map((s) => [s.id, { base: lines(s.behaviour, s.levelPeriod), variant: lines(s.variant?.behaviour ?? undefined, s.levelPeriod) }]));
}

describe('humanized skills', () => {
  it('a per-star damage marker reads as that star’s one damage line', () => {
    for (const [grade, pct] of [[3, '100%'], [4, '110%'], [5, '130%']] as const) {
      const dance = proseAt('CH0069', grade).get(6980)!.base.filter((l) => l.includes('damage'));
      expect(dance).toHaveLength(1);
      expect(dance[0]).toContain(`deals ${pct} of its ATK`);
    }
  });

  it('a cast-scoped damage counter unrolls into one line per hit', () => {
    const combo = proseAt('CH0003', 5).get(320)!.variant;
    expect(combo).toHaveLength(3);
    for (const [i, pct] of ['150%', '165%', '180%'].entries()) {
      expect(combo[i]).toContain(`deals ${pct} of its ATK as damage to it (a 55% critical chance with the Skill 2 / Burst mark)`);
      expect(combo[i]).not.toContain('only');
    }
    expect(combo.join(' ')).not.toMatch(/\bMark [A-Z]\b/);
  });

  it('a target-counting burst splits by targets hit', () => {
    const burst = proseAt('CH0003', 5).get(390)!.base.join(' ');
    expect(burst).toContain('deals 500% of its ATK as damage to every enemy hit — only when it hits exactly 1 target');
    expect(burst).toContain('deals 120% of its ATK as damage to every enemy hit — only when it hits 2+ targets');
  });

  it('a multi-hit single target spells out its range and hit count', () => {
    const line = proseAt('CH0033', 5).get(3390)!.base.find((l) => l.includes('Method'))!;
    expect(line.startsWith('Hits the nearest enemy in front within range 5, 5 times: ')).toBe(true);
    const all = Object.keys(data.characters).filter((k) => k.startsWith('CH') && data.characters[k].skillSetGroup != null)
      .flatMap((code) => [...proseAt(code, skillGrades(data.characters[code] as CharacterEntry, data).at(-1)!).values()].flatMap((p) => [...p.base, ...p.variant]));
    expect(all.filter((l) => /×\d|Single target|any distance|\bwithin \d/.test(l))).toEqual([]);
  });

  it('a multi-hit says whether its value repeats or is split', () => {
    expect(proseAt('CH0033', 5).get(3390)!.base.join(' ')).toContain('deals 500% of its ATK as damage to it in total (100% per hit)');
    expect(proseAt('CH0069', 5).get(6980)!.base.join(' ')).toContain('deals 130% of its ATK as damage to it per hit');
    expect(proseAt('CH0007', 5).get(710)!.base.join(' ')).toContain('deals 150% of its ATK as damage to it in total (21% on 6 hits, 24% on 1 hit)');
  });

  it('no two states in a kit share a name', () => {
    const clashes: string[] = [];
    for (const [code, c] of Object.entries(data.characters)) {
      if (!code.startsWith('CH') || c.skillSetGroup == null) continue;
      const kit = kitSkills(c.skillSetGroup, data);
      const ids = new Set<string>();
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
          const define = (v as { define?: unknown }).define;
          if (typeof define === 'string' && !(v as { name?: unknown }).name) ids.add(define);
          Object.values(v).forEach(walk);
        }
      };
      walk(kit);
      const states = kitStates(kit, 'en');
      const seen = new Map<string, string>();
      for (const id of ids) {
        const name = states(id);
        if (seen.has(name)) clashes.push(`${code}: ${seen.get(name)} / ${id} -> ${name}`);
        else seen.set(name, id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('no playable unit shows a lettered mark', () => {
    const lettered = new Set<string>();
    for (const [code, c] of Object.entries(data.characters)) {
      if (!code.startsWith('CH') || c.skillSetGroup == null) continue;
      for (const g of skillGrades(c as CharacterEntry, data)) {
        for (const [id, p] of proseAt(code, g)) {
          for (const l of [...p.base, ...p.variant]) if (/\bMark [A-Z]\b/.test(l)) lettered.add(`${code} ${id}: ${l}`);
        }
      }
    }
    expect([...lettered]).toEqual([]);
  });
});
