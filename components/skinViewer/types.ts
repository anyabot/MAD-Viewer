import type { Jiggler } from './jiggle';

// The prefab's `_actorType`: 0 standing, 1 desire, 2 affection, 3 pleasure, 5 drama.
export type SkinKind = 'standing' | 'affection' | 'desire' | 'pleasure' | 'drama';

// OneStore ships the uncensored art; only affection art diverges between stores.
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

// Resolved at export time, never inferred from names: `physics` springs a `gyro_*` bone, `reaction` and `region` play their clip, `generic` the phase's active clip.
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
    /** Attributed by the exporter's escalation inference, not by an exact name match. */
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
  skel?: string;
  atlas?: string;
  static?: { image: string; variants?: string[] };
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

// A diverged skin packs two suffixed archives but keeps the bare key here, so the stale-layout guard compares on this, not the archive name.
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

// A sequence sorts numerically: lexical order interleaves `ani_0010` into the tens.
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

// The digits before the first `_` of the segment after any `/`, else 0; an explicit `Track:` overrides it.
export function spineTrack(name: string): number {
  const segment = name.slice(name.indexOf('/') + 1);
  const underscore = segment.indexOf('_');
  if (underscore <= 0) return 0;
  const prefix = segment.slice(0, underscore);
  return /^\d+$/.test(prefix) ? Number(prefix) : 0;
}

// Groups the Free play dropdowns only; playback tracks come from `spineTrack`.
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

// A `bg_on` / `bg_off` event selects its layer by the integer payload alone.
export function backgroundBoneName(index: number): string {
  return index === 0 ? 'bg' : `bg_${index}`;
}

const STATE_TOKENS = ['close', 'open', 'after'];

// The interaction state a phase represents, read from its idle clip name.
export function phaseState(phase: ActorPhase): string | null {
  const name = (phase.idle ?? phase.active ?? '').toLowerCase();
  return STATE_TOKENS.find((s) => name.endsWith(`_${s}`) || name.endsWith(`/${s}`)) ?? null;
}

// Desire rigs attach every state's regions at once, so a region with a state counts only in the matching phase.
export function regionLiveInPhase(region: TouchRegion, phase: ActorPhase): boolean {
  if (!region.state) return true;
  const ps = phaseState(phase);
  return ps === null || ps === region.state;
}

// The exporter already decided the effect and clip; nothing is inferred from names here.
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

export {
  attachPanZoom, mappedSourcePixelScale, zoomAt, type DragClaim,
} from '@altterisk/game-hub/spine';
