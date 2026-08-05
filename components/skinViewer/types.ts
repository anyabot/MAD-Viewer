import type { Jiggler } from './jiggle';

// The prefab's `_actorType`: 0 standing, 1 desire, 2 affection, 3 pleasure.
// The families differ in staging and phase count, not in rendering.
export type SkinKind = 'standing' | 'affection' | 'desire' | 'pleasure';

// OneStore ships the uncensored art, Google Play the censored edit. Standings
// are identical across both; only affection art diverges.
export type StoreKey = 'onestore' | 'google';

export const STORE_KEYS: StoreKey[] = ['onestore', 'google'];

// Variations are alternatives the player picks between, not steps of a sequence.
export type ActorPhase = {
  idle: string | null;
  boring: string | null;
  active: string | null;
};

export type ActorMeta = {
  idle?: string | null;
  boring?: string | null;
  active?: string | null;
  phases?: ActorPhase[];
  faceBone?: string | null;
  mouthBone?: string | null;
  heightType?: number | null;
  /** 0 = standing, 2 = affection. */
  actorType?: number | null;
  pivot?: { x: number; y: number } | null;
  volumeProfiles?: number[];
};

// Resolved at export time; the viewer never infers this from names.
//   physics   springs a `gyro_*` bone; plays no animation
//   reaction  plays a dedicated `reaction/<state>_<CODE>` clip
//   region    plays a region clip (`00_breast_touch`)
//   generic   plays the current phase's `active` clip
// The primary action only: the click and jiggle handlers are independent in
// game, so a region may carry both a `clip` and a `bone`.
export type TouchEffect = 'physics' | 'reaction' | 'region' | 'generic';

export type TouchRegion = {
  box: string;
  code: string;
  side: string | null;
  /** Interaction state the region belongs to; null = live in every phase. */
  state: string | null;
  effect: TouchEffect;
  clip?: string;
  bone?: string;
  /** Attributed by the exporter's escalation inference, not by an exact name
   *  match — the authoritative mapping is server-side. */
  inferred?: boolean;
};

export type TouchMeta = {
  boxes?: string[];
  regions?: TouchRegion[];
  /** Reaction clips no region triggers — selected by server master data. */
  orphanReactions?: string[];
  /** Spring targets, live on the home screen only. */
  jigglers?: Jiggler[];
};

// Spine skin names bucketed by their `group/name` prefix at export time.
export type SkinGroups = {
  base?: string;        // the always-on skin (usually "default")
  faces?: string[];     // mutually exclusive expression skins
  parts?: string[];     // independently toggleable prop/costume skins
  aspects?: string[];   // affection framing skins ("4:3", "16:9", "all")
  defaultFace?: string;
  defaultAspect?: string;
};

export type Layout = {
  skin: string;
  kind: SkinKind;
  character?: string;
  skel: string;
  atlas: string;
  textures?: string[];
  animations?: string[];
  animationGroups?: Record<string, string[]>;
  faceAnimations?: string[];
  skins?: string[];
  skinGroups?: SkinGroups;
  actor?: ActorMeta;
  sequences?: {
    animation: string | null;
    cues: {
      time: number;
      events: {
        type: string | null;
        bone: string | null;
        offset: { x: number; y: number };
        prefab: { guid: string | null; subObject: string | null; subObjectType: string | null };
        ignoreTimeScale: boolean;
        followRotate: boolean;
        followScale: boolean;
      }[];
    }[];
  }[];
  touch?: TouchMeta;
  /** Attachment names each store build has that the other does not. */
  censorship?: { uncensored?: string[]; censored?: string[] };
  events?: string[];
  store?: StoreKey;
  diverged?: boolean;   // a differing counterpart archive exists
  world?: {
    skeleton?: { x: number; y: number; scale: number; dataScale?: number };
    ppu?: number;
    bg?: { name?: string; tex: string; x: number; y: number; w: number; h: number };
    backgrounds?: { name: string; tex: string; x: number; y: number; w: number; h: number }[];
    cutsceneOffsets?: {
      category: { fileId: number; pathId: number };
      samples: {
        aspect: number;
        position: { x: number; y: number };
        rotation: number;
        scale: number;
      }[];
    }[];
    camera?: { verticalFov?: number; nearClip?: number; farClip?: number };
    postProcessors?: {
      type: string | null;
      enabled: boolean;
      tint?: { r: number; g: number; b: number; a: number };
      overlay?: { texture: string; source: string };
      background?: { texture: string; source: string };
    }[];
  };
};

// A diverged skin is packed as two suffixed archives, but the embedded `skin`
// field carries the bare key in both, so the stale-layout guard has to compare
// on this rather than on the archive name.
export function baseSkinKey(skin: string): string {
  return skin.replace(/__(onestore|google)$/, '');
}

// A non-diverged skin has one un-suffixed archive shared by both stores.
export function archiveName(skin: string, store: StoreKey, diverged: boolean): string {
  const base = baseSkinKey(skin);
  return diverged ? `${base}__${store}` : base;
}

// manual | home-screen widget | scenario-driven scene.
export type PlayMode = 'manual' | 'home' | 'scene';

// Not extracted — the real delay lives in the game's C# controller.
export const BORING_DELAY_MS = 10_000;

/** Normalised so every family drives one state machine. */
export function actorPhases(actor: ActorMeta | undefined, animations: string[]): ActorPhase[] {
  const has = (n: string | null | undefined): string | null =>
    n && animations.includes(n) ? n : null;
  const declared = (actor?.phases ?? [])
    .map((p) => ({ idle: has(p.idle), boring: has(p.boring), active: has(p.active) }))
    .filter((p) => p.idle || p.active);
  if (declared.length) return declared;
  const single: ActorPhase = {
    idle: has(actor?.idle),
    boring: has(actor?.boring),
    active: has(actor?.active),
  };
  return single.idle || single.active ? [single] : [];
}

export type StorySequence = { group: string; clips: string[] };

/**
 * A sequence is a group whose clips all end in a number, sorted numerically —
 * a rig mixing `ani_009` with `ani_0010` interleaves the tens into the ones
 * under lexical order. A pleasure rig with no numbered group plays its whole
 * clip list in export order.
 */
export function storySequences(
  layout: Layout,
  isFace: (name: string) => boolean,
): StorySequence[] {
  if (layout.kind !== 'affection' && layout.kind !== 'pleasure') return [];
  const anims = (layout.animations ?? []).filter((a) => !isFace(a));
  const byGroup = new Map<string, string[]>();
  for (const a of anims) {
    const slash = a.indexOf('/');
    const g = slash > 0 ? a.slice(0, slash) : '';
    const list = byGroup.get(g);
    if (list) list.push(a);
    else byGroup.set(g, [a]);
  }
  const suffix = (name: string): number | null => {
    const m = /(\d+)$/.exec(name);
    return m ? parseInt(m[1], 10) : null;
  };
  const out: StorySequence[] = [];
  for (const [group, clips] of byGroup) {
    if (!group || clips.length < 2) continue;
    const nums = clips.map(suffix);
    if (nums.some((n) => n === null)) continue;
    const ordered = clips.slice()
      .sort((a, b) => (suffix(a) ?? 0) - (suffix(b) ?? 0));
    out.push({ group, clips: ordered });
  }
  if (!out.length && anims.length > 1) {
    out.push({ group: 'all', clips: anims });
  }
  return out;
}

/**
 * The clip's own name declares its track, as the client derives it: the digits
 * before the first `_` of the segment after any `/`, else 0. A scenario
 * command's explicit `Track:` overrides it. The prefixes are not decoration —
 * a clip layers over or under another purely by that number.
 */
export function spineTrack(name: string): number {
  const segment = name.slice(name.indexOf('/') + 1);
  const underscore = segment.indexOf('_');
  if (underscore <= 0) return 0;
  const prefix = segment.slice(0, underscore);
  return /^\d+$/.test(prefix) ? Number(prefix) : 0;
}

// A share of the rig's busiest clip. Groups the Free play dropdowns only;
// playback tracks come from `spineTrack`.
export const OVERLAY_BONE_SHARE = 0.28;

/** Clips too partial to own track 0, measured from the parsed skeleton. */
export function overlayAnimations(
  animations: { name: string; timelines: { boneIndex?: number }[] }[],
  isFace: (name: string) => boolean,
): Set<string> {
  const keyed = new Map<string, number>();
  for (const anim of animations) {
    const bones = new Set<number>();
    for (const t of anim.timelines) {
      if (typeof t.boneIndex === 'number') bones.add(t.boneIndex);
    }
    keyed.set(anim.name, bones.size);
  }
  const max = Math.max(1, ...Array.from(keyed.values()));
  const out = new Set<string>();
  for (const [name, bones] of keyed) {
    if (isFace(name)) continue;
    if (bones / max < OVERLAY_BONE_SHARE) out.add(name);
  }
  return out;
}

/**
 * A `bg_on` / `bg_off` event addresses its layer by the bone it stands on, and
 * only the integer payload selects it. The string payload is not a selector.
 */
export function backgroundBoneName(index: number): string {
  return index === 0 ? 'bg' : `bg_${index}`;
}

const STATE_TOKENS = ['close', 'open', 'after'];

// The interaction state a phase represents, read from its idle clip name.
export function phaseState(phase: ActorPhase): string | null {
  const name = (phase.idle ?? phase.active ?? '').toLowerCase();
  return STATE_TOKENS.find((s) => name.endsWith(`_${s}`) || name.endsWith(`/${s}`)) ?? null;
}

// Desire rigs attach every state's regions at once, so a region with a state
// counts only in the matching phase; a stateless one is always live.
export function regionLiveInPhase(region: TouchRegion, phase: ActorPhase): boolean {
  if (!region.state) return true;
  const ps = phaseState(phase);
  return ps === null || ps === region.state;
}

// The exporter already decided the effect and clip; nothing is inferred from
// names here, and repeated-touch escalation comes from the scenario script.
export function effectOf(
  region: TouchRegion | null,
  phase: ActorPhase,
): { effect: TouchEffect; clip: string | null; bone?: string } {
  if (!region) return { effect: 'generic', clip: phase.active ?? null };
  if (region.effect === 'physics') {
    return { effect: 'physics', clip: null, bone: region.bone };
  }
  if (region.clip) return { effect: region.effect, clip: region.clip };
  return { effect: 'generic', clip: phase.active ?? null };
}

// UI grouping only: the leading token of the slot name.
export function layerGroup(slot: string): string {
  const name = slot.replace(/^[A-Z0-9]+_(?:CH|NP|SC|EV)\d+_/i, '');
  const token = name.split('_')[0];
  return token || slot;
}

// A Spine mesh can carry a pixels-per-unit ratio compensating for a large Unity
// transform, so transform scale alone is not a native-resolution measurement.
// Every non-degenerate triangle is measured because a weighted mesh can have a
// different affine mapping across the current pose.
export function mappedSourcePixelScale(
  verts: ArrayLike<number>,
  uvs: ArrayLike<number>,
  indices: ArrayLike<number>,
  textureWidth: number,
  textureHeight: number,
  transform: { a: number; b: number; c: number; d: number },
): number {
  let maxScale = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i0 = indices[i] * 2, i1 = indices[i + 1] * 2, i2 = indices[i + 2] * 2;
    const sx1 = (uvs[i1] - uvs[i0]) * textureWidth;
    const sy1 = (uvs[i1 + 1] - uvs[i0 + 1]) * textureHeight;
    const sx2 = (uvs[i2] - uvs[i0]) * textureWidth;
    const sy2 = (uvs[i2 + 1] - uvs[i0 + 1]) * textureHeight;
    const det = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(det) < 1e-8) continue;

    const vx1 = verts[i1] - verts[i0], vy1 = verts[i1 + 1] - verts[i0 + 1];
    const vx2 = verts[i2] - verts[i0], vy2 = verts[i2 + 1] - verts[i0 + 1];
    const dx1 = transform.a * vx1 + transform.c * vy1;
    const dy1 = transform.b * vx1 + transform.d * vy1;
    const dx2 = transform.a * vx2 + transform.c * vy2;
    const dy2 = transform.b * vx2 + transform.d * vy2;

    // [dx1 dx2; dy1 dy2] * inverse([sx1 sx2; sy1 sy2])
    const a = (dx1 * sy2 - dx2 * sy1) / det;
    const c = (-dx1 * sx2 + dx2 * sx1) / det;
    const b = (dy1 * sy2 - dy2 * sy1) / det;
    const d = (-dy1 * sx2 + dy2 * sx1) / det;
    const sumSq = a * a + b * b + c * c + d * d;
    const mapDet = a * d - b * c;
    const discriminant = Math.max(0, sumSq * sumSq - 4 * mapDet * mapDet);
    maxScale = Math.max(maxScale, Math.sqrt((sumSq + Math.sqrt(discriminant)) / 2));
  }
  return maxScale;
}

// A claim takes a one-finger drag before panning does: the in-game jiggler
// input is a drag, which pan would otherwise swallow.
export type DragClaim = {
  move: (x: number, y: number) => void;
  end: () => void;
} | null;

export function zoomAt(root: any, factor: number, x: number, y: number): void {
  const scale = root.scale.x * factor;
  root.position.set(
    x + (root.position.x - x) * factor,
    y + (root.position.y - y) * factor,
  );
  root.scale.set(scale);
}

// Following the game's camera owns the framing, so both gates are refused
// while it is on. A claimed drag is not a pan and still runs.
export function attachPanZoom(
  canvas: HTMLCanvasElement,
  root: any,
  claimDrag?: (x: number, y: number) => DragClaim,
  zoomEnabled?: () => boolean,
  panEnabled?: () => boolean,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let rootStart = { x: 0, y: 0 };
  let pinchDist0 = 0;
  let pinchScale0 = 1;
  let pinchMid = { x: 0, y: 0 };
  let claimed: DragClaim = null;
  let claimId = -1;
  const endClaim = () => {
    claimed?.end();
    claimed = null;
    claimId = -1;
  };
  const applyScale = (factor: number, mx: number, my: number) => {
    if (zoomEnabled && !zoomEnabled()) return;
    zoomAt(root, factor, mx, my);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const rect = canvas.getBoundingClientRect();
    applyScale(factor, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchDist0 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchScale0 = root.scale.x;
      const rect = canvas.getBoundingClientRect();
      pinchMid = {
        x: (pts[0].x + pts[1].x) / 2 - rect.left,
        y: (pts[0].y + pts[1].y) / 2 - rect.top,
      };
      dragging = false;
      endClaim();   // a second finger means zoom, not a jiggle drag
    } else if (pointers.size === 1) {
      dragging = false;
      dragStart = { x: e.clientX, y: e.clientY };
      rootStart = { x: root.position.x, y: root.position.y };
      const rect = canvas.getBoundingClientRect();
      claimed = claimDrag?.(e.clientX - rect.left, e.clientY - rect.top) ?? null;
      claimId = claimed ? e.pointerId : -1;
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchDist0 > 0) {
        const s = (pinchScale0 * dist) / pinchDist0;
        applyScale(s / root.scale.x, pinchMid.x, pinchMid.y);
      }
      return;
    }
    if (e.buttons === 0) return;
    if (claimed && e.pointerId === claimId) {
      const rect = canvas.getBoundingClientRect();
      claimed.move(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    if (panEnabled && !panEnabled()) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragging && Math.hypot(dx, dy) < 4) return;
    dragging = true;
    root.position.set(rootStart.x + dx, rootStart.y + dy);
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.pointerId === claimId) endClaim();
    if (pointers.size < 2) { pinchDist0 = 0; dragging = false; }
    if (pointers.size === 1) {
      const pt = pointers.values().next().value as { x: number; y: number };
      dragStart = { x: pt.x, y: pt.y };
      rootStart = { x: root.position.x, y: root.position.y };
    }
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  return () => {
    endClaim();
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  };
}
