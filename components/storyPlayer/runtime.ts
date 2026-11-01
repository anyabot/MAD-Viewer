import type { StoryCommand, StoryScript, StoryScriptIndex } from '@/lib/data';
import { gameText, type GameLang } from '@/lib/gameText';
import { pauseBgm, playBgm, playSfx, stopBgm, stopSfx, type SceneAudioIndex } from '@/lib/sceneAudio';
import { sceneToWorld, worldToScene, type StoryActor, type StoryStage } from './stage';

export type PrinterId = 'ExDialogue' | 'ExWide' | 'ExCenterSubtitle' | 'ExFullScreen' | string;

export type StoryUi = {
  print: (line: { author: string; text: string; append: boolean; printer: PrinterId }) => void;
  hidePrinter: () => void;
  waitInput: () => Promise<void>;
  choose: (options: string[]) => Promise<number>;
  place: (text: string | null) => void;
  report: (unsupported: Map<string, number>) => void;
  sound: () => boolean;
};

// CustomVariablesConfiguration predefined variables, used by named move destinations.
const VARIABLES: Record<string, string> = {
  Left: '25', Center: '50', Right: '75', Near: ',,-25', Normal: ',,0', Far: ',,25', pos: '75',
};
const PRINTERS = new Set(['ExDialogue', 'ExWide', 'ExCenterSubtitle', 'ExFullScreen']);
const DEFAULT_DURATION = 0.35;
const SILENT = new Set(['Label', 'NaniSummary', 'TitleCommand', 'Skip', 'ProcessInput', 'Group',
  'ParametrizeGeneric', 'DesireWaitCommand', 'CharacterStyleOnCommand', 'CharacterStyleOffCommand']);
const COLORS: Record<string, number> = { white: 0xffffff, black: 0x000000, red: 0xff0000, gray: 0x808080, grey: 0x808080 };

const flag = (value: string | undefined, fallback: boolean): boolean =>
  value == null || value === '' ? fallback : value === 'true' || value === '1';
const num = (value: string | undefined, fallback: number): number => {
  const n = value == null || value === '' ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const parts = (value: string | undefined): (number | null)[] =>
  (value ?? '').split(',').map((p) => (p.trim() === '' || !Number.isFinite(Number(p)) ? null : Number(p)));

function color(value: string | undefined): number | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower in COLORS) return COLORS[lower];
  const hex = lower.replace('#', '');
  return /^[0-9a-f]{6}/.test(hex) ? parseInt(hex.slice(0, 6), 16) : null;
}

function actorId(value: string | undefined): [string, string | null] {
  const text = value ?? '';
  const dot = text.indexOf('.');
  return dot < 0 ? [text, null] : [text.slice(0, dot), text.slice(dot + 1)];
}

export class StoryRuntime {
  private pending: Promise<void>[] = [];
  private printer: PrinterId = 'ExDialogue';
  private highlight: string[] | 'auto' | 'all' = 'all';
  private labels = new Map<string, string>();
  private clones = new Map<string, string>();
  private choices: { text: string; goto?: string; body?: [number, number] }[] = [];
  readonly unsupported = new Map<string, number>();
  private stopped = false;
  private lastText = '';
  private track: string | null = null;

  constructor(readonly script: StoryScript, readonly stage: StoryStage, readonly index: StoryScriptIndex,
    readonly lang: GameLang, readonly ui: StoryUi, readonly audio: SceneAudioIndex | null) {}

  resumeMusic(): void {
    if (this.track && !this.stopped) this.music(this.track, 0.5);
  }

  stop(): void {
    this.stopped = true;
    stopBgm(0);
    stopSfx(null);
  }

  async run(): Promise<void> {
    const { commands } = this.script;
    let i = 0;
    while (i < commands.length && !this.stopped) {
      const command = commands[i];
      if (command.class === 'AddChoice') {
        const end = this.bodyEnd(i);
        this.choices.push({
          text: gameText(command.loc?.ChoiceSummary, this.lang),
          goto: command.fields.GotoPath || undefined,
          body: end > i + 1 ? [i + 1, end] : undefined,
        });
        i = end;
        continue;
      }
      const next = await this.step(command, i);
      i = next ?? i + 1;
    }
    await Promise.all(this.pending);
    this.ui.hidePrinter();
    stopBgm(1);
    stopSfx(null, 1);
  }

  private bodyEnd(at: number): number {
    const { commands } = this.script;
    const base = commands[at].indent ?? 0;
    let end = at + 1;
    while (end < commands.length && (commands[end].indent ?? 0) > base) end += 1;
    return end;
  }

  private labelIndex(path: string): number | null {
    const name = path.startsWith('.') ? path.slice(1) : path.split('.')[1] ?? '';
    const at = this.script.commands.findIndex((c) => c.class === 'Label' && c.label === name);
    return at >= 0 ? at : null;
  }

  private async runRange(from: number, to: number): Promise<number | null> {
    let i = from;
    while (i < to && !this.stopped) {
      const next = await this.step(this.script.commands[i], i);
      if (next != null && (next < from || next >= to)) return next;
      i = next ?? i + 1;
    }
    return null;
  }

  private miss(name: string): void {
    this.unsupported.set(name, (this.unsupported.get(name) ?? 0) + 1);
    this.ui.report(this.unsupported);
  }

  private hold(task: Promise<void>, wait: boolean): Promise<void> {
    if (wait) return task;
    this.pending.push(task);
    return Promise.resolve();
  }

  // Returns the next playlist index when the command jumps; null continues.
  private async step(c: StoryCommand, at: number): Promise<number | null> {
    const f = c.fields;
    const wait = flag(f.Wait, true);
    switch (c.class) {
      case 'Goto': {
        const target = this.labelIndex(f.Path ?? '');
        return target ?? this.script.commands.length;
      }
      case 'Stop': {
        if (!this.choices.length) return null;
        const options = this.choices;
        this.choices = [];
        this.ui.hidePrinter();
        const pick = options[await this.ui.choose(options.map((o) => o.text))];
        if (pick?.goto) return this.labelIndex(pick.goto) ?? this.script.commands.length;
        if (pick?.body) {
          const jump = await this.runRange(pick.body[0], pick.body[1]);
          if (jump != null) return jump;
        }
        return at + 1;
      }
      case 'End':
        return this.script.commands.length;
      case 'Wait':
        await this.stage.tween(num(f.WaitMode, 0), undefined, () => {});
        return null;
      case 'Await':
        await Promise.all(this.pending);
        this.pending = [];
        return null;
      case 'PrintText':
        await this.print(c, at);
        return null;
      case 'HidePrinter':
        this.ui.hidePrinter();
        return null;
      case 'ModifyTextPrinter': {
        const [id] = actorId(f.IdAndAppearance);
        if (id) this.printer = id;
        return null;
      }
      case 'AuthorCommand': {
        const id = f.CharacterId ?? '';
        if (flag(f.Reset, false)) this.labels.delete(id);
        else {
          const label = gameText(c.loc?.AuthorLabel, this.lang);
          if (label) this.labels.set(id, label);
        }
        return null;
      }
      case 'CharacterCloneCommand': {
        const [id] = actorId(f.IdAndAppearance);
        if (id && f.Origin) this.clones.set(id, f.Origin);
        return null;
      }
      case 'HighlightCommand': {
        const ids = (f.ActorIds ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
        this.highlight = ids[0] === '*' ? 'all' : ids[0] === 'auto' ? 'auto' : ids;
        if (this.highlight !== 'auto') this.applyHighlight(null);
        return null;
      }
      case 'PlaceCommand':
        this.ui.place(gameText(c.loc?.Text, this.lang) || null);
        return null;
      case 'ModifyBackground':
        await this.hold(this.modifyBackground(c), wait);
        return null;
      case 'ModifyCharacter':
        await this.hold(this.modifyCharacter(c), wait);
        return null;
      case 'CharacterSetAppearanceCommand': {
        const [id, appearance] = actorId(f.IdAndAppearance);
        const actor = this.actor(id);
        if (appearance) actor.setFace(appearance);
        if (f.LookDirection) { actor.look = lookOf(f.LookDirection); actor.apply(); }
        return null;
      }
      case 'CharacterMoveCommand':
      case 'CharacterAppearDestinationCommand':
        await this.hold(this.move(c), wait);
        return null;
      case 'CharacterAppearToLeftCommand':
      case 'CharacterAppearToRightCommand':
        await this.hold(this.appear(c, c.class.includes('Left') ? 1 : -1), wait);
        return null;
      case 'CharacterDisappearToLeftCommand':
      case 'CharacterDisappearToRightCommand':
        await this.hold(this.disappear(c, c.class.includes('Left') ? -1 : 1), wait);
        return null;
      case 'AlphaCommand': {
        const actor = this.actor(f.ActorId ?? '');
        const from = f.From != null && f.From !== '' ? num(f.From, actor.alpha) : actor.alpha;
        const to = num(f.To, actor.alpha);
        await this.hold(this.stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
          actor.alpha = from + (to - from) * t;
          actor.apply();
        }), wait);
        return null;
      }
      case 'TintCommand': {
        const [id, name] = actorId(f.IdAndTint);
        const actor = this.actor(id);
        const rgb = f.Red || f.Green || f.Blue
          ? (num(f.Red, 255) << 16) | (num(f.Green, 255) << 8) | num(f.Blue, 255)
          : color(name ?? '');
        if (rgb != null) { actor.tint = rgb; actor.apply(); }
        return null;
      }
      case 'HideActors': {
        const ids = (f.ActorIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const tasks = ids.map((id) => {
          if (PRINTERS.has(id)) { this.ui.hidePrinter(); return Promise.resolve(); }
          const actor = this.stage.actorMap.get(id);
          return actor ? this.fadeOut(actor, num(f.Duration, DEFAULT_DURATION)) : Promise.resolve();
        });
        await this.hold(Promise.all(tasks).then(() => {}), wait);
        return null;
      }
      case 'HideAllActors':
      case 'HideAllCharacters': {
        const duration = num(f.Duration, DEFAULT_DURATION);
        const tasks = [...this.stage.actorMap.values()].filter((a) => a.visible).map((a) => this.fadeOut(a, duration));
        if (c.class === 'HideAllActors') { this.ui.hidePrinter(); tasks.push(this.stage.hideBackground(duration)); }
        await this.hold(Promise.all(tasks).then(() => {}), wait);
        return null;
      }
      case 'RemoveActors':
        for (const id of (f.ActorIds ?? '').split(',').map((s) => s.trim())) {
          const actor = this.stage.actorMap.get(id);
          if (actor) { actor.visible = false; actor.apply(); }
        }
        return null;
      case 'ScreenFadeCommand':
        await this.hold(this.fade(c), wait);
        return null;
      case 'ModifyCamera':
        await this.hold(this.camera(c), wait);
        return null;
      case 'PlayBgm': {
        const fade = num(f.FadeInDuration, 0);
        if (this.ui.sound()) {
          if (flag(f.Pause, false)) pauseBgm(fade);
          else if (f.BgmPath) this.music(f.BgmPath, fade);
        } else if (f.BgmPath && !flag(f.Pause, false)) this.track = f.BgmPath;
        await this.hold(this.stage.tween(fade, undefined, () => {}), wait);
        return null;
      }
      case 'StopBgm': {
        const fade = num(f.FadeOutDuration, 0);
        this.track = null;
        stopBgm(fade);
        await this.hold(this.stage.tween(fade, undefined, () => {}), wait);
        return null;
      }
      case 'PlaySfx': {
        const fade = num(f.FadeInDuration, 0);
        if (f.SfxPath && this.ui.sound()) {
          const clip = this.clip(f.SfxPath);
          if (clip) void playSfx(this.audio, clip, flag(f.Loop, false), fade);
          else this.miss(`sound ${f.SfxPath}`);
        }
        await this.hold(this.stage.tween(fade, undefined, () => {}), wait);
        return null;
      }
      case 'StopSfx': {
        const fade = num(f.FadeOutDuration, 0);
        stopSfx(f.SfxPath ? this.clip(f.SfxPath) ?? f.SfxPath : null, fade);
        await this.hold(this.stage.tween(fade, undefined, () => {}), wait);
        return null;
      }
      default:
        if (!SILENT.has(c.class)) this.miss(c.class);
        return null;
    }
  }

  private clipNames: Map<string, string> | null = null;

  // Resource names resolve without case: a script's `SE_Tofu_hit_01` is the asset `SE_Tofu_Hit_01`.
  private clip(name: string): string | null {
    if (!this.audio) return null;
    if (this.audio.clips[name]) return name;
    this.clipNames ??= new Map(Object.keys(this.audio.clips).map((k) => [k.toLowerCase(), k]));
    return this.clipNames.get(name.toLowerCase()) ?? null;
  }

  // A music cue names its loop; the intro is paired by name in the scene audio index.
  private music(path: string, fade: number): void {
    this.track = path;
    const track = this.audio?.bgm?.find((t) => t.id === path || t.loop === path);
    if (!track) { this.miss(`music ${path}`); return; }
    void playBgm(this.audio, track.loop, track.intro, fade);
  }

  private actor(id: string): StoryActor {
    return this.stage.actor(id, this.clones.get(id));
  }

  private authorName(id: string | undefined, c: StoryCommand, at: number): string {
    const commands = this.script.commands;
    const generic = commands.slice(at + 1, at + 3).find((x) => x.class === 'ParametrizeGeneric' && x.line === c.line);
    const inline = gameText(generic?.loc?.AuthorLabel, this.lang) || gameText(c.loc?.AuthorLabel, this.lang);
    if (inline) return inline;
    if (!id) return '';
    const label = this.labels.get(id);
    if (label) return label;
    const origin = this.clones.get(id) ?? id;
    if (origin === 'player') return this.lang === 'ko' ? '나' : gameText(this.index.names.player, this.lang) || 'Me';
    return gameText(this.index.names[origin], this.lang) || gameText(this.index.names[id], this.lang) || '';
  }

  private async print(c: StoryCommand, at: number): Promise<void> {
    const f = c.fields;
    const text = (c.texts && (c.texts as Record<string, string>)[this.lang]) || c.text || '';
    const author = this.authorName(f.AuthorId, c, at);
    if (this.highlight === 'auto') this.applyHighlight(f.AuthorId ?? null);
    const append = flag(f.Append, false) && !flag(f.ResetPrinter, true);
    // A translation keys the whole split line, so every appended part repeats it; the first part already shows it.
    if (!(append && text === this.lastText)) this.ui.print({ author, text, append, printer: f.PrinterId || this.printer });
    this.lastText = text;
    if (flag(f.WaitForInput, true)) await this.ui.waitInput();
  }

  private applyHighlight(speaker: string | null): void {
    for (const actor of this.stage.actorMap.values()) {
      const lit = this.highlight === 'all'
        || (this.highlight === 'auto' ? !speaker || actor.id === speaker : this.highlight.includes(actor.id));
      if (actor.dimmed === !lit) continue;
      actor.dimmed = !lit;
      actor.apply();
    }
  }

  private async modifyBackground(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [name] = actorId(f.AppearanceAndTransition);
    const duration = num(f.Duration, DEFAULT_DURATION);
    if (f.Layer && f.Layer !== name) this.miss('ModifyBackground Layer');
    if (!flag(f.Visible, true)) { await this.stage.hideBackground(duration); return; }
    if (name) await this.stage.background(name, duration, f.EasingTypeName);
  }

  private target(actor: StoryActor, scenePosition: string | undefined, position: string | undefined) {
    const now = worldToScene(actor.pos.x, actor.pos.y);
    const next = { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z };
    if (scenePosition) {
      const [x, y, z] = parts(scenePosition);
      const world = sceneToWorld(x ?? now.x, y ?? now.y);
      next.x = world.x; next.y = world.y;
      if (z != null) next.z = z;
    }
    if (position) {
      const [x, y, z] = parts(position);
      if (x != null) next.x = x;
      if (y != null) next.y = y;
      if (z != null) next.z = z;
    }
    return next;
  }

  private async tweenActor(actor: StoryActor, to: { x: number; y: number; z: number }, alpha: number,
    rotation: number, duration: number, ease?: string): Promise<void> {
    const from = { ...actor.pos };
    const fromAlpha = actor.alpha;
    const fromRotation = actor.rotation;
    await this.stage.tween(duration, ease, (t) => {
      actor.pos = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
      actor.alpha = fromAlpha + (alpha - fromAlpha) * t;
      actor.rotation = fromRotation + (rotation - fromRotation) * t;
      actor.apply();
    });
  }

  private async modifyCharacter(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [id, appearance] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    if (appearance) actor.setFace(appearance);
    if (f.LookDirection) actor.look = lookOf(f.LookDirection);
    const tint = color(f.TintColor);
    if (tint != null) actor.tint = tint;
    const show = flag(f.Visible, true);
    if (show && !actor.visible) { actor.visible = true; actor.alpha = 0; }
    const to = this.target(actor, f.ScenePosition, f.Position);
    const rotation = f.Rotation ? parts(f.Rotation)[2] ?? actor.rotation : actor.rotation;
    const duration = num(f.Duration, DEFAULT_DURATION);
    await this.tweenActor(actor, to, show ? 1 : 0, rotation, duration, f.EasingTypeName);
    if (!show) { actor.visible = false; actor.apply(); }
  }

  // A named destination is a custom variable (`Near` -> ",,-25"); each component left empty keeps the current one.
  private destination(actor: StoryActor, value: string | undefined, offset: string | undefined) {
    const now = worldToScene(actor.pos.x, actor.pos.y);
    let scene = { x: now.x, y: now.y };
    let z = actor.pos.z;
    if (value) {
      const resolved = /^[\d\s,.+-]*$/.test(value) ? value : VARIABLES[value] ?? '';
      if (!resolved && value) this.miss(`Destination ${value}`);
      const [x, y, dz] = parts(resolved);
      scene = { x: x ?? scene.x, y: y ?? scene.y };
      if (dz != null) z = dz;
    }
    if (offset) {
      const [x, y, dz] = parts(offset);
      scene = { x: scene.x + (x ?? 0), y: scene.y + (y ?? 0) };
      z += dz ?? 0;
    }
    return { ...sceneToWorld(scene.x, scene.y), z };
  }

  private async move(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [id, appearance] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    if (appearance) actor.setFace(appearance);
    if (f.LookDirection) actor.look = lookOf(f.LookDirection);
    const show = flag(f.Visible, true);
    if (show && !actor.visible) { actor.visible = true; actor.alpha = 0; }
    const to = this.destination(actor, f.Destination, f.Offset);
    await this.tweenActor(actor, to, show ? 1 : 0, actor.rotation, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
    if (!show) { actor.visible = false; actor.apply(); }
  }

  private async appear(c: StoryCommand, side: number): Promise<void> {
    const f = c.fields;
    const [id, appearance] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    if (appearance) actor.setFace(appearance);
    if (f.LookDirection) actor.look = lookOf(f.LookDirection);
    const to = this.destination(actor, f.Destination, undefined);
    actor.pos = { ...to, x: sceneToWorld(side > 0 ? 150 : -50, 0).x };
    actor.visible = true;
    actor.alpha = 1;
    actor.apply();
    await this.tweenActor(actor, to, 1, actor.rotation, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
  }

  private async disappear(c: StoryCommand, side: number): Promise<void> {
    const f = c.fields;
    const [id] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    const to = { ...actor.pos, x: sceneToWorld(side > 0 ? 150 : -50, 0).x };
    await this.tweenActor(actor, to, 1, actor.rotation, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
    actor.visible = false;
    actor.apply();
  }

  private async fadeOut(actor: StoryActor, duration: number): Promise<void> {
    await this.tweenActor(actor, actor.pos, 0, actor.rotation, duration);
    actor.visible = false;
    actor.alpha = 1;
    actor.apply();
  }

  private async fade(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stage = this.stage;
    const out = (f.Direction ?? 'Out') === 'Out';
    const tint = color(f.TintColor) ?? color(f.Color);
    if (tint != null && out) stage.coverColor = tint;
    const from = f.From ? num(f.From, stage.coverAlpha) : stage.coverAlpha;
    const to = f.To ? num(f.To, out ? 1 : 0) : out ? 1 : 0;
    await stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      stage.coverAlpha = from + (to - from) * t;
      stage.drawCover();
    });
  }

  private async camera(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stage = this.stage;
    const from = { ...stage.camera };
    const [ox, oy] = parts(f.Offset);
    const to = { x: f.Offset ? ox ?? from.x : from.x, y: f.Offset ? oy ?? from.y : from.y, zoom: num(f.Zoom, from.zoom) };
    if (f.Rotation || f.Roll) this.miss('ModifyCamera Rotation');
    await stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      stage.camera = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, zoom: from.zoom + (to.zoom - from.zoom) * t };
      stage.applyCamera();
    });
  }
}

function lookOf(value: string): number {
  const lower = value.toLowerCase();
  return lower === 'left' ? 1 : lower === 'right' ? 2 : 0;
}
