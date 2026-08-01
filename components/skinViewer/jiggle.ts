// Home-screen spring jiggle. Mechanism and unit reasoning:

export type Jiggler = {
  box?: string | null;
  bone?: string | null;
  strength?: number | null;
  maxDistance?: number | null;
  springStrength?: number | null;
  springDamping?: number | null;
};

type Spring = {
  box: string;
  bone: any;
  stiffness: number;
  damping: number;
  strength: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  /** Local pose captured by `apply`, put back by `restore`. */
  baseX: number;
  baseY: number;
  applied: boolean;
};

export type JiggleHit = {
  box: string;
  bone: string;
  distance: number;
};

const MAX_STEP = 1 / 240;
const REST_EPSILON = 1e-4;
const INPUT_GAIN = 4;
const MIN_INPUT_DISTANCE = 5;

export class JiggleField {
  private springs: Spring[] = [];
  private byBox = new Map<string, Spring>();

  constructor(jigglers: Jiggler[], findBone: (name: string) => any) {
    for (const j of jigglers) {
      if (!j?.box || !j?.bone) continue;
      const bone = findBone(j.bone);
      if (!bone) continue;
      const stiffness = j.springStrength && j.springStrength > 0 ? j.springStrength : 200;
      const spring: Spring = {
        box: j.box,
        bone,
        stiffness,
        damping: 2 * Math.sqrt(stiffness) * (j.springDamping ?? 0.25),
        strength: j.strength ?? 1,
        ox: 0, oy: 0, vx: 0, vy: 0,
        baseX: 0, baseY: 0, applied: false,
      };
      this.springs.push(spring);
      this.byBox.set(spring.box, spring);
    }
  }

  get size(): number {
    return this.springs.length;
  }

  hasBox(box: string): boolean {
    return this.byBox.has(box);
  }

  boneFor(box: string): string | null {
    return this.byBox.get(box)?.bone?.data?.name ?? null;
  }

  private kick(s: Spring, dirX: number, dirY: number): void {
    const local = toBoneParentSpace(s.bone, dirX, dirY);
    const distance = Math.hypot(local.x, local.y);
    const scale = distance > 1e-6
      ? Math.max(distance, MIN_INPUT_DISTANCE) / distance
      : 0;
    const inputX = distance > 1e-6 ? local.x * scale : 0;
    const inputY = distance > 1e-6 ? local.y * scale : -MIN_INPUT_DISTANCE;
    const gain = INPUT_GAIN * s.strength * Math.sqrt(s.stiffness);
    s.vx = inputX * gain;
    s.vy = inputY * gain;
  }

  /** Kick the jiggler assigned to the touched box toward the touch point. */
  pokeToward(box: string, px: number, py: number): JiggleHit | null {
    const s = this.byBox.get(box);
    if (!s) return null;
    const dx = px - s.bone.worldX;
    const dy = py - s.bone.worldY;
    const distance = Math.hypot(dx, dy);
    this.kick(s, dx, dy);
    return { box: s.box, bone: s.bone?.data?.name ?? '', distance };
  }

  step(dt: number): void {
    if (!(dt > 0)) return;
    const elapsed = Math.min(dt, MAX_STEP * 16);
    const steps = Math.max(1, Math.ceil(elapsed / MAX_STEP));
    const h = elapsed / steps;
    for (const s of this.springs) {
      if (Math.abs(s.ox) < REST_EPSILON && Math.abs(s.oy) < REST_EPSILON
        && Math.abs(s.vx) < REST_EPSILON && Math.abs(s.vy) < REST_EPSILON) {
        s.ox = 0; s.oy = 0; s.vx = 0; s.vy = 0;
        continue;
      }
      for (let i = 0; i < steps; i++) {
        s.vx += (-s.stiffness * s.ox - s.damping * s.vx) * h;
        s.vy += (-s.stiffness * s.oy - s.damping * s.vy) * h;
        s.ox += s.vx * h;
        s.oy += s.vy * h;
      }
    }
  }

  /**
   * Must run after `AnimationState.apply` and before `updateWorldTransform`.
   * Captures the bone's animated local pose before offsetting it; `restore`
   * puts it back. Nothing keys a `gyro_*` bone (the clips key only the
   * constraint mixes), so an unpaired `+=` would compound every frame and
   * park the bone off-figure permanently.
   */
  apply(): void {
    for (const s of this.springs) {
      if (!s.ox && !s.oy) continue;
      s.baseX = s.bone.x;
      s.baseY = s.bone.y;
      s.applied = true;
      s.bone.x += s.ox;
      s.bone.y += s.oy;
    }
  }

  /** Must run after `updateWorldTransform`: the render keeps the offset, the
   *  local pose does not. */
  restore(): void {
    for (const s of this.springs) {
      if (!s.applied) continue;
      s.bone.x = s.baseX;
      s.bone.y = s.baseY;
      s.applied = false;
    }
  }

  reset(): void {
    for (const s of this.springs) { s.ox = 0; s.oy = 0; s.vx = 0; s.vy = 0; }
  }
}

function toBoneParentSpace(bone: any, dx: number, dy: number): { x: number; y: number } {
  const p = bone?.parent;
  if (!p) return { x: dx, y: dy };
  const det = p.a * p.d - p.b * p.c;
  if (!det || !Number.isFinite(det)) return { x: dx, y: dy };
  return {
    x: (p.d * dx - p.c * dy) / det,
    y: (-p.b * dx + p.a * dy) / det,
  };
}
