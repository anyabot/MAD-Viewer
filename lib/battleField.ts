export type Slot = [x: number, z: number];
export type SlotTable = Record<1 | 2 | 3, Record<1 | 2 | 3 | 4 | 5, Slot[]>>;

export const FIELD_GAME_VERSION = '1.9.8';

// Offsets from the team origin by line (1 front, 2 middle, 3 back) and how many units share that line.
export const ALLY_SLOTS: SlotTable = {
  1: {
    1: [[0, 0]],
    2: [[-0.5, 1.66], [-1, -0.83]],
    3: [[0, 0], [-1.2, 1.66], [-1.6, -1.66]],
    4: [[0, 1.66], [-0.5, -0.83], [-1.5, 0.83], [-2, -1.66]],
    5: [[0, 0], [-1.7, 0.83], [-3, -1.66], [-5, 1.66], [-6, -0.83]],
  },
  2: {
    1: [[-3.5, 0]],
    2: [[-3, 1.66], [-3.5, -1.66]],
    3: [[-2.5, 0], [-4.1, 1.66], [-4.5, -1.66]],
    4: [[-2.5, 0.83], [-3.2, -1.66], [-4.5, 1.66], [-5.3, -0.83]],
    5: [[0, 0], [-1.7, 0.83], [-3, -1.66], [-5, 1.66], [-6, -0.83]],
  },
  3: {
    1: [[-6.5, 0]],
    2: [[-6.3, 1.66], [-6.5, -1.66]],
    3: [[-5, 0], [-6.5, -1.66], [-6.5, 1.66]],
    4: [[-5.5, 1.66], [-5.8, -1.66], [-7.4, 0.83], [-8, -0.83]],
    5: [[0, 0], [-1.7, 0.83], [-3, -1.66], [-5, 1.66], [-6, -0.83]],
  },
};

export const ENEMY_SLOTS: SlotTable = {
  1: {
    1: [[0, 0]],
    2: [[0.5, 1.66], [1, -0.83]],
    3: [[0, 0], [1.2, 1.66], [1.6, -1.66]],
    4: [[0, 1.66], [0.5, -0.83], [1.5, 0.83], [2, -1.66]],
    5: [[0, 0], [1.7, 0.83], [3, -1.66], [5, 1.66], [6, -0.83]],
  },
  2: {
    1: [[3.5, 0]],
    2: [[3, 1.66], [3.5, -1.66]],
    3: [[2.5, 0], [4.1, 1.66], [4.5, -1.66]],
    4: [[2.5, 0.83], [3.2, -1.66], [4.5, 1.66], [5.3, -0.83]],
    5: [[0, 0], [1.7, 0.83], [3, -1.66], [5, 1.66], [6, -0.83]],
  },
  3: {
    1: [[6.5, 0]],
    2: [[6.5, 1.66], [6.3, -1.66]],
    3: [[5, 0], [6.5, -1.66], [6.5, 1.66]],
    4: [[5.5, 1.66], [5.8, -1.66], [7.4, 0.83], [8, -0.83]],
    5: [[0, 0], [1.7, 0.83], [3, -1.66], [5, 1.66], [6, -0.83]],
  },
};

// 0 is the midpoint between the two front units once both sides have walked in.
export const FIELD = {
  encounterDistance: 9,
  encounterRange: 1,
  boundaryHalf: 15,
  boundaryDepth: 6,
  boundaryInset: 0.1,
  hitRadius: 0.5,
  moveSpeed: 5,
};

export const RUN_IN_GAP = FIELD.encounterDistance + FIELD.encounterRange + FIELD.hitRadius;

// Typical approach by line (median of the roster), for slots with no unit picked.
export const DEFAULT_APPROACH = {
  ally: { 1: 2.5, 2: 6, 3: 9.8 },
  enemy: { 1: 1.9, 2: 4.5, 3: 8 },
} as const;

export type Walker = { x: number; z: number; r: number; approach: number; side: 1 | -1 };

// Both sides walk in at the same speed; each unit stops once the nearest opposing edge is within its approach.
export function settle(units: Walker[]): { units: Walker[]; centre: number } {
  const out = units.map((u) => ({ ...u }));
  const step = FIELD.moveSpeed * 0.01;
  for (let frame = 0; frame < 20000; frame += 1) {
    let moved = false;
    const snapshot = out.map((u) => u.x);
    for (let i = 0; i < out.length; i += 1) {
      const u = out[i];
      let gap = Infinity;
      out.forEach((o, j) => {
        if (o.side !== u.side) gap = Math.min(gap, Math.abs(snapshot[j] - snapshot[i]) - o.r);
      });
      const room = gap - u.approach;
      if (room > 1e-6) {
        u.x += u.side * Math.min(step, room);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const allyFront = Math.max(...out.filter((u) => u.side === 1).map((u) => u.x));
  const enemyFront = Math.min(...out.filter((u) => u.side === -1).map((u) => u.x));
  const centre = Number.isFinite(allyFront + enemyFront) ? (allyFront + enemyFront) / 2 : 0;
  return { units: out.map((u) => ({ ...u, x: u.x - centre })), centre };
}

