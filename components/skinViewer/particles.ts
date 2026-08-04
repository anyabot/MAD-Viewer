// A Unity `ParticleSystem`, replayed.
//
// An emote is a particle prefab, so drawing one means running its emitters, not
// showing a picture of them. This module is that runtime: it evaluates the same
// curves, gradients, shapes and over-lifetime modules the prefab authors and
// produces a list of live particles per frame. It touches no Pixi, no DOM and
// no Spine — positions and sizes come out in the emitter's own particle units
// and the caller converts them.
//
// The module set is the one the 30 emote prefabs enable: emission bursts,
// circle and edge shapes, size / colour / velocity / rotation / force over
// lifetime, and grid texture-sheet animation.
//
// Two things the prefabs carry that are deliberately not modelled: the trail
// emitters (their renderer draws no billboard at all, so they are not
// exported), and velocity-aligned billboards — the five emitters that ask for
// one all start at zero speed.
import type {
  EmoteCurve, EmoteEmitter, EmoteGradient, EmoteGradientStops,
} from '@/lib/data';

export type Particle = {
  /** Position in particle units, relative to the prefab root. */
  x: number;
  y: number;
  /** Quad size in particle units. */
  size: number;
  sizeY: number;
  /** Radians, counter-clockwise. */
  angle: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** Index into the emitter's tile grid, row-major from the top left. */
  frame: number;
};

export type EmitterRun = {
  def: EmoteEmitter;
  particles: Particle[];
};

export type EmoteRun = {
  emitters: EmitterRun[];
  /** Advance every emitter by `dt` seconds of scene time. */
  advance: (dt: number) => void;
  /** True once every emitter has stopped and its last particle has died. */
  finished: () => boolean;
};

type Live = Particle & {
  age: number;
  lifetime: number;
  /** Velocity from `startSpeed` and the spawn direction, particle units/s. */
  vx: number;
  vy: number;
  /** Integrated force and gravity, particle units/s. */
  ax: number;
  ay: number;
  size0: number;
  sizeY0: number;
  spin: number;
  frame0: number;
  color0: [number, number, number, number];
  /** One roll per random-valued property, drawn at birth and kept for life. */
  rolls: number[];
};

// Property slots in `Live.rolls`. A Unity particle keeps the same lerp factor
// for the whole of its life, so a roll is drawn once and reused.
const ROLL_LIFETIME = 0;
const ROLL_SPEED = 1;
const ROLL_SIZE = 2;
const ROLL_ROTATION = 3;
const ROLL_COLOR = 4;
const ROLL_SIZE_OL = 5;
const ROLL_COLOR_OL = 6;
const ROLL_VELOCITY = 7;
const ROLL_SPIN = 8;
const ROLL_FORCE = 9;
const ROLL_FRAME = 10;
const ROLL_GRAVITY = 11;
const ROLLS = 12;

// Unity's own gravity constant: `gravityModifier` scales it.
const GRAVITY = 9.81;
const DEG = Math.PI / 180;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** `mulberry32` — small, seedable, and good enough for particle jitter. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An `AnimationCurve`, evaluated the way Unity does: cubic Hermite between
 * keys, clamped outside the first and last, and stepped across a segment whose
 * tangent is infinite. No key in the emote set is weighted, so the tangents are
 * the whole story. */
function curveAt(keys: EmoteCurve['k'], time: number): number {
  if (!keys || !keys.length) return 0;
  if (keys.length === 1) return keys[0][1];
  if (time <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (time >= last[0]) return last[1];
  let index = 0;
  while (index < keys.length - 2 && keys[index + 1][0] <= time) index += 1;
  const [t0, v0, , out0] = keys[index];
  const [t1, v1, in1] = keys[index + 1];
  const span = t1 - t0;
  if (span <= 0) return v1;
  if (out0 === null || in1 === null) return v0;
  const u = (time - t0) / span;
  const uu = u * u;
  const uuu = uu * u;
  return (2 * uuu - 3 * uu + 1) * v0
    + (uuu - 2 * uu + u) * out0 * span
    + (-2 * uuu + 3 * uu) * v1
    + (uuu - uu) * in1 * span;
}

/** A `MinMaxCurve` at normalised time `t`, with the particle's stored roll. */
export function valueAt(curve: EmoteCurve | undefined, t: number, roll: number): number {
  if (!curve) return 0;
  switch (curve.m) {
    case 1:
      return curveAt(curve.k, t) * curve.s;
    case 2:
      return lerp(curveAt(curve.j, t), curveAt(curve.k, t), roll) * curve.s;
    case 3:
      return lerp(curve.n ?? curve.s, curve.s, roll);
    default:
      return curve.s;
  }
}

type Rgba = [number, number, number, number];

/** A `Gradient` at `t`. Colour and alpha are keyed independently; mode 1 is a
 * step gradient, so a key holds until the next one. */
function gradientAt(stops: EmoteGradientStops | undefined, t: number): Rgba {
  if (!stops) return [1, 1, 1, 1];
  const step = stops.f === 1;
  const out: Rgba = [1, 1, 1, 1];
  const colors = stops.c;
  if (colors.length) {
    let index = 0;
    while (index < colors.length - 1 && colors[index + 1][0] <= t) index += 1;
    const key = colors[index];
    const next = colors[Math.min(index + 1, colors.length - 1)];
    const span = next[0] - key[0];
    const u = step || span <= 0 ? 0 : clamp01((t - key[0]) / span);
    out[0] = lerp(key[1], next[1], u);
    out[1] = lerp(key[2], next[2], u);
    out[2] = lerp(key[3], next[3], u);
  }
  const alphas = stops.a;
  if (alphas.length) {
    let index = 0;
    while (index < alphas.length - 1 && alphas[index + 1][0] <= t) index += 1;
    const key = alphas[index];
    const next = alphas[Math.min(index + 1, alphas.length - 1)];
    const span = next[0] - key[0];
    const u = step || span <= 0 ? 0 : clamp01((t - key[0]) / span);
    out[3] = lerp(key[1], next[1], u);
  }
  return out;
}

/** A `MinMaxGradient` at `t`. Mode 4 samples one gradient at a fixed random
 * point, which is why the roll and not `t` is the lookup. */
export function colorAt(gradient: EmoteGradient | undefined, t: number, roll: number): Rgba {
  if (!gradient) return [1, 1, 1, 1];
  switch (gradient.m) {
    case 1:
      return gradientAt(gradient.g, t);
    case 2: {
      const min = gradient.d ?? [1, 1, 1, 1];
      const max = gradient.c ?? [1, 1, 1, 1];
      return [lerp(min[0], max[0], roll), lerp(min[1], max[1], roll),
        lerp(min[2], max[2], roll), lerp(min[3], max[3], roll)];
    }
    case 3: {
      const min = gradientAt(gradient.h, t);
      const max = gradientAt(gradient.g, t);
      return [lerp(min[0], max[0], roll), lerp(min[1], max[1], roll),
        lerp(min[2], max[2], roll), lerp(min[3], max[3], roll)];
    }
    case 4:
      return gradientAt(gradient.g, roll);
    default:
      return gradient.c ?? [1, 1, 1, 1];
  }
}

/**
 * Where a particle starts and which way it leaves, in the emitter's space.
 *
 * `Circle` places it on a disc between `radius * (1 - radiusThickness)` and
 * `radius`, area-uniform, and sends it radially outward. `SingleSidedEdge` is a
 * line of that length along the shape's x axis, emitting along its y.
 * `arcMode` 3 spreads one burst evenly over the arc instead of sampling it.
 */
function spawnPoint(def: EmoteEmitter, index: number, count: number,
                    roll: () => number): [number, number, number, number] {
  const shape = def.shape;
  if (!shape) return [0, 0, 0, 1];
  const base = shape.rotation * DEG;
  const arc = shape.arc * DEG;
  const spread = shape.arcMode === 3 && count > 1 ? index / count : roll();
  const theta = base + arc * spread;
  let x: number;
  let y: number;
  let dx: number;
  let dy: number;
  if (shape.type === 12) {
    const along = (spread - 0.5) * 2 * shape.radius;
    x = Math.cos(base) * along;
    y = Math.sin(base) * along;
    dx = -Math.sin(base);
    dy = Math.cos(base);
  } else {
    const inner = 1 - clamp01(shape.radiusThickness);
    const radius = shape.radius
      * Math.sqrt(lerp(inner * inner, 1, roll()));
    x = Math.cos(theta) * radius;
    y = Math.sin(theta) * radius;
    dx = Math.cos(theta);
    dy = Math.sin(theta);
  }
  const random = clamp01(shape.randomDirection);
  if (random > 0) {
    const angle = roll() * Math.PI * 2;
    dx = lerp(dx, Math.cos(angle), random);
    dy = lerp(dy, Math.sin(angle), random);
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
  }
  return [x + shape.position[0], y + shape.position[1], dx, dy];
}

function createEmitter(def: EmoteEmitter, seed: number) {
  const roll = random(seed);
  const live: Live[] = [];
  const out: Particle[] = [];
  const delay = valueAt(def.startDelay, 0, roll());
  const tiles = Math.max(1, def.tiles[0] * def.tiles[1]);
  const turn = def.angle * DEG;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  let time = -delay;
  // Emission is per burst cycle; a cycle fires the first time the emitter's
  // clock reaches it, which is what makes a burst schedule frame-rate free.
  const fired = new Set<string>();

  const spawn = (index: number, count: number, at: number) => {
    if (live.length >= def.maxParticles) return;
    const rolls: number[] = [];
    for (let i = 0; i < ROLLS; i += 1) rolls.push(roll());
    const t01 = def.duration > 0 ? clamp01(at / def.duration) : 0;
    const [x, y, dx, dy] = spawnPoint(def, index, count, roll);
    const speed = valueAt(def.start.speed, t01, rolls[ROLL_SPEED]);
    const size = valueAt(def.start.size, t01, rolls[ROLL_SIZE]);
    const sizeY = def.start.sizeY
      ? valueAt(def.start.sizeY, t01, rolls[ROLL_SIZE]) : size;
    const color = colorAt(def.start.color, t01, rolls[ROLL_COLOR]);
    // The emitter's own transform: its offset and rotation place the whole
    // spray, which is how `gogo`'s six letters are set side by side.
    const px = def.position[0] + (x * cos - y * sin) * def.scale[0];
    const py = def.position[1] + (x * sin + y * cos) * def.scale[1];
    const flip = def.start.flipRotation > 0 && roll() < def.start.flipRotation
      ? -1 : 1;
    live.push({
      x: px,
      y: py,
      age: 0,
      lifetime: Math.max(0.0001, valueAt(def.start.lifetime, t01, rolls[ROLL_LIFETIME])),
      vx: (dx * cos - dy * sin) * speed,
      vy: (dx * sin + dy * cos) * speed,
      ax: 0,
      ay: 0,
      size: size,
      sizeY: sizeY,
      size0: size,
      sizeY0: sizeY,
      angle: valueAt(def.start.rotation, t01, rolls[ROLL_ROTATION]) * flip
        + (def.shape?.alignToDirection ? Math.atan2(dy, dx) : 0) + turn,
      spin: flip,
      r: color[0],
      g: color[1],
      b: color[2],
      a: color[3],
      color0: color,
      frame: 0,
      frame0: def.uv ? valueAt(def.uv.startFrame, t01, rolls[ROLL_FRAME]) : 0,
      rolls,
    });
  };

  const emit = (from: number, to: number) => {
    const emission = def.emission;
    if (!emission) return;
    const span = def.looping ? def.duration : Infinity;
    emission.bursts.forEach((burst, bi) => {
      for (let cycle = 0; cycle < Math.max(1, burst.cycles); cycle += 1) {
        const at = burst.t + cycle * burst.interval;
        if (at > def.duration) break;
        const key = `${bi}:${cycle}`;
        if (fired.has(key) || at < from || at > to || at > span) continue;
        fired.add(key);
        if (burst.probability < 1 && roll() > burst.probability) continue;
        const t01 = def.duration > 0 ? clamp01(at / def.duration) : 0;
        const count = Math.round(valueAt(burst.n, t01, roll()));
        for (let i = 0; i < count; i += 1) spawn(i, count, at);
      }
    });
    // No emote emitter authors a rate, but a rate is what a system with no
    // bursts would use, so it is emitted rather than silently dropped.
    const rate = valueAt(emission.rate, def.duration > 0
      ? clamp01(to / def.duration) : 0, 0.5);
    if (rate > 0 && to <= def.duration) {
      const count = Math.floor(rate * (to - from));
      for (let i = 0; i < count; i += 1) spawn(i, count, to);
    }
  };

  const advance = (dt: number) => {
    const step = dt * def.simulationSpeed;
    const from = time;
    time += step;
    if (time >= 0) emit(Math.max(0, from), time);

    out.length = 0;
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const p = live[i];
      p.age += step;
      if (p.age >= p.lifetime) {
        live.splice(i, 1);
        continue;
      }
      const t = clamp01(p.age / p.lifetime);

      // Velocity over lifetime adds to the spawn velocity; forces and gravity
      // integrate into their own accumulator, exactly as they stack in Unity.
      let vx = p.vx;
      let vy = p.vy;
      if (def.velocity) {
        // The module's axes are the emitter's own unless it asks for world
        // space, so a rotated emitter rotates its authored velocity with it.
        const mx = valueAt(def.velocity.x, t, p.rolls[ROLL_VELOCITY]);
        const my = valueAt(def.velocity.y, t, p.rolls[ROLL_VELOCITY]);
        vx += def.velocity.inWorldSpace ? mx : mx * cos - my * sin;
        vy += def.velocity.inWorldSpace ? my : mx * sin + my * cos;
        const radial = valueAt(def.velocity.radial, t, p.rolls[ROLL_VELOCITY]);
        if (radial !== 0) {
          const dx = p.x - def.position[0];
          const dy = p.y - def.position[1];
          const length = Math.hypot(dx, dy);
          if (length > 0) {
            vx += (dx / length) * radial;
            vy += (dy / length) * radial;
          }
        }
        const modifier = valueAt(def.velocity.speedModifier, t, p.rolls[ROLL_VELOCITY]);
        vx *= modifier;
        vy *= modifier;
      }
      if (def.force) {
        p.ax += valueAt(def.force.x, t, p.rolls[ROLL_FORCE]) * step;
        p.ay += valueAt(def.force.y, t, p.rolls[ROLL_FORCE]) * step;
      }
      const gravity = valueAt(def.start.gravity, t, p.rolls[ROLL_GRAVITY]);
      if (gravity !== 0) p.ay -= gravity * GRAVITY * step;
      p.x += (vx + p.ax) * step;
      p.y += (vy + p.ay) * step;

      if (def.size) {
        const scale = valueAt(def.size.curve, t, p.rolls[ROLL_SIZE_OL]);
        p.size = p.size0 * scale;
        p.sizeY = p.sizeY0 * (def.size.separateAxes
          ? valueAt(def.size.y, t, p.rolls[ROLL_SIZE_OL]) : scale);
      }
      if (def.spin) {
        p.angle += valueAt(def.spin.curve, t, p.rolls[ROLL_SPIN]) * p.spin * step;
      }
      if (def.color) {
        const tint = colorAt(def.color.gradient, t, p.rolls[ROLL_COLOR_OL]);
        p.r = p.color0[0] * tint[0];
        p.g = p.color0[1] * tint[1];
        p.b = p.color0[2] * tint[2];
        p.a = p.color0[3] * tint[3];
      }
      if (def.uv) {
        const value = valueAt(def.uv.frame, t, p.rolls[ROLL_FRAME]) * def.uv.cycles;
        const index = Math.floor((p.frame0 + value) * tiles);
        p.frame = ((index % tiles) + tiles) % tiles;
      }
      out.push(p);
    }
  };

  return {
    def,
    particles: out,
    advance,
    // The system is spent when its clock has passed the authored length and
    // every particle it emitted has died.
    finished: () => !def.looping && time > def.duration && live.length === 0,
  };
}

/** Start one emote: every emitter of the prefab, from a fresh random seed. */
export function createEmoteRun(defs: EmoteEmitter[], seed: number): EmoteRun {
  const emitters = defs.map((def, index) => createEmitter(def, seed + index * 7919));
  return {
    emitters,
    advance: (dt) => { for (const emitter of emitters) emitter.advance(dt); },
    finished: () => emitters.every((emitter) => emitter.finished()),
  };
}
