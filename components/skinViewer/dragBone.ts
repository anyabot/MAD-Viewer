// A drag session's bone: a hardening spring toward a constrained pointer target. Pure math, no Spine.

export type DragBoneConstraint = {
  range: number | null;
  center: readonly [number, number];
  /** Degrees; null leaves the direction free. */
  direction: number | null;
  angle: number | null;
};

export type DragBoneSettings = { constraint: DragBoneConstraint; spring: number; damping: number };

export type DragBoneMotion = { x: number; y: number; vx: number; vy: number };

const DEG_TO_RAD = 0.01745329238474369;
const RAD_TO_DEG = 57.29578;
const EPSILON = 1e-6;
const ANGLE_TOLERANCE = 1e-4;
const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 512;
const NEWTON_STEPS = 40;
const NEWTON_TOLERANCE = 1e-12;

export const DEFAULT_SPRING = 500;
export const DEFAULT_DAMPING = 1;

function wrap180(degrees: number): number {
  let a = degrees - Math.floor(degrees / 360) * 360;
  a = a > 360 ? 360 : a < 0 ? 0 : a;
  return a > 180 ? a - 360 : a;
}

function inSector(x: number, y: number, c: DragBoneConstraint, tolerance: number): boolean {
  if (c.direction === null || c.angle === null || c.angle >= 360) return true;
  if (Math.hypot(x, y) <= EPSILON) return true;
  const off = wrap180(Math.atan2(y, x) * RAD_TO_DEG - c.direction);
  return Math.abs(off) <= c.angle * 0.5 + tolerance;
}

/** The closest point to `offset` inside the range circle and the angular sector, in constraint space. */
export function constrainOffset(ox: number, oy: number, c: DragBoneConstraint): [number, number] {
  const hasRange = c.range !== null;
  const range = c.range ?? 0;
  let cx = 0;
  let cy = 0;
  if (hasRange) {
    [cx, cy] = c.center;
    const length = Math.hypot(cx, cy);
    if (length * length > range * range && length > 0) {
      cx = (cx / length) * range;
      cy = (cy / length) * range;
    }
  }
  const hasAngle = c.direction !== null && c.angle !== null && c.angle < 360;
  const insideCircle = !hasRange || (ox - cx) ** 2 + (oy - cy) ** 2 <= range * range;
  if (!hasAngle) {
    if (insideCircle) return [ox, oy];
    const dx = ox - cx;
    const dy = oy - cy;
    const d = Math.hypot(dx, dy);
    return [cx + (dx / d) * range, cy + (dy / d) * range];
  }
  if (insideCircle && inSector(ox, oy, c, 0)) return [ox, oy];

  let best: [number, number] = [0, 0];
  let bestDistance = ox * ox + oy * oy;
  if (hasRange) {
    const dx = ox - cx;
    const dy = oy - cy;
    const d = Math.hypot(dx, dy);
    const [px, py] = d * d > range * range
      ? [cx + (dx / d) * range, cy + (dy / d) * range] : [ox, oy];
    if (inSector(px, py, c, ANGLE_TOLERANCE)) {
      best = [px, py];
      bestDistance = (ox - px) ** 2 + (oy - py) ** 2;
    }
  }
  const half = (c.angle as number) * 0.5;
  for (const sign of [-1, 1]) {
    const edge = ((c.direction as number) + sign * half) * DEG_TO_RAD;
    const ux = Math.cos(edge);
    const uy = Math.sin(edge);
    let t = Math.max(0, ox * ux + oy * uy);
    if (hasRange) {
      const b = cx * ux + cy * uy;
      const reach = Math.max(0, b + Math.sqrt(Math.max(0, b * b + range * range - (cx * cx + cy * cy))));
      t = Math.min(t, reach);
    }
    const px = ux * t;
    const py = uy * t;
    const distance = (ox - px) ** 2 + (oy - py) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [px, py];
    }
  }
  return best;
}

/** One frame toward `target`: backward Euler on `ë = −k·e − k3·|e|²·e − c·v`, substepped. */
export function stepMotion(
  motion: DragBoneMotion, tx: number, ty: number, settings: DragBoneSettings, dt: number,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const { constraint: c, spring, damping } = settings;
  const range = c.range ?? 0;
  const k3 = c.range !== null && range > 0 ? (4 * spring) / (range * range) : 0;
  const k = spring;
  const reach = c.range !== null ? range + Math.min(Math.hypot(c.center[0], c.center[1]), range) : 0;
  const omega = Math.sqrt(k + 3 * k3 * reach * reach);
  const count = Math.min(MAX_SUBSTEPS, Math.max(1,
    Math.ceil(dt / SUBSTEP) * Math.max(1, Math.ceil((omega * SUBSTEP) / 0.1))));
  const h = dt / count;
  const cDamp = 2 * damping * Math.sqrt(k);
  const a = 1 + h * cDamp + h * h * k;
  const cubic = h * h * k3;
  for (let i = 0; i < count; i++) {
    const ex = motion.x - tx;
    const ey = motion.y - ty;
    const bx = (1 + h * cDamp) * ex + h * motion.vx;
    const by = (1 + h * cDamp) * ey + h * motion.vy;
    const bLength = Math.hypot(bx, by);
    let r = 0;
    if (bLength > 0) {
      r = bLength / a;
      if (cubic > 0) {
        r = Math.min(r, Math.max(2 * Math.sqrt(ex * ex + ey * ey), Math.cbrt(bLength / cubic)));
        for (let n = 0; n < NEWTON_STEPS; n++) {
          const f = cubic * r * r * r + a * r - bLength;
          if (Math.abs(f) <= NEWTON_TOLERANCE * bLength) break;
          r -= f / (3 * cubic * r * r + a);
          if (r < 0) r = 0;
        }
      }
    }
    const nx = bLength > 0 ? (bx / bLength) * r : 0;
    const ny = bLength > 0 ? (by / bLength) * r : 0;
    motion.vx = (nx - ex) / h;
    motion.vy = (ny - ey) / h;
    motion.x = tx + nx;
    motion.y = ty + ny;
  }
}

export function isSettled(motion: DragBoneMotion, tx: number, ty: number): boolean {
  return Math.hypot(motion.x - tx, motion.y - ty) < 1e-3 && Math.hypot(motion.vx, motion.vy) < 1e-2;
}

/** `Center:"0.015,-0.024"` and `Center:0,0`. */
export function parsePair(value: string | undefined): [number, number] | null {
  if (!value) return null;
  const parts = value.replace(/"/g, '').split(',').map((p) => Number(p.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : null;
}

export function boneSettings(fields: Record<string, string>): DragBoneSettings {
  const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v));
  const range = num(fields.Range);
  const direction = num(fields.Direction);
  const angle = num(fields.Angle);
  const spring = num(fields.Spring);
  const damping = num(fields.Damping);
  return {
    constraint: {
      range: range !== null && Number.isFinite(range) ? range : null,
      center: parsePair(fields.Center) ?? [0, 0],
      direction: direction !== null && Number.isFinite(direction) ? direction : null,
      angle: angle !== null && Number.isFinite(angle) ? angle : null,
    },
    spring: spring !== null && Number.isFinite(spring) ? spring : DEFAULT_SPRING,
    damping: damping !== null && Number.isFinite(damping) ? damping : DEFAULT_DAMPING,
  };
}
