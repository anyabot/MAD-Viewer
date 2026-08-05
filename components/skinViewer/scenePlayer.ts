// The impure half of `ScriptMachine`: applies its effects to the skeleton, the
// audio and the presentation, and resolves each park by running it again.

import {
  ScriptMachine, type Armed, type ArmedOnlook, type Command, type Effect, type Park,
} from './interpreter.ts';
import type { Vars } from './interactions.ts';

export type SceneHost = {
  /** Authored seconds on the scene clock — paused and speed-scaled with the rig. */
  now(): number;
  schedule(run: () => void, seconds: number): number;
  cancel(handle: number | null): void;
  /** Seconds the clip on `track` has left; null asks for the body track. */
  remaining(track: number | null): number;
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
      default:
        break;
    }
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
    if (park.kind === 'wait') {
      timer = host.schedule(step, Math.max(0, park.seconds));
    } else if (park.kind === 'wait-animation') {
      timer = host.schedule(step, Math.max(0, host.remaining(park.track)));
    }
  };

  const triggerFor = (box: string): Armed | null => {
    const hits = armed.filter(
      (a) => (a.kind === 'touch' || a.kind === 'drag') && a.box === box);
    if (!hits.length) return null;
    // Several triggers can bind one box, a conditional one being the specific
    // variant beside an unconditional catch-all, so taking the first match
    // would make the variant unreachable.
    return hits.find((a) => a.when) ?? hits[0];
  };

  return {
    machine,

    /** Boxes a touch would currently reach. */
    armedBoxes(): Set<string> {
      const out = new Set<string>();
      for (const entry of armed) {
        if ((entry.kind === 'touch' || entry.kind === 'drag') && entry.box) {
          out.add(entry.box);
        }
      }
      return out;
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
     * A registration is held by the actor, not by the playback index, so it
     * stays hittable while the index is parked on a wait — a phase that
     * registers its only trigger and then waits could not be left otherwise.
     */
    touch(box: string): boolean {
      if (stopped || park.kind === 'end') return false;
      const entry = triggerFor(box);
      if (!entry) return false;
      machine.fire(entry.at);
      step();
      return true;
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

    /** Onlooks are a per-frame deadline, polled on the scene clock so they
     *  stretch and pause with the rig. */
    tick(): void {
      if (stopped || park.kind !== 'armed') return;
      const now = host.now();
      for (const entry of armed) {
        if (entry.kind !== 'onlook') continue;
        const stamped = onlookArmedAt.get(entry.at);
        if (!stamped || stamped.at + (entry as ArmedOnlook).threshold > now) continue;
        onlookArmedAt.set(entry.at, { stamp: entry.stamp, at: now });
        machine.fire(entry.at);
        step();
        return;
      }
    },

    stop(): void {
      stopped = true;
      clearTimer();
    },
  };
}
