// The emote container shares the actor's scene transform while particle units use their own scale.
import { EMOTE_UNIT_SCALE } from '@/components/skinViewer/constants';
import { createEmoteRun, type EmoteRun } from '@/components/skinViewer/particles';
import type { EmotePlacement } from '@/lib/emoticons';

export type EmoteBubble = {
  // The caller hides the container while measuring the scene.
  sprite: any;
  show: (placement: EmotePlacement) => void;
  hide: () => void;
  tick: () => void;
};

// A long frame advances by one bounded step instead of teleporting every particle.
const MAX_STEP = 0.333;

export function createEmoteBubble(options: {
  PIXI: any;
  scene: any;
  spine: any;
  // Scene time keeps the emote synchronized with pause and playback speed.
  now: () => number;
  isDestroyed: () => boolean;
}): EmoteBubble {
  const { PIXI, scene, spine, now, isDestroyed } = options;

  const container = new PIXI.Container();
  container.visible = false;
  container.eventMode = 'none';
  container.zIndex = 30;
  scene.addChild(container);

  const pool: { node: any; view: any }[] = [];
  // The emitter's grid makes each sheet-and-tile combination a distinct texture.
  const tiles = new Map<string, any>();
  const sheets = new Map<string, any>();
  let token = 0;
  let run: EmoteRun | null = null;
  let place: EmotePlacement | null = null;
  let last = 0;

  const tileTexture = (
    base: any, sheet: string, columns: number, rows: number, index: number,
  ) => {
    const key = `${sheet}|${columns}x${rows}|${index}`;
    const cached = tiles.get(key);
    if (cached) return cached;
    const width = base.width / columns;
    const height = base.height / rows;
    const texture = new PIXI.Texture({
      source: base.source,
      frame: new PIXI.Rectangle(
        (index % columns) * width, Math.floor(index / columns) * height,
        width, height),
    });
    tiles.set(key, texture);
    return texture;
  };

  const sprite = (index: number) => {
    let found = pool[index];
    if (!found) {
      const node = new PIXI.Container();
      const view = new PIXI.Sprite();
      node.eventMode = 'none';
      view.eventMode = 'none';
      node.addChild(view);
      found = { node, view };
      pool.push(found);
      container.addChild(node);
    }
    return found;
  };

  const draw = () => {
    if (!run || !place) return;
    const wanted = place.bone.toLowerCase();
    const bone = spine.skeleton.bones.find(
      (b: any) => b.data.name.toLowerCase() === wanted);
    if (!bone) return;
    // The authored offset and particles are y-up while `bone.worldY` is y-down.
    const originX = bone.worldX + place.offset[0];
    const originY = bone.worldY - place.offset[1];
    const unit = EMOTE_UNIT_SCALE;
    const scale = unit * Math.abs(spine.scale.y);
    // A mirrored placement flips positions, quads, pivots, and rotations about the slot.
    const mirror = place.mirror ? -1 : 1;

    let used = 0;
    for (const emitter of run.emitters) {
      const base = sheets.get(emitter.def.sheet);
      if (!base) continue;
      const [columns, rows] = emitter.def.tiles;
      for (const particle of emitter.particles) {
        const { node, view } = sprite(used);
        used += 1;
        view.texture = tileTexture(
          base, emitter.def.sheet, columns, rows, particle.frame);
        // Pixi's anchor is Unity's renderer pivot with its authored y-up coordinate mirrored.
        view.anchor.set(0.5 - emitter.def.pivot[0], 0.5 + emitter.def.pivot[1]);
        const point = scene.toLocal(spine.toGlobal({
          x: originX + particle.x * unit * mirror,
          y: originY - particle.y * unit,
        }));
        node.position.set(point.x, point.y);
        node.scale.set(mirror, 1);
        node.rotation = -particle.angle * mirror;
        view.position.set(0, 0);
        view.width = particle.size * scale;
        view.height = particle.sizeY * scale;
        view.scale.set(Math.abs(view.scale.x), Math.abs(view.scale.y));
        view.rotation = 0;
        view.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        view.alpha = Math.min(1, Math.max(0, particle.a));
        node.visible = true;
      }
    }
    for (let i = used; i < pool.length; i += 1) pool[i].node.visible = false;
  };

  const stop = () => {
    token += 1;
    run = null;
    place = null;
    container.visible = false;
    for (const item of pool) item.node.visible = false;
  };

  return {
    sprite: container,
    show: (placement) => {
      const mine = ++token;
      // The parser is explicit because Pixi's bare-string form produces no texture here.
      void Promise.all(Object.entries(placement.sheets).map(([name, sheet]) =>
        PIXI.Assets.load({ src: sheet.url, loadParser: 'loadTextures' })
          .then((texture: any) => [name, texture] as const)))
        .then((loaded) => {
          if (isDestroyed() || mine !== token) return;
          for (const [name, texture] of loaded) {
            if (texture?.source) sheets.set(name, texture);
          }
          const usable = placement.emitters.filter((def) => sheets.has(def.sheet));
          if (!usable.length) throw new Error('no emote sheet loaded');
          place = placement;
          run = createEmoteRun(usable, Math.floor(Math.random() * 0xffffffff));
          last = now();
          container.visible = true;
          // A zero-length step makes the opening burst visible on the line's first frame.
          run.advance(0);
          draw();
        })
        // A decorative asset must not break its reaction or fail silently.
        .catch((err: unknown) => console.warn('emote', err));
    },
    hide: stop,
    tick: () => {
      if (!run) return;
      const at = now();
      const step = Math.max(0, Math.min(MAX_STEP, at - last));
      last = at;
      run.advance(step);
      if (run.finished()) {
        stop();
        return;
      }
      draw();
    },
  };
}
