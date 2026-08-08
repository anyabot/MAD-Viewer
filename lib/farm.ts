// The node suites load this module directly: no runtime import through `@/`.
import type {
  CharacterData, CharacterEntry, GrowthData, LevelFee, MaterialCost, SkillEntry,
  StageData, StageEntry,
} from '@/lib/data';
import type { Localized } from '@/lib/i18n';

/** `SKILL_CATEGORIZE_TYPE` rows a player can level; the rest open with the star. */
export const LEVELLABLE = [2, 3];

/** Several items feed one pool at different values, so a shortfall is points. */
export type PoolKey = 'unitExp' | 'equipExp';

export const POOLS: PoolKey[] = ['unitExp', 'equipExp'];

export const POOL_LABEL: Record<PoolKey, Localized> = {
  unitExp: { en: 'Unit EXP', ko: '유닛 경험치' },
  equipExp: { en: 'Equipment EXP', ko: '장비 경험치' },
};

export const MATERIAL_KIND_LABEL: Record<string, Localized> = {
  goods: { en: 'Credits', ko: '재화' },
  skill: { en: 'Skill', ko: '스킬' },
  unitExp: { en: 'Unit EXP', ko: '유닛 경험치' },
  equipExp: { en: 'Equipment EXP', ko: '장비 경험치' },
  equipPiece: { en: 'Equipment voucher', ko: '장비 바우처' },
  equipment: { en: 'Equipment', ko: '장비' },
};

/** A material's art straddles the item and equipment atlases. */
export const MATERIAL_ICON_GROUPS = ['item', 'equip', 'ui'] as const;

export type GearPlan = { tier: number; level: number };

export type UnitPlan = {
  level: number;
  /** Skill id -> level. A skill the plan does not name sits at 1. */
  skills: Record<string, number>;
  /** Equipment slot type -> what is in it. Tier 0 is an empty slot. */
  gear: Record<string, GearPlan>;
};

/** `hidden` stays off the bill; `priority` takes its inventory share first. */
export type UnitPlanPair = {
  current: UnitPlan; target: UnitPlan; hidden?: boolean; priority?: boolean;
};

export type Bill = {
  materials: Record<string, number>;
  unitExp: number;
  equipExp: number;
};

export function emptyPlan(level = 1): UnitPlan {
  return { level, skills: {}, gear: {} };
}

export function emptyBill(): Bill {
  return { materials: {}, unitExp: 0, equipExp: 0 };
}

export function addCosts(bill: Bill, costs: MaterialCost[]): void {
  for (const cost of costs) {
    bill.materials[cost.ref] = (bill.materials[cost.ref] ?? 0) + cost.amount;
  }
}

export function mergeBills(bills: Bill[]): Bill {
  const out = emptyBill();
  for (const bill of bills) {
    for (const [ref, amount] of Object.entries(bill.materials)) {
      out.materials[ref] = (out.materials[ref] ?? 0) + amount;
    }
    out.unitExp += bill.unitExp;
    out.equipExp += bill.equipExp;
  }
  return out;
}

export function billIsEmpty(bill: Bill): boolean {
  return !bill.unitExp && !bill.equipExp && Object.keys(bill.materials).length === 0;
}

/** In the game's own slot order. */
export function levellableSkills(
  entry: CharacterEntry, data: CharacterData,
): { id: number; skill: SkillEntry }[] {
  const grades = data.skillSets[String(entry.skillSetGroup ?? '')] ?? {};
  const seen = new Map<number, SkillEntry>();
  for (const ids of Object.values(grades)) {
    for (const id of ids) {
      const skill = data.skills[String(id)];
      if (skill && skill.levelable && LEVELLABLE.includes(skill.categorize)) {
        seen.set(id, skill);
      }
    }
  }
  return [...seen.entries()]
    .map(([id, skill]) => ({ id, skill }))
    .sort((a, b) => a.skill.categorize - b.skill.categorize
      || a.skill.skillType - b.skill.skillType);
}

/** The cap the material table can actually reach, not the star-grade table. */
export function skillCap(growth: GrowthData, skill: SkillEntry): number {
  return growth.skill.maxLevel[String(skill.categorize)] ?? skill.maxLevel;
}

/** Keyed by the level being left, so 1 -> 3 pays rows 1 and 2. */
export function skillCost(
  growth: GrowthData, materialGroup: number | null | undefined,
  categorize: number, from: number, to: number,
): MaterialCost[] {
  const group = growth.skill.groups[String(materialGroup ?? '')];
  const curve = group && growth.skill.costs[String(group[String(categorize)])];
  if (!curve) return [];
  const out: MaterialCost[] = [];
  for (let level = from; level < to; level += 1) out.push(...(curve[String(level)] ?? []));
  return out;
}

export function tierUpCost(
  growth: GrowthData, slotType: number, from: number, to: number,
): MaterialCost[] {
  const out: MaterialCost[] = [];
  for (let tier = from + 1; tier <= to; tier += 1) {
    out.push(...(growth.equipment.tierUp[String(tier)]?.[String(slotType)] ?? []));
  }
  return out;
}

/** One accumulated curve that a tier only caps, so exp carries across a tier-up. */
export function equipExp(growth: GrowthData, from: number, to: number): number {
  const accum = growth.equipment.accumExp;
  return Math.max(0, (accum[String(to)] ?? 0) - (accum[String(from)] ?? 0));
}

export function unitExp(growth: GrowthData, from: number, to: number): number {
  const accum = growth.unit.accumExp;
  return Math.max(0, (accum[String(to)] ?? 0) - (accum[String(from)] ?? 0));
}

export function gearLevelCap(growth: GrowthData, tier: number): number {
  return growth.equipment.tiers.find((t) => t.tier === tier)?.maxLevel ?? 1;
}

/** Charged on the experience applied, so holding the exp items does not avoid it. */
export function addLevelFee(bill: Bill, fee: LevelFee, exp: number): void {
  if (!fee || exp <= 0) return;
  bill.materials[fee.ref] = (bill.materials[fee.ref] ?? 0) + exp * fee.perExp;
}

/** A target below the current state costs nothing. */
export function unitBill(
  growth: GrowthData, entry: CharacterEntry, data: CharacterData, plan: UnitPlanPair,
): Bill {
  const bill = emptyBill();
  const { current, target } = plan;
  const gained = unitExp(growth, current.level, Math.max(current.level, target.level));
  bill.unitExp += gained;
  addLevelFee(bill, growth.unit.levelFee, gained);

  for (const { id, skill } of levellableSkills(entry, data)) {
    const cap = skillCap(growth, skill);
    const from = Math.min(current.skills[String(id)] ?? 1, cap);
    const to = Math.min(Math.max(target.skills[String(id)] ?? 1, from), cap);
    addCosts(bill, skillCost(growth, entry.skillMaterialGroup, skill.categorize, from, to));
  }

  for (const slot of entry.equipmentSlots ?? []) {
    const from = current.gear[String(slot)] ?? { tier: 0, level: 1 };
    const to = target.gear[String(slot)] ?? { tier: 0, level: 1 };
    if (!to.tier || to.tier < from.tier) continue;
    addCosts(bill, tierUpCost(growth, slot, from.tier, to.tier));
    // an empty slot starts the curve at level 1
    const fromLevel = from.tier ? from.level : 1;
    const fed = equipExp(growth, Math.min(fromLevel, to.level), to.level);
    bill.equipExp += fed;
    addLevelFee(bill, growth.equipment.levelFee, fed);
  }
  return bill;
}

export function poolItems(growth: GrowthData, pool: PoolKey): Record<string, number> {
  return pool === 'unitExp' ? growth.unit.expItems : growth.equipment.expItems;
}

export type Need = {
  /** `item:…` / `goods:…` for a material, the pool key for experience. */
  key: string;
  kind: 'material' | PoolKey;
  required: number;
  have: number;
  short: number;
};

export function needsOf(
  growth: GrowthData, bill: Bill, inventory: Record<string, number>,
): Need[] {
  const out: Need[] = Object.entries(bill.materials).map(([key, required]) => {
    const have = inventory[key] ?? 0;
    return { key, kind: 'material' as const, required, have, short: Math.max(0, required - have) };
  });
  for (const pool of POOLS) {
    const required = pool === 'unitExp' ? bill.unitExp : bill.equipExp;
    if (!required) continue;
    let have = 0;
    for (const [ref, value] of Object.entries(poolItems(growth, pool))) {
      have += (inventory[ref] ?? 0) * value;
    }
    out.push({ key: pool, kind: pool, required, have, short: Math.max(0, required - have) });
  }
  return out.sort((a, b) => b.short - a.short || a.key.localeCompare(b.key));
}

export function billCovered(
  growth: GrowthData, bill: Bill, inventory: Record<string, number>,
): boolean {
  return needsOf(growth, bill, inventory).every((need) => need.short === 0);
}

/** Repeat channel only, and summed: a stage lists one item guaranteed and again on a chance. */
export function yieldPerRun(growth: GrowthData, stage: StageEntry, need: Need): number {
  const values = need.kind === 'material' ? null : poolItems(growth, need.kind);
  let total = 0;
  for (const drop of stage.rewards?.repeat ?? []) {
    if (!drop.ref) continue;
    const unit = values ? values[drop.ref] ?? 0 : (drop.ref === need.key ? 1 : 0);
    if (!unit) continue;
    const [min, max] = drop.amount;
    const amount = max ? (min + max) / 2 : min;
    total += amount * (drop.chance ?? 1) * unit;
  }
  return total;
}

/** Stars the player has recorded on a stage; nothing recorded means uncleared. */
export function starsOf(clears: Record<string, number>, stage: StageEntry): number {
  return clears[String(stage.id)] ?? 0;
}

/** An unrecorded stage is out of every pool rather than assumed open. */
export function isFarmable(stars: number, sweepOnly: boolean): boolean {
  return sweepOnly ? stars >= 3 : stars >= 1;
}

export type StageSource = {
  stage: StageEntry;
  perRun: number;
  /** The entry currency and its per-clear price; null when the stage is free. */
  entry: { ref: string; amount: number } | null;
  stars: number;
  open: boolean;
  /** Null when the stage pays nothing. */
  runs: number | null;
  /** In `entry.ref` — never comparable across refs. */
  cost: number | null;
  side: number;
};

/** Credits are excluded: thousands a drop against a material's one or two would decide every tie. */
function usefulSideValue(
  growth: GrowthData, stage: StageEntry, own: Set<string>, inventory: Record<string, number>,
): number {
  let total = 0;
  for (const drop of stage.rewards?.repeat ?? []) {
    if (!drop.ref || own.has(drop.ref)) continue;
    const material = growth.materials[drop.ref];
    if (!material || material.kind === 'goods') continue;
    const [min, max] = drop.amount;
    const amount = (max ? (min + max) / 2 : min) * (drop.chance ?? 1);
    total += amount / (1 + (inventory[drop.ref] ?? 0));
  }
  return total;
}

function sideValue(
  growth: GrowthData, stage: StageEntry, need: Need, inventory: Record<string, number>,
): number {
  const own = need.kind === 'material'
    ? new Set([need.key]) : new Set(Object.keys(poolItems(growth, need.kind)));
  return usefulSideValue(growth, stage, own, inventory);
}

/** Ranks on cost within one entry currency; across currencies only runs compare. */
export function sourcesFor(
  growth: GrowthData, stages: StageEntry[], need: Need,
  inventory: Record<string, number>, clears: Record<string, number>, sweepOnly: boolean,
): StageSource[] {
  const out: StageSource[] = [];
  for (const stage of stages) {
    const perRun = yieldPerRun(growth, stage, need);
    if (!perRun) continue;
    const stars = starsOf(clears, stage);
    const runs = need.short ? Math.ceil(need.short / perRun) : 0;
    const entry = stage.entry ?? null;
    out.push({
      stage,
      perRun,
      entry,
      stars,
      open: isFarmable(stars, sweepOnly),
      runs,
      cost: entry ? runs * entry.amount : null,
      side: sideValue(growth, stage, need, inventory),
    });
  }
  return out.sort((a, b) => {
    const availability = Number(b.open) - Number(a.open);
    if (availability) return availability;
    if (a.entry?.ref === b.entry?.ref && a.cost != null && b.cost != null) {
      return a.cost - b.cost
        || b.side * (b.runs ?? 0) - a.side * (a.runs ?? 0)
        || b.perRun - a.perRun;
    }
    return (a.runs ?? Infinity) - (b.runs ?? Infinity)
      || b.perRun - a.perRun
      || b.side - a.side;
  });
}

export type FarmRoute = {
  stage: StageEntry;
  runs: number;
  /** Need key -> expected units these runs bring in. */
  covers: Record<string, number>;
  entry: { ref: string; amount: number } | null;
  cost: number | null;
};

/** Scores shares of what is left, since material units and experience points do not add. */
export function farmRoutes(
  growth: GrowthData, stages: StageEntry[], needs: Need[],
  inventory: Record<string, number>, clears: Record<string, number>, sweepOnly: boolean,
): FarmRoute[] {
  const remaining = new Map<string, number>();
  for (const need of needs) if (need.short > 0) remaining.set(need.key, need.short);

  const own = new Set(needs.flatMap((need) => need.kind === 'material'
    ? [need.key] : Object.keys(poolItems(growth, need.kind))));
  const open = stages
    .filter((stage) => isFarmable(starsOf(clears, stage), sweepOnly))
    .map((stage) => ({
      stage,
      per: new Map(needs.flatMap((need) => {
        const perRun = yieldPerRun(growth, stage, need);
        return perRun > 0 ? [[need.key, perRun] as const] : [];
      })),
      side: usefulSideValue(growth, stage, own, inventory),
    }))
    .filter((row) => row.per.size > 0);

  const order: number[] = [];
  const byStage = new Map<number, FarmRoute>();
  while (remaining.size > 0) {
    let best: (typeof open)[number] | null = null;
    let bestScore = 0;
    let bestSide = 0;
    const byEntry = new Map<string, {
      row: (typeof open)[number]; score: number; efficiency: number; side: number;
    }>();
    for (const row of open) {
      let score = 0;
      for (const [key, left] of remaining) {
        const perRun = row.per.get(key);
        if (perRun) score += perRun / left;
      }
      if (score <= 0) continue;
      const price = row.stage.entry?.amount ?? 1;
      const candidate = { row, score, efficiency: score / price, side: row.side / price };
      const key = row.stage.entry?.ref ?? '';
      const current = byEntry.get(key);
      if (!current || candidate.efficiency > current.efficiency + 1e-12
        || (Math.abs(candidate.efficiency - current.efficiency) <= 1e-12
          && candidate.side > current.side)) {
        byEntry.set(key, candidate);
      }
    }
    for (const candidate of byEntry.values()) {
      if (candidate.score > bestScore + 1e-12
        || (Math.abs(candidate.score - bestScore) <= 1e-12 && candidate.side > bestSide)) {
        bestScore = candidate.score;
        bestSide = candidate.side;
        best = candidate.row;
      }
    }
    if (!best) break;

    let runs = Infinity;
    for (const [key, left] of remaining) {
      const perRun = best.per.get(key);
      if (perRun) runs = Math.min(runs, Math.ceil(left / perRun));
    }

    let route = byStage.get(best.stage.id);
    if (!route) {
      const entry = best.stage.entry ?? null;
      route = { stage: best.stage, runs: 0, covers: {}, entry, cost: entry ? 0 : null };
      byStage.set(best.stage.id, route);
      order.push(best.stage.id);
    }
    route.runs += runs;
    if (route.entry) route.cost = route.runs * route.entry.amount;

    for (const [key, left] of [...remaining]) {
      const perRun = best.per.get(key);
      if (!perRun) continue;
      const taken = Math.min(left, perRun * runs);
      route.covers[key] = (route.covers[key] ?? 0) + taken;
      if (left - perRun * runs > 1e-9) remaining.set(key, left - perRun * runs);
      else remaining.delete(key);
    }
  }
  return order.map((id) => byStage.get(id) as FarmRoute);
}

export type NeedPlan = {
  need: Need;
  sources: StageSource[];
  /** The cheapest open stage, which the estimate is built from. */
  best: StageSource | null;
  locked: number;
};

export type FarmPlan = {
  bill: Bill;
  needs: NeedPlan[];
  routes: FarmRoute[];
  /** Per currency ref, over the open routes only. */
  cost: Record<string, number>;
  runs: number;
  blocked: NeedPlan[];
};

export function farmPlan(
  growth: GrowthData, stages: StageEntry[], bill: Bill,
  inventory: Record<string, number>, clears: Record<string, number>, sweepOnly: boolean,
): FarmPlan {
  const needs = needsOf(growth, bill, inventory).map((need) => {
    const sources = sourcesFor(growth, stages, need, inventory, clears, sweepOnly);
    const open = sources.filter((s) => s.open);
    return {
      need,
      sources,
      best: open[0] ?? null,
      locked: sources.length - open.length,
    };
  });
  const routes = farmRoutes(
    growth, stages, needs.map((p) => p.need), inventory, clears, sweepOnly);
  const cost: Record<string, number> = {};
  let runs = 0;
  for (const route of routes) {
    runs += route.runs;
    if (route.entry && route.cost) {
      cost[route.entry.ref] = (cost[route.entry.ref] ?? 0) + route.cost;
    }
  }
  return {
    bill,
    needs,
    routes,
    cost,
    runs,
    blocked: needs.filter((p) => p.need.short > 0 && !p.best),
  };
}

/** Feeding an item banks its whole value, so the remainder goes back to the balance. */
export function spendBill(
  growth: GrowthData, bill: Bill, inventory: Record<string, number>,
): Record<string, number> {
  const out = { ...inventory };
  for (const [ref, amount] of Object.entries(bill.materials)) {
    out[ref] = Math.max(0, (out[ref] ?? 0) - amount);
  }
  for (const pool of POOLS) {
    let owed = pool === 'unitExp' ? bill.unitExp : bill.equipExp;
    if (!owed) continue;
    const balance = pool === 'unitExp' ? growth.unit.pool : growth.equipment.pool;
    const banked = out[balance] ?? 0;
    const spent = Math.min(banked, owed);
    out[balance] = banked - spent;
    owed -= spent;
    const items = Object.entries(poolItems(growth, pool))
      .filter(([ref]) => ref !== balance)
      .sort((a, b) => b[1] - a[1]);
    for (const [ref, value] of items) {
      if (owed <= 0) break;
      const held = out[ref] ?? 0;
      if (!held) continue;
      const use = Math.min(held, Math.ceil(owed / value));
      out[ref] = held - use;
      owed -= use * value;
    }
    // a negative remainder is the excess the last feed banked
    if (owed < 0) out[balance] = (out[balance] ?? 0) - owed;
  }
  return out;
}

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** `2.5m` / `150k` -> a number; null so a field leaves half-typed text alone. */
export function parseAmount(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(/[\s,_]/g, '');
  if (!raw) return 0;
  const match = /^(\d*\.?\d*)([kmb]?)$/.exec(raw);
  if (!match || !match[1] || match[1] === '.') return null;
  const value = Number(match[1]) * (SUFFIX[match[2]] ?? 1);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/** The inverse, for a field too narrow for the digits. */
export function formatAmount(value: number): string {
  if (value >= 1e6 && value % 1e5 === 0) return `${value / 1e6}m`;
  if (value >= 1e4 && value % 1e3 === 0) return `${value / 1e3}k`;
  return String(value);
}

const HARD_STAGE_NAME_KEY = 'contents_stage_list_name_conquest_zone_hard';

/** Story hard stages, capped at three runs a day. */
export function isHardStage(stage: StageEntry): boolean {
  return stage.nameKey === HARD_STAGE_NAME_KEY;
}

/** Stages that pay any growth material on repeat — the clear record's scope. */
export function farmStages(growth: GrowthData, data: StageData): StageEntry[] {
  const refs = new Set([
    ...Object.keys(growth.materials),
    ...Object.keys(growth.unit.expItems),
    ...Object.keys(growth.equipment.expItems),
  ]);
  return data.stages.filter(
    (s) => (s.rewards?.repeat ?? []).some((d) => d.ref && refs.has(d.ref)));
}

/** A pool borrows its stored balance's art, which is what the game counts against. */
export function needLabel(
  growth: GrowthData, need: Need, lang: 'en' | 'ko',
): { name: string; icon: string | null; grade: number | null } {
  if (need.kind !== 'material') {
    const balance = need.kind === 'unitExp' ? growth.unit.pool : growth.equipment.pool;
    return {
      name: POOL_LABEL[need.kind][lang],
      icon: growth.materials[balance]?.icon ?? null,
      grade: growth.materials[balance]?.grade ?? null,
    };
  }
  const material = growth.materials[need.key];
  return {
    name: material?.name || need.key,
    icon: material?.icon ?? null,
    grade: material?.grade ?? null,
  };
}
