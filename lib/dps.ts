import {
  INFUSION_PATHS, computeStats, equipmentSlotsOf, growValue, infusionNodes, statGrades,
  type EquipInput,
} from '@/lib/characters';
import type { CharacterData, CharacterEntry, SkillEntry, SkillHit, SkillOp, SkillTiming } from '@/lib/data';
import {
  BATTLE, criticalChance, defenseFactor, levelGapFactor, missChance, penetrationFactor,
} from '@/lib/formula';

export type Build = { level: number; star: 'max' | 'min'; gear: boolean; infusion: boolean; love: boolean };
export type Target = {
  defense: number; evasion: number; critResist: number; critDamageResist: number;
  penetrationResist: number; levelGap: number; advantage: boolean; maxLife: number;
  hpRate: number; marked: boolean;
};
export type SkillYield = {
  id: string; damage: number; heal: number; healPct: number; seconds: number | null; skipped: number;
};
export type Upkeep = { label: string; stat: string; amount: number };
export type UnitYield = {
  code: string; stats: Record<string, number>; loop: SkillYield[]; loopSeconds: number;
  burst: SkillYield | null; burstCooldown: number | null; dps: number; dpsBurst: number; hps: number; hpsBurst: number;
  missingTiming: boolean; skipped: number; passive: Upkeep[]; buffs: Upkeep[]; debuffs: Upkeep[];
  conditions: { label: string; labelEn: string; chance: number }[];
};

const SKILL_DAMAGE_STAT: Record<number, string> = {
  1: 'NORMAL_ATTACK_DAMAGE_RATE', 2: 'SKILL_01_DAMAGE_RATE', 3: 'SKILL_02_DAMAGE_RATE', 12: 'SPECIAL_SKILL_DAMAGE_RATE',
};
// `STAT_MULTIPLE_TYPE` -> the stat the multiple reads
const SCALE_STAT: Record<string, string> = {
  PHYSICAL_ATTACK_RATE: 'PHYSICS_ATTACK', HEAL_RATE: 'HEAL', MAX_LIFE_RATE: 'MAX_LIFE',
  PHYSICAL_DEFENSE_RATE: 'PHYSICS_DEFENSE', PHYSICAL_CRITICAL_CHANCE_RATE: 'PHYSICS_CRITICAL_CHANCE',
  PHYSICAL_CRITICAL_POWER_ADD_RATE: 'PHYSICS_CRITICAL_DAMAGE', HEAL_RECEIVE_RATE: 'HEAL_RECEIVE',
  EVASION_RATE: 'EVASION', ACCURACY_RATE: 'ACCURACY', CRITICAL_CHANCE_RESIST_RATE: 'CRITICAL_CHANCE_RESIST',
};
const SELF_BUFF: Record<string, string> = {
  BUFF_PHYSICS_ATTACK_UP: 'PHYSICS_ATTACK', BUFF_PHYSICS_CRITICAL_POWER_ADD_UP: 'PHYSICS_CRITICAL_DAMAGE',
  BUFF_PHYSICS_CRITICAL_CHANCE_UP: 'PHYSICS_CRITICAL_CHANCE', BUFF_HEAL_UP: 'HEAL',
};
const TARGET_DEBUFF: Record<string, 'defense' | 'critResist'> = {
  DEBUFF_PHYSICS_DEFEND_DOWN: 'defense', DEBUFF_CRITICAL_CHANCE_RESIST: 'critResist',
};
const TARGET_STAT: Record<'defense' | 'critResist', string> = {
  defense: 'PHYSICS_DEFENSE', critResist: 'CRITICAL_CHANCE_RESIST',
};
const DAMAGE_OPS = new Set(['ADD_DAMAGE', 'ADD_HEAL', 'ADD_FORCE_CRITICAL_DAMAGE', 'ADD_FORCE_PENETRATION_DAMAGE']);

const plain = (s?: string | null) => (s ?? '').replace(/<[^>]+>/g, '');

function starOf(entry: CharacterEntry, data: CharacterData, build: Build): number {
  const grades = statGrades(entry, data);
  return (build.star === 'max' ? grades[grades.length - 1] : grades[0]) ?? entry.defaultStar ?? 1;
}

export function unitStats(entry: CharacterEntry, data: CharacterData, build: Build): Record<string, number> {
  const equipment: EquipInput[] = build.gear
    ? equipmentSlotsOf(entry, data.equipment).flatMap((slot) => {
      const top = (slot.tiers ?? []).reduce<NonNullable<typeof slot.tiers>[number] | null>(
        (best, row) => (!best || row.tier > best.tier ? row : best), null);
      return top ? [{ type: slot.type, tier: top.tier, level: top.maxLevel }] : [];
    })
    : [];
  const infusion = build.infusion
    ? Object.fromEntries(INFUSION_PATHS.map((path) => [path, infusionNodes(entry, path).length])) : {};
  const rows = computeStats(entry, data, {
    level: build.level, star: starOf(entry, data, build), love: build.love ? data.statCaps.love : 1, equipment, infusion,
  });
  return Object.fromEntries(rows.map((r) => [r.stat, r.total]));
}

// A passive grant adds multiple × the unit's own stat; party-composition grants are left out.
function passiveGrants(entry: CharacterEntry, data: CharacterData, build: Build, own: Record<string, number>) {
  const group = data.skillSets[String(entry.skillSetGroup ?? '')];
  const ids = group?.[String(starOf(entry, data, build))] ?? [];
  const out: Upkeep[] = [];
  let skipped = 0;
  for (const id of ids) {
    const skill = data.skills[String(id)];
    if (skill?.categorize !== 4) continue;
    for (const grant of skill.behaviour?.stats ?? []) {
      if (grant.condition) { skipped += 1; continue; }
      const from = SCALE_STAT[grant.scale ?? ''];
      if (!grant.stat || !from) continue;
      out.push({ label: plain(skill.nameEn ?? skill.name), stat: grant.stat, amount: grant.multiple * (own[from] ?? 0) });
    }
  }
  return { grants: out, skipped };
}

function landings(hit: SkillHit): number {
  return hit.ticks > 0 ? hit.ticks
    : hit.lifetime && hit.cycle ? Math.max(1, Math.floor(hit.lifetime / hit.cycle)) : 1;
}

function weightAt(op: SkillOp, landing: number): number {
  const w = Array.isArray(op.weight) ? op.weight[landing] ?? op.weight[op.weight.length - 1] : op.weight;
  return (w ?? 100) / 100;
}

function tickWeightAt(op: SkillOp, tick: number): number {
  if (!op.tickWeights?.length) return 1;
  return (op.tickWeights[tick] ?? 0) / 100;
}

type Source = { skill: SkillEntry; perSecond: number };
type States = {
  stats: Record<string, number>; target: Target; buffs: Upkeep[]; debuffs: Upkeep[];
  onTarget: Map<string, number>; onSelf: Map<string, number>; names: Map<string, string>;
};

// Average stacks = applications per second × duration, capped; a state's coverage is the same, capped at 1.
function upkeep(sources: Source[], stats: Record<string, number>, target: Target): States {
  const onTarget = new Map<string, number>();
  const onSelf = new Map<string, number>();
  const names = new Map<string, string>();
  const add: Record<string, number> = {};
  const lower: Record<'defense' | 'critResist', number> = { defense: 0, critResist: 0 };
  const buffs: Upkeep[] = [];
  const debuffs: Upkeep[] = [];
  for (const { skill, perSecond } of sources) {
    if (!perSecond) continue;
    const level = Math.max(1, skill.maxLevel ?? 1);
    const period = skill.levelPeriod ?? 0;
    for (const hit of skill.behaviour?.hits ?? []) {
      const castTeam = hit.cast?.team ?? 'SELF';
      const targets = castTeam === 'SELF' || hit.cast?.pick === 'ALL' ? 1 : Math.max(1, hit.cast?.count ?? 1);
      for (const op of hit.ops) {
        if (op.kind !== 'duration' || op.interval || !op.seconds) continue;
        const secs = growValue(op.seconds, level, period);
        if (!secs) continue;
        const forever = secs >= 9999;
        const cap = op.maxStack && op.maxStack > 0 ? op.maxStack : 1;
        const onCaster = op.applyTo === 'CASTER' || castTeam === 'SELF' || op.team === 'SELF'
          || ((castTeam === 'FRIENDLY' || castTeam === 'ALL_UNIT') && op.pick === 'ALL');
        const enemyTeam = op.team === 'ENEMY' || (op.team === 'CAST_TARGET' && castTeam === 'ENEMY');
        const perCast = (op.chance ?? 1) * hit.count * (op.applyTo === 'CASTER' && op.team === 'CAST_TARGET' ? targets : 1);
        const stacks = forever ? Math.min(cap, perCast) : Math.min(cap, perSecond * perCast * secs);
        const cover = Math.min(1, stacks);
        const name = plain(op.name);
        if (name) names.set(name, plain(op.nameEn) || name);
        const value = op.value ? growValue(op.value, level, period) : 0;
        if (onCaster) {
          if (name) onSelf.set(name, Math.max(onSelf.get(name) ?? 0, cover));
          const stat = op.op ? SELF_BUFF[op.op] : undefined;
          const from = SCALE_STAT[op.scale ?? ''];
          if (stat && from && value) {
            const amount = stacks * value * (stats[from] ?? 0);
            add[stat] = (add[stat] ?? 0) + amount;
            buffs.push({ label: plain(op.nameEn ?? op.name), stat, amount });
          }
        } else if (enemyTeam && op.applyTo !== 'CASTER') {
          if (name) onTarget.set(name, Math.max(onTarget.get(name) ?? 0, cover));
          const field = op.op ? TARGET_DEBUFF[op.op] : undefined;
          const from = SCALE_STAT[op.scale ?? ''];
          if (field && from && value) {
            const base = op.scaleOf === 'CASTER' ? stats[from] ?? 0 : field === 'defense' ? target.defense : target.critResist;
            const amount = stacks * value * base;
            lower[field] += amount;
            debuffs.push({ label: plain(op.nameEn ?? op.name), stat: TARGET_STAT[field], amount });
          }
        }
      }
    }
  }
  const boosted = { ...stats };
  for (const [k, v] of Object.entries(add)) boosted[k] = (boosted[k] ?? 0) + v;
  return {
    stats: boosted,
    target: {
      ...target,
      defense: Math.max(0, target.defense - lower.defense),
      critResist: Math.max(0, target.critResist - lower.critResist),
    },
    buffs, debuffs, onTarget, onSelf, names,
  };
}

type Applied = { name: string; side: 'target' | 'self'; at: number; seconds: number };

// Named states the loop applies, with the moment they land and how long they last.
function appliedStates(steps: string[], data: CharacterData, timing: Record<string, SkillTiming>): { list: Applied[]; times: number[] } {
  const list: Applied[] = [];
  const times: number[] = [];
  let clock = 0;
  for (const id of steps) {
    const skill = data.skills[id];
    const hitAt = clock + (timing[id]?.hits?.[0] ?? 0);
    times.push(hitAt);
    for (const hit of skill?.behaviour?.hits ?? []) {
      const castTeam = hit.cast?.team ?? 'SELF';
      for (const op of hit.ops) {
        if (op.kind !== 'duration' || op.interval || !op.seconds || !op.name) continue;
        const seconds = growValue(op.seconds, Math.max(1, skill.maxLevel ?? 1), skill.levelPeriod ?? 0);
        const onCaster = op.applyTo === 'CASTER' || castTeam === 'SELF' || op.team === 'SELF';
        const enemyTeam = op.team === 'ENEMY' || (op.team === 'CAST_TARGET' && castTeam === 'ENEMY');
        if (onCaster) list.push({ name: plain(op.name), side: 'self', at: hitAt, seconds });
        else if (enemyTeam) list.push({ name: plain(op.name), side: 'target', at: hitAt, seconds });
      }
    }
    clock += timing[id]?.seconds ?? 0;
  }
  return { list, times };
}

function coverageAt(applied: Applied[], at: number, loopSeconds: number, side: Applied['side']): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of applied) {
    if (a.side !== side) continue;
    const since = loopSeconds ? (((at - a.at) % loopSeconds) + loopSeconds) % loopSeconds : 0;
    if (a.seconds >= 9999 || since < a.seconds || loopSeconds <= a.seconds) out.set(a.name, 1);
  }
  return out;
}

// The share of casts the effect applies on; null when nothing decides it.
function gateChance(gate: NonNullable<SkillOp['gate']>, states: States): number | null {
  const v = Number(gate.values?.[0]?.id);
  const t = states.target;
  const named = () => {
    const pool = gate.on === 'CASTER' ? states.onSelf : states.onTarget;
    const hits = (gate.values ?? []).map((x) => pool.get(plain(x.name))).filter((x): x is number => x != null);
    return hits.length ? Math.max(...hits) : (t.marked ? 1 : 0);
  };
  switch (gate.condition) {
    case 'HP_GREATER_THAN': return t.hpRate > v ? 1 : 0;
    case 'HP_GREATER_OR_EQUAL': return t.hpRate >= v ? 1 : 0;
    case 'HP_LESS_THAN': return t.hpRate < v ? 1 : 0;
    case 'HP_LESS_OR_EQUAL': return t.hpRate <= v ? 1 : 0;
    case 'HAS_DURATIONS': case 'HAS_DURATION_STACK_MORE': return named();
    case 'LACKS_DURATIONS': return 1 - named();
    case 'HAS_ANY_DURATIONS': return t.marked ? 1 : 0;
    case 'LACKS_ANY_DURATIONS': return t.marked ? 0 : 1;
    default: return null;
  }
}

// Expected value of one skill cast on one target: evasion, crit and conditions as probabilities, no rounding.
export function skillYield(skill: SkillEntry, id: string, states: States, timing?: SkillTiming): SkillYield {
  const level = Math.max(1, skill.maxLevel ?? 1);
  const period = skill.levelPeriod ?? 0;
  const { stats, target } = states;
  const stat = (k: string) => stats[k] ?? 0;
  const f = defenseFactor(target.defense);
  const a = target.advantage ? 1 + BATTLE.attributeBonus : 1;
  const l = levelGapFactor(target.levelGap);
  const s = Math.max(0, 1 + stat(SKILL_DAMAGE_STAT[skill.skillType] ?? ''));
  const hitChance = 1 - missChance(target.evasion - stat('ACCURACY'));
  const critPower = Math.min(BATTLE.criticalDamageMax,
    Math.max(BATTLE.criticalDamageMin, stat('PHYSICS_CRITICAL_DAMAGE') - target.critDamageResist));
  const baseCrit = criticalChance(stat('PHYSICS_CRITICAL_CHANCE') - target.critResist);
  const basePen = penetrationFactor(stat('PENETRATION') - target.penetrationResist);
  let damage = 0;
  let heal = 0;
  let healPct = 0;
  let skipped = 0;
  for (const hit of skill.behaviour?.hits ?? []) {
    const ticks = landings(hit);
    for (const op of hit.ops) {
      if (!op.value || !op.scale || !op.op || !DAMAGE_OPS.has(op.op)) continue;
      let chance = op.chance ?? 1;
      if (op.gate) {
        const c = gateChance(op.gate, states);
        if (c === null) { skipped += 1; continue; }
        chance *= c;
      }
      if (!chance) continue;
      const coef = growValue(op.value, level, period, 0);
      const extra = growValue(op.value, level, period, 1);
      const onHolder = op.scaleOf === 'HOLDER';
      const base = onHolder ? 0 : stat(SCALE_STAT[op.scale] ?? '');
      for (let landing = 0; landing < hit.count; landing += 1) {
        for (let tick = 0; tick < ticks; tick += 1) {
          const w = weightAt(op, landing) * tickWeightAt(op, tick);
          if (op.kind === 'duration') {
            const every = op.interval ?? 0;
            const secs = op.seconds ? growValue(op.seconds, level, period) : 0;
            const n = every > 0 && secs > 0 && secs < 9999 ? Math.floor(secs / every) : 0;
            if (!n) continue;
            if (op.op === 'ADD_DAMAGE') damage += chance * n * Math.max(1, coef * base * w) * f * a * l;
            else if (onHolder) healPct += chance * n * coef * w;
            else heal += chance * n * Math.max(1, coef * base * w);
            continue;
          }
          if (op.op === 'ADD_HEAL') {
            if (onHolder) healPct += chance * coef * w; else heal += chance * Math.max(1, coef * base * w);
            continue;
          }
          const i = Math.max(1, coef * base * w);
          const crit = op.op === 'ADD_FORCE_CRITICAL_DAMAGE' ? Math.min(1, Math.max(0, extra)) : baseCrit;
          const p = op.op === 'ADD_FORCE_PENETRATION_DAMAGE' ? extra : basePen;
          const c = 1 + crit * (critPower - 1);
          damage += chance * hitChance * (i * f * c + i * p) * a * l * s;
        }
      }
    }
  }
  return { id, damage, heal, healPct, seconds: timing?.seconds ?? null, skipped };
}

export function loopPatterns(entry: CharacterEntry) {
  return [...(entry.battlePatterns?.repeat ?? [])].sort((x, y) => x.order - y.order);
}

// The unconditional pattern is what a unit falls back to; otherwise the game's first.
export function defaultPattern(entry: CharacterEntry): number {
  return Math.max(0, loopPatterns(entry).findIndex((p) => p.condition === 0));
}

function burstOf(entry: CharacterEntry, data: CharacterData): string | null {
  const group = data.skillSets[String(entry.skillSetGroup ?? '')];
  if (!group) return null;
  const top = Object.keys(group).sort((x, y) => Number(y) - Number(x))[0];
  return (group[top] ?? []).map(String).find((id) => data.skills[id]?.categorize === 3) ?? null;
}

export function unitYield(
  code: string, data: CharacterData, build: Build, target: Target, timing: Record<string, SkillTiming>,
  pattern?: number, withBurst = true,
): UnitYield | null {
  const entry = data.characters[code];
  if (!entry) return null;
  const own = unitStats(entry, data, build);
  const { grants: passive, skipped: passiveSkipped } = passiveGrants(entry, data, build, own);
  const stats = { ...own };
  for (const g of passive) stats[g.stat] = (stats[g.stat] ?? 0) + g.amount;

  const patterns = loopPatterns(entry);
  const steps = ((patterns[pattern ?? defaultPattern(entry)] ?? patterns[0])?.steps ?? []).map(String);
  const loopSeconds = steps.reduce((t, id) => t + (timing[id]?.seconds ?? 0), 0);
  const missingTiming = steps.some((id) => timing[id]?.seconds == null);
  const burstId = burstOf(entry, data);
  const cd = burstId ? timing[burstId]?.cooldown ?? null : null;
  const burstShare = withBurst && cd && burstId && timing[burstId]?.seconds ? Math.min(1, timing[burstId].seconds! / cd) : 0;
  const counts = new Map<string, number>();
  for (const id of steps) counts.set(id, (counts.get(id) ?? 0) + 1);
  const sources: Source[] = [...counts].map(([id, n]) => ({
    skill: data.skills[id], perSecond: loopSeconds ? (n * (1 - burstShare)) / loopSeconds : 0,
  }));
  if (withBurst && burstId && cd) sources.push({ skill: data.skills[burstId], perSecond: 1 / cd });
  const states = upkeep(sources.filter((x) => x.skill), stats, target);

  // Loop-applied states follow the cast order; the burst's own states add their average uptime.
  const { list: applied, times } = appliedStates(steps, data, timing);
  const fromBurst = withBurst && burstId && cd
    ? upkeep([{ skill: data.skills[burstId], perSecond: 1 / cd }], stats, target) : null;
  const merge = (own: Map<string, number>, extra?: Map<string, number>) => {
    const out = new Map(own);
    for (const [k, v] of extra ?? []) out.set(k, 1 - (1 - (out.get(k) ?? 0)) * (1 - v));
    return out;
  };
  const loop = steps.map((id, k) => skillYield(data.skills[id], id, {
    ...states,
    onTarget: merge(coverageAt(applied, times[k], loopSeconds, 'target'), fromBurst?.onTarget),
    onSelf: merge(coverageAt(applied, times[k], loopSeconds, 'self'), fromBurst?.onSelf),
  }, timing[id]));
  const healOf = (y: SkillYield) => y.heal + y.healPct * target.maxLife;
  const burst = burstId ? skillYield(data.skills[burstId], burstId, states, timing[burstId]) : null;
  const dps = loopSeconds ? loop.reduce((t, y) => t + y.damage, 0) / loopSeconds : 0;
  const hps = loopSeconds ? loop.reduce((t, y) => t + healOf(y), 0) / loopSeconds : 0;
  const dpsBurst = cd && burst ? dps * (1 - burstShare) + burst.damage / cd : dps;
  const hpsBurst = cd && burst ? hps * (1 - burstShare) + healOf(burst) / cd : hps;
  const conditions = [...states.onTarget, ...states.onSelf]
    .map(([label, chance]) => ({ label, labelEn: states.names.get(label) ?? label, chance }));
  return {
    code, stats: states.stats, loop, loopSeconds, burst, burstCooldown: cd, dps, dpsBurst, hps, hpsBurst, missingTiming,
    skipped: loop.reduce((t, y) => t + y.skipped, 0) + (burst?.skipped ?? 0) + passiveSkipped,
    passive, buffs: states.buffs, debuffs: states.debuffs, conditions,
  };
}
