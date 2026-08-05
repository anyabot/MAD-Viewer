// Scene time is authored seconds, advancing with the rig's own animation clock:
// zero while paused, scaled by the speed control every frame, so a speed change
// mid-flight rescales what is left of anything pending. `setTimeout` and
// `performance.now()` are the wrong clock for anything the rig times.
import type { SceneFadeState } from '@/components/skinViewer/scenes';

export type SceneClock = {
  /** Authored seconds since the rig was built. */
  now: () => number;
  /** Returns a handle for `cancel`. */
  schedule: (task: () => void, seconds: number) => number;
  cancel: (handle: number | null) => void;
  /** Register on the Pixi ticker. */
  tick: (deltaMS: number) => void;
};

export function createSceneClock(rate: () => number): SceneClock {
  let now = 0;
  let seq = 0;
  let tasks: { id: number; at: number; run: () => void }[] = [];
  // Cancelling holds for the frame the task was already due on: several tasks
  // can come due together, and one clearing the sequence must stop the rest.
  const cancelled = new Set<number>();

  return {
    now: () => now,
    schedule: (task, seconds) => {
      const id = ++seq;
      tasks.push({ id, at: now + Math.max(0, seconds), run: task });
      return id;
    },
    cancel: (handle) => {
      if (handle === null) return;
      cancelled.add(handle);
      const at = tasks.findIndex((task) => task.id === handle);
      if (at >= 0) tasks.splice(at, 1);
    },
    tick: (deltaMS) => {
      now += (deltaMS / 1000) * rate();
      if (tasks.length) {
        const due = tasks.filter((task) => task.at <= now)
          .sort((a, b) => a.at - b.at || a.id - b.id);
        if (due.length) {
          const taken = new Set(due.map((task) => task.id));
          tasks = tasks.filter((task) => !taken.has(task.id));
          for (const task of due) {
            if (!cancelled.has(task.id)) task.run();
          }
        }
      }
      cancelled.clear();
    },
  };
}

export type FadeCover = {
  apply: (next: SceneFadeState) => void;
  /** Register on the Pixi ticker. */
  tick: () => void;
};

/**
 * A `Graphics` above the whole scene, so pan, zoom and device staging never
 * move it, and its alpha runs on the scene clock: a DOM cover with a CSS
 * transition desynchronises at any speed but 1x and cannot be paused.
 */
export function createFadeCover(PIXI: any, app: any, clock: SceneClock): FadeCover {
  const cover = new PIXI.Graphics();
  cover.rect(0, 0, 1, 1).fill(0xffffff);
  cover.eventMode = 'none';
  cover.alpha = 0;
  cover.visible = false;
  app.stage.addChild(cover);

  let tween: { from: number; to: number; at: number; duration: number } | null = null;
  let width = 0;
  let height = 0;
  const size = () => {
    if (width === app.screen.width && height === app.screen.height) return;
    width = app.screen.width;
    height = app.screen.height;
    cover.width = width;
    cover.height = height;
  };

  return {
    apply: (next) => {
      cover.tint = next.color;
      size();
      if (next.duration > 0) {
        tween = { from: cover.alpha, to: next.opacity, at: clock.now(), duration: next.duration };
      } else {
        tween = null;
        cover.alpha = next.opacity;
      }
      cover.visible = cover.alpha > 0 || next.opacity > 0;
    },
    tick: () => {
      if (tween) {
        const t = Math.min(1, (clock.now() - tween.at) / tween.duration);
        cover.alpha = tween.from + (tween.to - tween.from) * t;
        if (t >= 1) tween = null;
      }
      cover.visible = cover.alpha > 0;
      if (cover.visible) size();
    },
  };
}
