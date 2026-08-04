// Viewer constants and the pure name/geometry helpers built on them. Nothing
// here touches Pixi, Spine or React state, so it is safe to import from both
// the viewer and its control surface.
import type { SelectOption } from '@/components/skinViewer/chrome';

// Overlay colour per resolved touch effect: a dedicated reaction clip, a
// physics-only jiggle target, a region clip, or the generic phase reaction.
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

// Driven playback puts every clip on the track its own name declares
// (`spineTrack`), which is what the client does. These are the Free play lanes,
// where the user picks a body/face/overlay clip by hand, and the fallback face
// lane for a face clip whose name carries no track number (`mouth/*`).
export const TRACK_BODY = 0;
export const TRACK_FACE = 1;
export const TRACK_OVERLAY = 2;

// This composition uses the widest authored CutsceneOffset key even when the
// viewer panel itself is narrower than the game's long-screen presentation.
export const WIDE_CUTSCENE_STAGING_SKINS = new Set(['ds_ch0022']);

// World width the game's camera frames at `cam` scale 1, in skeleton units.
// Only the width is fixed; the view height is this width over the display
// aspect ratio.
export const REFERENCE_VIEW_WIDTH = 3840;

// Playback rates the speed control offers. 1x is the authored speed; the same
// factor drives the Spine clock, the idle timers and the voice.
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.5, 2, 3, 4].map((rate) => ({
  value: String(rate),
  label: `${rate}x`,
  hint: rate === 1 ? 'authored speed' : undefined,
}));

// A lobby touch takes over the reaction it lands on. Only one arriving less
// than this many seconds after the current line was staged is refused, so a
// double-tap does not restage the same line twice.
export const TOUCH_INTERRUPT_DELAY = 0.5;

// Particle units -> skeleton units for an emote. Only the ratios inside a
// prefab are authored (`startSize`, the emitter offsets, the shape radii); the
// factor that turns them into skeleton units is applied by the game's spawn
// code, so this sets the absolute size — chosen so an emote reads as a bubble
// over the head rather than across the body.
export const EMOTE_UNIT_SCALE = 4;

// Largest render-texture dimension a saved PNG may use — the minimum
// GL_MAX_TEXTURE_SIZE guaranteed by the WebGL2 baseline.
export const MAX_EXPORT_DIM = 16384;

// Position in the sorted per-attachment source-pixel scales that sets the PNG
// export resolution. See the reduction in the Pixi build effect.
export const EXPORT_SCALE_PERCENTILE = 0.1;

// Animation-name grouping. Affections namespace with "/" (lobby/idle);
// standings use a numeric prefix ("00_idle_normal", "01_anger").
export function animGroup(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0) return name.slice(0, slash);
  const m = /^(\d+)_/.exec(name);
  return m ? m[1] : '';
}

// Group names that hold face-only animations, played on track 1 over the body.
const FACE_GROUPS = new Set(['01', 'mouth']);

export function isFaceAnim(name: string): boolean {
  return FACE_GROUPS.has(animGroup(name));
}

// Strip the group prefix for display ("01_anger" -> "anger").
export function animLabel(name: string): string {
  return name.replace(/^\d+_/, '').replace(/^[^/]+\//, '');
}

// Shoelace area of a flat [x,y,...] polygon, used to pick the smallest (most
// specific) touch region when several overlap.
export function polygonArea(verts: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < verts.length; i += 2) {
    const j = (i + 2) % verts.length;
    sum += verts[i] * verts[j + 1] - verts[j] * verts[i + 1];
  }
  return Math.abs(sum) / 2;
}

// Prefer the prefab's declared idle clip, else the first entry.
export function pickDefault(names: string[], preferred?: string): string {
  if (preferred && names.includes(preferred)) return preferred;
  return names[0] ?? '';
}

// Dropdown entries filed under their animation group, so a rig with several
// namespaces (`lobby/`, `basic/`, `reaction/`) reads as sections rather than a
// flat list. A rig with one group gets no headings. The list is grouped by a
// stable sort, since `animations` arrives in skeleton order.
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
