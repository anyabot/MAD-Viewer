// What it costs to raise a unit, and where the materials come from. Everything
// here is a material bill joined to `stages.json`'s repeat channel — no stat is
// computed and nothing is a battle number.
//
// The node suites load this module directly, so nothing here may import a
// runtime value through the `@/` alias.
import type {
  CharacterData, CharacterEntry, GrowthData, MaterialCost, SkillEntry, StageData,
  StageEntry,
} from '@/lib/data';
import type { Localized } from '@/lib/i18n';

/** `SKILL_CATEGORIZE_TYPE` rows a player can level; the rest open with the star. */
export const LEVELLABLE = [2, 3];

/**
 * Experience is spent from a pool rather than as a countable item: several
 * items feed the same pool at different values, so a shortfall is a number of
 * points, not a number of things.
 */
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

/**
 * `hidden` keeps a plan on the books without letting it into the bill.
 * `priority` takes its share of the inventory before every other unit does.
 */
export type UnitPlanPair = {
  current: UnitPlan; target: UnitPlan; hidden?: boolean; priority?: boolean;
};

/** Counts of discrete materials plus the two experience pools. */
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

/** The levellable skills of a kit, in the game's own slot order. */
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

/**
 * A cost row is keyed by the level being left, so raising 1 -> 3 pays rows 1
 * and 2. A character whose material group has no curve for that categorize
 * contributes nothing rather than a guessed bill.
 */
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

/**
 * Equipment levels run on one accumulated curve and a tier only raises the cap
 * on it, so the experience already in a piece carries across a tier-up. That is
 * what the tables say; the game's own reset behaviour on tier-up is not decoded.
 */
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

/** What one unit's plan costs. A target below the current state costs nothing. */
export function unitBill(
  growth: GrowthData, entry: CharacterEntry, data: CharacterData, plan: UnitPlanPair,
): Bill {
  const bill = emptyBill();
  const { current, target } = plan;
  bill.unitExp += unitExp(growth, current.level, Math.max(current.level, target.level));

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
    bill.equipExp += equipExp(growth, Math.min(fromLevel, to.level), to.level);
  }
  return bill;
}

/** How much of a pool one of that pool's items is worth. */
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

/** What the merged bill still needs, given what the player says they hold. */
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

/** Whether the inventory already holds the whole bill, pools included. */
export function billCovered(
  growth: GrowthData, bill: Bill, inventory: Record<string, number>,
): boolean {
  return needsOf(growth, bill, inventory).every((need) => need.short === 0);
}

/**
 * What a stage pays per clear towards one need. Only the repeat channel counts:
 * a first-clear or mission payout happens once and is not a farm route. Entries
 * are summed rather than deduped — a stage lists the same item twice, once
 * guaranteed and once on a chance.
 */
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

/**
 * A stage is farmable once it is cleared at all, and sweepable only at three
 * stars — the owner's rule, and the reason an unrecorded stage is out of every
 * pool rather than assumed open.
 */
export function isFarmable(stars: number, sweepOnly: boolean): boolean {
  return sweepOnly ? stars >= 3 : stars >= 1;
}

export type StageSource = {
  stage: StageEntry;
  /** Expected units of the need per clear. */
  perRun: number;
  /** The entry currency and its per-clear price; null when the stage is free. */
  entry: { ref: string; amount: number } | null;
  stars: number;
  open: boolean;
  /** Clears to cover the shortfall; null when the stage pays nothing. */
  runs: number | null;
  /** `runs * entry.amount`, in `entry.ref` — never comparable across refs. */
  cost: number | null;
};

/**
 * Every stage that pays this need on repeat, cheapest first. Locked stages stay
 * in the list — what is out of reach is the answer to "what is available", not
 * something to hide.
 *
 * **Entry costs are not one currency**, so ranking is by runs, not by price: a
 * story clear spends recharging stamina and a daily clear spends the
 * daily-resetting kind, and adding the two would be meaningless.
 */
export function sourcesFor(
  growth: GrowthData, stages: StageEntry[], need: Need,
  clears: Record<string, number>, sweepOnly: boolean,
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
    });
  }
  return out.sort((a, b) => Number(b.open) - Number(a.open)
    || (a.runs ?? Infinity) - (b.runs ?? Infinity)
    || b.perRun - a.perRun);
}

export type FarmRoute = {
  stage: StageEntry;
  runs: number;
  /** Need key -> expected units these runs bring in. */
  covers: Record<string, number>;
  entry: { ref: string; amount: number } | null;
  cost: number | null;
};

/**
 * One run list for the whole shortfall, instead of a stage per need.
 *
 * A stage that pays two of the needs at once beats two stages with a better
 * rate on one each, and ranking every need on its own cannot see that. The
 * shortfalls are added up as **shares of what is left** — units of a material
 * and points of experience do not add — so a stage's score is how much of the
 * remaining plan one clear closes.
 *
 * Greedy, and committed in chunks: a pick runs only until it closes the first
 * of its needs, so the next pick is made against what that already brought in.
 * Each round closes at least one need, so the walk is bounded by their count.
 */
export function farmRoutes(
  growth: GrowthData, stages: StageEntry[], needs: Need[],
  clears: Record<string, number>, sweepOnly: boolean,
): FarmRoute[] {
  const remaining = new Map<string, number>();
  for (const need of needs) if (need.short > 0) remaining.set(need.key, need.short);

  const open = stages
    .filter((stage) => isFarmable(starsOf(clears, stage), sweepOnly))
    .map((stage) => ({
      stage,
      per: new Map(needs.flatMap((need) => {
        const perRun = yieldPerRun(growth, stage, need);
        return perRun > 0 ? [[need.key, perRun] as const] : [];
      })),
    }))
    .filter((row) => row.per.size > 0);

  const order: number[] = [];
  const byStage = new Map<number, FarmRoute>();
  while (remaining.size > 0) {
    let best: (typeof open)[number] | null = null;
    let bestScore = 0;
    for (const row of open) {
      let score = 0;
      for (const [key, left] of remaining) {
        const perRun = row.per.get(key);
        if (perRun) score += perRun / left;
      }
      if (score > bestScore) {
        bestScore = score;
        best = row;
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
  /** The cheapest open stage, which is what the estimate is built from. */
  best: StageSource | null;
  /** Sources that exist but are not open under the current rules. */
  locked: number;
};

export type FarmPlan = {
  bill: Bill;
  needs: NeedPlan[];
  /** The run list the totals are built from — every need at once, not one each. */
  routes: FarmRoute[];
  /** Entry-cost total per currency ref, over the open routes only. */
  cost: Record<string, number>;
  runs: number;
  /** Needs with a shortfall and no open route. */
  blocked: NeedPlan[];
};

export function farmPlan(
  growth: GrowthData, stages: StageEntry[], bill: Bill,
  inventory: Record<string, number>, clears: Record<string, number>, sweepOnly: boolean,
): FarmPlan {
  const needs = needsOf(growth, bill, inventory).map((need) => {
    const sources = sourcesFor(growth, stages, need, clears, sweepOnly);
    const open = sources.filter((s) => s.open);
    return {
      need,
      sources,
      best: open[0] ?? null,
      locked: sources.length - open.length,
    };
  });
  const routes = farmRoutes(growth, stages, needs.map((p) => p.need), clears, sweepOnly);
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

/**
 * Spend a bill out of an inventory, as finishing the plan would.
 *
 * Experience comes out of the stored balance first and then out of the items
 * that feed it, largest first — and **the remainder goes back into the
 * balance**, because feeding one banks the whole value whether the level needed
 * it or not. Anything the inventory cannot cover is left at zero rather than
 * going negative; the plan already reports that as a shortfall.
 */
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

/**
 * `2.5m` / `150k` / `1,200` -> a number. Returns null for anything that is not
 * an amount, so a field can leave a half-typed value alone.
 */
export function parseAmount(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(/[\s,_]/g, '');
  if (!raw) return 0;
  const match = /^(\d*\.?\d*)([kmb]?)$/.exec(raw);
  if (!match || !match[1] || match[1] === '.') return null;
  const value = Number(match[1]) * (SUFFIX[match[2]] ?? 1);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/** The inverse, for a field that has to show a big number without a scrollbar. */
export function formatAmount(value: number): string {
  if (value >= 1e6 && value % 1e5 === 0) return `${value / 1e6}m`;
  if (value >= 1e4 && value % 1e3 === 0) return `${value / 1e3}k`;
  return String(value);
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

/**
 * A material's display row, whichever side of the item / pool split it is on. A
 * pool borrows its stored balance's art, since that is what the game shows the
 * quantity against.
 */
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
