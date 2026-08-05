// A Naninovel script is a playlist walked by a playback index: most commands
// advance it, flow commands move it, trigger and reset commands park on it.
// This machine holds only that index, the variables and the effects a step
// produced — never Pixi, Spine or the DOM.
//
// A command's nested body is the run of following commands with a greater
// `indent`. It runs alongside the owner, which becomes a barrier on its exit.

import { evaluate, holds, type Vars } from './interactions.ts';
import { spineTrack } from './types.ts';

export type Command = {
  class: string;
  label?: string | null;
  line: number | null;
  inline: number | null;
  indent: number;
  fields: Record<string, string>;
  /** Rig animation the command's appearance names, resolved by the exporter. */
  clip?: string;
  /** Rig bounding box the command's `IdAndBoundingBox` names. */
  box?: string;
  text?: string;
  voice?: string;
  author?: string;
};

export type Effect =
  | { kind: 'animation'; clip: string; loop: boolean; track: number | null; hold: boolean }
  | { kind: 'idle'; clip: string; track: number | null }
  | { kind: 'clear-animation'; clip: string }
  | { kind: 'clear-track'; track: number | null }
  | { kind: 'reset-actor' }
  | { kind: 'say'; text: string; author: string | null; voice: string | null }
  | { kind: 'voice'; clip: string }
  | { kind: 'subtitle'; visible: boolean }
  | { kind: 'background'; appearance: string; visible: boolean; duration: number }
  | { kind: 'fade'; color: string; opacity: number; duration: number }
  | { kind: 'camera'; offset: (number | null)[] | null; zoom: number | null; duration: number }
  | { kind: 'bgm'; clip: string; intro: string | null; fade: number }
  | { kind: 'stop-bgm'; fade: number }
  | { kind: 'ending' }
  | { kind: 'unsupported'; command: string };

/** Why the machine stopped. The host resolves it and calls `run` again. */
export type Park =
  | { kind: 'wait'; seconds: number }
  /** Wait for the clip on `track`; null means the most recently authored one. */
  | { kind: 'wait-animation'; track: number | null }
  | { kind: 'wait-input' }
  | { kind: 'armed' }
  | { kind: 'end' };

type Registration = {
  /** Playlist index of the command that created it. */
  at: number;
  /** Bumped every time the command re-registers, which re-arms the trigger. */
  stamp: number;
  /**
   * Evaluated when the trigger is tested, not when it was registered: a
   * condition names variables that triggers listed before it set, and the index
   * never walks back, so evaluating at registration makes every gate unreachable.
   */
  when: string | null;
};

export type ArmedTouch = Registration & { kind: 'touch'; box: string; clip: string | null };
export type ArmedOnlook = Registration & {
  kind: 'onlook'; clip: string | null; threshold: number;
};
export type ArmedReset = Registration & { kind: 'reset'; destination: string | null };
export type ArmedDrag = Registration & {
  kind: 'drag'; box: string; clip: string | null; threshold: number;
};
export type Armed = ArmedTouch | ArmedOnlook | ArmedReset | ArmedDrag;

export type StepResult = { effects: Effect[]; park: Park; armed: Armed[] };

/** Naninovel's fade layers are background actors, addressed by appearance. */
const FADE_APPEARANCE = /BG_Fade_(White|Black)/i;

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v: string | undefined): boolean => v === 'true';

/** `-3.0,2.0` and `,,0` — a component left blank is unset, not zero. */
function vector(value: string | undefined): (number | null)[] | null {
  if (!value) return null;
  return value.split(',').map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  });
}

/** `z=z+1`, `x1=false` — a single assignment, applied in place. */
export function applyExpression(expr: string | undefined, vars: Vars): Vars {
  if (!expr) return vars;
  const eq = expr.indexOf('=');
  if (eq <= 0) return vars;
  const name = expr.slice(0, eq).trim();
  // A dot is part of a variable name, matching what the expression tokenizer
  // accepts on the reading side — a name refused here still parses there, so
  // the counter would never move while the gate reading it stays live.
  if (!/^[A-Za-z_][\w.]*$/.test(name)) return vars;
  const value = evaluate(expr.slice(eq + 1), vars);
  if (value === null) return vars;
  return { ...vars, [name]: value };
}

/** `.setting` and `setting` both name the same label. */
export function stripLabel(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot + 1) : path;
}

/** A populated WaitMode is seconds, or frames when suffixed `f` (`7f`). */
export function waitSeconds(mode: string): number {
  const trimmed = mode.trim().toLowerCase();
  if (trimmed.endsWith('f')) {
    const frames = Number(trimmed.slice(0, -1));
    return Number.isFinite(frames) ? frames / 60 : 0;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

/**
 * An open nested body.
 *
 * `command` — the owner started its own playback and is a barrier on exit.
 * `trigger` — the index returns to the owner, which re-registers it.
 * `group`   — one `@PickRandom` alternative; exit continues past the pick.
 *
 * `depth` is the `Gosub` stack height the frame opened at. A body ends when the
 * index walks off it, not merely when it points past it: a `Gosub` inside the
 * body jumps further down the script, which the index alone reads as the body
 * finishing.
 */
type Frame =
  | { kind: 'command'; at: number; end: number; depth: number; track: number | null; wait: boolean }
  | { kind: 'trigger'; at: number; end: number; depth: number }
  | { kind: 'group'; at: number; end: number; depth: number; after: number };

export class ScriptMachine {
  readonly program: Command[];

  /** Every label in playlist order — the scene's selectable stages. */
  readonly labels: string[] = [];

  private readonly labelIndex = new Map<string, number>();

  pc = 0;

  vars: Vars;

  /** The last label the index passed, or null before the first one. */
  label: string | null = null;

  /** An empty `@desire.wait` waits for this, not for an assumed body track. */
  lastTrack: number | null = null;

  private stack: number[] = [];

  /**
   * A registration outlives the command that created it, so this accumulates
   * and is replaced per command rather than rebuilt per run.
   */
  private registered = new Map<number, Armed>();

  private stamp = 0;

  private frames: Frame[] = [];

  private halted = false;

  private firing: number | null = null;

  constructor(program: Command[], vars: Vars = {}) {
    this.program = program;
    this.vars = vars;
    program.forEach((c, i) => {
      if (c.class !== 'Label' || !c.label) return;
      this.labels.push(c.label);
      if (!this.labelIndex.has(c.label)) this.labelIndex.set(c.label, i);
    });
  }

  hasLabel(label: string): boolean {
    return this.labelIndex.has(label);
  }

  /** Index of the first label, i.e. the end of the script's pre-label entry. */
  firstLabelIndex(): number {
    const at = this.program.findIndex((c) => c.class === 'Label' && c.label);
    return at < 0 ? 0 : at;
  }

  /** Index just past the body of the command at `at`. */
  private endOfBody(at: number): number {
    const { indent } = this.program[at];
    let i = at + 1;
    while (i < this.program.length && this.program[i].indent > indent) i++;
    return i;
  }

  /** Indices of the direct children of the command at `at`. */
  private childrenOf(at: number): number[] {
    const inner = this.program[at].indent + 1;
    const end = this.endOfBody(at);
    const out: number[] = [];
    for (let i = at + 1; i < end; i++) {
      if (this.program[i].indent === inner) out.push(i);
    }
    return out;
  }

  /**
   * Registrations are dropped: the destination re-executes its own trigger
   * commands, and a previous phase's touch zones are not live in the next one.
   */
  gotoLabel(label: string): boolean {
    const target = this.labelIndex.get(label);
    if (target === undefined) return false;
    this.pc = target;
    this.halted = false;
    this.firing = null;
    this.stack = [];
    this.frames = [];
    this.registered.clear();
    return true;
  }

  /** The index returns to the trigger on its body's exit, which re-arms it. */
  fire(at: number): void {
    if (!this.program[at]) return;
    this.firing = at;
    this.halted = false;
  }

  /** Every trigger the index has passed stays registered; the condition is
   *  what decides whether it is live this instant. */
  armedList(): Armed[] {
    return [...this.registered.values()]
      .filter((a) => holds(a.when, this.vars))
      .sort((a, b) => a.at - b.at);
  }

  /**
   * The authored `Track:` resolved against the current variables, else the
   * track the clip's own name declares. Never null for a clip: the host's
   * fallback is the Lobby body track, which cuts every waited clip short.
   */
  private track(expr: string | undefined, clip: string | undefined): number | null {
    if (expr !== undefined && expr !== '') {
      const value = evaluate(expr, this.vars);
      if (value !== null && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    }
    return clip ? spineTrack(clip) : null;
  }

  private register(
    at: number, when: string | undefined, armed: Omit<Armed, 'at' | 'stamp' | 'when'>,
  ): void {
    this.stamp += 1;
    this.registered.set(
      at, { ...armed, at, stamp: this.stamp, when: when ?? null } as Armed);
  }

  private park(park: Park, effects: Effect[]): StepResult {
    return { effects, park, armed: this.armedList() };
  }

  private play(c: Command, effects: Effect[]): number | null {
    if (!c.clip) return null;
    const track = this.track(c.fields.Track, c.clip);
    effects.push({
      kind: 'animation',
      clip: c.clip,
      loop: bool(c.fields.Loop),
      track,
      hold: bool(c.fields.Hold),
    });
    this.lastTrack = track;
    return track;
  }

  /**
   * Run until the machine parks. Commands that need the host to wait stop the
   * run and are resumed by calling `run` again.
   */
  run(): StepResult {
    const effects: Effect[] = [];
    let guard = 0;

    if (this.firing !== null) {
      const at = this.firing;
      this.firing = null;
      const c = this.program[at];
      this.play(c, effects);
      this.frames.push({
        kind: 'trigger', at, end: this.endOfBody(at), depth: this.stack.length,
      });
      this.pc = at + 1;
    }

    while (!this.halted && this.pc < this.program.length) {
      if (++guard > 10000) break;   // a script cannot legitimately loop this long
      const frame = this.frames[this.frames.length - 1];
      if (frame && this.pc >= frame.end && this.stack.length <= frame.depth) {
        this.frames.pop();
        if (frame.kind === 'group') {
          this.pc = frame.after;
          continue;
        }
        if (frame.kind === 'trigger') {
          // Re-executing the trigger is what re-registers it.
          this.pc = frame.at;
          continue;
        }
        // On its body's exit the owner still waits for its own playback.
        this.pc = frame.end;
        if (frame.wait) {
          return this.park({ kind: 'wait-animation', track: frame.track }, effects);
        }
        continue;
      }

      const c = this.program[this.pc];
      const f = c.fields ?? {};
      switch (c.class) {
        case 'Label':
          this.label = c.label ?? null;
          this.pc++;
          break;

        case 'UsingScopeCommand':
        case 'Await':
        case 'ShowUI':
        case 'HidePrinter':
        case 'Group':
        case 'NaniSummary':
        case 'Skip':
        case 'AddChoice':
          this.pc++;
          break;

        case 'ParametrizeGeneric':
          this.pc++;
          // Desire views author the skip, affection views do not, which is what
          // makes an affection view advance one line per tap.
          if (f.SkipWaitingInput !== 'true' && f.Wait === 'true') {
            return this.park({ kind: 'wait-input' }, effects);
          }
          break;

        case 'SetCustomVariable':
          this.vars = applyExpression(f.Expression, this.vars);
          this.pc++;
          break;

        case 'Goto': {
          if (!holds(f.ConditionalExpression, this.vars)) { this.pc++; break; }
          if (!f.Path || !this.gotoLabel(stripLabel(f.Path))) this.pc++;
          break;
        }

        case 'Gosub': {
          const target = f.Path ? this.labelIndex.get(stripLabel(f.Path)) : undefined;
          if (target === undefined) { this.pc++; break; }
          this.stack.push(this.pc + 1);
          this.pc = target;
          break;
        }

        case 'Return': {
          const back = this.stack.pop();
          if (back === undefined) { this.halted = true; break; }
          this.pc = back;
          break;
        }

        case 'Stop':
        case 'End':
        case 'SwitchToGame':
          this.halted = true;
          break;

        case 'BeginIf': {
          if (holds(f.Expression, this.vars)) { this.pc++; break; }
          // A false `@if` steps into the matching `@else` body when there is
          // one; falling out of a taken body instead lands on the `Else`, which
          // skips its own body below.
          const end = this.endOfBody(this.pc);
          const next = this.program[end];
          this.pc = next && next.class === 'Else' && next.indent === c.indent
            ? end + 1 : end;
          break;
        }

        case 'Else':
          this.pc = this.endOfBody(this.pc);
          break;

        case 'PickRandom': {
          const groups = this.childrenOf(this.pc);
          const after = this.endOfBody(this.pc);
          if (!groups.length) { this.pc = after; break; }
          const pick = groups[Math.floor(Math.random() * groups.length)];
          this.frames.push({
            kind: 'group', at: pick, end: this.endOfBody(pick),
            depth: this.stack.length, after,
          });
          this.pc = pick + 1;
          break;
        }

        case 'DesireCommand':
        case 'AffectionCommand': {
          if (!holds(f.ConditionalExpression, this.vars)) { this.pc++; break; }
          // A camera cue alongside an appearance is awaited with it, so it
          // never contributes a wait of its own.
          if (f.Offset !== undefined || f.Zoom !== undefined) {
            effects.push({
              kind: 'camera',
              offset: vector(f.Offset),
              zoom: f.Zoom === undefined ? null : num(f.Zoom, 0),
              duration: num(f.Duration, 0),
            });
          }
          if (bool(f.Reset)) {
            // `Reset:true` naming an appearance clears that animation's track;
            // a bare actor id clears a track, or resets the whole actor when no
            // track is named. It never plays the clip.
            if (c.clip) effects.push({ kind: 'clear-animation', clip: c.clip });
            else if (f.Track !== undefined) {
              effects.push({ kind: 'clear-track', track: this.track(f.Track, undefined) });
            } else effects.push({ kind: 'reset-actor' });
            this.pc++;
            break;
          }
          const track = this.play(c, effects);
          const loop = bool(f.Loop);
          const end = this.endOfBody(this.pc);
          // `Wait` unset defaults to waiting; only a non-looping clip blocks,
          // since a looping one's task is complete as soon as it is set.
          const wait = f.Wait !== 'false' && !!c.clip && !loop;
          if (end > this.pc + 1) {
            // The body runs alongside this command's own playback.
            this.frames.push({
              kind: 'command', at: this.pc, end, depth: this.stack.length, track, wait,
            });
            this.pc++;
            break;
          }
          this.pc++;
          if (wait) return this.park({ kind: 'wait-animation', track }, effects);
          break;
        }

        case 'DesireIdleCommand':
        case 'AffectionIdleCommand': {
          // A `DesireCommand` with loop true, no track and no hold, so it can
          // never block.
          if (c.clip) {
            const track = this.track(f.Track, c.clip);
            effects.push({ kind: 'idle', clip: c.clip, track });
            this.lastTrack = track;
          }
          this.pc++;
          break;
        }

        case 'DesireWaitCommand':
        case 'AffectionWaitCommand': {
          this.pc++;
          const mode = f.WaitMode;
          // An empty WaitMode waits for the current animation, not zero seconds.
          if (!mode) {
            return this.park({ kind: 'wait-animation', track: this.lastTrack }, effects);
          }
          return this.park({ kind: 'wait', seconds: waitSeconds(mode) }, effects);
        }

        case 'DesireTouchTriggerCommand': {
          this.register(this.pc, f.ConditionalExpression, {
            kind: 'touch', box: c.box ?? '', clip: c.clip ?? null,
          } as Omit<ArmedTouch, 'at' | 'stamp' | 'when'>);
          this.pc = this.endOfBody(this.pc);
          break;
        }

        case 'DesireOnlookTriggerCommand': {
          this.register(this.pc, f.ConditionalExpression, {
            kind: 'onlook',
            clip: c.clip ?? null,
            threshold: num(f.Threshold, 10),
          } as Omit<ArmedOnlook, 'at' | 'stamp' | 'when'>);
          this.pc = this.endOfBody(this.pc);
          break;
        }

        case 'DesireDragCommand': {
          this.register(this.pc, f.ConditionalExpression, {
            kind: 'drag',
            box: c.box ?? '',
            clip: c.clip ?? null,
            threshold: num(f.Threshold, 0),
          } as Omit<ArmedDrag, 'at' | 'stamp' | 'when'>);
          this.pc = this.endOfBody(this.pc);
          break;
        }

        case 'DesireResetCommand': {
          this.register(this.pc, f.ConditionalExpression, {
            kind: 'reset',
            destination: f.Destination ? stripLabel(f.Destination) : null,
          } as Omit<ArmedReset, 'at' | 'stamp' | 'when'>);
          this.pc = this.endOfBody(this.pc);
          break;
        }

        case 'PrintText': {
          if (c.text || c.voice) {
            effects.push({
              kind: 'say',
              text: c.text ?? '',
              author: c.author ?? null,
              voice: c.voice ?? null,
            });
          }
          this.pc++;
          break;
        }

        case 'PlayVoice':
          if (c.voice) effects.push({ kind: 'voice', clip: c.voice });
          this.pc++;
          break;

        case 'ModifyBackground': {
          const appearance = f.AppearanceAndTransition ?? '';
          const duration = num(f.Duration, 0);
          const visible = f.Visible !== 'false';
          const fadeLayer = FADE_APPEARANCE.exec(appearance);
          if (fadeLayer) {
            effects.push({
              kind: 'fade',
              color: fadeLayer[1].toLowerCase(),
              opacity: visible ? 1 : 0,
              duration,
            });
          } else {
            effects.push({ kind: 'background', appearance, visible, duration });
          }
          this.pc++;
          if (f.Wait === 'true' && duration > 0) {
            return this.park({ kind: 'wait', seconds: duration }, effects);
          }
          break;
        }

        case 'ScreenFadeCommand': {
          const duration = num(f.Duration, 0);
          effects.push({
            kind: 'fade',
            color: (f.Color ?? 'black').toLowerCase(),
            // `To` is the screen's target visibility, so the cover's opacity is
            // its complement.
            opacity: Math.max(0, Math.min(1, 1 - num(f.To, 1))),
            duration,
          });
          this.pc++;
          if (f.Wait === 'true' && duration > 0) {
            return this.park({ kind: 'wait', seconds: duration }, effects);
          }
          break;
        }

        case 'PlayBgm':
          if (f.BgmPath) {
            effects.push({
              kind: 'bgm',
              clip: f.BgmPath,
              intro: f.IntroBgmPath ?? null,
              fade: num(f.FadeInDuration, 0),
            });
          }
          this.pc++;
          break;

        case 'StopBgm':
          effects.push({ kind: 'stop-bgm', fade: num(f.FadeOutDuration, 0) });
          this.pc++;
          break;

        case 'ModifyCamera':
          effects.push({
            kind: 'camera',
            offset: vector(f.Offset),
            zoom: f.Zoom === undefined ? null : num(f.Zoom, 0),
            duration: num(f.Duration, 0),
          });
          this.pc++;
          break;

        case 'ModifyTextPrinter':
          if (f.Visible !== undefined) {
            effects.push({ kind: 'subtitle', visible: f.Visible !== 'false' });
          }
          this.pc++;
          break;

        case 'DesireEndingCommand':
        case 'AffectionEndingCommand':
          // A UI overlay; it never touches the rig.
          effects.push({ kind: 'ending' });
          this.pc++;
          break;

        default:
          effects.push({ kind: 'unsupported', command: c.class });
          this.pc++;
          break;
      }
    }
    const armed = this.armedList();
    return { effects, park: armed.length ? { kind: 'armed' } : { kind: 'end' }, armed };
  }
}
