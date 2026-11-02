import {
  INFUSION_PATHS, computeStats, equipmentSlotsOf, growValue, infusionNodes, statGrades,
  type EquipInput,
} from '@/lib/characters';
import type {
  CharacterData, CharacterEntry, SkillBehaviour, SkillEntry, SkillGate, SkillHit, SkillOp, SkillTiming, SkillTrigger,
} from '@/lib/data';
import {
  BATTLE, criticalChance, defenseFactor, levelGapFactor, missChance, penetrationFactor,
} from '@/lib/formula';

export type Build = {
  level: number; star: number; skillLevel: number; burstLevel: number; gear: boolean; infusion: boolean; love: boolean;
};
export type Target = {
  defense: number; evasion: number; critResist: number; critDamageResist: number;
  penetrationResist: number; levelGap: number; advantage: boolean; maxLife: number;
  hpRate: number; marked: boolean; seconds: number;
};
export type SkillYield = {
  id: string; damage: number; heal: number; healPct: number; seconds: number | null; skipped: number;
};
export type Upkeep = { label: string; stat: string; amount: number };
export type Labelled = { label: string; labelEn: string };
export type StackInput = Labelled & { key: string; max: number };
export type UnitYield = {
  code: string; star: number; stats: Record<string, number>; loopSeconds: number;
  burst: SkillYield | null; burstCooldown: number | null; dps: number; hps: number;
  missingTiming: boolean; skipped: number; passive: Upkeep[]; buffs: Upkeep[]; debuffs: Upkeep[];
  conditions: (Labelled & { chance: number })[]; triggers: (Labelled & { perMinute: number })[];
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
const SIMULATED = new Set(['TRIGGER_TYPE_USE_SKILL', 'TRIGGER_TYPE_DURATION_DEFINE_APPLY', 'TRIGGER_TYPE_BATTLE_START', 'TRIGGER_TYPE_WAVE_START']);
const FOREVER = 9999;

const plain = (s?: string | null) => (s ?? '').replace(/<[^>]+>/g, '');

type Side = 'self' | 'target';
type Effect = { op: string; value: number; scale: string | null; scaleOf: string | null };
type State = { name: string; nameEn: string; list: { row: string; until: number; n: number }[]; effects: Effect[] };
type Ctx = { stats: Record<string, number>; target: Target; gate: (gate: SkillGate, holder: Side) => number | null };
type Yield = { damage: number; heal: number; healPct: number };

export function unitStar(entry: CharacterEntry, data: CharacterData, build: Build): number {
  const grades = statGrades(entry, data);
  const fit = grades.filter((g) => g <= build.star);
  return (fit.length ? fit[fit.length - 1] : grades[0]) ?? entry.defaultStar ?? 1;
}

function kitIds(entry: CharacterEntry, data: CharacterData, star?: number): string[] {
  const group = data.skillSets[String(entry.skillSetGroup ?? '')];
  if (!group) return [];
  const top = Object.keys(group).sort((x, y) => Number(y) - Number(x))[0];
  const rows = star == null ? Object.values(group).flat() : group[String(star)] ?? group[top] ?? [];
  return [...new Set(rows.map(String))].filter((id) => data.skills[id]);
}

function kitOf(entry: CharacterEntry, data: CharacterData, star?: number): SkillEntry[] {
  return kitIds(entry, data, star).map((id) => data.skills[id]);
}

export function skillLevelCaps(data: CharacterData): { skill: number; burst: number } {
  let skill = 1;
  let burst = 1;
  for (const s of Object.values(data.skills)) {
    if (s.categorize === 2) skill = Math.max(skill, s.maxLevel ?? 1);
    else if (s.categorize === 3) burst = Math.max(burst, s.maxLevel ?? 1);
  }
  return { skill, burst };
}

function levelOf(skill: SkillEntry, build: Build): number {
  const want = skill.categorize === 3 ? build.burstLevel : skill.categorize === 2 ? build.skillLevel : 1;
  return Math.max(1, Math.min(skill.maxLevel ?? 1, want));
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
    level: build.level, star: unitStar(entry, data, build), love: build.love ? data.statCaps.love : 1, equipment, infusion,
  });
  return Object.fromEntries(rows.map((r) => [r.stat, r.total]));
}

// A passive grant adds multiple × the unit's own stat; party-composition grants are left out.
function passiveGrants(kit: SkillEntry[], own: Record<string, number>) {
  const out: Upkeep[] = [];
  let skipped = 0;
  for (const skill of kit) {
    if (skill.categorize !== 4) continue;
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

function compare(n: number, op: string | null, v: number): boolean {
  switch (op) {
    case 'COMPARISON_GREATER_THAN': return n > v + 1e-9;
    case 'COMPARISON_LESS_THAN': return n < v - 1e-9;
    case 'COMPARISON_EQUAL_TO': return Math.floor(n + 1e-9) === v;
    case 'COMPARISON_GREATER_OR_EQUAL': return n >= v - 1e-9;
    case 'COMPARISON_LESS_OR_EQUAL': return n <= v + 1e-9;
    default: return false;
  }
}

function sideOf(op: SkillOp, castTeam: string): Side | null {
  if (op.applyTo === 'CASTER' || castTeam === 'SELF' || op.team === 'SELF'
    || ((castTeam === 'FRIENDLY' || castTeam === 'ALL_UNIT') && op.pick === 'ALL')) return 'self';
  if (op.team === 'ENEMY' || (op.team === 'CAST_TARGET' && castTeam === 'ENEMY')) return 'target';
  return null;
}

function passiveSide(op: SkillOp, trig: SkillTrigger): Side {
  if (op.team === 'SELF' || op.applyTo === 'CASTER') return 'self';
  return op.team === 'ENEMY' || (op.team === 'CAST_TARGET' && trig.check === 'ENEMY') ? 'target' : 'self';
}

// Expected value of one hitbox on one target: evasion, crit and gates as probabilities, no rounding.
function hitYield(hit: SkillHit, level: number, period: number, skillType: number, ctx: Ctx, skip: (op: number) => void): Yield {
  const { stats, target } = ctx;
  const stat = (k: string) => stats[k] ?? 0;
  const f = defenseFactor(target.defense);
  const a = target.advantage ? 1 + BATTLE.attributeBonus : 1;
  const l = levelGapFactor(target.levelGap);
  const s = Math.max(0, 1 + stat(SKILL_DAMAGE_STAT[skillType] ?? ''));
  const hitChance = 1 - missChance(target.evasion - stat('ACCURACY'));
  const critPower = Math.min(BATTLE.criticalDamageMax,
    Math.max(BATTLE.criticalDamageMin, stat('PHYSICS_CRITICAL_DAMAGE') - target.critDamageResist));
  const baseCrit = criticalChance(stat('PHYSICS_CRITICAL_CHANCE') - target.critResist);
  const basePen = penetrationFactor(stat('PENETRATION') - target.penetrationResist);
  const out: Yield = { damage: 0, heal: 0, healPct: 0 };
  const ticks = landings(hit);
  hit.ops.forEach((op, k) => {
    if (!op.value || !op.scale || !op.op || !DAMAGE_OPS.has(op.op)) return;
    let chance = op.chance ?? 1;
    if (op.gate) {
      const c = ctx.gate(op.gate, op.op === 'ADD_HEAL' ? 'self' : 'target');
      if (c === null) { skip(k); return; }
      chance *= c;
    }
    if (!chance) return;
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
          const n = every > 0 && secs > 0 && secs < FOREVER ? Math.floor(secs / every) : 0;
          if (!n) continue;
          if (op.op === 'ADD_DAMAGE') out.damage += chance * n * Math.max(1, coef * base * w) * f * a * l;
          else if (onHolder) out.healPct += chance * n * coef * w;
          else out.heal += chance * n * Math.max(1, coef * base * w);
          continue;
        }
        if (op.op === 'ADD_HEAL') {
          if (onHolder) out.healPct += chance * coef * w; else out.heal += chance * Math.max(1, coef * base * w);
          continue;
        }
        const i = Math.max(1, coef * base * w);
        const crit = op.op === 'ADD_FORCE_CRITICAL_DAMAGE' ? Math.min(1, Math.max(0, extra)) : baseCrit;
        const p = op.op === 'ADD_FORCE_PENETRATION_DAMAGE' ? extra : basePen;
        const c = 1 + crit * (critPower - 1);
        out.damage += chance * hitChance * (i * f * c + i * p) * a * l * s;
      }
    }
  });
  return out;
}

export function loopPatterns(entry: CharacterEntry) {
  return [...(entry.battlePatterns?.repeat ?? [])].sort((x, y) => x.order - y.order);
}

function openingPatterns(entry: CharacterEntry) {
  return [...(entry.battlePatterns?.start ?? [])].sort((x, y) => x.order - y.order);
}

type Pattern = ReturnType<typeof loopPatterns>[number];

// Condition 20/21 read as ≥ / ≤: every pair in the data (CH0019 ≤0 / ≥1, CH0032 ≤4 / ≥5) is then exhaustive.
function patternHolds(p: Pattern, stacks: (define: string) => number): boolean {
  const [define = '', raw] = (p.conditionValue ?? []).map(String);
  const v = Number(raw);
  switch (p.condition) {
    case 0: return true;
    case 10: case 12: return 1 > v;
    case 11: case 13: return 1 < v;
    case 20: return stacks(define) >= v - 1e-9;
    case 21: return stacks(define) <= v + 1e-9;
    case 22: return stacks(define) > 0;
    case 23: return stacks(define) <= 0;
    default: return false;
  }
}

function kitDefines(kit: SkillEntry[]): Set<string> {
  const out = new Set<string>();
  const walk = (b?: SkillBehaviour | null) => {
    for (const hit of b?.hits ?? []) for (const op of hit.ops) if (op.define) out.add(op.define);
    for (const trig of b?.triggers ?? []) for (const op of trig.ops) if (op.define) out.add(op.define);
  };
  for (const skill of kit) { walk(skill.behaviour); walk(skill.variant?.behaviour); }
  return out;
}

function stackEffect(op: SkillOp): boolean {
  return op.kind === 'duration' && !!op.op && !!(SELF_BUFF[op.op] || TARGET_DEBUFF[op.op])
    && !!op.seconds && op.seconds.base[0] >= FOREVER;
}

// Event-fired passives the timeline cannot produce, e.g. a dispel or a kill, granting a lasting stat state.
function externalTriggers(kit: SkillEntry[], defines: Set<string>): { key: string; skill: SkillEntry; trig: SkillTrigger }[] {
  const out: { key: string; skill: SkillEntry; trig: SkillTrigger }[] = [];
  for (const skill of kit) {
    if (skill.categorize !== 4) continue;
    (skill.behaviour?.triggers ?? []).forEach((trig, k) => {
      const fromKit = trig.on === 'TRIGGER_TYPE_DURATION_DEFINE_APPLY' && (trig.value ?? []).some((v) => defines.has(v));
      if (trig.on && SIMULATED.has(trig.on) && (trig.on !== 'TRIGGER_TYPE_DURATION_DEFINE_APPLY' || fromKit)) return;
      if (!trig.ops.some(stackEffect)) return;
      out.push({ key: `${skill.skillType}:${k}`, skill, trig });
    });
  }
  return out;
}

export function stackInputs(code: string, data: CharacterData, build: Build): StackInput[] {
  const entry = data.characters[code];
  if (!entry) return [];
  const kit = kitOf(entry, data, unitStar(entry, data, build));
  return externalTriggers(kit, kitDefines(kitOf(entry, data))).map(({ key, skill, trig }) => {
    const op = trig.ops.find(stackEffect)!;
    return {
      key,
      label: plain(op.name) || plain(skill.name),
      labelEn: plain(op.nameEn) || plain(op.name) || plain(skill.nameEn ?? skill.name),
      max: trig.limit > 0 ? trig.limit : Math.max(1, op.rowMaxStack || op.maxStack || 1),
    };
  });
}

type Armed = { trig: SkillTrigger; last: number; fired: number };

export function unitYield(
  code: string, data: CharacterData, build: Build, target: Target, timing: Record<string, SkillTiming>,
  pattern?: number, withBurst = true, stacks: Record<string, number> = {},
): UnitYield | null {
  const entry = data.characters[code];
  if (!entry) return null;
  const star = unitStar(entry, data, build);
  const kit = kitOf(entry, data, star);
  const ids = kitIds(entry, data, star);
  const own = unitStats(entry, data, build);
  const { grants: passive, skipped: passiveSkipped } = passiveGrants(kit, own);
  const base = { ...own };
  for (const g of passive) base[g.stat] = (base[g.stat] ?? 0) + g.amount;

  const patterns = loopPatterns(entry).map((p) => ({ ...p, ids: p.steps.map(String) }));
  const openings = openingPatterns(entry).map((p) => ({ ...p, ids: p.steps.map(String) }));
  const forced = pattern != null && patterns[pattern] ? pattern : null;
  const secondsOf = (steps: string[]) => steps.reduce((t, id) => t + (timing[id]?.seconds ?? 0), 0);
  const burstId = ids.find((id) => data.skills[id].categorize === 3) ?? null;
  const triggerId = ids.find((id) => data.skills[id].categorize === 5) ?? null;
  const cd = burstId ? timing[burstId]?.cooldown ?? null : null;
  const usable = patterns.filter((p) => p.ids.length && p.ids.every((id) => data.skills[id]));
  const missingTiming = [...usable.flatMap((p) => p.ids), ...(burstId ? [burstId] : []), ...(triggerId ? [triggerId] : [])]
    .some((id) => timing[id]?.seconds == null);
  const empty: UnitYield = {
    code, star, stats: base, loopSeconds: 0, burst: null, burstCooldown: cd, dps: 0, hps: 0, missingTiming,
    skipped: passiveSkipped, passive, buffs: [], debuffs: [], conditions: [], triggers: [],
  };
  if (!usable.some((p) => secondsOf(p.ids) > 0)) return empty;
  const window = Math.max(1, target.seconds);

  const defines = kitDefines(kitOf(entry, data));
  const states = new Map<string, State>();
  const armed = new Map<string, Armed[]>();
  for (const skill of kit) {
    if (skill.categorize !== 4) continue;
    for (const trig of skill.behaviour?.triggers ?? []) {
      if (!trig.on || !SIMULATED.has(trig.on)) continue;
      const list = armed.get(trig.on) ?? [];
      list.push({ trig, last: -Infinity, fired: 0 });
      armed.set(trig.on, list);
    }
  }
  const queue: string[] = [];
  let nextBurst = withBurst && burstId && cd ? cd : Infinity;
  const skipped = new Set<string>();

  const count = (side: Side, define: string, at: number) => {
    const s = states.get(`${side}:${define}`);
    if (!s) return 0;
    let n = 0;
    for (const i of s.list) if (i.until > at) n += i.n;
    return n;
  };
  const statsAt = (at: number) => {
    const out = { ...base };
    for (const [k, s] of states) {
      if (!k.startsWith('self:') || !s.effects.length) continue;
      const n = count('self', k.slice(5), at);
      for (const e of s.effects) {
        const stat = SELF_BUFF[e.op];
        const from = SCALE_STAT[e.scale ?? ''];
        if (stat && from && n) out[stat] = (out[stat] ?? 0) + n * e.value * (base[from] ?? 0);
      }
    }
    return out;
  };
  const targetAt = (at: number): Target => {
    const lower = { defense: 0, critResist: 0 };
    for (const [k, s] of states) {
      if (!k.startsWith('target:') || !s.effects.length) continue;
      const n = count('target', k.slice(7), at);
      for (const e of s.effects) {
        const field = TARGET_DEBUFF[e.op];
        const from = SCALE_STAT[e.scale ?? ''];
        if (!field || !from || !n) continue;
        lower[field] += n * e.value * (e.scaleOf === 'CASTER' ? base[from] ?? 0 : target[field]);
      }
    }
    return {
      ...target,
      defense: Math.max(0, target.defense - lower.defense),
      critResist: Math.max(0, target.critResist - lower.critResist),
    };
  };
  const gateAt = (at: number) => (gate: SkillGate, holder: Side): number | null => {
    const v = Number(gate.values?.[0]?.id);
    switch (gate.condition) {
      case 'HP_GREATER_THAN': return target.hpRate > v ? 1 : 0;
      case 'HP_GREATER_OR_EQUAL': return target.hpRate >= v ? 1 : 0;
      case 'HP_LESS_THAN': return target.hpRate < v ? 1 : 0;
      case 'HP_LESS_OR_EQUAL': return target.hpRate <= v ? 1 : 0;
    }
    const side = gate.on === 'CASTER' ? 'self' : holder;
    const named = (gate.values ?? []).map((x) => x.id).filter((id) => id && Number.isNaN(Number(id)));
    const need = Number((gate.values ?? []).find((x) => x.id && !Number.isNaN(Number(x.id)))?.id ?? 1);
    const known = named.filter((id) => defines.has(id));
    const stack = known.length ? Math.max(...known.map((id) => count(side, id, at))) : (target.marked ? need : 0);
    const has = Math.min(1, stack);
    switch (gate.condition) {
      case 'HAS_DURATIONS': case 'HAS_ANY_DURATIONS': return has;
      case 'LACKS_DURATIONS': case 'LACKS_ANY_DURATIONS': return 1 - has;
      case 'HAS_DURATION_STACK_MORE': return stack >= need - 1e-9 ? 1 : 0;
      case 'HAS_DURATION_STACK_SAME': return Math.floor(stack + 1e-9) === need ? 1 : 0;
      case 'HAS_DURATION_STACK_NOT_SAME': return Math.floor(stack + 1e-9) === need ? 0 : 1;
      default: return null;
    }
  };
  const ctxAt = (at: number): Ctx => ({ stats: statsAt(at), target: targetAt(at), gate: gateAt(at) });

  const totals = { damage: 0, heal: 0 };
  const casts = new Map<string, number>();
  const burstSum = { damage: 0, heal: 0, healPct: 0 };
  const credit = (y: Yield, at: number) => {
    if (at < 0 || at > window) return;
    totals.damage += y.damage;
    totals.heal += y.heal + y.healPct * target.maxLife;
  };

  const clear = (side: Side, op: SkillOp) => {
    for (const v of op.detail?.kind === 'state' ? op.detail.values : []) {
      for (const id of [v.id, ...(v.more ?? [])]) states.delete(`${side}:${id}`);
    }
  };
  const apply = (side: Side, ops: SkillOp[], level: number, period: number, n: number, at: number, depth: number) => {
    const first = ops[0];
    const define = first.define!;
    const secs = first.seconds ? growValue(first.seconds, level, period) : 0;
    if (secs <= 0 || n <= 0) return;
    const key = `${side}:${define}`;
    const s = states.get(key) ?? {
      name: plain(first.name), nameEn: plain(first.nameEn) || plain(first.name), list: [], effects: [],
    };
    s.effects = ops.filter((op) => op.op && op.value && (SELF_BUFF[op.op] || TARGET_DEBUFF[op.op]))
      .map((op) => ({ op: op.op!, value: growValue(op.value!, level, period), scale: op.scale, scaleOf: op.scaleOf }));
    s.list = s.list.filter((i) => i.until > at);
    const until = secs >= FOREVER ? Infinity : at + secs;
    const row = first.row ?? define;
    // STACK adds to its own row without a timer reset until the row cap; TIME_REPLACE keeps the longer
    if (first.stacking === 'TIME_REPLACE' && s.list.length) {
      const old = s.list[0];
      if (until > old.until) s.list = [{ row, until, n: 1 - (1 - Math.min(1, old.n)) * (1 - Math.min(1, n)) }];
    } else {
      const same = first.stacking === 'STACK' ? s.list.find((i) => i.row === row) : undefined;
      const cap = first.rowMaxStack && first.rowMaxStack > 0 ? first.rowMaxStack : Infinity;
      if (!same) s.list.push({ row, until, n: first.stacking === 'TIME_REPLACE' ? Math.min(1, n) : Math.min(cap, n) });
      else if (same.n < cap) same.n = Math.min(cap, same.n + n);
      else same.until = until;
    }
    states.set(key, s);
    for (const a of armed.get('TRIGGER_TYPE_DURATION_DEFINE_APPLY') ?? []) {
      if (!(a.trig.value ?? []).includes(define)) continue;
      const check = a.trig.check;
      if (check === 'ENEMY' ? side !== 'target' : (check === 'SELF' || check === 'FRIENDLY') && side !== 'self') continue;
      fire(a, at, depth + 1);
    }
  };
  // A fire whose works all fail its checks spends neither the cooldown nor the limit.
  function fire(a: Armed, at: number, depth = 0) {
    const { trig } = a;
    if (depth > 8 || (trig.limit > 0 && a.fired >= trig.limit) || at - a.last < trig.cooldown) return;
    const pass = trig.ops.filter((op) => {
      const w = op.when;
      if (!w) return true;
      if (w.check !== 'CHECK_DURATION_DEFINE' || !w.state) return false;
      return compare(count(w.on === 'TRIGGER_TARGET' ? 'target' : 'self', w.state, at), w.op, Number(w.value));
    });
    if (!pass.length) return;
    a.fired += 1;
    a.last = at;
    const grouped = new Map<string, { side: Side; ops: SkillOp[] }>();
    for (const op of pass) {
      const side = passiveSide(op, trig);
      if (op.kind === 'duration' && op.define) {
        const k = `${side}:${op.define}`;
        const g = grouped.get(k) ?? { side, ops: [] };
        g.ops.push(op);
        grouped.set(k, g);
      } else if (op.op === 'CLEAR_DURATION_DEFINE_ID') clear(side, op);
      else if (op.op === 'REDUCE_BURST_COOLDOWN' && op.value) nextBurst -= growValue(op.value, 1, 0);
      else if (op.op === 'USE_TRIGGER_SKILL' && triggerId) queue.push(triggerId);
      else if (op.op && DAMAGE_OPS.has(op.op)) {
        const hit: SkillHit = { shape: null, range: 0, ticks: 1, cycle: 0, delay: 0, count: 1, ops: [op] };
        credit(hitYield(hit, 1, 0, 0, ctxAt(at), () => skipped.add(`${trig.on}:${op.op}`)), at);
      }
    }
    for (const g of grouped.values()) apply(g.side, g.ops, 1, 0, g.ops[0].chance ?? 1, at, depth);
  }

  const applyHit = (hit: SkillHit, level: number, period: number, at: number) => {
    const castTeam = hit.cast?.team ?? 'SELF';
    const targets = castTeam === 'SELF' || hit.cast?.pick === 'ALL' ? 1 : Math.max(1, hit.cast?.count ?? 1);
    const grouped = new Map<string, { side: Side; ops: SkillOp[]; n: number }>();
    const gate = gateAt(at);
    for (const op of hit.ops) {
      const side = sideOf(op, castTeam);
      if (!side) continue;
      let n = (op.chance ?? 1) * hit.count;
      if (op.gate) n *= gate(op.gate, side) ?? 0;
      if (n <= 0) continue;
      if (op.kind === 'duration' && op.define && op.seconds) {
        if (op.applyTo === 'CASTER' && op.team === 'CAST_TARGET') n *= targets;
        const k = `${side}:${op.define}`;
        const g = grouped.get(k) ?? { side, ops: [], n };
        g.ops.push(op);
        grouped.set(k, g);
      } else if (op.op === 'CLEAR_DURATION_DEFINE_ID' && n >= 0.5) clear(side, op);
      else if (op.op === 'REDUCE_BURST_COOLDOWN' && side === 'self' && op.value) nextBurst -= n * growValue(op.value, level, period);
    }
    for (const g of grouped.values()) apply(g.side, g.ops, level, period, g.n, at, 0);
  };

  const uptime = new Map<string, Labelled & { sum: number }>();
  const buffSum = new Map<string, Upkeep>();
  const debuffSum = new Map<string, Upkeep>();
  let samples = 0;
  const sample = (at: number) => {
    samples += 1;
    for (const [k, s] of states) {
      const side: Side = k.startsWith('self:') ? 'self' : 'target';
      const n = count(side, k.slice(side === 'self' ? 5 : 7), at);
      if (s.name) {
        const u = uptime.get(k) ?? { label: s.name, labelEn: s.nameEn, sum: 0 };
        u.sum += Math.min(1, n);
        uptime.set(k, u);
      }
      for (const e of s.effects) {
        const from = SCALE_STAT[e.scale ?? ''];
        if (!from || !n) continue;
        const label = s.nameEn || s.name;
        if (side === 'self' && SELF_BUFF[e.op]) {
          const stat = SELF_BUFF[e.op];
          const u = buffSum.get(`${label}|${stat}`) ?? { label, stat, amount: 0 };
          u.amount += n * e.value * (base[from] ?? 0);
          buffSum.set(`${label}|${stat}`, u);
        } else if (side === 'target' && TARGET_DEBUFF[e.op]) {
          const field = TARGET_DEBUFF[e.op];
          const u = debuffSum.get(`${label}|${field}`) ?? { label, stat: TARGET_STAT[field], amount: 0 };
          u.amount += n * e.value * (e.scaleOf === 'CASTER' ? base[from] ?? 0 : target[field]);
          debuffSum.set(`${label}|${field}`, u);
        }
      }
    }
  };

  const cast = (id: string, t0: number) => {
    const skill = data.skills[id];
    for (const a of armed.get('TRIGGER_TYPE_USE_SKILL') ?? []) {
      if ((a.trig.value ?? []).includes(String(skill.skillType))) fire(a, t0);
    }
    const v = skill.variant;
    const useVariant = !!v?.behaviour && v.when.type === 'CHECK_DURATION_DEFINE'
      && compare(count('self', v.when.define, t0), v.when.op, v.when.value);
    const behaviour = useVariant ? v!.behaviour : skill.behaviour;
    const level = levelOf(skill, build);
    const period = skill.levelPeriod ?? 0;
    const at = t0 + (timing[id]?.hits?.[0] ?? 0);
    const counted = at >= 0 && at <= window;
    if (counted) {
      sample(at);
      casts.set(id, (casts.get(id) ?? 0) + 1);
    }
    (behaviour?.hits ?? []).forEach((hit, h) => {
      const y = hitYield(hit, level, period, skill.skillType, ctxAt(at), (k) => skipped.add(`${id}:${h}:${k}`));
      credit(y, at);
      if (id === burstId && counted) {
        burstSum.damage += y.damage; burstSum.heal += y.heal; burstSum.healPct += y.healPct;
      }
      applyHit(hit, level, period, at);
    });
  };

  for (const on of ['TRIGGER_TYPE_BATTLE_START', 'TRIGGER_TYPE_WAVE_START']) for (const a of armed.get(on) ?? []) fire(a, 0);
  let early = -1e4;
  for (const { key, trig } of externalTriggers(kit, defines)) {
    const a: Armed = { trig, last: -Infinity, fired: 0 };
    for (let i = 0; i < (stacks[key] ?? 0); i += 1) {
      fire(a, early);
      early += Math.max(1, trig.cooldown) + 0.01;
    }
  }

  // The game re-selects the first matching loop before every cast; a different one restarts at its first step.
  const self = (define: string) => count('self', define, t);
  const pick = (list: typeof patterns) => list.findIndex((p) => p.ids.length && patternHolds(p, self));
  let t = 0;
  const opening = openings[pick(openings)]?.ids.filter((id) => data.skills[id]) ?? [];
  const first = forced ?? pick(patterns);
  const loopSeconds = first >= 0 ? secondsOf(patterns[first].ids) : 0;
  let current = -1;
  let k = 0;
  const burstTimes: number[] = [];
  for (let guard = 0; t < window && guard < 20000; guard += 1) {
    let id: string | undefined;
    if (queue.length) id = queue.shift()!;
    else if (burstId && t >= nextBurst) { id = burstId; nextBurst = t + cd!; burstTimes.push(t); }
    else if (opening.length) id = opening.shift()!;
    else {
      const next = forced ?? pick(patterns);
      if (next !== current) { current = next; k = 0; }
      const steps = patterns[current]?.ids ?? [];
      if (steps.length && steps.every((s) => data.skills[s])) { id = steps[k % steps.length]; k += 1; }
    }
    if (!id) { t += 0.1; continue; }
    cast(id, t);
    t += timing[id]?.seconds ?? 0;
  }

  const burstCasts = burstId ? casts.get(burstId) ?? 0 : 0;
  const gaps = burstTimes.slice(1).map((x, i) => x - burstTimes[i]);
  const mean = (m: Map<string, Upkeep>) => [...m.values()].map((u) => ({ ...u, amount: samples ? u.amount / samples : 0 }));
  const buffs = mean(buffSum);
  const stats = { ...base };
  for (const b of buffs) stats[b.stat] = (stats[b.stat] ?? 0) + b.amount;
  const triggers = triggerId && casts.get(triggerId)
    ? [{ label: plain(data.skills[triggerId].name), labelEn: plain(data.skills[triggerId].nameEn ?? data.skills[triggerId].name), perMinute: (casts.get(triggerId)! / window) * 60 }]
    : [];
  return {
    code, star, stats, loopSeconds,
    burst: burstId && burstCasts ? {
      id: burstId, damage: burstSum.damage / burstCasts, heal: burstSum.heal / burstCasts, healPct: burstSum.healPct / burstCasts,
      seconds: timing[burstId]?.seconds ?? null, skipped: 0,
    } : null,
    burstCooldown: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : cd,
    dps: totals.damage / window, hps: totals.heal / window, missingTiming,
    skipped: skipped.size + passiveSkipped,
    passive, buffs, debuffs: mean(debuffSum),
    conditions: [...uptime.values()].map((u) => ({ label: u.label, labelEn: u.labelEn, chance: samples ? u.sum / samples : 0 })),
    triggers,
  };
}
