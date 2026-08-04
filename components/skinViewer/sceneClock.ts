// The one clock the rig's playback runs on, and the fade cover that rides it.
//
// Scene time is authored seconds: it advances with the rig's own animation
// clock — zero while paused, scaled by the speed control every frame — so a
// wait, a fade, a camera move and the idle timeout all keep their authored
// relationship to the clip they accompany, and changing speed while any of them
// is in flight rescales what is left of it. `setTimeout` and `performance.now()`
// are the wrong clock for anything the rig times.
import type { SceneFadeState } from '@/components/skinViewer/scenes';

export type SceneClock = {
  /** Current scene time, in authored seconds since the rig was built. */
  now: () => number;
  /** Run `task` after `seconds` of scene time; returns a cancellation handle. */
  schedule: (task: () => void, seconds: number) => number;
  cancel: (handle: number | null) => void;
  /** Advance the clock and dispatch what is due. Register on the Pixi ticker. */
  tick: (deltaMS: number) => void;
};

export function createSceneClock(rate: () => number): SceneClock {
  let now = 0;
  let seq = 0;
  let tasks: { id: number; at: number; run: () => void }[] = [];
  // Cancelling holds for the frame the task was already due on: several actions
  // can come due together, and one of them clearing the sequence (a touch, an
  // authored reset) must still stop the rest.
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
  /** Show the authored state, tweening its alpha when it carries a duration. */
  apply: (next: SceneFadeState) => void;
  /** Advance the tween and resize to the screen. Register on the Pixi ticker. */
  tick: () => void;
};

/**
 * The cover the script fades in and out. It is a Pixi `Graphics` on the stage
 * above the whole scene, so pan, zoom and device staging never move it, and its
 * alpha runs on the scene clock rather than a CSS transition — a DOM cover
 * desynchronises from the animation it covers at any speed but 1x and cannot be
 * paused.
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
