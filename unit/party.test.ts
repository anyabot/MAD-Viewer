import { describe, it, expect } from 'vitest';
import { emptyPlan } from '@/lib/farm';
import { readShareCode, shareCode, type Team } from '@/lib/partyStore';

const TEAM: Team = { id: 't1', name: '팀 A', units: [{ code: 'CH0001', plan: emptyPlan() }, { code: 'CH0058', plan: emptyPlan() }] };

describe('team codes', () => {
  it('round-trip a team, Korean name included', () => {
    const doc = readShareCode(shareCode({ team: TEAM }));
    expect(doc && 'team' in doc ? doc.team.name : null).toBe('팀 A');
    expect(doc && 'team' in doc ? doc.team.units.map((u) => u.code) : null).toEqual(['CH0001', 'CH0058']);
  });

  it('tolerate surrounding whitespace', () => {
    expect(readShareCode(`  ${shareCode({ team: TEAM })}\n`)).not.toBeNull();
  });

  it.each(['', 'hello', 'MADP1.', 'MADP1.!!!', 'MADP1.e30'])('reject %j', (code) => {
    expect(readShareCode(code)).toBeNull();
  });
});
