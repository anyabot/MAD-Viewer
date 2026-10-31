// Port of the client's Naninovel scene runtime, class by class.

import { evaluate, evaluateValue, holds, type Calls, type Vars, type Vec } from './interactions.ts';
import { spineTrack } from './types.ts';

export type Command = {
  class: string;
  label?: string | null;
  line: number | null;
  inline: number | null;
  indent: number;
  fields: Record<string, string>;
  clip?: string;
  box?: string;
  text?: string;
  texts?: Record<string, string>;
  voice?: string;
  author?: string;
};

// --- scene-clock async ------------------------------------------------------

export class Cancelled extends Error {
  constructor() { super('cancelled'); }
}

export class Token {
  cancelled = false;

  private listeners = new Set<() => void>();

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    const listeners = Array.from(this.listeners);
    this.listeners.clear();
    for (const listener of listeners) listener();
  }

  on(listener: () => void): () => void {
    if (this.cancelled) { listener(); return () => {}; }
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  check(): void {
    if (this.cancelled) throw new Cancelled();
  }

  static linked(...parents: Token[]): Token {
    const token = new Token();
    for (const parent of parents) parent.on(() => token.cancel());
    return token;
  }
}

const NEVER = new Token();

export type Clock = {
  now(): number;
  schedule(run: () => void, seconds: number): number;
  cancel(handle: number | null): void;
};

function after(clock: Clock, seconds: number, token: Token): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) { reject(new Cancelled()); return; }
    let off = () => {};
    const handle = clock.schedule(() => { off(); resolve(); }, Math.max(0, seconds));
    off = token.on(() => { clock.cancel(handle); reject(new Cancelled()); });
  });
}

// `WaitEndOfFrame` / one `UniTask` player-loop step.
const nextFrame = (clock: Clock, token: Token) => after(clock, 0, token);

async function waitUntil(clock: Clock, done: () => boolean, token: Token): Promise<void> {
  while (!done()) await nextFrame(clock, token);
}

function swallow(task: Promise<unknown>): void {
  task.catch((e) => { if (!(e instanceof Cancelled)) console.error(e); });
}

// --- rig ---------------------------------------------------------------------

export type SceneRig = {
  state: any;
  skeleton: any;
  has(clip: string): boolean;
  // `SkeletonDataAsset` mix between two clips: the from→to pair, else the rig default.
  mix(from: string, to: string): number;
  // `SkeletonAnimation.Update(0)` and the apply that follows it.
  refresh(): void;
  // `DesireAndAffectionActor::Play` starts the clip's animation sound first.
  sfx(clip: string, loop: boolean): void;
  show(): void;
};

// `SkeletonCharacterAnimation`: scene source tracks sit one above Spine track 0.
const spineIndex = (source: number) => Math.max(0, source) + 1;
const sourceOf = (entry: any): number => (entry ? entry.trackIndex - 1 : -1);

type EntryHandlers = Set<() => void>;

// `CV.Naninovel.DesireAndAffectionController`.
export class SceneController {
  readonly reserved = new Set<number>();

  private fading: { entry: any; duration: number }[] = [];

  private handlers = new WeakMap<any, EntryHandlers>();

  private readonly rig: SceneRig;

  private readonly clock: Clock;

  constructor(rig: SceneRig, clock: Clock) {
    this.rig = rig;
    this.clock = clock;
  }

  current(source: number): any {
    return this.rig.state.getCurrent(spineIndex(source)) ?? null;
  }

  // Interrupt and End both route here, as the client subscribes one delegate to each.
  onLeave(entry: any, run: () => void): void {
    let set = this.handlers.get(entry);
    if (!set) {
      const created: EntryHandlers = new Set();
      set = created;
      this.handlers.set(entry, created);
      const fire = () => { for (const handler of Array.from(created)) handler(); };
      entry.listener = { interrupt: fire, end: fire };
    }
    set.add(run);
  }

  private setSourceTrack(source: number, clip: string, loop: boolean, mix: number | null): any {
    const entry = this.rig.state.setAnimation(spineIndex(source), clip, loop);
    const from = entry.mixingFrom?.animation?.name;
    entry.mixDuration = mix !== null ? mix : from ? this.rig.mix(from, clip) : 0;
    return entry;
  }

  setAnimationEntry(clip: string, loop: boolean, track: number | null, hold: boolean, mix: number | null): any {
    if (!this.rig.has(clip)) return null;
    const source = track ?? spineTrack(clip);
    const current = this.current(source);
    if (current && loop && current.animation?.name === clip) {
      if (hold) {
        current.mixAttachmentThreshold = Infinity;
        this.reserved.add(sourceOf(current));
      }
      current.loop = true;
      return current;
    }
    const entry = this.setSourceTrack(source, clip, loop, mix);
    const index = sourceOf(entry);
    entry.holdPrevious = this.reserved.delete(index);
    if (hold) {
      entry.mixAttachmentThreshold = Infinity;
      this.reserved.add(index);
    }
    if (!current && mix !== null && mix > 0) this.fadeIn(entry, mix);
    this.rig.refresh();
    return entry;
  }

  async setAnimation(
    clip: string, loop: boolean, track: number | null, hold: boolean, token: Token, mix: number | null,
  ): Promise<boolean> {
    token.check();
    const entry = this.setAnimationEntry(clip, loop, track, hold, mix);
    if (!entry) return false;
    if (loop) return true;
    let interrupted = false;
    const spine = entry.trackIndex;
    this.onLeave(entry, () => { interrupted = true; });
    await waitUntil(this.clock, () => interrupted
      || this.rig.state.getCurrent(spine) !== entry || entry.isComplete(), token);
    token.check();
    return !interrupted && this.rig.state.getCurrent(spine) === entry;
  }

  private fadeIn(entry: any, duration: number): void {
    entry.alpha = 0;
    this.fading.push({ entry, duration });
    this.onLeave(entry, () => { this.fading = this.fading.filter((f) => f.entry !== entry); });
  }

  // `ApplyFadeIns`, on the skeleton's `BeforeApply`.
  applyFadeIns(): void {
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const { entry, duration } = this.fading[i];
      const t = Math.max(0, Math.min(1, (entry.trackTime ?? 0) / duration));
      entry.alpha = t;
      if (t >= 1) this.fading.splice(i, 1);
    }
  }

  clearTrack(track: number | null, mix: number): void {
    const state = this.rig.state;
    if (track !== null) {
      const current = this.current(track);
      state.setEmptyAnimation(spineIndex(track), mix);
      this.reserved.delete(current ? sourceOf(current) : Math.max(0, track));
      return;
    }
    if (mix > 0) {
      const tracks: any[] = state.tracks ?? [];
      for (let i = tracks.length - 1; i >= 0; i--) {
        const entry = tracks[i];
        if (entry && sourceOf(entry) >= 0) state.setEmptyAnimation(entry.trackIndex, mix);
      }
    } else {
      const tracks: any[] = state.tracks ?? [];
      for (let i = tracks.length - 1; i >= 1; i--) state.clearTrack(i);
      this.rig.skeleton.setToSetupPose();
    }
    this.reserved.clear();
  }

  clearClip(clip: string, mix: number): void {
    const tracks: any[] = this.rig.state.tracks ?? [];
    const entry = tracks.find((t) => t && t.trackIndex > 0 && t.animation?.name === clip);
    if (!entry) return;
    this.rig.state.setEmptyAnimation(entry.trackIndex, mix);
    this.reserved.delete(sourceOf(entry));
  }

  async waitForTrackCycleEnd(source: number, expected: string, token: Token): Promise<boolean> {
    const entry = this.current(source);
    if (!entry || entry.animation?.name !== expected) return false;
    const length = (entry.animationEnd ?? 0) - (entry.animationStart ?? 0);
    if (length <= 0) return false;
    const target = entry.loop ? length * (Math.floor((entry.trackTime ?? 0) / length) + 1) : length;
    for (;;) {
      const now = this.current(source);
      if (!now || now.animation?.name !== expected) return false;
      if ((now.trackTime ?? 0) >= target) return true;
      if (!now.loop && now.isComplete()) return true;
      await nextFrame(this.clock, token);
    }
  }

  // `WaitForCurrentCycleEnd(name, track)`: only when the named clip is current there.
  async waitForCurrentCycleEnd(clip: string, track: number | null, token: Token): Promise<boolean> {
    if (!this.rig.has(clip)) return false;
    const source = track ?? spineTrack(clip);
    const current = this.current(source);
    if (!current || current.animation?.name !== clip) return false;
    return this.waitForTrackCycleEnd(source, clip, token);
  }
}

// --- actor and triggers -----------------------------------------------------

type PointerEvent = { isTouch: (filter: string) => boolean; point: Vec };

export abstract class Trigger {
  readonly spot: number;

  readonly command: TriggerCommandLike;

  constructor(spot: number, command: TriggerCommandLike) {
    this.spot = spot;
    this.command = command;
  }

  get isTriggered(): boolean {
    return this.command.shouldTrigger() && this.evaluate();
  }

  abstract evaluate(): boolean;

  click?(event: PointerEvent): void;

  down?(event: PointerEvent): void;

  drag?(event: PointerEvent, frameSeconds: number): void;

  up?(event: PointerEvent): void;
}

type TriggerCommandLike = { shouldTrigger(): boolean };

export class TouchTrigger extends Trigger {
  latched = false;

  readonly box: string;

  constructor(spot: number, command: TriggerCommandLike, box: string) {
    super(spot, command);
    this.box = box;
  }

  evaluate(): boolean { return this.latched; }

  click(event: PointerEvent): void {
    if (!this.latched) this.latched = event.isTouch(this.box);
  }
}

export class OnlookTrigger extends Trigger {
  armedAt: number;

  readonly threshold: number;

  private readonly clock: Clock;

  constructor(spot: number, command: TriggerCommandLike, armedAt: number, threshold: number, clock: Clock) {
    super(spot, command);
    this.armedAt = armedAt;
    this.threshold = threshold;
    this.clock = clock;
  }

  evaluate(): boolean { return this.armedAt + this.threshold <= this.clock.now(); }
}

// `DragContext`: positions actor-local y-up; `delta` is movement per 1/60 s.
export type DragContext = {
  start: Vec; last: Vec; delta: Vec; startedAt: number;
};

const FRAME = 1 / 60;

function moved(a: number, b: number): boolean {
  const eps = Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 8 * Number.EPSILON);
  return Math.abs(a - b) >= eps;
}

export class DragTrigger extends Trigger {
  context: DragContext | null = null;

  pressed = false;

  activated = false;

  consumed = false;

  released = false;

  readonly box: string;

  readonly threshold: number;

  private readonly clock: Clock;

  constructor(spot: number, command: TriggerCommandLike, box: string, threshold: number, clock: Clock) {
    super(spot, command);
    this.box = box;
    this.threshold = threshold;
    this.clock = clock;
  }

  evaluate(): boolean { return this.activated && !this.consumed; }

  down(event: PointerEvent): void {
    if (!event.isTouch(this.box)) return;
    this.pressed = true;
    this.released = false;
    this.context = { start: event.point, last: event.point, delta: [0, 0], startedAt: this.clock.now() };
  }

  drag(event: PointerEvent, frameSeconds: number): void {
    const c = this.context;
    if (!this.pressed || !c) return;
    const [x, y] = event.point;
    if (!moved(x, c.last[0]) && !moved(y, c.last[1])) return;
    const scale = frameSeconds > Number.EPSILON ? FRAME / frameSeconds : 1;
    c.delta = [(x - c.last[0]) * scale, (y - c.last[1]) * scale];
    c.last = [x, y];
    if (!this.activated && Math.hypot(x - c.start[0], y - c.start[1]) >= this.threshold) this.activated = true;
  }

  up(): void {
    this.pressed = false;
    this.released = true;
  }
}

export function dragVars(c: DragContext, now: number): Vars {
  const dx = c.last[0] - c.start[0];
  const dy = c.last[1] - c.start[1];
  const distance = Math.hypot(dx, dy);
  return {
    'drag.position': c.last,
    'drag.delta': c.delta,
    'drag.distance': distance,
    'drag.direction': distance > 1e-6 ? [dx / distance, dy / distance] : [0, 0],
    'drag.time': Math.max(0, now - c.startedAt),
  };
}

// `CV.Naninovel.DesireAndAffectionActor`.
export class SceneActor {
  idleSpot: number | null = null;

  idleAnimation: string | null = null;

  triggers: Trigger[] = [];

  readonly controller: SceneController;

  private readonly rig: SceneRig;

  constructor(controller: SceneController, rig: SceneRig) {
    this.controller = controller;
    this.rig = rig;
  }

  async play(
    clip: string, loop: boolean, track: number | null, hold: boolean, token: Token, mix: number | null,
  ): Promise<void> {
    if (!clip) return;
    this.rig.show();
    this.rig.sfx(clip, loop);
    await this.controller.setAnimation(clip, loop, track, hold, token, mix);
    if (token.cancelled || loop || !this.idleAnimation) return;
    if ((track ?? spineTrack(clip)) !== spineTrack(this.idleAnimation)) return;
    swallow(this.controller.setAnimation(this.idleAnimation, true, null, hold, NEVER, null));
  }

  addTrigger(trigger: Trigger): void { this.triggers.push(trigger); }

  removeTrigger(spot: number): void { this.triggers = this.triggers.filter((t) => t.spot !== spot); }

  containsTrigger(spot: number): boolean { return this.triggers.some((t) => t.spot === spot); }

  clearTriggers(): void { this.triggers = []; }

  // `CheckTrigger`: the first registration whose trigger holds moves playback to its command.
  checkTrigger(play: (index: number) => void): boolean {
    for (const trigger of this.triggers) {
      if (!trigger.isTriggered) continue;
      play(trigger.spot);
      return true;
    }
    return false;
  }
}

// --- host --------------------------------------------------------------------

export type SceneHost = {
  clock: Clock;
  rig: SceneRig;
  say(text: string, author: string | null, voice: string | null, texts?: Record<string, string> | null, join?: boolean): void;
  voice(clip: string, loop?: boolean): void;
  voiceBusy(): boolean;
  subtitle(visible: boolean): void;
  background(appearance: string, visible: boolean, duration: number): void;
  fade(color: string, opacity: number, duration: number, from?: number | null): void;
  blink?(open: number, from: number | null, position: number, softness: number, color: string, duration: number): void;
  camera(offset: (number | null)[] | null, zoom: number | null, duration: number): void;
  bgm(clip: string, intro: string | null, fade: number): void;
  stopBgm(fade: number, clip?: string | null): void;
  pauseBgm?(clip: string | null, fade: number): void;
  hideActors?(duration: number): void;
  popup?(image: string, visible: boolean, duration: number): void;
  shake?(scale: number): void;
  sfx?(clip: string, loop: boolean, fade: number): void;
  stopSfx?(clip: string | null, fade: number): void;
  ending(): void;
  contains?(box: string, x: number, y: number): boolean;
  unsupported?(what: string): void;
  onState(state: SceneState): void;
};

export type ArmedKind = 'touch' | 'onlook' | 'drag' | 'reset';

export type Armed = {
  kind: ArmedKind;
  at: number;
  box: string | null;
  clip: string | null;
  destination?: string | null;
};

export type ParkKind = 'running' | 'wait-input' | 'drag-session' | 'armed' | 'end';

export type SceneState = {
  label: string | null;
  armed: Armed[];
  park: { kind: ParkKind };
  vars: Vars;
};

export type DragBoneTarget = { bone: string; fields: Record<string, string>; target: Vec | null };

// --- commands -----------------------------------------------------------------

// `ScriptPlayerConfiguration.WaitByDefault` is on.
const waits = (f: Record<string, string>): boolean => f.Wait !== 'false';
// `ActorManagerConfiguration.DefaultDuration`.
const ACTOR_DURATION = 0.35;
// `DesireAffectionSubtitle.ChangeVisibilityDuration`.
const PRINTER_FADE = 0.3;
const FADE_APPEARANCE = /BG_Fade_(White|Black)/i;

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: string | undefined): boolean => v === 'true';

function vector(value: string | undefined): (number | null)[] | null {
  if (!value) return null;
  return value.split(',').map((part) => {
    const n = Number(part.trim());
    return part.trim() && Number.isFinite(n) ? n : null;
  });
}

export function applyExpression(expr: string | undefined, vars: Vars): Vars {
  if (!expr) return vars;
  const eq = expr.indexOf('=');
  if (eq <= 0) return vars;
  const name = expr.slice(0, eq).trim();
  if (!/^[A-Za-z_][\w.]*$/.test(name)) return vars;
  const value = evaluate(expr.slice(eq + 1), vars);
  if (value === null) return vars;
  return { ...vars, [name]: value };
}

export function stripLabel(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot + 1) : path;
}

export function waitSeconds(mode: string): number {
  const trimmed = mode.trim().toLowerCase();
  if (trimmed.endsWith('f')) {
    const frames = Number(trimmed.slice(0, -1));
    return Number.isFinite(frames) ? frames / 60 : 0;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

type Ctx = { scene: Scene; cursor: Cursor; token: Token };

interface Impl {
  execute(ctx: Ctx): Promise<void>;
  shouldExecute(scene: Scene): boolean;
  // `INestedHost.GetNextPlaybackIndex`; absent for a command that cannot own a body.
  next?(cursor: Cursor, played: number): number;
  interrupted?(scene: Scene): void;
}

const conditional = (c: Command) => (scene: Scene) => holds(c.fields.ConditionalExpression, scene.vars);

// A plain nested host: step into the body, leave it at its end.
function blockNext(self: { index: number; indent: number }, cursor: Cursor, played: number): number {
  const pl = cursor.scene;
  if (played === self.index && pl.isEnteringNestedAt(played)) return played + 1;
  if (pl.isExitingNestedAt(played, self.indent)) return pl.exitNestedAt(played, self.indent);
  return played + 1;
}

class Basic implements Impl {
  readonly c: Command;

  readonly index: number;

  private readonly run: (ctx: Ctx) => Promise<void> | void;

  constructor(c: Command, index: number, run: (ctx: Ctx) => Promise<void> | void) {
    this.c = c;
    this.index = index;
    this.run = run;
  }

  shouldExecute(scene: Scene): boolean { return conditional(this.c)(scene); }

  async execute(ctx: Ctx): Promise<void> { await this.run(ctx); }

  next(cursor: Cursor, played: number): number {
    return blockNext({ index: this.index, indent: this.c.indent }, cursor, played);
  }
}

// `DesireCommand` / `AffectionCommand`.
class AnimationCommand implements Impl {
  initial = false;

  private tasks: Promise<void> = Promise.resolve();

  private animation: Token | null = null;

  readonly c: Command;

  readonly index: number;

  readonly affection: boolean;

  constructor(c: Command, index: number, affection: boolean) {
    this.c = c;
    this.index = index;
    this.affection = affection;
  }

  shouldExecute(scene: Scene): boolean { return conditional(this.c)(scene); }

  get clip(): string | null { return this.c.clip ?? null; }

  track(scene: Scene): number | null {
    const expr = this.c.fields.Track;
    if (expr !== undefined && expr !== '') {
      const value = evaluate(expr, scene.vars);
      if (value !== null && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    }
    return null;
  }

  private async modify(ctx: Ctx, animation: Token): Promise<void> {
    const f = this.c.fields;
    const { scene } = ctx;
    const jobs: Promise<unknown>[] = [];
    if (f.Offset !== undefined || f.Zoom !== undefined) {
      const duration = num(f.Duration, 0);
      scene.host.camera(vector(f.Offset), f.Zoom === undefined ? null : num(f.Zoom, 0), duration);
      if (duration > 0) jobs.push(after(scene.host.clock, duration, ctx.token));
    }
    if (bool(f.Reset)) {
      const mix = num(f.Mix, 0);
      if (this.clip) scene.actor.controller.clearClip(this.clip, mix);
      else scene.actor.controller.clearTrack(f.Track !== undefined ? this.track(scene) : null, mix);
    } else if (this.clip) {
      const mix = f.Mix === undefined ? null : Math.max(0, num(f.Mix, 0));
      jobs.push(scene.actor.play(this.clip, bool(f.Loop), this.track(scene), bool(f.Hold), animation, mix));
    }
    await Promise.all(jobs);
  }

  private async waitForLoopEnd(ctx: Ctx): Promise<void> {
    if (!this.affection || !bool(this.c.fields.Loop) || !this.clip) return;
    await ctx.scene.actor.controller.waitForCurrentCycleEnd(this.clip, this.track(ctx.scene), ctx.token);
  }

  async execute(ctx: Ctx): Promise<void> {
    if (this.initial) {
      await this.tasks;
      this.initial = false;
      await this.waitForLoopEnd(ctx);
      return;
    }
    this.animation?.cancel();
    const animation = Token.linked(ctx.token);
    this.animation = animation;
    const work = this.modify(ctx, animation);
    if (waits(this.c.fields)) {
      this.tasks = work;
    } else {
      swallow(work);
      this.tasks = Promise.resolve();
    }
    swallow(this.tasks);
    await nextFrame(ctx.scene.host.clock, ctx.token);
    if (ctx.scene.isEnteringNestedAt(this.index)) { this.initial = true; return; }
    await this.tasks;
    await this.waitForLoopEnd(ctx);
  }

  next(cursor: Cursor, played: number): number {
    const pl = cursor.scene;
    if (pl.isEnteringNestedAt(played)) return this.initial ? played + 1 : pl.skipNestedAt(played, this.c.indent);
    if (pl.isExitingNestedAt(played, this.c.indent)) {
      return this.initial ? this.index : pl.exitNestedAt(played, this.c.indent);
    }
    return played + 1;
  }

  interrupted(): void {
    this.initial = false;
    this.tasks = Promise.resolve();
    this.animation?.cancel();
    this.animation = null;
  }
}

const TriggerState = { NonRegistered: 0, Registered: 1, Execute: 2, Hold: 3, End: 4 } as const;
type TriggerStateValue = typeof TriggerState[keyof typeof TriggerState];

// `DesireTriggerCommand` with `DesireTouchTriggerCommand` / `DesireOnlookTriggerCommand`.
class TriggerCommand implements Impl {
  state: TriggerStateValue = TriggerState.NonRegistered;

  private returningToSelf = false;

  private version = 0;

  private reaction: Token | null = null;

  private completion: { promise: Promise<void>; resolve: () => void } | null = null;

  readonly c: Command;

  readonly index: number;

  readonly kind: 'touch' | 'onlook';

  constructor(c: Command, index: number, kind: 'touch' | 'onlook') {
    this.c = c;
    this.index = index;
    this.kind = kind;
  }

  shouldExecute(): boolean { return true; }

  shouldTrigger(scene: Scene): boolean {
    const expr = this.c.fields.ConditionalExpression;
    return !expr || holds(expr, scene.vars);
  }

  get clip(): string | null { return this.c.clip ?? null; }

  track(scene: Scene): number | null {
    const expr = this.c.fields.Track;
    if (expr === undefined || expr === '') return null;
    const value = evaluate(expr, scene.vars);
    return value !== null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
  }

  private createTrigger(scene: Scene): Trigger {
    const like = { shouldTrigger: () => this.shouldTrigger(scene) };
    if (this.kind === 'onlook') {
      return new OnlookTrigger(this.index, like, scene.host.clock.now(), num(this.c.fields.Threshold, 0), scene.host.clock);
    }
    return new TouchTrigger(this.index, like, this.c.box ?? '');
  }

  cancelReaction(): void {
    this.version += 1;
    this.reaction?.cancel();
    this.reaction = null;
    this.completion?.resolve();
    this.completion = null;
  }

  private async runReaction(ctx: Ctx, token: Token): Promise<void> {
    let resolve = () => {};
    const promise = new Promise<void>((r) => { resolve = r; });
    const completion = { promise, resolve };
    this.completion = completion;
    try {
      if (this.clip) {
        const f = this.c.fields;
        const mix = f.Mix === undefined ? null : Math.max(0, num(f.Mix, 0));
        await ctx.scene.actor.play(this.clip, false, this.track(ctx.scene), bool(f.Hold), token, mix);
      }
    } finally {
      if (this.completion === completion) this.completion = null;
      completion.resolve();
    }
  }

  async execute(ctx: Ctx): Promise<void> {
    const { actor } = ctx.scene;
    const returning = this.returningToSelf;
    this.returningToSelf = false;
    if (!returning && this.state >= TriggerState.Execute) this.cancelReaction();
    if (this.state === TriggerState.Registered && !actor.containsTrigger(this.index)) {
      this.state = TriggerState.NonRegistered;
    }
    switch (this.state) {
      case TriggerState.NonRegistered:
        this.state = TriggerState.Registered;
        actor.addTrigger(this.createTrigger(ctx.scene));
        return;
      case TriggerState.Registered: {
        this.version += 1;
        this.state = TriggerState.Execute;
        actor.clearTriggers();
        const token = Token.linked(ctx.token);
        this.reaction = token;
        swallow(this.runReaction(ctx, token));
        return;
      }
      case TriggerState.Execute:
      case TriggerState.Hold: {
        this.state = TriggerState.Hold;
        const version = this.version;
        if (this.completion) await this.completion.promise;
        if (version === this.version) this.state = TriggerState.End;
        return;
      }
      case TriggerState.End:
        this.state = TriggerState.NonRegistered;
        return;
      default:
        return;
    }
  }

  private returnToSelf(): number {
    this.returningToSelf = true;
    return this.index;
  }

  next(cursor: Cursor, played: number): number {
    const pl = cursor.scene;
    const toIdle = () => (this.c.indent !== 0
      ? pl.returnToNestedHost(played, this.c.indent)
      : pl.actor.idleSpot ?? -1);
    if (pl.isEnteringNestedAt(this.index)) {
      if (played !== this.index && pl.isExitingNestedAt(played, this.c.indent)) return this.returnToSelf();
      switch (this.state) {
        case TriggerState.NonRegistered: return toIdle();
        case TriggerState.Registered: return pl.skipNestedAt(played, this.c.indent);
        case TriggerState.Execute: return played + 1;
        default: return this.returnToSelf();
      }
    }
    switch (this.state) {
      case TriggerState.NonRegistered: return toIdle();
      case TriggerState.Registered: return played + 1;
      default: return this.returnToSelf();
    }
  }

  interrupted(scene: Scene): void {
    if (scene.actor.containsTrigger(this.index)) scene.actor.removeTrigger(this.index);
    this.cancelReaction();
  }
}

// `DesireDragCommand`: registers a drag trigger; fired, it runs its body, then the live session picks a branch.
class DragCommand implements Impl {
  state: TriggerStateValue = TriggerState.NonRegistered;

  trigger: DragTrigger | null = null;

  session = false;

  readonly c: Command;

  readonly index: number;

  constructor(c: Command, index: number) {
    this.c = c;
    this.index = index;
  }

  shouldExecute(): boolean { return true; }

  shouldTrigger(scene: Scene): boolean {
    const expr = this.c.fields.ConditionalExpression;
    return !expr || holds(expr, scene.vars);
  }

  async execute(ctx: Ctx): Promise<void> {
    const { scene } = ctx;
    const { actor } = scene;
    if (this.state === TriggerState.Registered && actor.containsTrigger(this.index) && this.trigger?.evaluate()) {
      this.state = TriggerState.Execute;
      const trigger = this.trigger;
      trigger.consumed = true;
      actor.clearTriggers();
      await this.runSession(ctx, trigger);
      this.state = TriggerState.NonRegistered;
      return;
    }
    this.state = TriggerState.Registered;
    const like = { shouldTrigger: () => this.shouldTrigger(scene) };
    this.trigger = new DragTrigger(this.index, like, this.c.box ?? '', num(this.c.fields.Threshold, 0), scene.host.clock);
    actor.addTrigger(this.trigger);
  }

  private async runSession(ctx: Ctx, trigger: DragTrigger): Promise<void> {
    const { scene } = ctx;
    const children = scene.childrenOf(this.index);
    const branchKinds = new Set(['DesireDragUpdateCommand', 'DesireDragReleaseCommand', 'DesireDragResolveCommand']);
    for (const child of children) {
      if (branchKinds.has(scene.program[child].class)) continue;
      await scene.runTree(child, ctx.token);
    }
    this.session = true;
    scene.publish();
    let pick: number | null = null;
    try {
      for (;;) {
        const context = trigger.context;
        if (context) {
          const vars = { ...scene.vars, ...dragVars(context, scene.host.clock.now()) };
          const calls = scene.dragCalls(context.last);
          const condition = (i: number) => scene.program[i].fields?.ConditionalExpression;
          pick = children.find((i) => scene.program[i].class === 'DesireDragResolveCommand'
            && !!condition(i) && holds(condition(i), vars, calls)) ?? null;
          if (pick === null && trigger.released) {
            pick = children.find((i) => scene.program[i].class === 'DesireDragReleaseCommand'
              && (!condition(i) || holds(condition(i), vars, calls))) ?? null;
          }
          if (pick !== null || trigger.released) {
            scene.vars = { ...scene.vars, ...dragVars(context, scene.host.clock.now()) };
            break;
          }
        } else if (trigger.released) break;
        await nextFrame(scene.host.clock, ctx.token);
      }
    } finally {
      this.session = false;
    }
    if (pick !== null) {
      for (const child of scene.childrenOf(pick)) await scene.runTree(child, ctx.token);
    }
  }

  next(cursor: Cursor, played: number): number {
    const pl = cursor.scene;
    if (this.state === TriggerState.Registered) return pl.skipNestedAt(played, this.c.indent);
    return this.c.indent !== 0 ? pl.returnToNestedHost(played, this.c.indent) : pl.actor.idleSpot ?? -1;
  }
}

// `IdleCommand` (`DesireIdleCommand`, `AffectionIdleCommand`).
class IdleCommand implements Impl {
  readonly c: Command;

  readonly index: number;

  constructor(c: Command, index: number) {
    this.c = c;
    this.index = index;
  }

  shouldExecute(scene: Scene): boolean { return conditional(this.c)(scene); }

  async execute(ctx: Ctx): Promise<void> {
    const { actor } = ctx.scene;
    actor.idleSpot = this.index;
    actor.idleAnimation = this.c.clip ?? null;
    actor.clearTriggers();
    const task = this.c.clip ? actor.play(this.c.clip, true, null, false, ctx.token, null) : Promise.resolve();
    swallow(task);
    await nextFrame(ctx.scene.host.clock, ctx.token);
    await task;
  }
}

// `DesireAffectionWaitCommandBase`: a mode waits time; none waits its host clip's current cycle.
class WaitCommand implements Impl {
  readonly c: Command;

  readonly index: number;

  constructor(c: Command, index: number) {
    this.c = c;
    this.index = index;
  }

  shouldExecute(scene: Scene): boolean { return conditional(this.c)(scene); }

  async execute(ctx: Ctx): Promise<void> {
    const mode = this.c.fields.WaitMode;
    if (mode) {
      await after(ctx.scene.host.clock, waitSeconds(mode), ctx.token);
      return;
    }
    const host = ctx.scene.waitHost(this.index);
    if (!host || !host.clip) return;
    await ctx.scene.actor.controller.waitForCurrentCycleEnd(host.clip, host.track(ctx.scene), ctx.token);
  }
}

// --- playlist and player ---------------------------------------------------------

// A Naninovel playback routine over the playlist; the main player and every transient run are one.
class Cursor {
  index = 0;

  playing = false;

  private routine: Token | null = null;

  readonly scene: Scene;

  readonly bound: number | null;

  constructor(scene: Scene, bound: number | null = null) {
    this.scene = scene;
    this.bound = bound;
  }

  play(index: number, parent: Token): Promise<void> {
    this.routine?.cancel();
    const token = Token.linked(parent);
    this.routine = token;
    this.playing = true;
    this.index = index;
    return this.loop(token);
  }

  stop(): void {
    this.playing = false;
    this.routine?.cancel();
    this.routine = null;
  }

  private async loop(token: Token): Promise<void> {
    try {
      while (this.playing && !token.cancelled) {
        const executed = await this.executePlayed(token);
        if (!this.playing || token.cancelled) break;
        if (!this.selectNext(executed)) break;
      }
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    } finally {
      if (this.routine === token) { this.playing = false; this.routine = null; }
      this.scene.publish();
    }
  }

  private async executePlayed(token: Token): Promise<boolean> {
    const impl = this.scene.impl(this.index);
    if (!impl || !impl.shouldExecute(this.scene)) return false;
    this.scene.markLabel(this.index);
    await impl.execute({ scene: this.scene, cursor: this, token });
    this.scene.publish();
    return true;
  }

  private selectNext(executed: boolean): boolean {
    const { scene } = this;
    const c = scene.program[this.index];
    // `SelectNextCommand`: a played `INestedHost` names the next index itself, body or not.
    const impl = scene.impl(this.index);
    const next = !executed && scene.isEnteringNestedAt(this.index)
      ? scene.exitNestedAt(scene.nestedExitIndexAt(this.index, c.indent), c.indent)
      : impl?.next ? impl.next(this, this.index) : scene.moveAt(this.index, this);
    if (next < 0 || next >= scene.program.length || (this.bound !== null && next >= this.bound)) {
      this.stop();
      return false;
    }
    this.index = next;
    return true;
  }
}

export class Scene {
  readonly labels: string[] = [];

  readonly actor: SceneActor;

  readonly main: Cursor;

  vars: Vars;

  label: string | null = null;

  printerVisible = false;

  joinNext = false;

  gosub: number[] = [];

  resetDestination: string | null = null;

  navigateToReset: (() => void) | null = null;

  waitingInput: (() => void) | null = null;

  private impls: (Impl | null)[];

  private labelIndex = new Map<string, number>();

  private root = new Token();

  private loops = new Map<string, Token>();

  readonly program: Command[];

  readonly host: SceneHost;

  constructor(program: Command[], host: SceneHost, vars: Vars = {}) {
    this.program = program;
    this.host = host;
    this.vars = vars;
    this.actor = new SceneActor(new SceneController(host.rig, host.clock), host.rig);
    this.main = new Cursor(this);
    program.forEach((c, i) => {
      if (c.class !== 'Label' || !c.label) return;
      this.labels.push(c.label);
      if (!this.labelIndex.has(c.label)) this.labelIndex.set(c.label, i);
    });
    this.impls = program.map((c, i) => this.build(c, i));
  }

  impl(index: number): Impl | null { return this.impls[index] ?? null; }

  hasLabel(label: string): boolean { return this.labelIndex.has(label); }

  labelAt(label: string): number | null { return this.labelIndex.get(label) ?? null; }

  firstLabelIndex(): number {
    const at = this.program.findIndex((c) => c.class === 'Label' && c.label);
    return at < 0 ? 0 : at;
  }

  markLabel(index: number): void {
    const c = this.program[index];
    if (c?.class === 'Label' && c.label && this.label !== c.label) this.label = c.label;
  }

  // --- `ScriptPlaylist`

  isEnteringNestedAt(i: number): boolean {
    const a = this.program[i];
    const b = this.program[i + 1];
    return !!a && !!b && b.indent > a.indent;
  }

  isExitingNestedAt(i: number, hostIndent: number): boolean {
    const a = this.program[i];
    if (!a) return false;
    const b = this.program[i + 1];
    return b ? b.indent <= hostIndent : a.indent > 0;
  }

  nestedExitIndexAt(i: number, hostIndent: number): number {
    for (let j = i; j < this.program.length; j++) if (this.isExitingNestedAt(j, hostIndent)) return j;
    return this.program.length - 1;
  }

  skipNestedAt(i: number, hostIndent: number): number {
    return this.exitNestedAt(this.nestedExitIndexAt(i, hostIndent), hostIndent);
  }

  nestedHostIndex(i: number, hostIndent: number): number {
    for (let j = i - 1; j >= 0; j--) {
      if (this.program[j].indent === hostIndent && this.impls[j]?.next) return j;
    }
    return -1;
  }

  exitNestedAt(i: number, hostIndent: number): number {
    if (hostIndent === 0) return i + 1;
    const host = this.nestedHostIndex(i, hostIndent - 1);
    const impl = host >= 0 ? this.impls[host] : null;
    return impl?.next ? impl.next(this.main, i) : i + 1;
  }

  returnToNestedHost(played: number, indent: number): number {
    const host = this.nestedHostIndex(played, indent - 1);
    const impl = host >= 0 ? this.impls[host] : null;
    return impl?.next ? impl.next(this.main, played) : played + 1;
  }

  moveAt(i: number, cursor: Cursor): number {
    const c = this.program[i];
    const impl = this.impls[i];
    if (this.isEnteringNestedAt(i) && impl?.next) return impl.next(cursor, i);
    if (!c || c.indent === 0) return i + 1;
    const host = this.nestedHostIndex(i, c.indent - 1);
    const hostImpl = host >= 0 ? this.impls[host] : null;
    return hostImpl?.next ? hostImpl.next(cursor, i) : i + 1;
  }

  endOfBody(at: number): number {
    const { indent } = this.program[at];
    let i = at + 1;
    while (i < this.program.length && this.program[i].indent > indent) i++;
    return i;
  }

  childrenOf(at: number): number[] {
    const inner = this.program[at].indent + 1;
    const end = this.endOfBody(at);
    const out: number[] = [];
    for (let i = at + 1; i < end; i++) if (this.program[i].indent === inner) out.push(i);
    return out;
  }

  // The nearest enclosing `IDesireAndAffectionWaitHost` — an animation command or a trigger.
  waitHost(index: number): { clip: string | null; track: (scene: Scene) => number | null } | null {
    let indent = this.program[index].indent;
    let at = index;
    while (indent > 0) {
      const host = this.nestedHostIndex(at, indent - 1);
      if (host < 0) return null;
      const impl = this.impls[host];
      if (impl instanceof AnimationCommand || impl instanceof TriggerCommand) return impl;
      if (impl instanceof DragCommand) return { clip: this.program[host].clip ?? null, track: () => null };
      at = host;
      indent = this.program[host].indent;
    }
    return null;
  }

  // `ExecuteCommandTree` / a transient: the command at `at` and its body on their own routine.
  runTree(at: number, token: Token): Promise<void> {
    const cursor = new Cursor(this, this.endOfBody(at));
    return cursor.play(at, token);
  }

  dragCalls(point: Vec): Calls {
    const { contains } = this.host;
    const test = (box: unknown) => (typeof box === 'string' && contains
      ? contains(box.trim().replace(/^[^.]*\./, ''), point[0], point[1]) : null);
    return {
      'drag.isinside': ([box]) => { const r = test(box); return r === null ? null : r ? 1 : 0; },
      'drag.isoutside': ([box]) => { const r = test(box); return r === null ? null : r ? 0 : 1; },
    };
  }

  // --- playback control

  // `ScriptPlayer.Play` at an index, interrupting the hosts the old position sits in.
  playAt(index: number): void {
    if (index < 0 || index >= this.program.length) return;
    this.notifyInterrupted(index);
    this.waitingInput = null;
    swallow(this.main.play(index, this.root));
    this.publish();
  }

  private notifyInterrupted(target: number): void {
    if (!this.main.playing) return;
    let at = this.main.index;
    let indent = this.program[at]?.indent ?? 0;
    const hosts: number[] = [];
    if (this.isEnteringNestedAt(at) && this.impls[at]?.next) hosts.push(at);
    while (indent > 0) {
      const host = this.nestedHostIndex(at, indent - 1);
      if (host < 0) break;
      hosts.push(host);
      at = host;
      indent = this.program[host].indent;
    }
    for (const host of hosts) {
      if (target > host && target < this.endOfBody(host)) continue;
      this.impls[host]?.interrupted?.(this);
    }
  }

  stop(): void {
    this.root.cancel();
    this.root = new Token();
    this.main.stop();
    for (const token of Array.from(this.loops.values())) token.cancel();
    this.loops.clear();
    this.waitingInput = null;
  }

  dispose(): void {
    this.stop();
    this.actor.clearTriggers();
  }

  // Registrations whose `ShouldTrigger` holds now — the ones a pointer event can fire.
  armed(): Armed[] {
    const list: Armed[] = this.actor.triggers.filter((t) => t.command.shouldTrigger()).map((t) => ({
      kind: t instanceof TouchTrigger ? 'touch' : t instanceof DragTrigger ? 'drag' : 'onlook',
      at: t.spot,
      box: t instanceof TouchTrigger || t instanceof DragTrigger ? t.box : null,
      clip: this.program[t.spot]?.clip ?? null,
    }));
    if (this.resetDestination) {
      list.push({ kind: 'reset', at: -1, box: null, clip: null, destination: this.resetDestination });
    }
    return list;
  }

  activeDrag(): DragCommand | null {
    for (const impl of this.impls) if (impl instanceof DragCommand && impl.session) return impl;
    return null;
  }

  parkKind(): ParkKind {
    if (this.waitingInput) return 'wait-input';
    if (this.activeDrag()) return 'drag-session';
    if (this.main.playing) return 'running';
    return this.actor.triggers.length ? 'armed' : 'end';
  }

  publish(): void {
    this.host.onState({ label: this.label, armed: this.armed(), park: { kind: this.parkKind() }, vars: this.vars });
  }

  // --- command table

  private build(c: Command, i: number): Impl | null {
    const f = c.fields ?? {};
    const host = this.host;
    const basic = (run: (ctx: Ctx) => Promise<void> | void) => new Basic(c, i, run);
    const timed = (seconds: number) => async (ctx: Ctx) => {
      if (waits(f) && seconds > 0) await after(host.clock, seconds, ctx.token);
    };
    switch (c.class) {
      case 'DesireCommand': return new AnimationCommand(c, i, false);
      case 'AffectionCommand': return new AnimationCommand(c, i, true);
      case 'DesireIdleCommand':
      case 'AffectionIdleCommand': return new IdleCommand(c, i);
      case 'DesireWaitCommand':
      case 'AffectionWaitCommand': return new WaitCommand(c, i);
      case 'DesireTouchTriggerCommand': return new TriggerCommand(c, i, 'touch');
      case 'DesireOnlookTriggerCommand': return new TriggerCommand(c, i, 'onlook');
      case 'DesireDragCommand': return new DragCommand(c, i);
      case 'Label':
      case 'UsingScopeCommand':
      case 'ShowUI':
      case 'Group':
      case 'NaniSummary':
      case 'Skip':
      case 'AddChoice':
      case 'DesireDragUpdateCommand':
      case 'DesireDragReleaseCommand':
      case 'DesireDragResolveCommand':
      case 'DesireDragBoneCommand':
        return basic(() => {});
      case 'SetCustomVariable':
        return basic(() => { this.vars = applyExpression(f.Expression, this.vars); });
      case 'Goto':
        return basic(() => {
          const target = f.Path ? this.labelIndex.get(stripLabel(f.Path)) : undefined;
          if (target !== undefined) this.playAt(target);
        });
      case 'Gosub':
        // `PushReturnSpot` stores `ScriptPlaylist.MoveAt(gosub)`: a gosub ending a body returns through its host.
        return basic((ctx) => {
          const target = f.Path ? this.labelIndex.get(stripLabel(f.Path)) : undefined;
          if (target === undefined) return;
          this.gosub.push(this.moveAt(i, ctx.cursor));
          this.playAt(target);
        });
      case 'Return':
        return basic(() => {
          const back = this.gosub.pop();
          if (back === undefined) this.main.stop();
          else this.playAt(back);
        });
      case 'Stop':
      case 'End':
      case 'SwitchToGame':
        return basic(() => { this.main.stop(); });
      case 'BeginIf': {
        const impl = new Basic(c, i, () => {});
        impl.shouldExecute = () => true;
        impl.next = (cursor, played) => {
          if (played === i) {
            if (holds(f.Expression, this.vars)) return this.isEnteringNestedAt(i) ? i + 1 : i + 1;
            const end = this.endOfBody(i);
            const after = this.program[end];
            return after && after.class === 'Else' && after.indent === c.indent ? end + 1 : end;
          }
          return blockNext({ index: i, indent: c.indent }, cursor, played);
        };
        return impl;
      }
      case 'Else': {
        const impl = new Basic(c, i, () => {});
        impl.next = (cursor, played) => (played === i
          ? this.endOfBody(i)
          : blockNext({ index: i, indent: c.indent }, cursor, played));
        return impl;
      }
      case 'PickRandom': {
        const impl = new Basic(c, i, () => {});
        impl.next = (_cursor, played) => {
          if (played === i) {
            const groups = this.childrenOf(i);
            return groups.length ? groups[Math.floor(Math.random() * groups.length)] : this.endOfBody(i);
          }
          return this.exitNestedAt(this.nestedExitIndexAt(played, c.indent), c.indent);
        };
        return impl;
      }
      case 'Await': {
        const impl = new Basic(c, i, async (ctx) => {
          await Promise.all(this.childrenOf(i).map((child) => this.runTree(child, ctx.token)));
        });
        impl.next = (_cursor, played) => this.skipNestedAt(played, c.indent);
        return impl;
      }
      case 'Delay': {
        const impl = new Basic(c, i, (ctx) => {
          const token = Token.linked(this.root);
          swallow((async () => {
            await after(host.clock, num(f.Seconds, 0), token);
            for (const child of this.childrenOf(i)) await this.runTree(child, token);
          })());
          void ctx;
        });
        impl.next = (_cursor, played) => (played === i ? this.skipNestedAt(played, c.indent)
          : blockNext({ index: i, indent: c.indent }, _cursor, played));
        return impl;
      }
      case 'LoopCommand': {
        let cycles = 0;
        const count = f.Count ? num(f.Count, 1) : null;
        const foreground = f.Wait !== 'false';
        const impl = new Basic(c, i, (ctx) => {
          const id = f.Id ?? `@${i}`;
          if (f.Active === 'false') {
            this.loops.get(id)?.cancel();
            this.loops.delete(id);
            return;
          }
          cycles = 0;
          if (foreground) return;
          this.loops.get(id)?.cancel();
          const token = Token.linked(this.root);
          this.loops.set(id, token);
          swallow((async () => {
            for (let done = 0; count === null || done < count; done++) {
              token.check();
              for (const child of this.childrenOf(i)) await this.runTree(child, token);
            }
          })());
          void ctx;
        });
        impl.next = (cursor, played) => {
          const active = f.Active !== 'false' && foreground;
          if (played === i) {
            return active && (count === null || cycles < count) && this.isEnteringNestedAt(i)
              ? i + 1 : this.skipNestedAt(played, c.indent);
          }
          if (this.isExitingNestedAt(played, c.indent)) {
            cycles += 1;
            return count === null || cycles < count ? i + 1 : this.exitNestedAt(played, c.indent);
          }
          return played + 1;
        };
        return impl;
      }
      case 'DesireResetCommand': {
        // `Execute` hands the view menu its destination; `NavigateToReset` runs the body, whose exit goes there.
        let requested = false;
        const destination = f.Destination ? stripLabel(f.Destination) : null;
        const impl = new Basic(c, i, () => {
          this.resetDestination = destination;
          this.navigateToReset = () => {
            this.actor.clearTriggers();
            this.resetDestination = null;
            if (this.isEnteringNestedAt(i)) {
              requested = true;
              this.playAt(i + 1);
            } else if (destination !== null && this.labelIndex.has(destination)) {
              this.playAt(this.labelIndex.get(destination) as number);
            }
          };
        });
        impl.next = (_cursor, played) => {
          if (this.isEnteringNestedAt(played)) return this.skipNestedAt(played, c.indent);
          if (this.isExitingNestedAt(played, c.indent)) {
            if (!requested) return this.exitNestedAt(played, c.indent);
            requested = false;
            return destination !== null ? this.labelIndex.get(destination) ?? -1 : -1;
          }
          return played + 1;
        };
        return impl;
      }
      case 'ParametrizeGeneric':
        return basic(async (ctx) => {
          if (f.Join === 'true') this.joinNext = true;
          if (f.SkipWaitingInput !== 'true' && f.Wait === 'true') await this.waitInput(ctx.token);
        });
      case 'PrintText':
        return basic(async (ctx) => {
          if (!this.printerVisible) {
            this.printerVisible = true;
            if (waits(f)) {
              host.subtitle(true);
              await after(host.clock, PRINTER_FADE, ctx.token);
            }
          }
          if (c.text || c.voice) {
            host.say(c.text ?? '', c.author ?? null, c.voice ?? null, c.texts ?? null, this.joinNext);
          }
          this.joinNext = false;
          if (!waits(f)) return;
          if (f.WaitForInput === 'true') { await this.waitInput(ctx.token); return; }
          if (c.voice) {
            await nextFrame(host.clock, ctx.token);
            await waitUntil(host.clock, () => !host.voiceBusy(), ctx.token);
          }
        });
      case 'PlayVoice':
        return basic(() => { if (c.voice) host.voice(c.voice, bool(f.Loop)); });
      case 'HidePrinter': {
        const seconds = num(f.Duration, PRINTER_FADE);
        return basic(async (ctx) => {
          this.printerVisible = false;
          host.subtitle(false);
          await timed(seconds)(ctx);
        });
      }
      case 'ModifyTextPrinter': {
        const timedChange = ['Visible', 'ScenePosition', 'Position', 'Rotation', 'Scale', 'Tint'].some((k) => f[k] !== undefined);
        return basic(async (ctx) => {
          if (f.Visible !== undefined) {
            this.printerVisible = f.Visible !== 'false';
            host.subtitle(this.printerVisible);
          }
          if (timedChange) await timed(num(f.Duration, ACTOR_DURATION))(ctx);
        });
      }
      case 'ModifyBackground': {
        const duration = num(f.Duration, ACTOR_DURATION);
        return basic(async (ctx) => {
          const appearance = f.AppearanceAndTransition ?? '';
          const visible = f.Visible !== 'false';
          const layer = FADE_APPEARANCE.exec(appearance);
          if (layer) host.fade(layer[1].toLowerCase(), visible ? 1 : 0, duration);
          else host.background(appearance, visible, duration);
          await timed(duration)(ctx);
        });
      }
      case 'ScreenFadeCommand': {
        const duration = num(f.Duration, 0);
        return basic(async (ctx) => {
          const inward = f.Direction === 'In' ? true : f.Direction === 'Out' ? false : null;
          const to = f.To !== undefined ? num(f.To, 1) : inward === false ? 0 : 1;
          const from = f.From !== undefined ? num(f.From, 0) : inward === null ? null : inward ? 0 : 1;
          const cover = (v: number) => Math.max(0, Math.min(1, 1 - v));
          host.fade((f.Color ?? 'black').toLowerCase(), cover(to), duration, from === null ? null : cover(from));
          await timed(duration)(ctx);
        });
      }
      case 'BlinkCommand': {
        const duration = num(f.Duration, 0);
        return basic(async (ctx) => {
          host.blink?.(Math.max(0, Math.min(1, num(f.To, 0))), f.From !== undefined ? num(f.From, 0) : null,
            num(f.Position, 50) / 100, num(f.Softness, 0.5), (f.Color ?? 'black').toLowerCase(), duration);
          await timed(duration)(ctx);
        });
      }
      case 'HideAllActors': {
        const duration = num(f.Duration, ACTOR_DURATION);
        return basic(async (ctx) => { host.hideActors?.(duration); await timed(duration)(ctx); });
      }
      case 'PopupImage': {
        const duration = num(f.Duration, ACTOR_DURATION);
        return basic(async (ctx) => {
          if (f.ImageId) host.popup?.(f.ImageId, f.Visible !== 'false', duration);
          await timed(duration)(ctx);
        });
      }
      case 'Spawn':
        return basic(() => { if ((f.Path ?? '').toLowerCase() === 'shakecamera') host.shake?.(num(f.Scale, 1)); });
      case 'PlayBgm': {
        const fade = num(f.FadeInDuration, 0);
        return basic(async (ctx) => {
          if (f.Pause === 'true') host.pauseBgm?.(f.BgmPath ?? null, fade);
          else if (f.BgmPath) host.bgm(f.BgmPath, f.IntroBgmPath ?? null, fade);
          await timed(fade)(ctx);
        });
      }
      case 'StopBgm': {
        const fade = num(f.FadeOutDuration, 0);
        return basic(async (ctx) => { host.stopBgm(fade, f.BgmPath ?? null); await timed(fade)(ctx); });
      }
      case 'PlaySfx': {
        const fade = num(f.FadeInDuration, 0);
        return basic(async (ctx) => {
          if (f.SfxPath) host.sfx?.(f.SfxPath, f.Loop === 'true', fade);
          await timed(fade)(ctx);
        });
      }
      case 'StopSfx': {
        const fade = num(f.FadeOutDuration, 0);
        return basic(async (ctx) => { host.stopSfx?.(f.SfxPath ?? null, fade); await timed(fade)(ctx); });
      }
      case 'ModifyCamera': {
        const duration = num(f.Duration, ACTOR_DURATION);
        return basic(async (ctx) => {
          host.camera(vector(f.Offset), f.Zoom === undefined ? null : num(f.Zoom, 0), duration);
          await timed(duration)(ctx);
        });
      }
      case 'DesireEndingCommand':
      case 'AffectionEndingCommand':
        return basic(() => { host.ending(); });
      default:
        return basic(() => { host.unsupported?.(c.class); });
    }
  }

  waitInput(token: Token): Promise<void> {
    return new Promise((resolve, reject) => {
      const off = token.on(() => {
        if (this.waitingInput === done) this.waitingInput = null;
        reject(new Cancelled());
      });
      const done = () => { off(); this.waitingInput = null; resolve(); this.publish(); };
      this.waitingInput = done;
      this.publish();
    });
  }
}

// --- the viewer-facing player ---------------------------------------------------

export function createScenePlayer(program: Command[], host: SceneHost, vars: Vars = {}) {
  const scene = new Scene(program, host, vars);
  const advanced = new Map<number, number>();
  let pressed: DragTrigger | null = null;
  let disposed = false;

  const play = (index: number) => scene.playAt(index);

  const restampOnlooks = () => {
    const now = host.clock.now();
    for (const t of scene.actor.triggers) if (t instanceof OnlookTrigger) t.armedAt = now;
  };

  // `IsTouch` → `TryGetContainedBoundingBox`: any visible box whose name ends with the filter contains the point.
  const event = (box: string | null, point: Vec): PointerEvent => ({
    isTouch: (filter) => (host.contains
      ? host.contains(filter, point[0], point[1])
      : !!box && (!filter || box.endsWith(filter))),
    point,
  });

  const idealGesture = (angle: number): DragContext => {
    const v: Vec = [Math.cos(angle) * 10, Math.sin(angle) * 10];
    return { start: [0, 0], last: v, delta: v, startedAt: host.clock.now() - 0.1 };
  };

  const armedKinds = () => scene.armed();

  return {
    scene,
    labels: scene.labels,

    armsBox(box: string): boolean {
      return scene.actor.triggers.some((t) => (t instanceof TouchTrigger || t instanceof DragTrigger)
        && (!t.box || box.endsWith(t.box)) && t.command.shouldTrigger());
    },

    boxKind(box: string): 'touch' | 'drag' | null {
      const hits = scene.actor.triggers.filter((t) => (t instanceof TouchTrigger || t instanceof DragTrigger)
        && (!t.box || box.endsWith(t.box)) && t.command.shouldTrigger());
      if (!hits.length) return null;
      return hits.some((t) => t instanceof DragTrigger) ? 'drag' : 'touch';
    },

    armed: armedKinds,

    park: () => ({ kind: scene.parkKind() }),

    resetDestination: (): string | null => scene.resetDestination,

    start(skipEntry: boolean): void {
      play(skipEntry ? scene.firstLabelIndex() : 0);
    },

    goto(label: string): void {
      const at = scene.labelAt(label);
      if (at !== null) play(at);
    },

    // `OnPointerClick`: each touch registration latches, then `CheckTrigger`.
    touch(box: string | null, point: Vec = [0, 0]): boolean {
      if (disposed) return false;
      restampOnlooks();
      const e = event(box, point);
      for (const t of scene.actor.triggers) t.click?.(e);
      const fired = scene.actor.checkTrigger(play);
      scene.publish();
      return fired;
    },

    dragBegin(box: string, x: number, y: number): boolean {
      if (disposed) return false;
      restampOnlooks();
      const e = event(box, [x, y]);
      for (const t of scene.actor.triggers) t.down?.(e);
      pressed = scene.actor.triggers.find((t): t is DragTrigger => t instanceof DragTrigger && t.pressed) ?? null;
      scene.actor.checkTrigger(play);
      return !!pressed;
    },

    dragFrame(x: number, y: number, frameSeconds: number): boolean {
      const trigger = pressed;
      if (!trigger || disposed) return false;
      trigger.drag?.(event(null, [x, y]), frameSeconds);
      return scene.actor.checkTrigger(play);
    },

    dragTrace(): Vars | null {
      const ctx = pressed?.context;
      return ctx && scene.activeDrag() ? dragVars(ctx, host.clock.now()) : null;
    },

    dragBones(): DragBoneTarget[] {
      const drag = scene.activeDrag();
      const ctx = pressed?.context;
      if (!drag || !ctx || !pressed?.pressed) return [];
      const vars = { ...scene.vars, ...dragVars(ctx, host.clock.now()) };
      return scene.childrenOf(drag.index)
        .filter((i) => program[i].class === 'DesireDragUpdateCommand')
        .flatMap((i) => scene.childrenOf(i))
        .map((i) => program[i])
        .filter((c) => c.class === 'DesireDragBoneCommand')
        .map((c) => {
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
      const trigger = pressed;
      pressed = null;
      if (!trigger) return false;
      trigger.up?.();
      return scene.actor.checkTrigger(play);
    },

    advance(): boolean {
      if (!scene.waitingInput) return false;
      scene.waitingInput();
      return true;
    },

    canAutoAdvance(): boolean {
      const kind = scene.parkKind();
      return kind === 'wait-input' || kind === 'drag-session'
        || (kind === 'armed' && scene.actor.triggers.some((t) => t instanceof TouchTrigger || t instanceof DragTrigger));
    },

    // The viewer's Advance button: the least-pressed live touch or drag, a drag with an ideal swipe.
    autoAdvance(): boolean {
      if (scene.waitingInput) { scene.waitingInput(); return true; }
      const drag = scene.activeDrag();
      if (drag?.trigger) {
        drag.trigger.context = idealGesture(Math.PI / 8);
        drag.trigger.released = true;
        return true;
      }
      const pool = scene.actor.triggers.filter((t) => (t instanceof TouchTrigger || t instanceof DragTrigger)
        && t.command.shouldTrigger());
      if (!pool.length) return false;
      const pick = pool.reduce((best, t) => ((advanced.get(t.spot) ?? 0) < (advanced.get(best.spot) ?? 0) ? t : best));
      advanced.set(pick.spot, (advanced.get(pick.spot) ?? 0) + 1);
      restampOnlooks();
      if (pick instanceof TouchTrigger) pick.latched = true;
      if (pick instanceof DragTrigger) {
        pick.context = idealGesture(Math.PI / 8);
        pick.activated = true;
        pick.released = true;
      }
      return scene.actor.checkTrigger(play);
    },

    // The view menu's reset button.
    reset(): boolean {
      const navigate = scene.navigateToReset;
      if (!navigate || !scene.resetDestination) return false;
      scene.navigateToReset = null;
      navigate();
      return true;
    },

    // Fade-ins and the onlook poll, once per frame.
    tick(): void {
      if (disposed) return;
      scene.actor.controller.applyFadeIns();
      if (!scene.main.playing && scene.actor.triggers.some((t) => t instanceof OnlookTrigger)) {
        if (scene.actor.checkTrigger(play)) scene.publish();
      }
    },

    stop(): void {
      disposed = true;
      scene.dispose();
    },
  };
}

export type ScenePlayer = ReturnType<typeof createScenePlayer>;
