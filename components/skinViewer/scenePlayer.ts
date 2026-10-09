// The impure half of `ScriptMachine`: applies its effects to the skeleton, the
// audio and the presentation, and resolves each park by running it again.

import {
  ScriptMachine, type Armed, type Command, type Effect, type Park,
} from './interpreter.ts';
import { evaluateValue, type Vars, type Vec } from './interactions.ts';

export type SceneHost = {
  /** Authored seconds on the scene clock — paused and speed-scaled with the rig. */
  now(): number;
  schedule(run: () => void, seconds: number): number;
  cancel(handle: number | null): void;
  /** Seconds the clip on `track` has left; null asks for the body track. */
  remaining(track: number | null): number;
  /** Seconds until every one-shot now playing, on any track, has finished. */
  remainingReaction(): number;
  playAnimation(clip: string, loop: boolean, track: number | null, hold: boolean): void;
  /** The looping clip the actor returns to when a one-shot ends on its track. */
  setIdle(clip: string, track: number | null): void;
  clearAnimation(clip: string): void;
  clearTrack(track: number | null): void;
  resetActor(): void;
  say(text: string, author: string | null, voice: string | null): void;
  voice(clip: string): void;
  subtitle(visible: boolean): void;
  background(appearance: string, visible: boolean, duration: number): void;
  fade(color: string, opacity: number, duration: number): void;
  camera(offset: (number | null)[] | null, zoom: number | null, duration: number): void;
  bgm(clip: string, intro: string | null, fade: number): void;
  stopBgm(fade: number): void;
  ending(): void;
  /** Called after every step so the UI can follow the scene. */
  onState(state: SceneState): void;
};

export type SceneState = {
  label: string | null;
  armed: Armed[];
  park: Park;
  vars: Vars;
};

export type ScenePlayer = ReturnType<typeof createScenePlayer>;

/** A held session's bone action and its pointer target, y-up actor-local; null when it does not evaluate. */
export type DragBoneTarget = { bone: string; fields: Record<string, string>; target: Vec | null };

// Mirrors the client's drag context: positions are actor-local with y up, `delta` is the last frame's movement per 1/60 s and survives a still frame.
type DragState = {
  at: number;
  threshold: number;
  start: Vec;
  last: Vec;
  delta: Vec;
  startedAt: number;
  activated: boolean;
  released: boolean;
  /** A branch was taken; the rest of the gesture changes nothing. */
  settled: boolean;
};

const FRAME_SECONDS = 1 / 60;

function moved(a: number, b: number): boolean {
  const eps = Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 8 * Number.EPSILON);
  return Math.abs(a - b) >= eps;
}

function dragVars(d: DragState, now: number): Vars {
  const dx = d.last[0] - d.start[0];
  const dy = d.last[1] - d.start[1];
  const distance = Math.hypot(dx, dy);
  return {
    'drag.position': d.last,
    'drag.delta': d.delta,
    'drag.distance': distance,
    'drag.direction': distance > 1e-6 ? [dx / distance, dy / distance] : [0, 0],
    'drag.time': Math.max(0, now - d.startedAt),
  };
}

export function createScenePlayer(
  program: Command[], host: SceneHost, vars: Vars = {},
) {
  const machine = new ScriptMachine(program, vars);
  let timer: number | null = null;
  let park: Park = { kind: 'end' };
  let armed: Armed[] = [];
  let stopped = false;
  // Stamped when the trigger command runs, so a returning nested body — which
  // re-runs it — restarts the deadline.
  const onlookArmedAt = new Map<number, { stamp: number; at: number }>();
  let drag: DragState | null = null;
  const delayed = new Set<number>();

  const apply = (effect: Effect): void => {
    switch (effect.kind) {
      case 'animation':
        host.playAnimation(effect.clip, effect.loop, effect.track, effect.hold);
        break;
      case 'idle':
        host.setIdle(effect.clip, effect.track);
        break;
      case 'clear-animation':
        host.clearAnimation(effect.clip);
        break;
      case 'clear-track':
        host.clearTrack(effect.track);
        break;
      case 'reset-actor':
        host.resetActor();
        break;
      case 'say':
        host.say(effect.text, effect.author, effect.voice);
        break;
      case 'voice':
        host.voice(effect.clip);
        break;
      case 'subtitle':
        host.subtitle(effect.visible);
        break;
      case 'background':
        host.background(effect.appearance, effect.visible, effect.duration);
        break;
      case 'fade':
        host.fade(effect.color, effect.opacity, effect.duration);
        break;
      case 'camera':
        host.camera(effect.offset, effect.zoom, effect.duration);
        break;
      case 'bgm':
        host.bgm(effect.clip, effect.intro, effect.fade);
        break;
      case 'stop-bgm':
        host.stopBgm(effect.fade);
        break;
      case 'ending':
        host.ending();
        break;
      case 'delay':
        runDelayed(effect.at, effect.seconds);
        break;
      default:
        break;
    }
  };

  // A delayed body plays on its own cursor; only its variable changes reach the scene.
  const runDelayed = (at: number, seconds: number) => {
    let handle: number | null = null;
    const sub = new ScriptMachine(program);
    const advance = () => {
      if (handle !== null) delayed.delete(handle);
      handle = null;
      if (stopped) return;
      const before = { ...machine.vars };
      sub.vars = before;
      const result = sub.run();
      for (const [key, value] of Object.entries(sub.vars)) {
        if (before[key] !== value) machine.vars = { ...machine.vars, [key]: value };
      }
      for (const effect of result.effects) apply(effect);
      const wait = result.park.kind === 'wait' ? result.park.seconds
        : result.park.kind === 'wait-animation' ? host.remaining(result.park.track)
          : result.park.kind === 'wait-reaction' ? host.remainingReaction() : null;
      if (wait !== null) {
        handle = host.schedule(advance, Math.max(0, wait));
        delayed.add(handle);
      }
    };
    sub.startBody(at);
    handle = host.schedule(advance, Math.max(0, seconds));
    delayed.add(handle);
  };

  const clearTimer = () => {
    host.cancel(timer);
    timer = null;
  };

  const step = (): void => {
    if (stopped) return;
    clearTimer();
    const result = machine.run();
    for (const effect of result.effects) apply(effect);
    park = result.park;
    armed = result.armed;
    const live = new Set(armed.map((a) => a.at));
    for (const key of Array.from(onlookArmedAt.keys())) {
      if (!live.has(key)) onlookArmedAt.delete(key);
    }
    for (const entry of armed) {
      if (entry.kind !== 'onlook') continue;
      const seen = onlookArmedAt.get(entry.at);
      if (!seen || seen.stamp !== entry.stamp) {
        onlookArmedAt.set(entry.at, { stamp: entry.stamp, at: host.now() });
      }
    }
    host.onState({
      label: machine.label, armed, park, vars: machine.vars,
    });
    if (park.kind === 'drag-session' && drag?.released && !drag.settled) {
      settleDrag(true);
      return;
    }
    if (park.kind === 'wait') {
      timer = host.schedule(step, Math.max(0, park.seconds));
    } else if (park.kind === 'wait-animation') {
      timer = host.schedule(step, Math.max(0, host.remaining(park.track)));
    } else if (park.kind === 'wait-reaction') {
      timer = host.schedule(step, Math.max(0, host.remainingReaction()));
    }
  };

  const settleDrag = (released: boolean): boolean => {
    if (!drag || machine.dragSession === null) return false;
    const vars = dragVars(drag, performance.now() / 1000);
    if (!machine.resolveDrag(vars, released)) return false;
    if (released) drag = null;
    else drag.settled = true;
    step();
    return true;
  };

  /** Boredom is "nothing happened for a while", so any input restarts it. */
  const restampOnlooks = () => {
    const at = host.now();
    for (const entry of armed) {
      if (entry.kind !== 'onlook') continue;
      onlookArmedAt.set(entry.at, { stamp: entry.stamp, at });
    }
  };

  // A trigger naming only the actor has an empty box filter, which the client matches against any box.
  const reaches = (a: Armed, box: string): boolean => (
    (a.kind === 'touch' || a.kind === 'drag') && (!a.box || a.box === box));

  const triggerFor = (box: string, kind: 'touch' | 'drag'): Armed | null => {
    const hits = armed.filter((a) => a.kind === kind && reaches(a, box));
    if (!hits.length) return null;
    // Several triggers can bind one box, a conditional one being the specific
    // variant beside an unconditional catch-all, so taking the first match
    // would make the variant unreachable.
    const named = hits.filter((a) => (a.kind === 'touch' || a.kind === 'drag') && a.box);
    const pool = named.length ? named : hits;
    return pool.find((a) => a.when) ?? pool[0];
  };

  return {
    machine,

    /** Whether a touch on this box would currently reach a trigger. */
    armsBox(box: string): boolean {
      return armed.some((a) => reaches(a, box));
    },

    armed: () => armed,
    park: () => park,

    resetDestination(): string | null {
      const entry = armed.find((a) => a.kind === 'reset');
      return entry && entry.kind === 'reset' ? entry.destination : null;
    },

    /** `skipEntry` starts at the first label, past the script's own opening. */
    start(skipEntry: boolean): void {
      stopped = false;
      machine.pc = skipEntry ? machine.firstLabelIndex() : 0;
      step();
    },

    goto(label: string): void {
      if (!machine.gotoLabel(label)) return;
      step();
    },

    /**
     * A pointer event on the actor. A tap that reached no box still passes
     * `null`: it restarts the onlook deadline like any other interaction.
     *
     * A registration is held by the actor, not by the playback index, so it
     * stays hittable while the index is parked on a wait — a phase that
     * registers its only trigger and then waits could not be left otherwise.
     */
    touch(box: string | null): boolean {
      if (stopped || park.kind === 'end') return false;
      restampOnlooks();
      const entry = box ? triggerFor(box, 'touch') : null;
      if (!entry) return false;
      machine.fire(entry.at);
      step();
      return true;
    },

    /** Pointer down on a drag box; `x`, `y` are actor-local with y up. */
    dragBegin(box: string, x: number, y: number): boolean {
      if (stopped || park.kind === 'end') return false;
      restampOnlooks();
      const entry = triggerFor(box, 'drag');
      if (!entry || entry.kind !== 'drag') return false;
      drag = {
        at: entry.at,
        threshold: entry.threshold,
        start: [x, y],
        last: [x, y],
        delta: [0, 0],
        startedAt: performance.now() / 1000,
        activated: false,
        released: false,
        settled: false,
      };
      return true;
    },

    /** Once per rendered frame while held, with the latest pointer point and that frame's seconds. Returns true when the trigger fired or a branch was taken. */
    dragFrame(x: number, y: number, frameSeconds: number): boolean {
      const d = drag;
      if (!d || d.released || d.settled || stopped) return false;
      if (moved(x, d.last[0]) || moved(y, d.last[1])) {
        const scale = frameSeconds > Number.EPSILON ? FRAME_SECONDS / frameSeconds : 1;
        d.delta = [(x - d.last[0]) * scale, (y - d.last[1]) * scale];
        d.last = [x, y];
        const vars = dragVars(d, performance.now() / 1000);
        if (!d.activated && (vars['drag.distance'] as number) >= d.threshold) {
          d.activated = true;
          machine.fire(d.at, vars);
          step();
          return true;
        }
      }
      return d.activated ? settleDrag(false) : false;
    },

    /** The values a resolve is tested against, while a session is live. */
    dragTrace(): Vars | null {
      if (!drag || machine.dragSession === null) return null;
      return dragVars(drag, performance.now() / 1000);
    },

    /** Empty unless a session is parked with the pointer still held. */
    dragBones(): DragBoneTarget[] {
      const d = drag;
      if (!d || d.released || d.settled || machine.dragSession === null) return [];
      const vars = { ...machine.vars, ...dragVars(d, performance.now() / 1000) };
      return machine.sessionBones().map((c) => {
        const id = c.fields.IdAndBone ?? '';
        const value = c.fields.Position ? evaluateValue(c.fields.Position, vars) : null;
        return {
          bone: id.includes('.') ? id.slice(id.indexOf('.') + 1) : id,
          fields: c.fields,
          target: value !== null && typeof value !== 'number' ? value : null,
        };
      });
    },

    dragEnd(): boolean {
      const d = drag;
      if (!d) return false;
      d.released = true;
      if (!d.activated || d.settled) {
        drag = null;
        return false;
      }
      // Still inside the drag's own body: the session settles the release when it parks.
      return machine.dragSession !== null ? settleDrag(true) : false;
    },

    advance(): boolean {
      if (stopped || park.kind !== 'wait-input') return false;
      step();
      return true;
    },

    /** The index parks on an armed reset until this fires. */
    reset(): boolean {
      const entry = armed.find((a) => a.kind === 'reset');
      if (!entry || entry.kind !== 'reset' || !entry.destination) return false;
      if (!machine.gotoLabel(entry.destination)) return false;
      step();
      return true;
    },

    /**
     * The onlook deadline, polled on the scene clock so it pauses and scales
     * with the rig. Only an armed phase is polled, so a reaction — which parks
     * the machine and leaves nothing registered — is never interrupted.
     */
    tick(): void {
      if (stopped || park.kind !== 'armed') return;
      const now = host.now();
      for (const entry of armed) {
        if (entry.kind !== 'onlook') continue;
        const stamped = onlookArmedAt.get(entry.at);
        if (!stamped || stamped.at + entry.threshold > now) continue;
        onlookArmedAt.set(entry.at, { stamp: entry.stamp, at: now });
        machine.fire(entry.at);
        step();
        return;
      }
    },

    stop(): void {
      stopped = true;
      clearTimer();
      for (const handle of delayed) host.cancel(handle);
      delayed.clear();
      drag = null;
    },
  };
}
