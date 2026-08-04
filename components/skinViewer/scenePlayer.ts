// Drives a `ScriptMachine` against the rig.
//
// The machine is pure: it returns the effects a step produced and the reason it
// stopped. This module is the other half — it applies those effects to the
// skeleton, the audio and the presentation, and resolves each park (a timed
// wait, a clip finishing, a tap, or an armed trigger) by running the machine
// again. One playback index drives the whole scene, exactly as the client's
// playlist does.

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
  // Scene-clock reading each onlook was armed at, keyed by its playlist index.
  // The client stamps this when the trigger command runs, and re-running it —
  // which is what a returning nested body does — restarts the deadline.
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
    // Registrations that went away take their deadline with them; one that
    // re-registered restarts it.
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

  /** The trigger a touch on `box` runs, or null when the box is inert here. */
  const triggerFor = (box: string): Armed | null => {
    const hits = armed.filter(
      (a) => (a.kind === 'touch' || a.kind === 'drag') && a.box === box);
    if (!hits.length) return null;
    // Several triggers can bind one box; a conditional one is the specific
    // variant and an unconditional one the catch-all registered beside it, so
    // taking the first match would make the variant unreachable. Which one the
    // client's own trigger check prefers is not decoded.
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

    /** Label the destination of the section's authored reset, when it has one. */
    resetDestination(): string | null {
      const entry = armed.find((a) => a.kind === 'reset');
      return entry && entry.kind === 'reset' ? entry.destination : null;
    },

    /**
     * Begin the script. `skipEntry` starts at the first label, which is where
     * the script's own pre-label opening ends — the viewer's Follow game flow
     * option owns that opening.
     */
    start(skipEntry: boolean): void {
      stopped = false;
      machine.pc = skipEntry ? machine.firstLabelIndex() : 0;
      step();
    },

    /** Jump to a label, as the stage selector does. */
    goto(label: string): void {
      if (!machine.gotoLabel(label)) return;
      step();
    },

    /**
     * Run a touch on `box`. False when nothing there is armed.
     *
     * A registration is held by the actor, not by the playback index, so it
     * stays hittable while the index is parked on a wait — ds_ch0022's phase 2
     * registers its only trigger and then waits five seconds, and refusing
     * input for that wait makes the phase impossible to leave.
     */
    touch(box: string): boolean {
      if (stopped || park.kind === 'end') return false;
      const entry = triggerFor(box);
      if (!entry) return false;
      machine.fire(entry.at);
      step();
      return true;
    },

    /** A tap while the script waits for input on a printed line. */
    advance(): boolean {
      if (stopped || park.kind !== 'wait-input') return false;
      step();
      return true;
    },

    /**
     * The view menu's reset button. `DesireResetCommand` parks until this is
     * pressed, then the index moves to its destination.
     */
    reset(): boolean {
      const entry = armed.find((a) => a.kind === 'reset');
      if (!entry || entry.kind !== 'reset' || !entry.destination) return false;
      if (!machine.gotoLabel(entry.destination)) return false;
      step();
      return true;
    },

    /**
     * Poll the armed onlooks. The client evaluates `armedAt + Threshold <=
     * Time.time` every frame; the scene clock is this viewer's equivalent, so
     * the deadline stretches and pauses with the rig.
     */
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
