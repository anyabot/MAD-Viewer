import { loadSkinArchive, readBytes, readText, urlFor } from '@/lib/skinArchive';
import { storyAssetUrl, storyBackgroundUrl, type StoryScriptIndex } from '@/lib/data';
import { FxRun, type FxIndex } from './fx';
import { archiveName, type StoreKey } from '@/components/skinViewer/types';
import { easeOf } from './ease';
import { FilterStack } from './filters';
import { createEmoteBubble, type EmoteBubble } from '@/components/skinViewer/emote';
import { emotePlacement, type EmoticonManifest } from '@/lib/emoticons';

// CameraConfiguration: 2340x1080 reference at 100 PPU, orthographic size 5.4, camera at the origin.
export const SCENE_W = 23.4;
export const SCENE_H = 10.8;
const ORTHO = SCENE_H / 2;
const MAX_ZOOM = 0.99;
const BACK_Z = 100;
// SpineCharacter::UpdateRenderTransform constants and the height-type factor table (index heightType + 1).
const DEPTH_A = -0.298492968082428;
const DEPTH_B = 0.4382548928260803;
const HEIGHT_FACTOR = [-4, -1, 0, 1];
const UNIT_Y = (1080 / 100) * 0.01;

type Layout = {
  skel: string;
  atlas: string;
  animations?: string[];
  world?: { skeleton?: { dataScale?: number }; ppu?: number | null };
  actor?: { idle?: string | null; pivot?: { x: number; y: number } | null; heightType?: number | null };
};

type Tween = { elapsed: number; duration: number; ease: (t: number) => number; apply: (t: number) => void; done: () => void };

export type Vec3 = { x: number; y: number; z: number };

export type BackLayer = {
  id: string;
  name: string | null;
  node: any;
  sprite: any;
  x: number; y: number; z: number; rotation: number; scaleX: number; scaleY: number;
  tint: number; tintAlpha: number; alpha: number; visible: boolean; order: number;
};

export type DrawShape = {
  id: string;
  kind: 'box' | 'circle' | 'line' | 'fill' | 'image';
  node: any;
  graphics: any;
  sprite: any;
  x: number; y: number; z: number; w: number; h: number; rotation: number;
  color: number; border: number | null; alpha: number; pivotX: number; pivotY: number;
  fromX: number; fromY: number; toX: number; toY: number; length: number | null; thickness: number;
};

export type Transition = {
  type: 'fade' | 'slide' | 'blink' | 'iris' | 'circle';
  amount: number;
  color: number;
  x: number;
  y: number;
  softness: number;
  roundness: number;
  side: string;
};

export function sceneToWorld(x: number, y: number): { x: number; y: number } {
  return { x: -SCENE_W / 2 + (x / 100) * SCENE_W, y: -SCENE_H / 2 + (y / 100) * SCENE_H };
}

export function worldToScene(x: number, y: number): { x: number; y: number } {
  return { x: ((x + SCENE_W / 2) / SCENE_W) * 100, y: ((y + SCENE_H / 2) / SCENE_H) * 100 };
}

// exp(A*(z+25)/25 + B): 1.55 at Near (z -25), 1.15 at Normal (0), 0.85 at Far (25).
export function depthScale(z: number): number {
  return Math.exp(DEPTH_A * ((z + 25) / 25) + DEPTH_B);
}

function heightOffset(scale: number, heightType: number): number {
  const u = (scale - 1.55) / -0.4;
  const factor = HEIGHT_FACTOR[heightType + 1] ?? 0;
  return (3.5 * u + 15 + (-3 * u + 8.5) * factor) * UNIT_Y;
}

export class StoryActor {
  pos: Vec3 = { ...sceneToWorld(50, 50), z: 0 };
  look = 0;
  visible = false;
  alpha = 1;
  rotation = 0;
  shake = { x: 0, y: 0 };
  private rollPivot: number | null = null;
  tint = 0xffffff;
  dimmed = false;
  face = '';
  holder: any;
  private bubble: EmoteBubble | null = null;
  readonly filters: FilterStack;
  spine: any = null;
  layout: Layout | null = null;
  ready: Promise<void>;

  constructor(readonly stage: StoryStage, readonly id: string, readonly rig: string | null, readonly facing: number) {
    this.holder = new stage.PIXI.Container();
    this.filters = new FilterStack(stage.PIXI, () => this.spine, () => stage.pixelScale);
    this.holder.visible = false;
    stage.actors.addChild(this.holder);
    this.ready = rig ? this.load(rig).catch((e) => stage.report(`rig ${rig}: ${String(e)}`)) : Promise.resolve();
  }

  private async load(rig: string): Promise<void> {
    const { PIXI, SPINE } = this.stage;
    // A rig whose art differs by store ships one archive per store; the first listed store plays, as in the skin viewer.
    const stores = this.stage.skinStores.get(rig) ?? [];
    const archive = archiveName(rig, stores[0] ?? 'onestore', stores.length > 1);
    const files = await loadSkinArchive(archive);
    const layout = JSON.parse(await readText(files, 'spine.json')) as Layout;
    const atlas = new SPINE.TextureAtlas(await readText(files, layout.atlas));
    await Promise.all(atlas.pages.map(async (page: any) => {
      const texture = await PIXI.Assets.load({
        src: urlFor(archive, files, page.name),
        loadParser: 'loadTextures',
        data: { alphaMode: page.pma ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload' },
      });
      page.setTexture(SPINE.SpineTexture.from(texture.source));
    }));
    const binary = new SPINE.SkeletonBinary(new SPINE.AtlasAttachmentLoader(atlas));
    binary.scale = layout.world?.skeleton?.dataScale ?? 1;
    const spine = new SPINE.Spine({ skeletonData: binary.readSkeletonData(await readBytes(files, layout.skel)) });
    const transform = spine.transformAttachments.bind(spine);
    spine.transformAttachments = () => { spine.currentClippingSlot = undefined; transform(); };
    const idle = layout.actor?.idle;
    if (idle && spine.skeleton.data.findAnimation(idle)) spine.state.setAnimation(0, idle, true);
    // Inferred: the render-texture drawer's PPU over the camera's 100 normalises every rig (skeleton and pivot both land ~15 units).
    const render = (layout.world?.ppu ?? 100) / 100;
    const pivot = layout.actor?.pivot ?? { x: 0, y: 0 };
    spine.scale.set(render);
    spine.position.set(-pivot.x * render, pivot.y * render);
    this.layout = layout;
    this.spine = spine;
    this.holder.addChild(spine);
    // SetFlip gives the emote the actor's world scale and UIParticle draws 100 px per particle unit, so a particle unit is a world unit.
    this.bubble = createEmoteBubble({
      PIXI: this.stage.PIXI, scene: this.holder, spine, now: () => this.stage.time, isDestroyed: () => this.holder.destroyed,
      unit: 1 / render,
    });
    this.stage.app.ticker.add(this.bubble.tick);
    if (this.face) this.setFace(this.face);
    this.apply();
  }

  // SpineCharacter: the pivot sits on the actor position, lifted by the height offset and scaled by depth.
  apply(): void {
    const scale = depthScale(this.pos.z);
    const heightType = this.layout?.actor?.heightType ?? 1;
    const flip = this.look && this.facing && this.look !== this.facing ? -1 : 1;
    this.holder.position.set(this.pos.x + this.shake.x, -(this.pos.y + this.shake.y + heightOffset(scale, heightType)));
    this.holder.scale.set(scale * flip, scale);
    this.holder.rotation = this.rotation * (Math.PI / 180);
    this.applyRollPivot();
    this.holder.zIndex = -this.pos.z;
    this.holder.alpha = this.alpha;
    this.holder.visible = this.visible && this.alpha > 0;
    this.holder.tint = this.dimmed ? multiply(this.tint, 0x8c8c8c) : this.tint;
  }

  // Inferred: a roll pivot is a height percent of the setup bounds, 0 at the feet; rotation turns about it instead of the actor pivot.
  setRollPivot(percent: number): void {
    this.rollPivot = percent;
    this.apply();
  }

  private applyRollPivot(): void {
    const bounds = (this.layout as { bounds?: { y: number; height: number } } | null)?.bounds;
    if (this.rollPivot == null || !bounds || !this.spine) { this.holder.pivot.set(0, 0); return; }
    const data = this.layout?.world?.skeleton?.dataScale ?? 1;
    const render = (this.layout?.world?.ppu ?? 100) / 100;
    const pivotY = this.layout?.actor?.pivot?.y ?? 0;
    const y = (bounds.y + (bounds.height * this.rollPivot) / 100) * data;
    const local = (pivotY - y) * render;
    this.holder.pivot.set(0, local);
    this.holder.position.y += local * this.holder.scale.y;
  }

  // CharacterEmoticon on the rig's slot, mirrored when the actor faces right; resolves when the particles have died.
  emote(name: string): Promise<boolean> {
    const placement = emotePlacement(this.stage.emoticons, name, this.rig?.replace(/^st_/, '').toUpperCase());
    if (!placement || !this.bubble) return Promise.resolve(false);
    return new Promise((done) => this.bubble!.show(placement, () => done(true)));
  }

  dispose(): void {
    if (this.bubble) { this.stage.app.ticker.remove(this.bubble.tick); this.bubble.hide(); }
  }

  // An appearance is a face clip on track 1, as on the lobby; `default` returns the face to the body's keys.
  setFace(face: string): void {
    this.face = face;
    if (!this.spine) return;
    const names: string[] = this.layout?.animations ?? [];
    const lower = face.toLowerCase();
    const clip = names.find((a) => a.toLowerCase() === `01_${lower}` || a.toLowerCase().endsWith(`/${lower}`));
    if (clip) this.spine.state.setAnimation(1, clip, true).mixDuration = 0.15;
    else this.spine.state.setEmptyAnimation(1, 0.15);
  }
}

function multiply(a: number, b: number): number {
  const ch = (shift: number) => Math.round((((a >> shift) & 255) * ((b >> shift) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class StoryStage {
  readonly root: any;
  readonly cam: any;
  readonly backdrop: any;
  readonly actors: any;
  readonly cover: any;
  private tweens = new Set<Tween>();
  readonly backLayers = new Map<string, BackLayer>();
  readonly actorMap = new Map<string, StoryActor>();
  camera = { x: 0, y: 0, zoom: 0, roll: 0 };
  shake = { x: 0, y: 0 };
  transition: Transition = { type: 'fade', amount: 0, color: 0x000000, x: 0.5, y: 0.5, softness: 0, roundness: 0, side: 'Left' };
  speed = 1;
  time = 0;
  emoticons: EmoticonManifest | null = null;
  fx: FxIndex | null = null;
  skinStores = new Map<string, StoreKey[]>();
  readonly fxLayer: any;
  private readonly fxRuns = new Map<string, Set<FxRun>>();
  private readonly fxSheets = new Map<string, any>();
  readonly backgroundFilters: FilterStack;
  readonly screenFilters: FilterStack;
  private width = 1;
  private height = 1;
  private readonly tick = (ticker: any) => this.update((ticker.deltaMS / 1000) * this.speed);

  constructor(readonly PIXI: any, readonly SPINE: any, readonly app: any, readonly index: StoryScriptIndex,
    readonly report: (message: string) => void) {
    this.root = new PIXI.Container();
    this.cam = new PIXI.Container();
    this.backdrop = new PIXI.Container();
    this.actors = new PIXI.Container();
    this.actors.sortableChildren = true;
    this.cover = new PIXI.Graphics();
    this.fxLayer = new PIXI.Container();
    this.cam.addChild(this.backdrop, this.actors, this.fxLayer);
    this.root.addChild(this.cam, this.cover);
    app.stage.addChild(this.root);
    app.ticker.add(this.tick);
    this.backgroundFilters = new FilterStack(PIXI, () => this.backdrop, () => this.pixelScale);
    this.screenFilters = new FilterStack(PIXI, () => this.cam, () => this.pixelScale);
  }

  dispose(): void {
    this.app.ticker.remove(this.tick);
    this.stopFx(null);
    for (const actor of this.actorMap.values()) actor.dispose();
    this.root.destroy({ children: true });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.applyCamera();
    this.drawCover();
  }

  get pixelScale(): number {
    return this.height / SCENE_H / 100;
  }

  // Starts a spawned prefab at a world point (or inside `parent`); `key` groups runs for DestroySpawned.
  async spawnFx(prefab: string, key: string, place: { x: number; y: number; scale: number; rotation: number; mirror?: boolean },
    parent?: any): Promise<FxRun | null> {
    const emitters = this.fx?.prefabs[prefab];
    if (!emitters) return null;
    await Promise.all([...new Set(emitters.map((e) => e.sheet))].filter((s) => !this.fxSheets.has(s)).map(async (sheet) => {
      const texture = await this.PIXI.Assets.load({ src: storyAssetUrl('fx', sheet), loadParser: 'loadTextures' }).catch(() => null);
      if (texture?.source) this.fxSheets.set(sheet, texture);
    }));
    const group = this.fxRuns.get(key) ?? new Set<FxRun>();
    this.fxRuns.set(key, group);
    const run: FxRun = new FxRun(this.PIXI, parent ?? this.fxLayer, emitters, this.fxSheets, () => this.time, () => group.delete(run));
    run.container.position.set(place.x, -place.y);
    run.container.scale.set(place.scale * (place.mirror ? -1 : 1), place.scale);
    run.container.rotation = -place.rotation * (Math.PI / 180);
    group.add(run);
    return run;
  }

  private readonly popups = new Map<string, any>();
  readonly draws = new Map<string, DrawShape>();
  holes: { id: string; x: number; y: number; size: number; soft: number }[] = [];

  // Inferred: draw shapes live in scene percent (x of the width, y of the height, y up) and sort by z among the actors.
  drawShape(id: string): DrawShape {
    let shape = this.draws.get(id);
    if (!shape) {
      const node = new this.PIXI.Container();
      const graphics = new this.PIXI.Graphics();
      node.addChild(graphics);
      this.actors.addChild(node);
      shape = { id, kind: 'box', node, graphics, sprite: null, x: 50, y: 50, z: 0, w: 0, h: 0, rotation: 0, color: 0x000000,
        border: null, alpha: 0, pivotX: 50, pivotY: 50, fromX: 0, fromY: 0, toX: 0, toY: 0, length: null, thickness: 1 };
      this.draws.set(id, shape);
    }
    return shape;
  }

  renderShape(shape: DrawShape): void {
    const W = SCENE_W / 100;
    const H = SCENE_H / 100;
    const g = shape.graphics;
    g.clear();
    shape.node.zIndex = -shape.z;
    shape.node.alpha = shape.alpha;
    shape.node.visible = shape.alpha > 0.001;
    const world = sceneToWorld(shape.x, shape.y);
    shape.node.position.set(world.x, -world.y);
    shape.node.rotation = (shape.rotation * Math.PI) / 180;
    const stroke = shape.border != null ? { width: 0.03, color: shape.border } : null;
    if (shape.kind === 'box' || shape.kind === 'circle') {
      const w = shape.w * W;
      const h = shape.h * H;
      const ox = -w * (shape.pivotX / 100);
      const oy = -h * (1 - shape.pivotY / 100);
      if (shape.kind === 'box') g.rect(ox, oy, w, h); else g.ellipse(ox + w / 2, oy + h / 2, w / 2, h / 2);
      g.fill({ color: shape.color });
      if (stroke) g.stroke(stroke);
    } else if (shape.kind === 'fill') {
      shape.node.position.set(0, 0);
      shape.node.rotation = 0;
      const a = sceneToWorld(shape.fromX, shape.fromY);
      const b = sceneToWorld(shape.toX, shape.toY);
      g.rect(Math.min(a.x, b.x), -Math.max(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)).fill({ color: shape.color });
      for (const hole of this.holes) {
        const c = sceneToWorld(hole.x, hole.y);
        if (hole.size > 0) g.circle(c.x, -c.y, (hole.size * H) / 2).cut();
      }
    } else if (shape.kind === 'line') {
      shape.node.position.set(0, 0);
      shape.node.rotation = 0;
      const end = sceneToWorld(shape.toX, shape.toY);
      let start = sceneToWorld(shape.fromX, shape.fromY);
      if (shape.length != null) {
        const turn = (shape.rotation * Math.PI) / 180;
        start = { x: end.x - Math.cos(turn) * shape.length * W, y: end.y - Math.sin(turn) * shape.length * W };
      }
      g.moveTo(start.x, -start.y).lineTo(end.x, -end.y).stroke({ width: shape.thickness * 0.05, color: shape.color });
    }
    if (shape.sprite) {
      const h = shape.h * H;
      shape.sprite.height = h;
      shape.sprite.width = h * (shape.sprite.texture.width / shape.sprite.texture.height);
    }
  }

  async popupSprite(id: string, image: string, size: [number, number]): Promise<any | null> {
    const existing = this.popups.get(id);
    if (existing) return existing;
    const texture = await this.PIXI.Assets.load({ src: storyAssetUrl('popup', image), loadParser: 'loadTextures' }).catch(() => null);
    if (!texture?.source) { this.report(`popup ${image}`); return null; }
    const sprite = new this.PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = size[0] / 100;
    sprite.height = size[1] / 100;
    const base = sprite.scale.x;
    const holder = new this.PIXI.Container();
    holder.addChild(sprite);
    sprite.scale.set(base);
    holder.visible = false;
    holder.scale.set(1);
    this.fxLayer.addChild(holder);
    this.popups.set(id, holder);
    return holder;
  }

  stopFx(key: string | null): void {
    for (const [k, group] of this.fxRuns) {
      if (key !== null && k !== key) continue;
      for (const run of [...group]) run.stop();
    }
  }

  private update(dt: number): void {
    this.time += dt;
    for (const group of this.fxRuns.values()) for (const run of [...group]) run.tick();
    for (const stack of [this.backgroundFilters, this.screenFilters, ...[...this.actorMap.values()].map((a) => a.filters)]) {
      stack.apply(this.time);
    }
    for (const tween of [...this.tweens]) {
      tween.elapsed += dt;
      const t = tween.duration > 0 ? Math.min(1, tween.elapsed / tween.duration) : 1;
      tween.apply(tween.ease(t));
      if (t >= 1) { this.tweens.delete(tween); tween.done(); }
    }
  }

  tween(duration: number, ease: string | undefined, apply: (t: number) => void): Promise<void> {
    if (!(duration > 0)) { apply(1); return Promise.resolve(); }
    return new Promise((done) => {
      this.tweens.add({ elapsed: 0, duration, ease: easeOf(ease), apply, done });
    });
  }

  finishTweens(): void {
    for (const tween of [...this.tweens]) { tween.apply(1); this.tweens.delete(tween); tween.done(); }
  }

  // CameraManager: position = initial + offset; orthographicSize = initial * (1 - clamp(zoom, 0, 0.99)).
  applyCamera(): void {
    const zoom = this.camera.zoom < 0 ? 0 : Math.min(this.camera.zoom, MAX_ZOOM);
    const size = ORTHO * (1 - zoom);
    const k = this.height / 2 / size;
    this.cam.position.set(this.width / 2, this.height / 2);
    this.cam.scale.set(k);
    this.cam.pivot.set(this.camera.x + this.shake.x, -(this.camera.y + this.shake.y));
    // A camera turned counter-clockwise shows the scene turned clockwise.
    this.cam.rotation = (this.camera.roll * Math.PI) / 180;
  }

  // The fade panel: `amount` is how much of the screen is covered, drawn as the command's mask shape.
  drawCover(): void {
    const { type, amount, color, x, y, softness, roundness, side } = this.transition;
    const w = this.width;
    const h = this.height;
    const g = this.cover;
    g.clear();
    g.alpha = 1;
    g.visible = amount > 0.001;
    if (!g.visible) return;
    const fill = { color, alpha: 1 };
    if (type === 'fade') {
      g.rect(0, 0, w, h).fill(fill);
      g.alpha = Math.min(1, amount);
    } else if (type === 'slide') {
      const horizontal = side === 'Left' || side === 'Right';
      const span = (horizontal ? w : h) * amount;
      const soft = (horizontal ? w : h) * 0.2 * softness;
      const steps = soft > 0 ? 8 : 0;
      const band = (from: number, size: number, alpha: number) => {
        const start = side === 'Left' || side === 'Up' ? from : (horizontal ? w : h) - from - size;
        if (horizontal) g.rect(start, 0, size, h).fill({ color, alpha }); else g.rect(0, start, w, size).fill({ color, alpha });
      };
      band(0, Math.max(0, span - soft), 1);
      for (let i = 0; i < steps; i += 1) band(span - soft + (soft * i) / steps, soft / steps, 1 - (i + 0.5) / steps);
    } else if (type === 'blink') {
      const line = (1 - y) * h;
      const top = line * amount;
      const bottom = (h - line) * amount;
      const curve = h * 0.25 * roundness * amount;
      g.moveTo(0, 0).lineTo(w, 0).lineTo(w, top).quadraticCurveTo(w / 2, top + curve, 0, top).closePath().fill(fill);
      g.moveTo(0, h).lineTo(w, h).lineTo(w, h - bottom).quadraticCurveTo(w / 2, h - bottom - curve, 0, h - bottom).closePath().fill(fill);
    } else {
      const cx = x * w;
      const cy = (1 - y) * h;
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const radius = reach * Math.max(0, 1 - amount);
      const soft = reach * 0.15 * softness;
      g.rect(0, 0, w, h).fill(fill);
      if (radius > 0) g.circle(cx, cy, radius).cut();
      for (let i = 0; soft > 0 && radius > 0 && i < 6; i += 1) {
        const r = radius - (soft * (i + 1)) / 6;
        if (r > 0) g.circle(cx, cy, radius - (soft * i) / 6).fill({ color, alpha: 0.12 }), g.circle(cx, cy, r).cut();
      }
    }
  }

  actor(id: string, origin?: string): StoryActor {
    let actor = this.actorMap.get(id);
    if (!actor) {
      const rig = this.index.actors[origin ?? id] ?? null;
      actor = new StoryActor(this, id, rig, rig ? this.index.facing[rig] ?? 0 : 0);
      this.actorMap.set(id, actor);
    }
    return actor;
  }

  // Each background id is its own actor; inferred stock Naninovel layout: all start at z 100, nearer z draws on top, ties by creation.
  backLayer(id: string): BackLayer {
    let layer = this.backLayers.get(id);
    if (!layer) {
      const node = new this.PIXI.Container();
      this.backdrop.addChild(node);
      layer = { id, name: null, node, sprite: null, x: 0, y: 0, z: BACK_Z, rotation: 0, scaleX: 1, scaleY: 1, tint: 0xffffff,
        tintAlpha: 1, alpha: 0, visible: false, order: this.backLayers.size };
      this.backLayers.set(id, layer);
    }
    return layer;
  }

  renderBack(layer: BackLayer): void {
    layer.node.position.set(layer.x, -layer.y);
    layer.node.rotation = (-layer.rotation * Math.PI) / 180;
    layer.node.scale.set(layer.scaleX, layer.scaleY);
    layer.node.alpha = layer.alpha * layer.tintAlpha;
    layer.node.visible = layer.node.alpha > 0.001;
    layer.node.zIndex = -layer.z * 1000 + layer.order;
    for (const child of layer.node.children) child.tint = layer.tint;
    this.backdrop.sortableChildren = true;
  }

  // Background sprites are crop-matched to the scene; the authored world size is the sprite rect over its PPU.
  async backSprite(name: string): Promise<any | null> {
    const size = this.index.backgrounds[name];
    const texture = await this.PIXI.Assets.load(storyBackgroundUrl(name)).catch(() => null);
    if (!texture || !size) { this.report(`background ${name}`); return null; }
    const sprite = new this.PIXI.Sprite(texture);
    const scale = Math.max(SCENE_W / size[0], SCENE_H / size[1]);
    sprite.anchor.set(0.5);
    sprite.width = size[0] * scale;
    sprite.height = size[1] * scale;
    return sprite;
  }

  // A new appearance on a shown layer cross-fades, or slides in from the right for `SlideIn` (inferred direction).
  async setBackAppearance(layer: BackLayer, name: string, duration: number, ease: string | undefined, transition: string | undefined): Promise<void> {
    if (layer.name === name) return;
    layer.name = name;
    const sprite = await this.backSprite(name);
    if (!sprite || layer.name !== name) { sprite?.destroy(); return; }
    const previous = layer.sprite;
    layer.sprite = sprite;
    sprite.tint = layer.tint;
    layer.node.addChild(sprite);
    if (!previous || !layer.visible) { previous?.destroy(); return; }
    const slide = transition?.toLowerCase() === 'slidein';
    sprite.alpha = slide ? 1 : 0;
    await this.tween(duration, ease, (t) => {
      if (slide) sprite.x = SCENE_W * (1 - t); else sprite.alpha = t;
    });
    sprite.x = 0;
    sprite.alpha = 1;
    if (layer.sprite === sprite) previous.destroy();
  }

  shakeBackground(x: number, y: number): void {
    this.backdrop.position.set(x, -y);
  }

  async hideBack(layer: BackLayer, duration: number, ease?: string): Promise<void> {
    if (!layer.visible) return;
    layer.visible = false;
    const from = layer.alpha;
    await this.tween(duration, ease, (t) => { layer.alpha = from * (1 - t); this.renderBack(layer); });
  }
}
