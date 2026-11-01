import { loadSkinArchive, readBytes, readText, urlFor } from '@/lib/skinArchive';
import { buildBackgrounds } from '@/components/skinViewer/background';
import { REFERENCE_VIEW_WIDTH } from '@/components/skinViewer/constants';
import { gameViewFit, rigCameraTransform } from '@/components/skinViewer/scenes';
import { archiveName } from '@/components/skinViewer/types';
import { SCENE_H, SCENE_W, type StoryStage } from './stage';

type Layout = {
  skel?: string;
  atlas?: string;
  animations?: string[];
  actor?: { idle?: string | null };
  static?: { image: string };
  world?: { skeleton?: { x: number; y: number; scale: number; dataScale?: number } };
};

// `TryFindAppearanceAnimation`: a clip's appearance is its name with each segment's `<digits>_` prefix dropped; its track is the second segment's digits.
function findClip(names: string[], appearance: string): { clip: string; track: number } | null {
  const lower = appearance.toLowerCase();
  for (const name of names) {
    const [head, rest] = name.includes('/') ? name.split('/', 2) : ['', name];
    const strip = (s: string) => s.replace(/^\d+_/, '');
    const shown = head ? `${strip(head)}/${strip(rest)}` : strip(rest);
    if (shown.toLowerCase() === lower || name.toLowerCase() === lower) return { clip: name, track: parseInt(rest, 10) || 0 };
  }
  return null;
}

// A Desire, Pleasure or Drama actor: its rig is drawn by its own cutscene camera into a texture laid over the scene.
export class StoryCutscene {
  readonly holder: any;
  private readonly view: any;
  private spine: any = null;
  private layout: Layout | null = null;
  private tick: (() => void) | null = null;
  alpha = 0;
  visible = false;
  ready: Promise<void>;

  constructor(private readonly stage: StoryStage, readonly id: string, rig: string) {
    this.holder = new stage.PIXI.Container();
    this.view = new stage.PIXI.Container();
    this.holder.addChild(this.view);
    this.holder.zIndex = -1000;
    this.holder.visible = false;
    stage.actors.addChild(this.holder);
    this.ready = this.load(rig).catch((e) => stage.report(`rig ${rig}: ${String(e)}`));
  }

  private async load(rig: string): Promise<void> {
    const { PIXI, SPINE } = this.stage;
    const stores = this.stage.skinStores.get(rig) ?? [];
    const archive = archiveName(rig, stores[0] ?? 'onestore', stores.length > 1);
    const files = await loadSkinArchive(archive);
    const layout = JSON.parse(await readText(files, 'spine.json')) as Layout;
    this.layout = layout;
    if (layout.static) {
      // Inferred: a still drama image covers the scene, as a background does.
      const texture = await PIXI.Assets.load({ src: urlFor(archive, files, layout.static.image), loadParser: 'loadTextures' });
      const sprite = new PIXI.Sprite(texture);
      const scale = Math.max(SCENE_W / texture.width, SCENE_H / texture.height);
      sprite.anchor.set(0.5);
      sprite.scale.set(scale);
      this.view.addChild(sprite);
      return;
    }
    const atlas = new SPINE.TextureAtlas(await readText(files, layout.atlas!));
    await Promise.all(atlas.pages.map(async (page: any) => {
      const texture = await PIXI.Assets.load({
        src: urlFor(archive, files, page.name),
        loadParser: 'loadTextures',
        data: { alphaMode: page.pma ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload' },
      });
      page.setTexture(SPINE.SpineTexture.from(texture.source));
    }));
    const binary = new SPINE.SkeletonBinary(new SPINE.AtlasAttachmentLoader(atlas));
    const sk = layout.world?.skeleton ?? { x: 0, y: 0, scale: 1, dataScale: 1 };
    binary.scale = sk.dataScale ?? 1;
    const spine = new SPINE.Spine({ skeletonData: binary.readSkeletonData(await readBytes(files, layout.skel!)) });
    const prefabScale = sk.scale || 1;
    spine.position.set(sk.x, -sk.y);
    spine.scale.set(prefabScale);
    const scene = new PIXI.Container();
    scene.sortableChildren = true;
    scene.addChild(spine);
    this.view.addChild(scene);
    const rooms = await buildBackgrounds({
      PIXI, archive, files, scene, spine, world: layout.world ?? {}, showBg: () => true, isDestroyed: () => this.holder.destroyed,
    });
    const idle = layout.actor?.idle;
    if (idle && spine.skeleton.data.findAnimation(idle)) spine.state.setAnimation(findClip([idle], idle)?.track ?? 0, idle, true);
    spine.update(0);
    // The skin viewer's game frame: the reference view width around the `cam` bone at the scene's drawn aspect, filling the scene.
    const camBone = spine.skeleton.findBone('cam');
    const camSetup = camBone
      ? { x: camBone.worldX, y: camBone.worldY, scale: Math.abs(camBone.getWorldScaleX()) || 1, rotation: camBone.getWorldRotationX() }
      : { x: 0, y: 0, scale: 1, rotation: 0 };
    const fit = gameViewFit(SCENE_W / SCENE_H);
    const viewW = REFERENCE_VIEW_WIDTH * (sk.dataScale ?? 1) * prefabScale * camSetup.scale * fit.scale;
    const centre = { x: spine.position.x + camSetup.x * prefabScale, y: spine.position.y + camSetup.y * prefabScale };
    this.holder.scale.set(SCENE_W / viewW);
    this.holder.pivot.set(centre.x, centre.y);
    this.tick = () => {
      rooms?.applyTransforms();
      if (!camBone) return;
      const target = rigCameraTransform(centre, {
        x: (camBone.worldX - camSetup.x) * prefabScale,
        y: (camBone.worldY - camSetup.y) * prefabScale,
        scale: (Math.abs(camBone.getWorldScaleX()) || 1) / camSetup.scale,
        rotation: ((camBone.getWorldRotationX() - camSetup.rotation) * Math.PI) / 180,
      });
      this.view.pivot.set(target.pivotX, target.pivotY);
      this.view.position.set(target.x, target.y);
      this.view.scale.set(target.scale);
      this.view.rotation = target.rotation;
    };
    this.stage.app.ticker.add(this.tick);
    this.spine = spine;
  }

  // Only a non-looping clip holds the script (`DesireAndAffectionController::SetAnimation`).
  play(appearance: string | null, loop: boolean): Promise<void> {
    if (!this.spine || !appearance) return Promise.resolve();
    const found = findClip(this.layout?.animations ?? [], appearance);
    if (!found) { this.stage.report(`${this.id} ${appearance}`); return Promise.resolve(); }
    const entry = this.spine.state.setAnimation(found.track, found.clip, loop);
    if (loop) return Promise.resolve();
    return new Promise((done) => { entry.listener = { complete: () => done(), interrupt: () => done(), end: () => done() }; });
  }

  apply(): void {
    this.holder.alpha = this.alpha;
    this.holder.visible = this.visible && this.alpha > 0.001;
  }

  dispose(): void {
    if (this.tick) this.stage.app.ticker.remove(this.tick);
  }
}
