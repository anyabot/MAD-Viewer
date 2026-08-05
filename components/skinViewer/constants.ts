// Nothing here touches Pixi, Spine or React state, so both the viewer and its
// control surface can import it.
import type { SelectOption } from '@/components/skinViewer/chrome';

export const EFFECT_COLOR: Record<string, number> = {
  reaction: 0xff4444,
  region: 0xffaa33,
  physics: 0x44dd88,
  generic: 0x4488ff,
};

export const EFFECT_LABEL: Record<string, string> = {
  reaction: 'reaction clip',
  region: 'region clip',
  physics: 'jiggle only — no animation',
  generic: 'generic touch',
  // Home-screen outcomes.
  touch: 'variation touch clip',
  jiggle: 'jiggle only',
  // Scenario-driven outcomes.
  state: 'state change only — no clip',
  inert: 'nothing armed here yet',
};

// The Free play lanes only: driven playback puts a clip on the track its own
// name declares, via `spineTrack`.
export const TRACK_BODY = 0;
export const TRACK_FACE = 1;
export const TRACK_OVERLAY = 2;

// This composition uses the widest authored CutsceneOffset key even when the
// viewer panel itself is narrower than the game's long-screen presentation.
export const WIDE_CUTSCENE_STAGING_SKINS = new Set(['ds_ch0022']);

// World width the game's camera frames at `cam` scale 1, in skeleton units.
// Only the width is fixed; the height is this over the display aspect.
export const REFERENCE_VIEW_WIDTH = 3840;

// The same factor drives the Spine clock, the idle timers and the voice.
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.5, 2, 3, 4].map((rate) => ({
  value: String(rate),
  label: `${rate}x`,
  hint: rate === 1 ? 'authored speed' : undefined,
}));

// Seconds after a lobby line is staged during which a touch is refused, so a
// double-tap does not restage the same line twice.
export const TOUCH_INTERRUPT_DELAY = 0.5;

// Particle units -> skeleton units for an emote. A prefab authors only the
// ratios inside itself, so this sets the absolute size: chosen so an emote
// reads as a bubble over the head rather than across the body.
export const EMOTE_UNIT_SCALE = 4;

// The minimum GL_MAX_TEXTURE_SIZE the WebGL2 baseline guarantees.
export const MAX_EXPORT_DIM = 16384;

// Position in the sorted per-attachment source-pixel scales.
export const EXPORT_SCALE_PERCENTILE = 0.1;

// Affections namespace with "/" (lobby/idle); standings use a numeric prefix
// ("00_idle_normal", "01_anger").
export function animGroup(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0) return name.slice(0, slash);
  const m = /^(\d+)_/.exec(name);
  return m ? m[1] : '';
}

const FACE_GROUPS = new Set(['01', 'mouth']);

export function isFaceAnim(name: string): boolean {
  return FACE_GROUPS.has(animGroup(name));
}

// "01_anger" -> "anger".
export function animLabel(name: string): string {
  return name.replace(/^\d+_/, '').replace(/^[^/]+\//, '');
}

// Shoelace area of a flat [x,y,...] polygon, which picks the most specific
// touch region when several overlap.
export function polygonArea(verts: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < verts.length; i += 2) {
    const j = (i + 2) % verts.length;
    sum += verts[i] * verts[j + 1] - verts[j] * verts[i + 1];
  }
  return Math.abs(sum) / 2;
}

export function pickDefault(names: string[], preferred?: string): string {
  if (preferred && names.includes(preferred)) return preferred;
  return names[0] ?? '';
}

// Filed under the animation group, by a stable sort since `animations` arrives
// in skeleton order. A rig with one group gets no headings.
export function groupedOptions(names: string[]): SelectOption[] {
  const groups = Array.from(new Set(names.map(animGroup)));
  const showGroup = groups.length > 1;
  const order = new Map(groups.map((g, i) => [g, i]));
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (showGroup
      ? (order.get(animGroup(a.n))! - order.get(animGroup(b.n))!) || (a.i - b.i)
      : a.i - b.i))
    .map(({ n }) => ({
      value: n,
      label: animLabel(n),
      group: showGroup && animGroup(n) ? animGroup(n) : undefined,
    }));
}
