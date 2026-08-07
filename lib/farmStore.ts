// The farm tracker's own record: what the player holds, what they have cleared,
// and where they want each unit to end up. Unlike `filterStore` this is meant
// to outlive the session, so it is mirrored into `localStorage`.
//
// The store starts empty so the statically exported HTML and the first client
// render agree; `restoreFarm` applies the saved record after mount, the same
// way the language picker does.
import { create } from 'zustand';
import { emptyPlan, type GearPlan, type UnitPlan, type UnitPlanPair } from '@/lib/farm';

const STORAGE_KEY = 'mad.farm';

export type FarmState = {
  /** Material ref -> how many the player holds. */
  inventory: Record<string, number>;
  /** Character code -> the current and target plan. */
  units: Record<string, UnitPlanPair>;
  /** Stage id -> stars cleared, 0 for never cleared. */
  clears: Record<string, number>;
  /** Restrict every pool to stages that can be swept. */
  sweepOnly: boolean;
  /** Whether hard stages count as a farm route. */
  hardStages: boolean;
};

type FarmStore = FarmState & {
  ready: boolean;
  setInventory: (ref: string, count: number) => void;
  /** One write for a whole recount, so a completed plan is a single update. */
  replaceInventory: (inventory: Record<string, number>) => void;
  clearInventory: () => void;
  addUnit: (code: string) => void;
  removeUnit: (code: string) => void;
  setHidden: (code: string, hidden: boolean) => void;
  setPriority: (code: string, priority: boolean) => void;
  setPlan: (code: string, side: 'current' | 'target', patch: Partial<UnitPlan>) => void;
  setSkill: (code: string, side: 'current' | 'target', id: number, level: number) => void;
  setGear: (code: string, side: 'current' | 'target', slot: number, gear: GearPlan) => void;
  /** The target becomes the current state; the inventory it cost comes in
   *  already spent, so both land in one write. */
  completeUnit: (code: string, inventory: Record<string, number>) => void;
  setStars: (stageId: number, stars: number) => void;
  setStarsMany: (stageIds: number[], stars: number) => void;
  setSweepOnly: (on: boolean) => void;
  setHardStages: (on: boolean) => void;
};

const EMPTY: FarmState = {
  inventory: {}, units: {}, clears: {}, sweepOnly: false, hardStages: true,
};

function persist(state: FarmState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      inventory: state.inventory,
      units: state.units,
      clears: state.clears,
      sweepOnly: state.sweepOnly,
      hardStages: state.hardStages,
    }));
  } catch {
    // private mode or a blocked store: the record just does not persist
  }
}

function save<T extends Partial<FarmState>>(state: FarmStore, patch: T): T {
  persist({ ...state, ...patch });
  return patch;
}

/** A target below the current state is not a plan. */
function atLeastCurrent(pair: UnitPlanPair): UnitPlanPair {
  const { current, target } = pair;
  const skills = { ...target.skills };
  for (const [id, level] of Object.entries(current.skills)) {
    if ((skills[id] ?? 1) < level) skills[id] = level;
  }
  const gear = { ...target.gear };
  for (const [slot, worn] of Object.entries(current.gear)) {
    const want = gear[slot];
    if (!want || want.tier < worn.tier
      || (want.tier === worn.tier && want.level < worn.level)) {
      gear[slot] = { ...worn };
    }
  }
  return {
    ...pair,
    target: { level: Math.max(target.level, current.level), skills, gear },
  };
}

function withSide(
  units: FarmState['units'], code: string, side: 'current' | 'target',
  update: (plan: UnitPlan) => UnitPlan,
): FarmState['units'] {
  const pair = units[code] ?? { current: emptyPlan(), target: emptyPlan() };
  const next = { ...pair, [side]: update(pair[side]) };
  return { ...units, [code]: side === 'current' ? atLeastCurrent(next) : next };
}

export const useFarm = create<FarmStore>((set) => ({
  ...EMPTY,
  ready: false,

  setInventory: (ref, count) => set((s) => save(s, {
    inventory: { ...s.inventory, [ref]: Math.max(0, Math.floor(count) || 0) },
  })),
  replaceInventory: (inventory) => set((s) => save(s, { inventory })),
  clearInventory: () => set((s) => save(s, { inventory: {} })),

  addUnit: (code) => set((s) => (s.units[code] ? {} : save(s, {
    units: { ...s.units, [code]: { current: emptyPlan(), target: emptyPlan() } },
  }))),
  removeUnit: (code) => set((s) => {
    const units = { ...s.units };
    delete units[code];
    return save(s, { units });
  }),
  setHidden: (code, hidden) => set((s) => {
    const pair = s.units[code];
    return pair ? save(s, { units: { ...s.units, [code]: { ...pair, hidden } } }) : {};
  }),
  setPriority: (code, priority) => set((s) => {
    const pair = s.units[code];
    return pair ? save(s, { units: { ...s.units, [code]: { ...pair, priority } } }) : {};
  }),
  completeUnit: (code, inventory) => set((s) => {
    const pair = s.units[code];
    if (!pair) return {};
    return save(s, {
      inventory,
      units: { ...s.units, [code]: { ...pair, current: pair.target } },
    });
  }),

  setPlan: (code, side, patch) => set((s) => save(s, {
    units: withSide(s.units, code, side, (plan) => ({ ...plan, ...patch })),
  })),
  setSkill: (code, side, id, level) => set((s) => save(s, {
    units: withSide(s.units, code, side, (plan) => ({
      ...plan, skills: { ...plan.skills, [id]: level },
    })),
  })),
  setGear: (code, side, slot, gear) => set((s) => save(s, {
    units: withSide(s.units, code, side, (plan) => ({
      ...plan, gear: { ...plan.gear, [slot]: gear },
    })),
  })),

  setStars: (stageId, stars) => set((s) => save(s, {
    clears: { ...s.clears, [stageId]: stars },
  })),
  setStarsMany: (stageIds, stars) => set((s) => {
    const clears = { ...s.clears };
    for (const id of stageIds) clears[id] = stars;
    return save(s, { clears });
  }),

  setSweepOnly: (on) => set((s) => save(s, { sweepOnly: on })),

  setHardStages: (on) => set((s) => save(s, { hardStages: on })),
}));

function record(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function plan(value: unknown): UnitPlan {
  const raw = (value ?? {}) as Partial<UnitPlan>;
  const gear: Record<string, GearPlan> = {};
  for (const [slot, set_] of Object.entries(raw.gear ?? {})) {
    if (set_ && typeof set_.tier === 'number' && typeof set_.level === 'number') {
      gear[slot] = { tier: set_.tier, level: set_.level };
    }
  }
  return {
    level: typeof raw.level === 'number' ? raw.level : 1,
    skills: record(raw.skills),
    gear,
  };
}

/** Applied after mount; a malformed or foreign record is discarded field by
 *  field rather than throwing the whole tracker away. */
export function restoreFarm(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    useFarm.setState({ ready: true });
    return;
  }
  if (!saved) {
    useFarm.setState({ ready: true });
    return;
  }
  try {
    const doc = JSON.parse(saved) as Partial<FarmState>;
    const units: FarmState['units'] = {};
    for (const [code, pair] of Object.entries(doc.units ?? {})) {
      units[code] = {
        current: plan(pair?.current),
        target: plan(pair?.target),
        ...(pair?.hidden ? { hidden: true } : {}),
        ...(pair?.priority ? { priority: true } : {}),
      };
    }
    useFarm.setState({
      inventory: record(doc.inventory),
      units,
      clears: record(doc.clears),
      sweepOnly: doc.sweepOnly === true,
      hardStages: doc.hardStages !== false,
      ready: true,
    });
  } catch {
    useFarm.setState({ ready: true });
  }
}
