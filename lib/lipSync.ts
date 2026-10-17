// Port of the game's AffectionLipSyncController clip analysis; the envelope drives the mouth track's alpha.

const WINDOW = 1024;
const HOP = 256;
const EPSILON = 1e-4;

export type LipAnalysis = { total: number; hop: number; envelope: Float32Array };

const clamp01 = (v: number) => (v > 1 ? 1 : v < 0 || Number.isNaN(v) ? 0 : v);

function windowCount(total: number): number {
  if (total < 1) return 0;
  if (total <= WINDOW) return 1;
  return Math.ceil((total - WINDOW) / HOP) + 1;
}

function rms(mono: Float32Array, total: number, windows: number): Float32Array {
  const out = new Float32Array(windows);
  for (let i = 0; i < windows; i++) {
    const start = HOP * i;
    const end = Math.min(start + WINDOW, total);
    let sum = 0;
    for (let f = start; f < end; f++) sum += mono[f] * mono[f];
    out[i] = Math.sqrt(sum / Math.max(end - start, 1));
  }
  return out;
}

function sortedAbove(values: Float32Array): Float32Array {
  return Float32Array.from(values.filter((v) => v > EPSILON)).sort();
}

function normalizeInPlace(values: Float32Array): void {
  const sorted = sortedAbove(values);
  if (!sorted.length) return;
  const at = Math.min(Math.max(Math.ceil((sorted.length - 1) * 0.97), 0), sorted.length - 1);
  const ref = Math.max(sorted[at], EPSILON);
  for (let i = 0; i < values.length; i++) values[i] = clamp01(values[i] / ref);
}

function smooth(source: Float32Array, radius: number): Float32Array {
  if (radius < 1 || !source.length) return source.slice();
  const n = source.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(i - radius, 0);
    const hi = Math.min(n - 1, i + radius);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += source[k];
    out[i] = hi >= lo ? sum / (hi - lo + 1) : 0;
  }
  return out;
}

function percentileNonZero(values: Float32Array, percentile: number): number {
  const sorted = sortedAbove(values.map(Math.abs));
  if (!sorted.length) return 0;
  const pos = clamp01(percentile) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + clamp01(pos - lo) * (sorted[hi] - sorted[lo]);
}

function sampleAt(values: Float32Array, x: number): number {
  if (!values.length) return 0;
  const last = values.length - 1;
  const i0 = Math.min(Math.max(Math.floor(x), 0), last);
  const i1 = Math.min(i0 + 1, last);
  return values[i0] + clamp01(x - i0) * (values[i1] - values[i0]);
}

function compose(
  source: Float32Array, medium: Float32Array, base: Float32Array, mediumThreshold: number, fineThreshold: number,
): Float32Array {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const t = clamp01((source[i] - 0.1) / 0.55);
    const energy = t * t * (3 - 2 * t);
    const mediumDiff = medium[i] - base[i];
    const fineDiff = source[i] - medium[i];
    const mediumExcess = Math.max(Math.abs(mediumDiff) - mediumThreshold * (1.3 - 0.25 * energy), 0);
    const fineExcess = Math.max(Math.abs(fineDiff) - fineThreshold * (1.65 - 0.45 * energy), 0);
    out[i] = clamp01(base[i] + Math.sign(mediumDiff) * mediumExcess * 0.82 + Math.sign(fineDiff) * fineExcess * 0.22);
  }
  return out;
}

function lastPeakStretchInPlace(values: Float32Array): void {
  const n = values.length;
  if (n < 4) return;
  let peak = -1;
  for (let i = n - 2; i >= 1; i--) {
    if (values[i] >= 0.18 && values[i] >= values[i - 1] && values[i] >= values[i + 1]) { peak = i; break; }
  }
  if (peak < 0 || peak >= n - 1) return;
  const peakValue = values[peak];
  const floor = Math.max(peakValue * 0.05, 0.02);
  let tail = n - 1;
  for (let i = n - 1; i > peak; i--) {
    if (values[i] >= floor) { tail = i; break; }
  }
  if (tail - peak < 2 || peakValue - values[tail] < 0.04) return;
  const end = Math.min(n - 1, tail + 180);
  if (end <= tail) return;
  const span = end - peak;
  const copy = values.slice();
  for (let k = 1; k <= span; k++) {
    const index = peak + k;
    const stretched = sampleAt(copy, peak + (tail - peak) * Math.min((k / span) ** 2, 1));
    if (index <= tail) {
      values[index] = stretched;
      continue;
    }
    const w = tail === end ? 0 : clamp01((index - tail) / (end - tail));
    const ease = clamp01(w * w * w * (w * (w * 6 - 15) + 10));
    values[index] = stretched + ease * (copy[index] - stretched);
  }
}

export function analyzeLipSync(channels: Float32Array[], total: number): LipAnalysis | null {
  const windows = windowCount(total);
  if (!channels.length || windows < 1) return null;
  const mono = new Float32Array(total);
  for (const data of channels) for (let f = 0; f < total; f++) mono[f] += data[f];
  for (let f = 0; f < total; f++) mono[f] /= channels.length;

  const raw = rms(mono, total, windows);
  normalizeInPlace(raw);
  for (let i = 0; i < raw.length; i++) raw[i] = clamp01(raw[i] / 0.6);
  const source = smooth(raw, 1).map(clamp01);
  const medium = smooth(source, 2);
  const base = smooth(source, 3);
  const mediumDetail = medium.map((v, i) => v - base[i]);
  const fineDetail = source.map((v, i) => v - medium[i]);
  const mediumThreshold = Math.max(percentileNonZero(mediumDetail, 0.78), 0.015);
  const fineThreshold = Math.max(percentileNonZero(fineDetail, 0.8), 0.01);

  let envelope: Float32Array;
  if (source.length === 1) {
    envelope = source.slice();
  } else {
    envelope = smooth(compose(source, medium, base, mediumThreshold, fineThreshold), 8);
    lastPeakStretchInPlace(envelope);
  }
  return { total, hop: HOP, envelope: envelope.map(clamp01) };
}

export function sampleLipSync(analysis: LipAnalysis, frame: number): number {
  const { envelope } = analysis;
  if (frame < 0 || !envelope.length || frame >= analysis.total) return 0;
  if (envelope.length === 1) return envelope[0];
  return sampleAt(envelope, frame / analysis.hop);
}
