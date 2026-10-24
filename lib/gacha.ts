import type { GachaBanner, GachaBannerIndex } from '@/lib/data';

export type Pull = { code: string; grade: number; pickup: boolean };

export type BannerTally = {
  pulls: number;
  // pulls toward the next every-N guarantee
  sinceSpecial: number;
  // pulls since the last ★3, for the banners with a ★3 guarantee group
  sinceThree: number;
  mileage: number;
  spent: number;
  got: Record<string, number>;
  // every ★3 in order, with the pulls it took since the previous ★3 (or the start)
  threes: { code: string; gap: number; pickup: boolean }[];
};

export const emptyTally = (): BannerTally => ({
  pulls: 0, sinceSpecial: 0, sinceThree: 0, mileage: 0, spent: 0, got: {}, threes: [],
});

function weighted<T>(entries: T[], weight: (e: T) => number, rng: () => number): T {
  const total = entries.reduce((s, e) => s + weight(e), 0);
  let roll = rng() * total;
  for (const e of entries) {
    roll -= weight(e);
    if (roll < 0) return e;
  }
  return entries[entries.length - 1];
}

// The group a pull draws from: the ★3 guarantee first, then the every-N ★2+ guarantee, else the base split.
function groupFor(banner: GachaBanner, tally: BannerTally): string {
  if (banner.pityGroup && banner.pity && tally.sinceThree + 1 >= banner.pity) return banner.pityGroup;
  if (banner.special && banner.every && tally.sinceSpecial + 1 >= banner.every) return banner.special;
  return banner.base;
}

// Master's Pick rates its chosen partner up like a rate-up pickup: twice the rest of the ★3 pool, so 2/3 of the ★3 share.
export function poolFor(data: GachaBannerIndex, pool: string, grade: number, target?: string | null): [string, number][] {
  const units = data.pools[pool] ?? [];
  if (!target || grade < 3 || !units.some(([c]) => c === target)) return units;
  const rest = units.filter(([c]) => c !== target).reduce((s, [, w]) => s + w, 0);
  return units.map(([c, w]): [string, number] => (c === target ? [c, rest * 2] : [c, w]));
}

export function pullOnce(
  data: GachaBannerIndex, banner: GachaBanner, tally: BannerTally, rng: () => number = Math.random,
  target: string | null = null,
): { pull: Pull; tally: BannerTally } {
  const split = data.groups[groupFor(banner, tally)] ?? data.groups[banner.base];
  const grade = weighted(split, (e) => e.weight, rng);
  const [code] = weighted(poolFor(data, grade.pool, grade.grade, target), ([, w]) => w, rng);
  const special = !!banner.every && tally.sinceSpecial + 1 >= banner.every;
  const three = grade.grade >= 3;
  const next: BannerTally = {
    pulls: tally.pulls + 1,
    // Normal Summon resets the every-10 counter on a ★3; rate-ups only count.
    sinceSpecial: special || (three && banner.kind === 'premium') ? 0 : tally.sinceSpecial + 1,
    sinceThree: three ? 0 : tally.sinceThree + 1,
    mileage: tally.mileage + (banner.mileage ? 1 : 0),
    spent: tally.spent + banner.price,
    got: { ...tally.got, [code]: (tally.got[code] ?? 0) + 1 },
    threes: tally.threes,
  };
  const pickup = !!banner.pickups?.includes(code) || code === target;
  if (three) next.threes = [...tally.threes, { code, gap: tally.sinceThree + 1, pickup }];
  return { pull: { code, grade: grade.grade, pickup }, tally: next };
}

export function pullMany(
  data: GachaBannerIndex, banner: GachaBanner, tally: BannerTally, count: number, rng: () => number = Math.random,
  target: string | null = null,
): { pulls: Pull[]; tally: BannerTally } {
  const pulls: Pull[] = [];
  let current = tally;
  for (let i = 0; i < count; i++) {
    const step = pullOnce(data, banner, current, rng, target);
    pulls.push(step.pull);
    current = step.tally;
  }
  return { pulls, tally: current };
}

// Each partner's share of one pull under the base split, for the rate table.
export function baseRates(
  data: GachaBannerIndex, group: string, target: string | null = null,
): { grade: number; share: number; units: [string, number][] }[] {
  const split = data.groups[group] ?? [];
  const total = split.reduce((s, e) => s + e.weight, 0) || 1;
  return split.map((e) => {
    const pool = poolFor(data, e.pool, e.grade, target);
    const sum = pool.reduce((s, [, w]) => s + w, 0) || 1;
    const share = e.weight / total;
    return { grade: e.grade, share, units: pool.map(([code, w]): [string, number] => [code, share * (w / sum)]) };
  }).sort((a, b) => b.grade - a.grade);
}
