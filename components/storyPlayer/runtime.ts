import type { StoryCommand, StoryScript, StoryScriptIndex } from '@/lib/data';
import { gameText, type GameLang } from '@/lib/gameText';
import { pauseBgm, playBgm, playSfx, stopBgm, stopSfx, type SceneAudioIndex } from '@/lib/sceneAudio';
import { holds, type Vars } from '@/components/skinViewer/interactions';
import { applyExpression } from '@/components/skinViewer/sceneRuntime';
import { depthScale, sceneToWorld, worldToScene, type DrawShape, type StoryActor, type StoryStage, type Transition } from './stage';
import type { FilterKind, FilterStack } from './filters';

export type PrinterId = 'ExDialogue' | 'ExWide' | 'ExCenterSubtitle' | 'ExFullScreen' | string;

export type StoryUi = {
  // resolves once the line has finished revealing
  print: (line: { author: string; actor: string | null; text: string; append: boolean; printer: PrinterId; speed: number }) => Promise<void>;
  hidePrinter: () => void;
  waitInput: () => Promise<void>;
  choose: (options: string[]) => Promise<number>;
  place: (text: string | null) => void;
  report: (unsupported: Map<string, number>) => void;
  sound: () => boolean;
  shakePrinter: (x: number, y: number) => void;
};

// CustomVariablesConfiguration predefined variables, used by named move destinations.
const VARIABLES: Record<string, string> = {
  Left: '25', Center: '50', Right: '75', Near: ',,-25', Normal: ',,0', Far: ',,25', pos: '75',
};
const PRINTERS = new Set(['ExDialogue', 'ExWide', 'ExCenterSubtitle', 'ExFullScreen']);
const DEFAULT_DURATION = 0.35;
// CharactersConfiguration / BackgroundsConfiguration DefaultEasing (1 SmoothStep, 3 EaseInQuad).
const ACTOR_EASE = 'SmoothStep';
const BACKGROUND_EASE = 'EaseInQuad';
// Naninovel's default background actor id; `Layer` names another one.
const MAIN_BACKGROUND = 'MainBackground';
// CharacterPingPongMoveCommand subclasses' DefaultPower / DefaultCount / DefaultDuration.
const PING_PONG: Record<string, { power: number; count: number; duration: number }> = {
  CharacterHopHopCommand: { power: 3, count: 2, duration: 0.3 },
  CharacterJumpCommand: { power: 5, count: 1, duration: 0.3 },
  CharacterGreetingCommand: { power: -6, count: 1, duration: 0.7 },
};
// Game UI and flow switches with nothing to draw: the skip button, input lock, chapter-end prompt, UI panels.
const SILENT = new Set(['Label', 'NaniSummary', 'TitleCommand', 'Skip', 'ProcessInput', 'Group',
  'ParametrizeGeneric', 'CharacterStyleOnCommand', 'CharacterStyleOffCommand',
  'ContinueCommand', 'HideUI', 'ShowUI', 'UsingScopeCommand']);
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

function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// The alpha byte of `#RRGGBBAA`; a colour without one is opaque.
function colorAlpha(value: string | undefined): number {
  const hex = (value ?? '').toLowerCase().replace('#', '');
  return /^[0-9a-f]{8}$/.test(hex) ? parseInt(hex.slice(6), 16) / 255 : 1;
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
  private track: string | null = null;
  private trackVolume = 1;
  private vars: Vars = {};
  private loops = new Map<string, { active: boolean }>();
  private readonly owners = new WeakMap<StoryActor, { pos: number; alpha: number; rotation: number }>();
  // an in-battle script plays over the battle music, so it leaves the track running when it ends
  keepMusic = false;

  constructor(readonly script: StoryScript, readonly stage: StoryStage, readonly index: StoryScriptIndex,
    readonly lang: GameLang, readonly ui: StoryUi, readonly audio: SceneAudioIndex | null) {
    // a bare `Label` is published without a fields object
    for (const command of script.commands) command.fields ??= {};
  }

  resumeMusic(): void {
    if (this.track && !this.stopped) this.music(this.track, 0.5);
  }

  stop(): void {
    this.stopped = true;
    stopBgm(0);
    stopSfx(null);
  }

  async run(): Promise<void> {
    await this.walk(0, this.script.commands.length);
    await Promise.all(this.pending);
    for (const loop of this.loops.values()) loop.active = false;
    this.ui.hidePrinter();
    if (!this.keepMusic) stopBgm(1);
    stopSfx(null, 1);
  }

  playTrack(path: string): void {
    this.trackVolume = 1;
    this.music(path, 0.5);
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

  private test(expr: string | undefined): boolean {
    return holds(expr, this.vars);
  }

  // Blocks are indentation: a command's body is the deeper-indented run below it. Returns a jump target outside [from, to).
  private async walk(from: number, to: number): Promise<number | null> {
    const { commands } = this.script;
    let i = from;
    while (i < to && !this.stopped) {
      const c = commands[i];
      const end = this.bodyEnd(i);
      let next: number;
      if (c.fields.ConditionalExpression && c.class !== 'BeginIf' && !this.test(c.fields.ConditionalExpression)) {
        next = end;
      } else if (c.class === 'AddChoice') {
        this.choices.push({
          text: gameText(c.loc?.ChoiceSummary, this.lang),
          goto: c.fields.GotoPath || undefined,
          body: end > i + 1 ? [i + 1, end] : undefined,
        });
        next = end;
      } else if (c.class === 'BeginIf') {
        const otherwise = commands[end]?.class === 'Else' && (commands[end].indent ?? 0) === (c.indent ?? 0) ? end : -1;
        const after = otherwise >= 0 ? this.bodyEnd(otherwise) : end;
        const jump = this.test(c.fields.Expression) ? await this.walk(i + 1, end)
          : otherwise >= 0 ? await this.walk(otherwise + 1, after) : null;
        next = jump ?? after;
      } else if (c.class === 'Else') {
        next = end;
      } else if (c.class === 'LoopCommand') {
        next = (await this.loop(c, i, end)) ?? end;
      } else {
        next = (await this.step(c, i)) ?? end;
      }
      if (next < from || next > to) return next;
      i = next;
    }
    return null;
  }

  // LoopCommand: `Wait` runs the body Count times in place; otherwise it repeats in the background until `Active:false` with its Id.
  private async loop(c: StoryCommand, at: number, end: number): Promise<number | null> {
    const id = c.fields.Id ?? '';
    if (!flag(c.fields.Active, true)) {
      const running = this.loops.get(id);
      if (running) running.active = false;
      return null;
    }
    if (end <= at + 1) return null;
    if (flag(c.fields.Wait, true)) {
      for (let n = 0; n < num(c.fields.Count, 1) && !this.stopped; n += 1) {
        const jump = await this.walk(at + 1, end);
        if (jump != null) return jump;
      }
      return null;
    }
    const state = { active: true };
    this.loops.set(id, state);
    const limit = num(c.fields.Count, Infinity);
    // A background loop is not async work `Await` waits on (it ends only on `Active:false`), and a pass that took no time yields a frame.
    void (async () => {
      for (let n = 0; n < limit && state.active && !this.stopped; n += 1) {
        const start = this.stage.time;
        await this.walk(at + 1, end);
        if (this.stage.time === start) await this.stage.tween(1 / 60, undefined, () => {});
      }
    })();
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
          const jump = await this.walk(pick.body[0], pick.body[1]);
          if (jump != null) return jump;
        }
        return at + 1;
      }
      case 'End':
        return this.script.commands.length;
      case 'SetCustomVariable':
        this.vars = applyExpression(f.Expression, this.vars);
        return null;
      case 'WaitForInput':
        await this.ui.waitInput();
        return null;
      case 'ResetText':
        this.ui.hidePrinter();
        return null;
      case 'Wait':
        await this.stage.tween(num(f.WaitMode, 0), undefined, () => {});
        return null;
      // `DesireAffectionWaitCommandBase::Execute`: a WaitMode alone runs a stock Wait sharing that parameter.
      case 'DesireWaitCommand':
        if (f.Animation || f.Track || !f.WaitMode) this.miss('DesireWaitCommand animation cycle');
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
      case 'DesireCommand':
      case 'PleasureCommand':
      case 'DramaCommand':
        await this.hold(this.cutscene(c), wait);
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
      case 'CharacterHopHopCommand':
      case 'CharacterJumpCommand':
      case 'CharacterGreetingCommand':
        await this.hold(this.pingPong(c, PING_PONG[c.class]), wait);
        return null;
      case 'CharacterEmoticonCommand':
        await this.hold(this.emoticon(c), wait);
        return null;
      case 'Spawn':
        await this.hold(this.spawn(c), wait);
        return null;
      case 'DestroySpawned':
        this.stage.stopFx(`spawn:${f.Path ?? ''}`);
        return null;
      case 'DestroyAllSpawned':
        this.stage.stopFx(null);
        return null;
      case 'CharacterEffectSpawnCommand':
        await this.hold(this.characterEffect(c), wait);
        return null;
      case 'PopupImage':
        await this.hold(this.popup(c), wait);
        return null;
      case 'DrawBoxCommand':
      case 'DrawCircleCommand':
      case 'DrawLineCommand':
      case 'DrawFillCommand':
      case 'DrawImageCommand':
        await this.hold(this.draw(c), wait);
        return null;
      case 'DrawHoleCommand':
        await this.hold(this.hole(c), wait);
        return null;
      case 'ClearDrawCommand':
        await this.hold(this.clearDraw(c), wait);
        return null;
      case 'SpawnShake':
        await this.hold(this.spawnShake(c), wait);
        return null;
      case 'CharacterFilterCommand':
      case 'BackgroundFilterCommand':
      case 'ScreenFilterCommand':
        await this.hold(this.filter(c), wait);
        return null;
      case 'SpawnBlur':
        await this.hold(this.blur(c), wait);
        return null;
      case 'CharacterStiffCommand':
        await this.hold(this.stiff(c), wait);
        return null;
      case 'CharacterRollCommand':
        await this.hold(this.roll(c), wait);
        return null;
      case 'CharacterMoveCommand':
      case 'CharacterAppearDestinationCommand':
        await this.hold(this.move(c), wait);
        return null;
      case 'CharacterAppearToLeftCommand':
      case 'CharacterAppearToRightCommand':
        await this.hold(this.appear(c, c.class.includes('Left') ? 1 : -1), wait);
        return null;
      case 'CharacterDisappearCommand': {
        const [id] = actorId(f.IdAndAppearance);
        const actor = this.stage.actorMap.get(id);
        if (actor) await this.hold(this.fadeOut(actor, num(f.Duration, DEFAULT_DURATION)), wait);
        return null;
      }
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
          const layer = this.stage.backLayers.get(id);
          if (layer) return this.stage.hideBack(layer, num(f.Duration, DEFAULT_DURATION));
          const cutscene = this.stage.cutscenes.get(id);
          if (cutscene) return this.stage.fadeCutscene(cutscene, 0, num(f.Duration, DEFAULT_DURATION));
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
        if (c.class === 'HideAllActors') {
          this.ui.hidePrinter();
          for (const layer of this.stage.backLayers.values()) tasks.push(this.stage.hideBack(layer, duration));
          for (const cutscene of this.stage.cutscenes.values()) if (cutscene.visible) tasks.push(this.stage.fadeCutscene(cutscene, 0, duration));
        }
        await this.hold(Promise.all(tasks).then(() => {}), wait);
        return null;
      }
      case 'RemoveActors':
        for (const id of (f.ActorIds ?? '').split(',').map((s) => s.trim())) {
          const actor = this.stage.actorMap.get(id);
          if (actor) { actor.visible = false; actor.apply(); }
        }
        return null;
      case 'SlideCommand':
      case 'BlinkCommand':
      case 'IrisCommand':
      case 'CircleCommand':
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
          else if (f.BgmPath) { this.trackVolume = num(f.Volume, 1); this.music(f.BgmPath, fade); }
        } else if (f.BgmPath && !flag(f.Pause, false)) { this.track = f.BgmPath; this.trackVolume = num(f.Volume, 1); }
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
          if (clip) void playSfx(this.audio, clip, flag(f.Loop, false), fade, num(f.Volume, 1));
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
    void playBgm(this.audio, track.loop, track.intro, fade, this.trackVolume);
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
    // Naninovel prints the actor id when it has no display name, as for `???`.
    return gameText(this.index.names[origin], this.lang) || gameText(this.index.names[id], this.lang) || (/^\?+$/.test(id) ? id : '');
  }

  private async print(c: StoryCommand, at: number): Promise<void> {
    const f = c.fields;
    const text = (c.texts && (c.texts as Record<string, string>)[this.lang]) || c.text || '';
    const generic = this.script.commands.slice(at + 1, at + 3).find((x) => x.class === 'ParametrizeGeneric' && x.line === c.line);
    // `Unknown` hides the speaker behind the label `CharacterManager.IsUnknownAuthorLabel` tests for.
    const unknown = flag(f.Unknown ?? generic?.fields.Unknown, false);
    const author = unknown && f.AuthorId ? '???' : this.authorName(f.AuthorId, c, at);
    if (this.highlight === 'auto') this.applyHighlight(f.AuthorId ?? null);
    const append = flag(f.Append, false) && !flag(f.ResetPrinter, true);
    const actor = f.AuthorId ? this.clones.get(f.AuthorId) ?? f.AuthorId : null;
    const revealed = this.ui.print({ author, actor, text, append, printer: f.PrinterId || this.printer, speed: num(f.RevealSpeed, 1) });
    const skip = flag(generic?.fields.SkipWaitingInput, false);
    if (flag(f.WaitForInput, true) && !skip) await this.ui.waitInput();
    else await revealed;
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
    const [name, transition] = actorId(f.AppearanceAndTransition);
    const stage = this.stage;
    const layer = stage.backLayer(f.Layer || MAIN_BACKGROUND);
    const duration = num(f.Duration, DEFAULT_DURATION);
    const ease = f.EasingTypeName ?? BACKGROUND_EASE;
    if (!flag(f.Visible, true)) { await stage.hideBack(layer, duration, ease); return; }
    const tasks: Promise<void>[] = [];
    if (name) tasks.push(stage.setBackAppearance(layer, name, duration, ease, f.Transition || transition || undefined));
    const to = { x: layer.x, y: layer.y, z: layer.z, rotation: layer.rotation, scaleX: layer.scaleX, scaleY: layer.scaleY };
    if (f.ScenePosition) {
      const [x, y, z] = parts(f.ScenePosition);
      const now = worldToScene(layer.x, layer.y);
      const world = sceneToWorld(x ?? now.x, y ?? now.y);
      Object.assign(to, { x: world.x, y: world.y });
      if (z != null) to.z = z;
    }
    if (f.Position) {
      const [x, y, z] = parts(f.Position);
      if (x != null) to.x = x;
      if (y != null) to.y = y;
      if (z != null) to.z = z;
    }
    const rz = f.Rotation ? parts(f.Rotation)[2] : null;
    if (rz != null) to.rotation = rz;
    if (f.Scale) {
      const [sx, sy] = parts(f.Scale);
      to.scaleX = sx ?? to.scaleX;
      to.scaleY = sy ?? sx ?? to.scaleY;
    }
    const tint = color(f.TintColor);
    const tintAlpha = f.TintColor ? colorAlpha(f.TintColor) : layer.tintAlpha;
    const fresh = !layer.visible;
    layer.visible = true;
    const from = { ...layer, tint: layer.tint };
    // Unlike the other fields, the layer's z (draw order) switches at once.
    layer.z = to.z;
    tasks.push(stage.tween(duration, ease, (t) => {
      const mix = (a: number, b: number) => a + (b - a) * t;
      layer.x = mix(from.x, to.x);
      layer.y = mix(from.y, to.y);
      layer.rotation = mix(from.rotation, to.rotation);
      layer.scaleX = mix(from.scaleX, to.scaleX);
      layer.scaleY = mix(from.scaleY, to.scaleY);
      layer.alpha = fresh ? mix(from.alpha, 1) : 1;
      layer.tintAlpha = mix(from.tintAlpha, tintAlpha);
      if (tint != null) layer.tint = mixColor(from.tint, tint, t);
      stage.renderBack(layer);
    }));
    await Promise.all(tasks);
  }

  // `DesireCommand` names the `<id>/desire` actor; Pleasure and Drama actors are their mapper names.
  private async cutscene(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [id, appearance] = actorId(f.IdAndAppearance);
    const prefix = { DesireCommand: 'DesireAndAffections', PleasureCommand: 'Pleasures', DramaCommand: 'Dramas' }[c.class as 'DramaCommand'];
    const actorKey = c.class === 'DesireCommand' ? `${id}/desire` : id;
    const cutscene = this.stage.cutscene(actorKey, `${prefix}/${actorKey}`);
    if (!cutscene) { this.miss(`${c.class} ${actorKey}`); return; }
    for (const name of ['Offset', 'Zoom', 'Track', 'Mix'] as const) if (f[name]) this.miss(`${c.class} ${name}`);
    for (const name of ['Reset', 'Hold', 'Jiggler'] as const) if (flag(f[name], false)) this.miss(`${c.class} ${name}`);
    await cutscene.ready;
    const show = cutscene.visible ? Promise.resolve() : this.stage.fadeCutscene(cutscene, 1, num(f.Duration, DEFAULT_DURATION));
    await Promise.all([show, cutscene.play(appearance, flag(f.Loop, false))]);
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

  // Per-property tweens, a newer one taking its property over (Naninovel's actor tweens), so a face change mid-move cannot freeze the move.
  private async tweenActor(actor: StoryActor, change: { pos?: { x: number; y: number; z: number }; alpha?: number; rotation?: number },
    duration: number, ease?: string): Promise<void> {
    const from = { pos: { ...actor.pos }, alpha: actor.alpha, rotation: actor.rotation };
    const owners = this.owners.get(actor) ?? { pos: 0, alpha: 0, rotation: 0 };
    this.owners.set(actor, owners);
    const mine = {
      pos: change.pos ? ++owners.pos : -1,
      alpha: change.alpha != null ? ++owners.alpha : -1,
      rotation: change.rotation != null ? ++owners.rotation : -1,
    };
    await this.stage.tween(duration, ease ?? ACTOR_EASE, (t) => {
      const to = change.pos;
      if (to && owners.pos === mine.pos) {
        actor.pos = { x: from.pos.x + (to.x - from.pos.x) * t, y: from.pos.y + (to.y - from.pos.y) * t, z: from.pos.z + (to.z - from.pos.z) * t };
      }
      if (change.alpha != null && owners.alpha === mine.alpha) actor.alpha = from.alpha + (change.alpha - from.alpha) * t;
      if (change.rotation != null && owners.rotation === mine.rotation) actor.rotation = from.rotation + (change.rotation - from.rotation) * t;
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
    if (f.TimeScale) actor.setTimeScale(num(f.TimeScale, 1));
    const show = flag(f.Visible, true);
    const appearing = show && !actor.visible;
    if (appearing) { actor.visible = true; actor.alpha = 0; }
    const moves = !!(f.ScenePosition || f.Position);
    // Unity z turns counter-clockwise; the actor keeps a clockwise angle, as `CharacterRollCommand` does.
    const z = f.Rotation ? parts(f.Rotation)[2] : null;
    const duration = num(f.Duration, DEFAULT_DURATION);
    await this.tweenActor(actor, {
      pos: moves ? this.target(actor, f.ScenePosition, f.Position) : undefined,
      alpha: !show ? 0 : appearing || actor.alpha < 1 ? 1 : undefined,
      rotation: z != null ? -z : undefined,
    }, duration, f.EasingTypeName);
    if (!show) { actor.visible = false; actor.apply(); }
  }

  // A named destination is a custom variable (`Near` -> ",,-25"); each component left empty keeps the current one.
  private destination(actor: StoryActor, value: string | undefined, offset: string | undefined) {
    const now = worldToScene(actor.pos.x, actor.pos.y);
    let scene = { x: now.x, y: now.y };
    let z = actor.pos.z;
    if (value) {
      // An undefined name (`Center.Near`) fails `ParseFloats` in the client, which skips the move; so does this.
      const resolved = /^[\d\s,.+-]*$/.test(value) ? value : VARIABLES[value] ?? '';
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
    const appearing = show && !actor.visible;
    if (appearing) { actor.visible = true; actor.alpha = 0; }
    const to = this.destination(actor, f.Destination, f.Offset);
    await this.tweenActor(actor, { pos: to, alpha: !show ? 0 : appearing ? 1 : undefined }, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
    if (!show) { actor.visible = false; actor.apply(); }
  }

  // CharacterMoveSequenceCommand: each step tweens the named scene-percent components from the base position, in order.
  private async sequence(actor: StoryActor, steps: { duration: number; x?: number; y?: number }[], ease: string): Promise<void> {
    for (const step of steps) {
      const now = worldToScene(actor.pos.x, actor.pos.y);
      const world = sceneToWorld(step.x ?? now.x, step.y ?? now.y);
      await this.tweenActor(actor, { pos: { ...actor.pos, x: world.x, y: world.y } }, step.duration, ease);
    }
  }

  // CharacterEmoticonCommand spawns the prefab and plays its `SFX_Char_Emo_<NN>_<Name>` clip (paired by name — inference).
  private async emoticon(c: StoryCommand): Promise<void> {
    const [id, name] = actorId(c.fields.IdAndEmoticon);
    if (!name) return;
    const actor = this.actor(id);
    await actor.ready;
    const volume = num(c.fields.Volume, 1);
    if (this.ui.sound() && volume > 0) {
      const clip = this.emoteClip(name);
      if (clip) void playSfx(this.audio, clip, false, 0, volume);
    }
    if (!(await actor.emote(name))) this.miss(`emote ${name}`);
  }

  private emoteClip(name: string): string | null {
    if (!this.audio) return null;
    const pattern = new RegExp(`^SFX_Char_Emo_[0-9]+_${name}$`, 'i');
    return Object.keys(this.audio.clips).find((k) => pattern.test(k)) ?? null;
  }

  private spawnShake(c: StoryCommand): Promise<void> {
    const f = c.fields;
    return this.shake(f.ActorId && f.ActorId !== 'Camera' ? 'character' : 'camera', f.ActorId ?? '', {
      count: f.ShakeCount, duration: f.ShakeDuration, durationVariation: f.DurationVariation,
      amplitude: f.ShakeAmplitude, amplitudeVariation: f.AmplitudeVariation,
      horizontal: f.ShakeHorizontally, vertical: f.ShakeVertically, damping: f.Damping, ease: f.EasingTypeName,
    });
  }

  // Naninovel ShakeTransform: per iteration -half, +full, back over 1/4, 1/2, 1/4 of a varied duration; damping thins later iterations.
  private async shake(kind: 'camera' | 'character' | 'background' | 'printer', id: string, p: Record<string, string | undefined>): Promise<void> {
    const actor = kind === 'character' ? this.stage.actorMap.get(id) ?? null : null;
    if (kind === 'character' && !actor) return;
    const count = num(p.count, 3);
    const duration = num(p.duration, 0.15);
    const amplitude = num(p.amplitude, 0.5);
    const horizontal = flag(p.horizontal, false);
    const vertical = flag(p.vertical, true);
    const damping = Math.min(1, Math.max(0, num(p.damping, 0)));
    const vary = (base: number, by: number) => base + base * (Math.random() * 2 - 1) * by;
    const set = (x: number, y: number) => {
      if (actor) { actor.shake = { x, y }; actor.apply(); } else if (kind === 'background') this.stage.shakeBackground(x, y);
      else if (kind === 'printer') this.ui.shakePrinter(x, y);
      else { this.stage.shake = { x, y }; this.stage.applyCamera(); }
    };
    const move = (from: { x: number; y: number }, to: { x: number; y: number }, seconds: number) =>
      this.stage.tween(seconds, p.ease, (t) => set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t));
    for (let i = 0; i < count && !this.stopped; i += 1) {
      const scale = 1 - damping * (count > 1 ? i / (count - 1) : 0);
      const a = vary(amplitude, num(p.amplitudeVariation, 0.5)) * scale;
      const d = { x: horizontal ? a : 0, y: vertical ? a : 0 };
      const span = vary(duration, num(p.durationVariation, 0.25));
      const low = { x: -d.x / 2, y: -d.y / 2 };
      await move({ x: 0, y: 0 }, low, span / 4);
      await move(low, d, span / 2);
      await move(d, { x: 0, y: 0 }, span / 4);
    }
    set(0, 0);
  }

  // `@spawn Shake<Target>` positional params: object id, count, duration, duration variation, amplitude, amplitude variation, horizontal, vertical.
  private spawn(c: StoryCommand): Promise<void> {
    const path = c.fields.Path ?? '';
    const kind = ({ ShakeCamera: 'camera', ShakeCharacter: 'character', ShakeBackground: 'background', ShakePrinter: 'printer' } as const)[path as 'ShakeCamera'];
    if (!kind) return this.spawnEffect(c);
    const [id, count, duration, durationVariation, amplitude, amplitudeVariation, horizontal, vertical] =
      (c.fields.Params ?? '').split(',').map((v) => v.trim() || undefined);
    return this.shake(kind, id ?? '', { count, duration, durationVariation, amplitude, amplitudeVariation, horizontal, vertical });
  }

  private stackFor(id: string): FilterStack | null {
    if (this.stage.actorMap.has(id)) return this.stage.actorMap.get(id)!.filters;
    if (/^BG_/i.test(id)) return this.stage.backgroundFilters;
    return null;
  }

  // CharacterFilterType Off / Scanline / Grayscale / Glitch / Silhouette; Off clears every filter on the target.
  private async filter(c: StoryCommand): Promise<void> {
    const f = c.fields;
    let stack: FilterStack | null;
    let type: string;
    let level = 1;
    if (c.class === 'ScreenFilterCommand') {
      stack = this.stage.screenFilters;
      type = f.FilterTypeName ?? '';
      level = num(f.Intensity, 1);
    } else {
      const [id, name] = actorId(f.IdAndFilterType);
      stack = this.stackFor(id);
      type = name ?? '';
    }
    if (!stack) return;
    const kind = type.toLowerCase();
    const on = flag(f.Enable, true);
    const kinds: FilterKind[] = kind === 'off' ? ['grayscale', 'sepia', 'silhouette', 'scanline', 'glitch']
      : (['grayscale', 'sepia', 'silhouette', 'scanline', 'glitch'] as FilterKind[]).filter((k) => k === kind);
    if (!kinds.length) { this.miss(`filter ${type}`); return; }
    const from = kinds.map((k) => stack!.amounts[k]);
    const to = kind === 'off' || !on ? 0 : level;
    await this.stage.tween(num(f.Duration, 0), undefined, (t) => {
      kinds.forEach((k, i) => { stack!.amounts[k] = from[i] + (to - from[i]) * t; });
    });
  }

  private async blur(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stack = f.ActorId === 'Camera' ? this.stage.screenFilters : this.stackFor(f.ActorId ?? '');
    if (!stack) return;
    const from = stack.amounts.blur;
    const to = num(f.Intensity, 0);
    await this.stage.tween(num(f.FadeDuration, 0), undefined, (t) => { stack.amounts.blur = from + (to - from) * t; });
  }

  // A spawned prefab sits at its scene position (centre when none); Rotation y 180 mirrors it.
  private async spawnEffect(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const path = f.Path ?? '';
    const prefab = byName(this.stage.fx?.spawn, path);
    if (!prefab) { this.miss(`effect ${path}`); return; }
    const at = this.target({ pos: { x: 0, y: 0, z: 0 } } as StoryActor, f.ScenePosition, f.Position);
    const [, ry, rz] = parts(f.Rotation);
    await this.stage.spawnFx(prefab, `spawn:${path}`, {
      x: at.x, y: at.y, scale: num(f.Scale, 1), rotation: rz ?? 0, mirror: Math.abs(ry ?? 0) === 180,
    });
  }

  // CharacterEffectSpawnCommand: the effect rides the actor (Follow) at an offset from its pivot; Visible:false removes it by Id.
  private async characterEffect(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [id, name] = actorId(f.IdAndFx);
    const key = `character:${f.Id || `${id}.${name}`}`;
    if (!flag(f.Visible, true)) { this.stage.stopFx(key); return; }
    const prefab = name ? byName(this.stage.fx?.characterFx, name) : undefined;
    if (!prefab) { this.miss(`character effect ${name}`); return; }
    const actor = this.actor(id);
    await actor.ready;
    const [ox, oy] = parts(f.Position);
    const follow = flag(f.Follow, true);
    await this.stage.spawnFx(prefab, key, {
      x: (ox ?? 0) + (follow ? 0 : actor.pos.x), y: -(oy ?? 0) + (follow ? 0 : actor.pos.y), scale: num(f.Scale, 1), rotation: 0,
    }, follow ? actor.holder : undefined);
  }

  // A popup image is a world sprite at 100 pixels per unit, centred unless placed, faded by Duration.
  private async popup(c: StoryCommand): Promise<void> {
    const f = c.fields;
    // Inferred: `Visible:false` naming no image hides every popup on screen.
    if (!f.ImageId && !flag(f.Visible, true)) {
      const shown = this.stage.popupSprites().filter((s) => s.visible);
      const from = shown.map((s) => s.alpha);
      await this.stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => { shown.forEach((s, i) => { s.alpha = from[i] * (1 - t); }); });
      shown.forEach((s) => { s.visible = false; });
      return;
    }
    const entry = this.stage.fx?.popups[f.ImageId ?? ''];
    if (!entry) { this.miss(`popup ${f.ImageId}`); return; }
    const sprite = await this.stage.popupSprite(f.ImageId!, entry.image, entry.size);
    if (!sprite) return;
    const at = this.target({ pos: { x: sprite.x, y: -sprite.y, z: 0 } } as StoryActor, f.ScenePosition, f.Position);
    const show = flag(f.Visible, true);
    const from = { x: sprite.x, y: sprite.y, s: sprite.scale.y, a: sprite.alpha, r: sprite.rotation };
    const scale = num(f.Scale, from.s || 1);
    const [, , rz] = parts(f.Rotation);
    const rotation = rz != null ? (-rz * Math.PI) / 180 : from.r;
    if (show && !sprite.visible) { sprite.visible = true; sprite.alpha = 0; from.a = 0; }
    await this.stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      sprite.position.set(from.x + (at.x - from.x) * t, from.y + (-at.y - from.y) * t);
      sprite.scale.set(from.s + (scale - from.s) * t);
      sprite.rotation = from.r + (rotation - from.r) * t;
      sprite.alpha = from.a + ((show ? 1 : 0) - from.a) * t;
    });
    if (!show) sprite.visible = false;
  }

  private async draw(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stage = this.stage;
    const kinds: Record<string, DrawShape['kind']> = {
      DrawBoxCommand: 'box', DrawCircleCommand: 'circle', DrawLineCommand: 'line', DrawFillCommand: 'fill', DrawImageCommand: 'image',
    };
    const kind = kinds[c.class];
    const shape = stage.drawShape(f.Id || f.ImageId || kind);
    const fresh = shape.alpha <= 0.001;
    shape.kind = kind;
    if (kind === 'image' && !shape.sprite) {
      const entry = stage.fx?.popups[f.ImageId ?? ''];
      if (!entry) { this.miss(`draw image ${f.ImageId}`); return; }
      const holder = await stage.popupSprite(`draw:${shape.id}`, entry.image, entry.size);
      if (!holder) return;
      shape.sprite = holder.children[0];
      holder.removeChild(shape.sprite);
      shape.sprite.anchor.set(0.5);
      shape.node.addChild(shape.sprite);
    }
    const [px, py, pz] = parts(f.Position);
    const [sw, sh] = parts(f.Size);
    const [fx, fy] = parts(f.From);
    const [tx, ty] = parts(f.To);
    const [vx, vy] = parts(f.Pivot);
    const to = {
      x: px ?? shape.x, y: py ?? shape.y, z: num(f.Z, pz ?? shape.z),
      w: sw ?? shape.w, h: sh ?? (sw != null && kind !== 'box' ? sw : shape.h),
      rotation: f.Rotation ? num(f.Rotation, 0) : shape.rotation,
      alpha: flag(f.Visible, true) ? 1 : 0,
      fromX: fx ?? shape.fromX, fromY: fy ?? shape.fromY, toX: tx ?? shape.toX, toY: ty ?? shape.toY,
      length: f.Length ? num(f.Length, 0) : shape.length,
    };
    shape.color = color(f.TintColor) ?? (kind === 'image' ? 0xffffff : shape.color);
    if (shape.sprite) shape.sprite.tint = shape.color;
    shape.border = color(f.BorderColor);
    shape.thickness = num(f.Thickness, shape.thickness);
    shape.pivotX = vx ?? shape.pivotX;
    shape.pivotY = vy ?? shape.pivotY;
    if (fresh) Object.assign(shape, { ...to, alpha: 0, length: to.length != null ? 0 : null });
    const start = { ...shape };
    await stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      const mix = (a: number, b: number) => a + (b - a) * t;
      Object.assign(shape, {
        x: mix(start.x, to.x), y: mix(start.y, to.y), z: to.z, w: mix(start.w, to.w), h: mix(start.h, to.h),
        rotation: mix(start.rotation, to.rotation), alpha: mix(start.alpha, to.alpha),
        fromX: mix(start.fromX, to.fromX), fromY: mix(start.fromY, to.fromY), toX: mix(start.toX, to.toX), toY: mix(start.toY, to.toY),
        length: to.length != null ? mix(start.length ?? 0, to.length) : null,
      });
      stage.renderShape(shape);
    });
  }

  private async hole(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stage = this.stage;
    const [x, y] = parts(f.Position);
    const id = f.Id ?? '';
    const existing = stage.holes.find((h) => h.id === id);
    const target = {
      id, x: x ?? existing?.x ?? 50, y: y ?? existing?.y ?? 50,
      size: flag(f.Visible, true) ? num(f.Size, existing?.size ?? 10) : 0, soft: num(f.Soft, 0),
    };
    const live = existing ? { ...existing } : { ...target, size: 0 };
    const from = { ...live };
    stage.holes = [...stage.holes.filter((h) => h.id !== id), live];
    await stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      live.x = from.x + (target.x - from.x) * t;
      live.y = from.y + (target.y - from.y) * t;
      live.size = from.size + (target.size - from.size) * t;
      for (const shape of stage.draws.values()) if (shape.kind === 'fill') stage.renderShape(shape);
    });
  }

  private async clearDraw(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const ids = f.Ids ? f.Ids.split(',').map((s) => s.trim()) : null;
    const shapes = [...this.stage.draws.values()].filter((s) => !ids || ids.includes(s.id));
    const from = shapes.map((s) => s.alpha);
    await this.stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      shapes.forEach((s, i) => { s.alpha = from[i] * (1 - t); this.stage.renderShape(s); });
    });
    if (!ids) this.stage.holes = [];
  }

  // <GetMoveSequence>d__11: per count, up by power x depth scale over half the duration, then back.
  private async pingPong(c: StoryCommand, defaults: { power: number; count: number; duration: number }): Promise<void> {
    const f = c.fields;
    const [id] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    const base = worldToScene(actor.pos.x, actor.pos.y);
    const lift = num(f.Power, defaults.power) * depthScale(actor.pos.z);
    const half = num(f.Duration, defaults.duration) / 2;
    const steps = [];
    for (let i = 0; i < num(f.Count, defaults.count); i += 1) steps.push({ duration: half, y: base.y + lift }, { duration: half, y: base.y });
    await this.sequence(actor, steps, f.EasingTypeName || 'EaseOutQuad');
  }

  // <GetMoveSequence>d__5: 2 x count sideways steps alternating -/+ power x depth scale, each back to centre.
  private async stiff(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [id] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    const base = worldToScene(actor.pos.x, actor.pos.y);
    const swing = num(f.Power, 1) * depthScale(actor.pos.z);
    const step = f.Duration ? num(f.Duration, 0.1) * 0.25 : 0.025;
    const steps = [];
    for (let i = 0; i < 2 * num(f.Count, 2); i += 1) steps.push({ duration: step, x: base.x + (i % 2 ? 1 : -1) * swing }, { duration: step, x: base.x });
    await this.sequence(actor, steps, f.EasingTypeName || 'EaseOutQuad');
  }

  // `To` is an absolute clockwise angle, `By` relative; the default duration is the actor configuration's.
  private async roll(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const [id] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    if (f.Pivot) actor.setRollPivot(num(f.Pivot, 0));
    const target = f.To ? num(f.To, actor.rotation) : actor.rotation + num(f.By, 0);
    await this.tweenActor(actor, { rotation: target }, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
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
    await this.tweenActor(actor, { pos: to }, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
  }

  private async disappear(c: StoryCommand, side: number): Promise<void> {
    const f = c.fields;
    const [id] = actorId(f.IdAndAppearance);
    const actor = this.actor(id);
    await actor.ready;
    const to = { ...actor.pos, x: sceneToWorld(side > 0 ? 150 : -50, 0).x };
    await this.tweenActor(actor, { pos: to }, num(f.Duration, DEFAULT_DURATION), f.EasingTypeName);
    actor.visible = false;
    actor.apply();
  }

  private async fadeOut(actor: StoryActor, duration: number): Promise<void> {
    await this.tweenActor(actor, { alpha: 0 }, duration);
    actor.visible = false;
    actor.alpha = 1;
    actor.apply();
  }

  // CV FadeCommand family on one fade panel: From/To are coverage (defaults 0 -> 1; Blink keeps the current value;
  // ScreenFade's direction picks the end), Position is screen percent, softness defaults Slide 1, Blink 0.5, else 0.
  private async fade(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stage = this.stage;
    const kinds: Record<string, Transition['type']> = { SlideCommand: 'slide', BlinkCommand: 'blink', IrisCommand: 'iris', CircleCommand: 'circle' };
    const type: Transition['type'] = kinds[c.class] ?? 'fade';
    const current = stage.transition;
    const same = current.type === type;
    const now = same ? current.amount : 0;
    const out = (f.Direction ?? 'Out') === 'Out';
    const from = f.From ? num(f.From, now) : type === 'fade' || type === 'blink' ? now : 0;
    const to = f.To ? num(f.To, 1) : type === 'fade' ? (out ? 1 : 0) : type === 'blink' ? now : 1;
    const [px, py] = parts(f.Position);
    const tint = color(f.TintColor) ?? color(f.Color);
    const next = {
      type,
      amount: from,
      color: tint ?? (same ? current.color : 0x000000),
      x: px != null ? px / 100 : same ? current.x : 0.5,
      y: py != null ? py / 100 : px != null && type === 'blink' ? px / 100 : same ? current.y : 0.5,
      softness: num(f.Softness, type === 'slide' ? 1 : type === 'blink' ? 0.5 : 0),
      roundness: num(f.Roundness, 0),
      side: type === 'slide' ? f.Direction || 'Left' : current.side,
    };
    stage.transition = next;
    await stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      stage.transition = { ...next, amount: from + (to - from) * t };
      stage.drawCover();
    });
  }

  private async camera(c: StoryCommand): Promise<void> {
    const f = c.fields;
    const stage = this.stage;
    const from = { ...stage.camera };
    const [ox, oy] = parts(f.Offset);
    // `Roll` is the camera's z angle in degrees, as is `Rotation`'s z; an orthographic 2D scene has no x/y turn to show.
    const rz = f.Rotation ? parts(f.Rotation)[2] : null;
    const roll = f.Roll ? num(f.Roll, from.roll) : rz ?? from.roll;
    const to = { x: f.Offset ? ox ?? from.x : from.x, y: f.Offset ? oy ?? from.y : from.y, zoom: num(f.Zoom, from.zoom), roll };
    await stage.tween(num(f.Duration, DEFAULT_DURATION), f.EasingTypeName, (t) => {
      stage.camera = {
        x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
        zoom: from.zoom + (to.zoom - from.zoom) * t, roll: from.roll + (to.roll - from.roll) * t,
      };
      stage.applyCamera();
    });
  }
}

// Resource names resolve without case (`shock` is the `Shock` effect).
function byName<T>(table: Record<string, T> | undefined, name: string): T | undefined {
  if (!table) return undefined;
  if (name in table) return table[name];
  const lower = name.toLowerCase();
  const key = Object.keys(table).find((k) => k.toLowerCase() === lower);
  return key ? table[key] : undefined;
}

function lookOf(value: string): number {
  const lower = value.toLowerCase();
  return lower === 'left' ? 1 : lower === 'right' ? 2 : 0;
}
