import type { SdCharacter } from '@/lib/data';

type Bounds = { x: number; y: number; width: number; height: number };
type Screen = { width: number; height: number };
type Shake = NonNullable<SdCharacter['cutin']>['shakes'][number];


export function frameBounds(screen: Screen, bounds: Bounds, padding = 0.92) {
  const scale = Math.min(
    screen.width * padding / Math.max(bounds.width, 0.01),
    screen.height * padding / Math.max(bounds.height, 0.01),
  );
  return {
    scale,
    x: screen.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: screen.height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

function curveValue(shake: Shake, time: number) {
  const keys = shake.curve ?? [];
  if (!keys.length) return 1;
  if (time <= keys[0].time) return keys[0].value;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index];
    const right = keys[index + 1];
    if (time > right.time) continue;
    const span = right.time - left.time;
    const ratio = span > 0 ? (time - left.time) / span : 1;
    return left.value + (right.value - left.value) * ratio;
  }
  return keys[keys.length - 1].value;
}

export function shakeOffset(shakes: Shake[], time: number) {
  const shake = shakes.find(
    (candidate) => time >= candidate.start
      && time < candidate.start + candidate.duration);
  if (!shake) return { x: 0, y: 0 };
  const elapsed = time - shake.start;
  const normal = shake.duration > 0 ? elapsed / shake.duration : 0;
  const envelope = shake.useCurve ? curveValue(shake, normal) : 1;
  const amplitude = (shake.minAmplitude
    + (shake.maxAmplitude - shake.minAmplitude) * envelope);
  const phase = elapsed * Math.max(shake.frequency, 1) * Math.PI * 2;
  return {
    x: Math.sin(phase) * amplitude,
    y: Math.sin(phase * 1.37 + 1.9) * amplitude,
  };
}
