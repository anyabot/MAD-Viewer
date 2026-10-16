export const FORMULA_GAME_VERSION = '1.9.7';
export const FORMULA_UPDATED = '2026-10-16';

export const BATTLE = {
  defenseConstant: 600,
  pierceConstant: 500,
  pierceRateMax: 0.3,
  evasionConstant: 300,
  evasionRateMax: 0.7,
  criticalRatePerPoint: 0.05 * 0.01,
  criticalDamageMin: 1.1,
  criticalDamageMax: 3,
  levelGapRate: 0.08,
  levelGapRateMax: 0.8,
  attributeBonus: 0.3,
};

// attacker attribute -> the attribute it deals bonus damage to
export const ATTRIBUTE_SUPERIORITY: [number, number][] = [[1, 3], [3, 2], [2, 4], [4, 1]];

export const defenseFactor = (defense: number) =>
  BATTLE.defenseConstant / (BATTLE.defenseConstant + defense);

export const penetrationFactor = (gap: number) =>
  Math.max(0, (BATTLE.pierceRateMax * gap) / (gap + BATTLE.pierceConstant));

export const missChance = (gap: number) => {
  if (gap <= 0) return 0;
  const x = Math.max(1, gap);
  return Math.min(BATTLE.evasionRateMax, x / (x + BATTLE.evasionConstant));
};

export const criticalChance = (gap: number) =>
  Math.min(1, Math.max(0, gap) * BATTLE.criticalRatePerPoint);

export const levelGapFactor = (gap: number) =>
  1 - Math.min(BATTLE.levelGapRateMax, Math.max(0, BATTLE.levelGapRate * gap));
