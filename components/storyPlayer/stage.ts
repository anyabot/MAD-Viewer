import { loadSkinArchive, readBytes, readText, urlFor } from '@/lib/skinArchive';
import { storyBackgroundUrl, type StoryScriptIndex } from '@/lib/data';
import { easeOf } from './ease';

// CameraConfiguration: 2340x1080 reference at 100 PPU, orthographic size 5.4, camera at the origin.
export const SCENE_W = 23.4;
export const SCENE_H = 10.8;
const ORTHO = SCENE_H / 2;
const MAX_ZOOM = 0.99;
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
  tint = 0xffffff;
  dimmed = false;
  face = '';
  holder: any;
  spine: any = null;
  layout: Layout | null = null;
  ready: Promise<void>;

  constructor(readonly stage: StoryStage, readonly id: string, readonly rig: string | null, readonly facing: number) {
    this.holder = new stage.PIXI.Container();
    this.holder.visible = false;
    stage.actors.addChild(this.holder);
    this.ready = rig ? this.load(rig).catch((e) => stage.report(`rig ${rig}: ${String(e)}`)) : Promise.resolve();
  }

  private async load(rig: string): Promise<void> {
    const { PIXI, SPINE } = this.stage;
    const files = await loadSkinArchive(rig);
    const layout = JSON.parse(await readText(files, 'spine.json')) as Layout;
    const atlas = new SPINE.TextureAtlas(await readText(files, layout.atlas));
    await Promise.all(atlas.pages.map(async (page: any) => {
      const texture = await PIXI.Assets.load({
        src: urlFor(rig, files, page.name),
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
    if (this.face) this.setFace(this.face);
    this.apply();
  }

  // SpineCharacter: the pivot sits on the actor position, lifted by the height offset and scaled by depth.
  apply(): void {
    const scale = depthScale(this.pos.z);
    const heightType = this.layout?.actor?.heightType ?? 1;
    const flip = this.look && this.facing && this.look !== this.facing ? -1 : 1;
    this.holder.position.set(this.pos.x, -(this.pos.y + heightOffset(scale, heightType)));
    this.holder.scale.set(scale * flip, scale);
    this.holder.rotation = -this.rotation * (Math.PI / 180);
    this.holder.zIndex = -this.pos.z;
    this.holder.alpha = this.alpha;
    this.holder.visible = this.visible && this.alpha > 0;
    this.holder.tint = this.dimmed ? multiply(this.tint, 0x8c8c8c) : this.tint;
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
  private bg: { name: string; sprite: any } | null = null;
  readonly actorMap = new Map<string, StoryActor>();
  camera = { x: 0, y: 0, zoom: 0 };
  coverColor = 0x000000;
  coverAlpha = 0;
  speed = 1;
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
    this.cam.addChild(this.backdrop, this.actors);
    this.root.addChild(this.cam, this.cover);
    app.stage.addChild(this.root);
    app.ticker.add(this.tick);
  }

  dispose(): void {
    this.app.ticker.remove(this.tick);
    this.root.destroy({ children: true });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.applyCamera();
    this.drawCover();
  }

  private update(dt: number): void {
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
    this.cam.pivot.set(this.camera.x, -this.camera.y);
  }

  drawCover(): void {
    this.cover.clear();
    this.cover.rect(0, 0, this.width, this.height).fill({ color: this.coverColor, alpha: 1 });
    this.cover.alpha = this.coverAlpha;
    this.cover.visible = this.coverAlpha > 0;
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

  // Background sprites are crop-matched to the scene; the authored world size is the sprite rect over its PPU.
  async background(name: string, duration: number, ease?: string): Promise<void> {
    if (this.bg?.name === name) return;
    const size = this.index.backgrounds[name];
    const texture = await this.PIXI.Assets.load(storyBackgroundUrl(name)).catch(() => null);
    if (!texture || !size) { this.report(`background ${name}`); return; }
    const sprite = new this.PIXI.Sprite(texture);
    const scale = Math.max(SCENE_W / size[0], SCENE_H / size[1]);
    sprite.anchor.set(0.5);
    sprite.width = size[0] * scale;
    sprite.height = size[1] * scale;
    sprite.alpha = 0;
    this.backdrop.addChild(sprite);
    const previous = this.bg;
    this.bg = { name, sprite };
    await this.tween(duration, ease, (t) => { sprite.alpha = t; });
    previous?.sprite.destroy();
  }

  async hideBackground(duration: number): Promise<void> {
    const previous = this.bg;
    if (!previous) return;
    this.bg = null;
    await this.tween(duration, undefined, (t) => { previous.sprite.alpha = 1 - t; });
    previous.sprite.destroy();
  }
}
