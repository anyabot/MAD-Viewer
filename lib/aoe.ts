import {
  ALLY_SLOTS, DEFAULT_APPROACH, ENEMY_SLOTS, FIELD, RUN_IN_GAP, settle, type SlotTable,
} from '@/lib/battleField';
import type { SkillBehaviour, SkillHit, SkillMoveTarget, SkillOp } from '@/lib/data';

export type Side = 'ally' | 'enemy';
export type Unit = { key: string; side: Side; line: 1 | 2 | 3; code?: string; x: number; z: number; r: number; face?: 1 | -1 };
export type Area =
  | { kind: 'line'; x: number; z: number; half: number; hit: number }
  | { kind: 'circle'; x: number; z: number; radius: number; hit: number }
  | { kind: 'global'; hit: number };
export type Outcome = {
  caster: Unit;
  path: { from: [number, number]; to: [number, number] }[];
  areas: Area[];
  targets: Set<string>;
  affected: Map<string, number[]>;
  guessed: boolean;
};

const EPS = 0.001;

function slotted(table: SlotTable, lines: (1 | 2 | 3)[]): { line: 1 | 2 | 3; x: number; z: number }[] {
  const out: { line: 1 | 2 | 3; x: number; z: number }[] = [];
  const seen: Record<number, number> = {};
  for (const line of lines) seen[line] = (seen[line] ?? 0) + 1;
  const index: Record<number, number> = {};
  for (const line of lines) {
    const n = seen[line] as 1 | 2 | 3 | 4 | 5;
    const i = index[line] ?? 0;
    index[line] = i + 1;
    const [x, z] = table[line][n][i];
    out.push({ line, x, z });
  }
  return out;
}

const facing = (u: Unit) => u.face ?? (u.side === 'ally' ? 1 : -1);

function teamOf(team: string | null, caster: Unit, units: Unit[]): Unit[] {
  const mine = units.filter((u) => u.side === caster.side);
  const theirs = units.filter((u) => u.side !== caster.side);
  switch (team) {
    case 'ENEMY': return theirs;
    case 'FRIENDLY': return mine;
    case 'FRIENDLY_NOT_SELF': return mine.filter((u) => u.key !== caster.key);
    case 'SELF': return [caster];
    case 'ALL_UNIT': return units;
    default: return [];
  }
}

const SORTABLE = new Set(['DISTANCE_LOWEST', 'DISTANCE_HIGHEST']);

function resolveCast(cast: SkillHit['cast'], caster: Unit, units: Unit[], chosen: string | null) {
  if (!cast || !cast.team || cast.team === 'SELF') return { targets: [caster], guessed: false };
  let pool = teamOf(cast.team, caster, units);
  if (cast.range === 'FRONT') {
    pool = pool.filter((t) => (t.x - caster.x) * facing(caster) >= 0
      && Math.abs(t.x - caster.x) - t.r <= cast.rangeValue + EPS);
  } else if (cast.range === 'CENTER') {
    pool = pool.filter((t) => Math.hypot(t.x - caster.x, t.z - caster.z) - t.r <= cast.rangeValue);
  }
  const dist = (t: Unit) => Math.abs(t.x - caster.x);
  const guessed = !!cast.sort && !SORTABLE.has(cast.sort);
  pool = [...pool].sort((a, b) => (cast.sort === 'DISTANCE_HIGHEST' ? dist(b) - dist(a) : dist(a) - dist(b)));
  if (guessed && chosen) {
    const pick = pool.find((t) => t.key === chosen);
    if (pick) pool = [pick, ...pool.filter((t) => t !== pick)];
  }
  if (cast.pick === 'ALL') return { targets: pool, guessed };
  if (cast.pick === 'NTH_TARGET_SELECT') return { targets: pool.slice(cast.count - 1, cast.count), guessed };
  return { targets: pool.slice(0, Math.max(1, cast.count)), guessed };
}

function inside(area: Area, u: Unit): boolean {
  if (area.kind === 'global') return true;
  if (area.kind === 'line') return Math.abs(u.x - area.x) - u.r <= area.half + EPS;
  return Math.hypot(u.x - area.x, u.z - area.z) - u.r <= area.radius;
}

function opUnits(op: SkillOp, caster: Unit, units: Unit[], targets: Unit[], area: Area): Unit[] {
  const pool = op.team === 'CAST_TARGET' ? targets : teamOf(op.team, caster, units);
  let hit = pool.filter((u) => inside(area, u));
  if (op.pick === 'N_TARGET_SELECT' && op.count > 0) {
    const cx = area.kind === 'global' ? caster.x : area.x;
    hit = [...hit].sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx)).slice(0, op.count);
  }
  return hit;
}

function clampX(x: number): number {
  return Math.min(Math.max(x, -FIELD.boundaryHalf), FIELD.boundaryHalf - FIELD.boundaryInset);
}

export function simulate(behaviour: SkillBehaviour, start: Unit, units: Unit[], chosen: string | null): Outcome {
  let caster = { ...start };
  const others = units.map((u) => (u.key === caster.key ? caster : u));
  const path: Outcome['path'] = [];
  let guessed = false;
  for (const move of (behaviour.moveTargets ?? []) as SkillMoveTarget[]) {
    const from: [number, number] = [caster.x, caster.z];
    if (move.type === 'MOVE_TO_TARGET') {
      const { targets, guessed: g } = resolveCast(move.cast, caster, others, chosen);
      guessed ||= g;
      const t = targets[0];
      if (!t || t.key === caster.key) continue;
      const off = move.offset ?? 0;
      const x = clampX(t.x + (caster.x < t.x ? off : -off));
      caster = { ...caster, x, z: t.z, face: move.lookAtTarget ? (t.x >= x ? 1 : -1) : caster.face };
    } else if (move.type === 'MOVE_TO_DIRECTION' && move.offset) {
      caster = { ...caster, x: clampX(caster.x + facing(caster) * move.offset) };
    } else {
      continue;
    }
    path.push({ from, to: [caster.x, caster.z] });
  }
  const field = units.map((u) => (u.key === caster.key ? caster : u));
  const areas: Area[] = [];
  const targets = new Set<string>();
  const affected = new Map<string, number[]>();
  (behaviour.hits ?? []).forEach((hit, h) => {
    const { targets: anchors, guessed: g } = resolveCast(hit.cast, caster, field, chosen);
    guessed ||= g;
    anchors.forEach((t) => targets.add(t.key));
    for (const anchor of anchors) {
      const dir = hit.offset === 'FORWARD' ? facing(caster) : hit.offset === 'BACKWARD' ? -facing(caster) : 0;
      const x = anchor.x + dir * (hit.offsetValue ?? 0);
      const z = (hit.fieldCenter ? 0 : anchor.z) + (hit.offsetZ ?? 0);
      const area: Area = hit.shape === 'CIRCLE' ? { kind: 'circle', x, z, radius: hit.range, hit: h }
        : hit.shape === 'GLOBAL' ? { kind: 'global', hit: h }
          : { kind: 'line', x, z, half: hit.range / 2, hit: h };
      areas.push(area);
      for (const op of hit.ops) {
        for (const u of opUnits(op, caster, field, anchors, area)) {
          const list = affected.get(u.key) ?? [];
          if (!list.includes(h)) list.push(h);
          affected.set(u.key, list);
        }
      }
    }
  });
  return { caster, path, areas, targets, affected, guessed };
}

const SPREAD_TEAMS = new Set(['ENEMY', 'FRIENDLY', 'FRIENDLY_NOT_SELF', 'ALL_UNIT']);

// A hit is area damage when one of its effects lands on every unit of a side inside the zone, not just the cast target.
export function isAreaHit(hit: SkillHit): boolean {
  if (hit.cast?.pick === 'ALL' && hit.ops.some((op) => op.team === 'CAST_TARGET')) return true;
  return hit.ops.some((op) => SPREAD_TEAMS.has(op.team ?? '') && op.pick !== 'N_TARGET_SELECT');
}

export function hasArea(behaviour: SkillBehaviour | null | undefined): boolean {
  return !!behaviour?.hits?.some(isAreaHit);
}

export type Anchor = 'unit' | 'enemy' | 'ally' | 'field';

export function anchorOf(hit: SkillHit): Anchor {
  if (hit.shape === 'GLOBAL') return 'field';
  const cast = hit.cast;
  if (!cast?.team || cast.team === 'SELF') return 'unit';
  if (cast.pick === 'ALL' || cast.range === 'ALL') return 'field';
  return cast.team === 'ENEMY' ? 'enemy' : 'ally';
}

// One caster vs a 2/2/1 wave after both sides have walked in; startX is its run-in slot.
export function soloField(line: 1 | 2 | 3, code: string, r: number, approach = 0): { units: Unit[]; startX: number } {
  const [sx] = ALLY_SLOTS[line][1][0];
  const enemy = slotted(ENEMY_SLOTS, [1, 1, 2, 2, 3]);
  const lead = Math.min(...enemy.map((e) => e.x));
  const startX = -RUN_IN_GAP / 2 + sx;
  const { units: walked, centre } = settle([
    { x: startX, z: 0, r, approach, side: 1 },
    ...enemy.map((e) => ({ x: RUN_IN_GAP / 2 + (e.x - lead), z: e.z, r: FIELD.hitRadius, approach: DEFAULT_APPROACH.enemy[e.line], side: -1 as const })),
  ]);
  return {
    units: [
      { key: 'a0', side: 'ally', line, code, x: walked[0].x, z: 0, r },
      ...enemy.map((e, i) => ({ key: `e${i}`, side: 'enemy' as const, line: e.line, x: walked[i + 1].x, z: e.z, r: FIELD.hitRadius })),
    ],
    startX: startX - centre,
  };
}
