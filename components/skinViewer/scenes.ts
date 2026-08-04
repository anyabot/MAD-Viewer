export type AnimationAction = {
  type: 'animation';
  clip: string;
  loop: boolean;
  /** Authored Spine track expression (`31`, `z`); null selects by clip role. */
  track: string | number | null;
  hold?: boolean;
  reset?: boolean;
  wait: boolean;
  when?: string | null;
};

export type ResetAnimationAction = {
  type: 'reset-animation';
  track: string | null;
  wait: boolean;
};

export type WaitAction = { type: 'wait'; duration: number };
export type WaitAnimationAction = { type: 'wait-animation' };

export type CameraAction = {
  type: 'camera';
  source: 'camera' | 'actor';
  offset?: (number | null)[];
  rotation?: (number | null)[];
  zoom?: number;
  roll?: number;
  duration: number;
  easing?: string;
  wait: boolean;
};

export type FadeAction = {
  type: 'fade';
  color: 'white' | 'black' | string;
  opacity: number;
  duration: number;
  wait: boolean;
};

// One spoken line: its subtitle and, when the line was recorded, the voice clip
// id to play with it. Naninovel binds the clip outside the script, so a line
// with no `voice` is one the game never voiced — the subtitle still stands.
export type SayAction = {
  type: 'say';
  text: string;
  /** Naninovel actor id of the speaker (`mane_swimsuit`), not a display name. */
  author?: string;
  voice?: string;
};

export type BgmAction = {
  type: 'bgm';
  clip: string;
  intro?: string;
  fade: number;
};

export type StopBgmAction = { type: 'stop-bgm'; fade: number };

// `alt` marks an action authored inside one `@PickRandom` group as
// `"<pick>:<group>"`. The game plays a single group, so `resolveAlternatives`
// drops the rest before anything is scheduled.
export type SceneAction = (AnimationAction | ResetAnimationAction | WaitAction
  | WaitAnimationAction | CameraAction | FadeAction | SayAction | BgmAction
  | StopBgmAction) & { alt?: string };

/**
 * Drop every `@PickRandom` alternative but one per pick, which is what the game
 * does. The tag is `"<pick>:<group>"`; untagged actions always survive. Without
 * this a single touch runs all the alternatives in sequence, so the character
 * speaks two different lines back to back.
 */
export function resolveAlternatives(
  actions: SceneAction[], pick: (n: number) => number = (n) => Math.floor(Math.random() * n),
): SceneAction[] {
  const groups = new Map<string, Set<string>>();
  for (const action of actions) {
    const { alt } = action;
    if (!alt) continue;
    const [id, group] = alt.split(':');
    if (!groups.has(id)) groups.set(id, new Set());
    groups.get(id)!.add(group);
  }
  if (!groups.size) return actions;
  const chosen = new Map<string, string>();
  for (const [id, seen] of Array.from(groups)) {
    const ordered = Array.from(seen).sort((a, b) => Number(a) - Number(b));
    chosen.set(id, ordered[Math.min(pick(ordered.length), ordered.length - 1)]);
  }
  return actions.filter((action) => {
    const { alt } = action;
    if (!alt) return true;
    const [id, group] = alt.split(':');
    return chosen.get(id) === group;
  });
}

export type SceneBeat = { label: string; actions: SceneAction[] };
export type LinearScene = { script: string; entry: SceneAction[]; beats: SceneBeat[] };
export type DesirePresentation = {
  script: string;
  entry: SceneAction[];
  sections: {
    labels: (string | null)[];
    entry: SceneAction[];
    triggers: SceneAction[][];
    reset?: string | null;
    resetActions?: SceneAction[];
  }[];
  subroutines?: Record<string, SceneAction[]>;
  modelCommands?: {
    class: string;
    line: number | null;
    inline: number | null;
    indent: number;
    fields: Record<string, string>;
  }[];
};

export type SceneTimelineRig = {
  view?: LinearScene | DesirePresentation;
  story?: LinearScene;
};

export type SceneTimelineData = {
  generated: string;
  source: string;
  rigs: Record<string, SceneTimelineRig>;
};

export function isLinearScene(scene: LinearScene | DesirePresentation | undefined):
scene is LinearScene {
  return !!scene && 'beats' in scene;
}

/**
 * Every voice clip a rig's timelines can speak. The lines sit in entries, beats,
 * trigger bodies and subroutines, so this walks the structure rather than
 * naming the places; the result is what the viewer prefetches so a line is
 * audible the moment its animation starts.
 */
export function sceneVoiceIds(rig: SceneTimelineRig | null | undefined): string[] {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const action = node as Partial<SayAction>;
    if (action.type === 'say' && action.voice) out.add(action.voice);
    for (const value of Object.values(node)) walk(value);
  };
  walk(rig);
  return Array.from(out);
}

export type CameraState = { offsetX: number; offsetY: number; zoom: number };
export type SceneFadeState = { color: string; opacity: number; duration: number };

/** Spine `bg_*` events control the scene's white overlay, not its room sprite. */
export function spineBackgroundEventFade(
  current: SceneFadeState,
  eventName: string,
): SceneFadeState {
  if (eventName === 'bg_on') return { color: 'white', opacity: 1, duration: 0 };
  if (eventName === 'bg_off' && current.color === 'white') {
    return { ...current, opacity: 0, duration: 0 };
  }
  return current;
}

export type CameraBase = {
  x: number; y: number; scale: number; width: number; height: number;
};

export type CutsceneOffsetSample = {
  aspect: number;
  position: { x: number; y: number };
  rotation: number;
  scale: number;
};

/** Linearly sample Unity's aspect-keyed cutscene actor staging curve. */
export function cutsceneOffsetAt(
  samples: CutsceneOffsetSample[], aspect: number,
): CutsceneOffsetSample | null {
  if (!samples.length) return null;
  const ordered = [...samples].sort((a, b) => a.aspect - b.aspect);
  if (aspect <= ordered[0].aspect) return ordered[0];
  if (aspect >= ordered[ordered.length - 1].aspect) return ordered[ordered.length - 1];
  const upper = ordered.findIndex((sample) => sample.aspect >= aspect);
  const a = ordered[upper - 1];
  const b = ordered[upper];
  const t = (aspect - a.aspect) / (b.aspect - a.aspect);
  return {
    aspect,
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
    },
    rotation: a.rotation + (b.rotation - a.rotation) * t,
    scale: a.scale + (b.scale - a.scale) * t,
  };
}

export function scriptCameraTransform(base: CameraBase, state: CameraState): {
  x: number; y: number; scale: number;
} {
  const factor = 1 / Math.max(0.1, 1 - state.zoom);
  const x = base.width / 2 + (base.x - base.width / 2) * factor
    - state.offsetX * base.scale * factor;
  const y = base.height / 2 + (base.y - base.height / 2) * factor
    + state.offsetY * base.scale * factor;
  return { x, y, scale: base.scale * factor };
}

/**
 * The rig's own camera pose for the current frame, read off the `cam` bone and
 * expressed relative to that bone's setup pose. `x`/`y` are in the container
 * space the transform is applied in, `scale` is the bone's world scale and
 * `rotation` its world rotation in radians.
 */
export type RigCameraState = { x: number; y: number; scale: number; rotation: number };

export type RigCameraTransform = {
  pivotX: number; pivotY: number; x: number; y: number; scale: number; rotation: number;
};

/**
 * View transform for a desire/affection rig's `cam` bone.
 *
 * The bone is the camera, so the view is the inverse of its pose: a bone scale
 * of `s` shows `s` times as much of the scene, which is a `1/s` zoom, and the
 * bone's position is the point held at the centre of the view. A bone left at
 * its setup pose returns the identity transform, which is what keeps a rig
 * without a `cam` bone — and every clip that does not animate one — framed
 * exactly as the plain fit frames it.
 */
export function rigCameraTransform(
  centre: { x: number; y: number },
  cam: RigCameraState,
): RigCameraTransform {
  return {
    pivotX: centre.x + cam.x,
    pivotY: centre.y + cam.y,
    x: centre.x,
    y: centre.y,
    scale: 1 / Math.max(0.01, cam.scale),
    rotation: -cam.rotation,
  };
}

export function presentationDuration(actions: SceneAction[], animationRemaining = 0): number {
  let elapsed = 0;
  for (const action of actions) {
    if (action.type === 'wait') elapsed += action.duration;
    else if (action.type === 'wait-animation') {
      elapsed = Math.max(elapsed, animationRemaining);
    }
    else if ((action.type === 'camera' || action.type === 'fade') && action.wait) {
      elapsed += action.duration;
    }
  }
  return elapsed;
}

/** Resolve an empty Desire wait against the most recently authored track. */
export function waitAnimationDeadline(
  elapsed: number,
  lastAnimationTrack: number | null,
  scheduledEnds: ReadonlyMap<number, number>,
  liveRemaining = 0,
): number {
  const hasScheduled = lastAnimationTrack !== null
    && scheduledEnds.has(lastAnimationTrack);
  const deadline = hasScheduled
    ? scheduledEnds.get(lastAnimationTrack!) ?? 0
    : liveRemaining;
  return Math.max(elapsed, deadline);
}
