import { describe, it, expect } from 'vitest';
import { BATTLE, criticalChance, defenseFactor, levelGapFactor, missChance, penetrationFactor } from '@/lib/formula';

describe('battle formulas', () => {
  it('defence halves damage at the defence constant', () => {
    expect(defenseFactor(0)).toBe(1);
    expect(defenseFactor(BATTLE.defenseConstant)).toBeCloseTo(0.5);
  });

  it('penetration starts at zero and stays under its cap', () => {
    expect(penetrationFactor(0)).toBe(0);
    expect(penetrationFactor(-50)).toBe(0);
    expect(penetrationFactor(1e9)).toBeLessThan(BATTLE.pierceRateMax);
    expect(penetrationFactor(1e9)).toBeCloseTo(BATTLE.pierceRateMax, 3);
  });

  it('miss chance is zero without a gap and capped above', () => {
    expect(missChance(0)).toBe(0);
    expect(missChance(-10)).toBe(0);
    expect(missChance(BATTLE.evasionConstant)).toBeCloseTo(0.5);
    expect(missChance(1e9)).toBe(BATTLE.evasionRateMax);
  });

  it('critical chance is linear and clamped to [0, 1]', () => {
    expect(criticalChance(-5)).toBe(0);
    expect(criticalChance(100)).toBeCloseTo(100 * BATTLE.criticalRatePerPoint);
    expect(criticalChance(1e9)).toBe(1);
  });

  it('level gap scales down to its floor', () => {
    expect(levelGapFactor(0)).toBe(1);
    expect(levelGapFactor(5)).toBeCloseTo(1 - 5 * BATTLE.levelGapRate);
    expect(levelGapFactor(1000)).toBeCloseTo(1 - BATTLE.levelGapRateMax);
  });
});
