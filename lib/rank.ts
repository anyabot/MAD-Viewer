// Star costs, kept clear of `farm.ts` so that module can import this one.
import type { CharacterEntry, ExchangeTier, StageEntry, StarGrowth } from '@/lib/data';

/** The owner's reported hard-stage cap; no run-limit column has been located. */
export const HARD_RUNS_PER_DAY = 3;

/** A unit is at her release star until the plan says otherwise. */
export function baseStar(entry: CharacterEntry): number {
  return entry.defaultStar ?? 1;
}

export function starCap(star: StarGrowth | undefined): number {
  return star?.max ?? 1;
}

/** Memories to go from one star to another; a backwards span costs nothing. */
export function stepCost(star: StarGrowth | undefined, from: number, to: number): number {
  if (!star) return 0;
  let total = 0;
  for (let s = from; s < to; s += 1) total += star.upgrade[String(s)] ?? 0;
  return total;
}

/** Memories to unlock a unit you do not own yet, by her release star. */
export function unlockCost(star: StarGrowth | undefined, entry: CharacterEntry): number {
  return star?.open[String(baseStar(entry))] ?? 0;
}

export function memoryRef(star: StarGrowth | undefined, code: string): string | null {
  return star?.pieces[code] ?? null;
}

export function sellsMemory(star: StarGrowth | undefined, code: string): boolean {
  return !!star?.exchange?.codes.includes(code);
}

export function ladderFor(star: StarGrowth | undefined, code: string): ExchangeTier[] {
  const exchange = star?.exchange;
  if (!exchange) return [];
  return exchange.ladders?.[code] ?? exchange.tiers;
}

/** Currency for `count` more purchases when `bought` are already on the record. */
export function exchangeCost(tiers: ExchangeTier[], bought: number, count: number): number | null {
  if (!tiers.length) return null;
  let total = 0;
  let at = bought;
  let left = count;
  for (const tier of tiers) {
    if (left <= 0) break;
    if (tier.through == null) return total + left * tier.price;
    const room = tier.through - at;
    if (room <= 0) continue;
    const take = Math.min(room, left);
    total += take * tier.price;
    at += take;
    left -= take;
  }
  // the ladder ran out before the purchase did: the top rung has a cap
  return left > 0 ? null : total;
}

export type MemorySource = {
  stage: StageEntry;
  /** Expected memories a clear pays, chance included. */
  perRun: number;
};

/** The stages paying one unit's memory, best first. Pass the pool already filtered. */
export function memorySources(stages: StageEntry[], ref: string | null): MemorySource[] {
  if (!ref) return [];
  const out: MemorySource[] = [];
  for (const stage of stages) {
    let perRun = 0;
    for (const drop of stage.rewards?.repeat ?? []) {
      if (drop.ref !== ref) continue;
      const [min, max] = drop.amount;
      perRun += (max ? (min + max) / 2 : min) * (drop.chance ?? 1);
    }
    if (perRun) out.push({ stage, perRun });
  }
  return out.sort((a, b) => b.perRun - a.perRun);
}

export type MemoryPlan = {
  ref: string | null;
  /** Memories the star span costs, before anything held is taken off. */
  required: number;
  held: number;
  short: number;
  /** Currency for the shortfall; null when the shop does not sell this unit. */
  buy: number | null;
  sources: MemorySource[];
  /** Expected memories a day over those stages at the run cap; 0 with no route. */
  perDay: number;
  /** Days of farming for the shortfall, null when nothing drops her memory. */
  days: number | null;
};

export function memoryPlan(
  star: StarGrowth | undefined, code: string, required: number, held: number,
  bought: number, stages: StageEntry[], runsPerDay = HARD_RUNS_PER_DAY,
): MemoryPlan {
  const ref = memoryRef(star, code);
  const short = Math.max(0, required - held);
  const sources = memorySources(stages, ref);
  const perDay = sources.reduce((sum, s) => sum + s.perRun, 0) * runsPerDay;
  return {
    ref,
    required,
    held,
    short,
    buy: exchangeCost(sellsMemory(star, code) ? ladderFor(star, code) : [], bought, short),
    sources,
    perDay,
    days: short === 0 ? 0 : perDay ? Math.ceil(short / perDay) : null,
  };
}
