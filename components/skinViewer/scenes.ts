// Scene data shapes and camera math. Nothing here schedules playback.

import type { Command } from './interpreter';

export type SceneScript = {
  /** Script asset stem, e.g. `ch0011_03_desire_view`. */
  script: string;
  /** Every command in playlist order, labels included. */
  modelCommands: Command[];
};

export type SceneTimelineRig = {
  view?: SceneScript;
  story?: SceneScript;
};

export type SceneTimelineData = {
  generated: string;
  source: string;
  rigs: Record<string, SceneTimelineRig>;
};

/** Prefetched, so a line is audible the moment its animation starts. */
export function sceneVoiceIds(rig: SceneTimelineRig | null | undefined): string[] {
  const out = new Set<string>();
  for (const scene of Object.values(rig ?? {})) {
    for (const command of scene?.modelCommands ?? []) {
      if (command.voice) out.add(command.voice);
    }
  }
  return Array.from(out);
}

/** Prefetched: a cue that starts downloading when it fires plays over silence
 *  for as long as the fetch takes. */
export function sceneBgmIds(rig: SceneTimelineRig | null | undefined): string[] {
  const out = new Set<string>();
  for (const scene of Object.values(rig ?? {})) {
    for (const command of scene?.modelCommands ?? []) {
      if (command.class !== 'PlayBgm') continue;
      const { BgmPath, IntroBgmPath } = command.fields;
      if (BgmPath) out.add(BgmPath);
      if (IntroBgmPath) out.add(IntroBgmPath);
    }
  }
  return Array.from(out);
}

export type CameraState = { offsetX: number; offsetY: number; zoom: number };
export type SceneFadeState = { color: string; opacity: number; duration: number };

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

/** Relative to the `cam` bone's setup pose. `x`/`y` are in the container space
 *  the transform is applied in; `rotation` is in radians. */
export type RigCameraState = { x: number; y: number; scale: number; rotation: number };

export type RigCameraTransform = {
  pivotX: number; pivotY: number; x: number; y: number; scale: number; rotation: number;
};

/**
 * The bone is the camera, so the view is the inverse of its pose: bone scale
 * `s` shows `s` times as much of the scene, i.e. a `1/s` zoom. A bone at its
 * setup pose gives the identity, which is what leaves a rig with no `cam` bone
 * framed by the plain fit.
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
