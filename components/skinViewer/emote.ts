// One Pixi sprite per live particle of the prefab `[@emo]` names; the
// simulation itself is `particles.ts`. The container sits in `scene` beside the
// actor so pan, zoom and device staging carry it with the figure.
//
// The slot bone and its offset are in skeleton units while the particles are in
// the emitter's own; `EMOTE_UNIT_SCALE` is the factor between them.
import { EMOTE_UNIT_SCALE } from '@/components/skinViewer/constants';
import { createEmoteRun, type EmoteRun } from '@/components/skinViewer/particles';
import type { EmotePlacement } from '@/lib/emoticons';

export type EmoteBubble = {
  /** The Pixi container, so the caller can hide it while measuring the scene. */
  sprite: any;
  show: (placement: EmotePlacement) => void;
  hide: () => void;
  /** Register on the Pixi ticker. */
  tick: () => void;
};

// Unity's own `Time.maximumDeltaTime`: a longer frame advances the simulation
// by one step of this rather than teleporting every particle.
const MAX_STEP = 0.333;

export function createEmoteBubble(options: {
  PIXI: any;
  scene: any;
  spine: any;
  /** Scene time, so the emote pauses and rescales with everything else. */
  now: () => number;
  isDestroyed: () => boolean;
}): EmoteBubble {
  const { PIXI, scene, spine, now, isDestroyed } = options;

  const container = new PIXI.Container();
  container.visible = false;
  container.eventMode = 'none';
  container.zIndex = 30;
  scene.addChild(container);

  const pool: any[] = [];
  // One texture per (sheet, tile). The grid is the emitter's, so the same sheet
  // read through two grids yields two sets.
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
      found = new PIXI.Sprite();
      found.eventMode = 'none';
      pool.push(found);
      container.addChild(found);
    }
    return found;
  };

  const draw = () => {
    if (!run || !place) return;
    const wanted = place.bone.toLowerCase();
    const bone = spine.skeleton.bones.find(
      (b: any) => b.data.name.toLowerCase() === wanted);
    if (!bone) return;
    // `bone.worldY` is already y-down while the authored offset and the
    // particle positions are y-up, so both are subtracted rather than added.
    const originX = bone.worldX + place.offset[0];
    const originY = bone.worldY - place.offset[1];
    const unit = EMOTE_UNIT_SCALE;
    const scale = unit * Math.abs(spine.scale.y);
    // A mirrored placement flips the whole effect about the slot: the
    // particle's x, the quad's own x — which carries the pivot with it — and
    // the sense of its rotation.
    const mirror = place.mirror ? -1 : 1;

    let used = 0;
    for (const emitter of run.emitters) {
      const base = sheets.get(emitter.def.sheet);
      if (!base) continue;
      const [columns, rows] = emitter.def.tiles;
      for (const particle of emitter.particles) {
        const view = sprite(used);
        used += 1;
        view.texture = tileTexture(
          base, emitter.def.sheet, columns, rows, particle.frame);
        // Unity's renderer pivot moves the quad by `+pivot * size` and is the
        // point it turns about, which is exactly a Pixi anchor — mirrored in y
        // because the pivot is authored y-up.
        view.anchor.set(0.5 - emitter.def.pivot[0], 0.5 + emitter.def.pivot[1]);
        const point = scene.toLocal(spine.toGlobal({
          x: originX + particle.x * unit * mirror,
          y: originY - particle.y * unit,
        }));
        view.position.set(point.x, point.y);
        view.width = particle.size * scale;
        view.height = particle.sizeY * scale;
        view.scale.x = Math.abs(view.scale.x) * mirror;
        // Counter-clockwise about the emitter's plane against a y-down stage,
        // so it enters Pixi negated, and mirroring reverses it again.
        view.rotation = -particle.angle * mirror;
        view.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        view.alpha = Math.min(1, Math.max(0, particle.a));
        view.visible = true;
      }
    }
    for (let i = used; i < pool.length; i += 1) pool[i].visible = false;
  };

  const stop = () => {
    token += 1;
    run = null;
    place = null;
    container.visible = false;
    for (const view of pool) view.visible = false;
  };

  return {
    sprite: container,
    show: (placement) => {
      const mine = ++token;
      // PIXI picks a parser by extension, and the bare-string form produces no
      // texture, so `loadParser` is named explicitly.
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
          // A zero-length step puts the opening burst on screen for the frame
          // the line starts, not the one after.
          run.advance(0);
          draw();
        })
        // A decorative asset must not break the reaction it belongs to, nor
        // fail silently.
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
