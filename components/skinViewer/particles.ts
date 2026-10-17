// A Unity `ParticleSystem`, replayed. Touches no Pixi, DOM or Spine: positions
// and sizes come out in the emitter's own particle units for the caller to
// convert. The modules covered are the ones the emote prefabs enable.
//
// Not modelled: trail emitters, whose renderer draws no billboard and which are
// therefore not exported, and velocity-aligned billboards, which every emitter
// asking for one starts at zero speed.
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
  sizeZ: number;
  /** Radians, counter-clockwise. */
  angle: number;
  // 3D start rotation; zero unless the emitter authors one
  angleX: number;
  angleY: number;
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

/** Unity's evaluation: cubic Hermite between keys, clamped outside the first
 * and last, and stepped across a segment whose tangent is infinite. */
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
 * `Circle` places the particle on a disc between `radius * (1 -
 * radiusThickness)` and `radius`, area-uniform, leaving radially.
 * `SingleSidedEdge` is a line of that length along the shape's x axis, emitting
 * along its y. `arcMode` 3 spreads one burst evenly instead of sampling it.
 */
type Vec3 = [number, number, number];

// `Quaternion.Euler`: Z, then X, then Y.
function rotateEuler(v: Vec3, degrees: Vec3): Vec3 {
  let [x, y, z] = v;
  let c = Math.cos(degrees[2] * DEG);
  let s = Math.sin(degrees[2] * DEG);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(degrees[0] * DEG);
  s = Math.sin(degrees[0] * DEG);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(degrees[1] * DEG);
  s = Math.sin(degrees[1] * DEG);
  [x, z] = [x * c + z * s, z * c - x * s];
  return [x, y, z];
}

function unitSphere(roll: () => number): Vec3 {
  const u = roll() * 2 - 1;
  const phi = roll() * Math.PI * 2;
  const ring = Math.sqrt(1 - u * u);
  return [ring * Math.cos(phi), ring * Math.sin(phi), u];
}

// Spawn point and direction in shape space, then the module's scale, rotation and position; z is dropped.
function spawnPoint(def: EmoteEmitter, index: number, count: number,
                    roll: () => number): [number, number, number, number] {
  const shape = def.shape;
  if (!shape) return [0, 0, 0, 1];
  const spread = shape.arcMode === 3 && count > 1 ? index / count : roll();
  const theta = shape.arc * DEG * spread;
  const inner = 1 - clamp01(shape.radiusThickness);
  const fraction = () => Math.sqrt(lerp(inner * inner, 1, roll()));
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  let p: Vec3;
  let d: Vec3;
  switch (shape.type) {
    case 12: {
      const along = (spread - 0.5) * 2 * shape.radius;
      p = [along, 0, 0];
      d = [0, 1, 0];
      break;
    }
    case 18:
      p = [roll() - 0.5, roll() - 0.5, 0];
      d = [0, 0, 1];
      break;
    case 5:
      p = [roll() - 0.5, roll() - 0.5, roll() - 0.5];
      d = [0, 0, 1];
      break;
    case 15: {
      p = [roll() - 0.5, roll() - 0.5, roll() - 0.5];
      p[Math.floor(roll() * 3) % 3] = roll() < 0.5 ? -0.5 : 0.5;
      d = [0, 0, 1];
      break;
    }
    case 16: {
      const free = Math.floor(roll() * 3) % 3;
      p = [roll() < 0.5 ? -0.5 : 0.5, roll() < 0.5 ? -0.5 : 0.5, roll() < 0.5 ? -0.5 : 0.5];
      p[free] = roll() - 0.5;
      d = [0, 0, 1];
      break;
    }
    case 0:
    case 2: {
      d = unitSphere(roll);
      if (shape.type === 2) d[2] = Math.abs(d[2]);
      const r = shape.radius * Math.cbrt(lerp(inner * inner * inner, 1, roll()));
      p = [d[0] * r, d[1] * r, d[2] * r];
      break;
    }
    case 4:
    case 7:
    case 8:
    case 9: {
      const f = shape.type === 7 || shape.type === 9 ? 1 : fraction();
      const tilt = Math.tan((shape.angle ?? 25) * DEG) * f;
      const toward: Vec3 = [tilt * cosT, tilt * sinT, 1];
      p = [shape.radius * f * cosT, shape.radius * f * sinT, 0];
      if (shape.type === 8 || shape.type === 9) {
        const t = (shape.length ?? 5) * roll();
        p = [p[0] + toward[0] * t, p[1] + toward[1] * t, toward[2] * t];
      }
      const length = Math.hypot(...toward);
      d = [toward[0] / length, toward[1] / length, toward[2] / length];
      break;
    }
    case 17: {
      const tube = (shape.donutRadius ?? 0.2) * fraction();
      const phi = roll() * Math.PI * 2;
      d = [cosT * Math.cos(phi), sinT * Math.cos(phi), Math.sin(phi)];
      p = [cosT * shape.radius + d[0] * tube, sinT * shape.radius + d[1] * tube, d[2] * tube];
      break;
    }
    default: {
      const r = shape.type === 11 ? shape.radius : shape.radius * fraction();
      p = [cosT * r, sinT * r, 0];
      d = [cosT, sinT, 0];
    }
  }
  const [sx, sy, sz] = shape.scale ?? [1, 1, 1];
  p = [p[0] * sx, p[1] * sy, p[2] * sz];
  const rotation: Vec3 = shape.rotation3 ?? [0, 0, shape.rotation];
  p = rotateEuler(p, rotation);
  d = rotateEuler(d, rotation);
  const random = clamp01(shape.randomDirection);
  if (random > 0) {
    const other = unitSphere(roll);
    d = [lerp(d[0], other[0], random), lerp(d[1], other[1], random), lerp(d[2], other[2], random)];
    const length = Math.hypot(...d) || 1;
    d = [d[0] / length, d[1] / length, d[2] / length];
  }
  return [p[0] + shape.position[0], p[1] + shape.position[1], d[0], d[1]];
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
  // Rate emission below one particle per frame accumulates instead of rounding to zero.
  let carry = 0;

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
    // The emitter's own offset and rotation place the whole spray.
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
      sizeZ: def.start.sizeZ ? valueAt(def.start.sizeZ, t01, rolls[ROLL_SIZE]) : size,
      angleX: def.start.rotationX ? valueAt(def.start.rotationX, t01, rolls[ROLL_ROTATION]) : 0,
      angleY: def.start.rotationY ? valueAt(def.start.rotationY, t01, rolls[ROLL_ROTATION]) : 0,
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
    emission.bursts.forEach((burst, bi) => {
      for (let cycle = 0; cycle < Math.max(1, burst.cycles); cycle += 1) {
        const at = burst.t + cycle * burst.interval;
        if (at > def.duration) break;
        const key = `${bi}:${cycle}`;
        if (fired.has(key) || at < from || at > to) continue;
        fired.add(key);
        if (burst.probability < 1 && roll() > burst.probability) continue;
        const t01 = def.duration > 0 ? clamp01(at / def.duration) : 0;
        const count = Math.round(valueAt(burst.n, t01, roll()));
        for (let i = 0; i < count; i += 1) spawn(i, count, at);
      }
    });
    const rate = valueAt(emission.rate, def.duration > 0
      ? clamp01(to / def.duration) : 0, 0.5);
    if (rate > 0 && (def.looping || from < def.duration)) {
      carry += rate * Math.max(0, Math.min(to, def.looping ? to : def.duration) - from);
      const count = Math.floor(carry);
      carry -= count;
      for (let i = 0; i < count; i += 1) spawn(i, count, to);
    }
  };

  const advance = (dt: number) => {
    const step = dt * def.simulationSpeed;
    const from = time;
    time += step;
    // A looping system restarts its clock each cycle, so its bursts fire again.
    if (def.looping && def.duration > 0 && time > def.duration) {
      emit(Math.max(0, from), def.duration);
      time -= def.duration;
      fired.clear();
      emit(0, time);
    } else if (time >= 0) {
      emit(Math.max(0, from), time);
    }

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
      // integrate into their own accumulator, as they stack in Unity.
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
    finished: () => !def.looping && time > def.duration && live.length === 0,
  };
}

export function createEmoteRun(defs: EmoteEmitter[], seed: number): EmoteRun {
  const emitters = defs.map((def, index) => createEmitter(def, seed + index * 7919));
  return {
    emitters,
    advance: (dt) => { for (const emitter of emitters) emitter.advance(dt); },
    finished: () => emitters.every((emitter) => emitter.finished()),
  };
}
