import { createEmoteRun, type EmoteRun } from '@/components/skinViewer/particles';
import type { SdCharacter } from '@/lib/data';
import { urlFor } from '@/lib/skinArchive';

type Effect = NonNullable<SdCharacter['cutin']>['effects'][number];

type ActiveEffect = {
  effect: Effect;
  run: EmoteRun;
  sprites: any[];
  elapsed: number;
};


export async function createCutinEffects(options: {
  PIXI: any;
  spine: any;
  files: Map<string, Blob>;
  cacheKey: string;
  effects: Effect[];
}) {
  const { PIXI, spine, files, cacheKey, effects } = options;
  const sheets = new Map<string, any>();
  const names = [...new Set(effects.flatMap(
    (effect) => effect.emitters.map((emitter) => emitter.sheet)))];
  await Promise.all(names.map(async (name) => {
    if (!files.has(name)) return;
    const texture = await PIXI.Assets.load({
      src: urlFor(cacheKey, files, name),
      loadParser: 'loadTextures',
    });
    if (texture?.source) sheets.set(name, texture);
  }));

  const container = new PIXI.Container();
  container.eventMode = 'none';
  container.sortableChildren = true;
  spine.addChild(container);
  const tiles = new Map<string, any>();
  const active = new Map<number, ActiveEffect>();
  let entry: any = null;
  let lastTime = 0;

  const tileTexture = (base: any, sheet: string, columns: number,
                       rows: number, index: number) => {
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

  const clear = () => {
    active.clear();
    container.removeChildren().forEach((sprite: any) => sprite.destroy());
  };

  const begin = (effect: Effect, index: number, elapsed: number) => {
    const usable = effect.emitters.filter((emitter) => sheets.has(emitter.sheet));
    if (!usable.length) return;
    const run = createEmoteRun(usable, (index + 1) * 0x9e3779b1);
    run.advance(Math.max(0, elapsed));
    active.set(index, { effect, run, sprites: [], elapsed });
  };

  const draw = (live: ActiveEffect) => {
    const bone = live.effect.bone
      ? spine.skeleton.findBone(live.effect.bone) : null;
    const originX = bone?.worldX ?? 0;
    const originY = bone?.worldY ?? 0;
    let used = 0;
    for (const emitter of live.run.emitters) {
      const base = sheets.get(emitter.def.sheet);
      if (!base) continue;
      const [columns, rows] = emitter.def.tiles;
      for (const particle of emitter.particles) {
        let sprite = live.sprites[used];
        if (!sprite) {
          sprite = new PIXI.Sprite();
          sprite.eventMode = 'none';
          live.sprites.push(sprite);
          container.addChild(sprite);
        }
        used += 1;
        sprite.texture = tileTexture(
          base, emitter.def.sheet, columns, rows, particle.frame);
        sprite.anchor.set(
          0.5 - emitter.def.pivot[0], 0.5 + emitter.def.pivot[1]);
        sprite.position.set(originX + particle.x, originY - particle.y);
        sprite.width = particle.size;
        sprite.height = particle.sizeY;
        sprite.rotation = -particle.angle;
        sprite.zIndex = (emitter.def as typeof emitter.def & { order?: number }).order ?? 0;
        sprite.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        sprite.alpha = Math.min(1, Math.max(0, particle.a));
        sprite.visible = true;
      }
    }
    for (let i = used; i < live.sprites.length; i += 1) {
      live.sprites[i].visible = false;
    }
  };

  return {
    clear,
    tick: (current: any, enabled: boolean) => {
      const time = current?.trackTime ?? 0;
      if (!enabled) {
        if (active.size) clear();
        entry = current;
        lastTime = time;
        return;
      }
      const restarted = current !== entry || time < lastTime;
      if (restarted) {
        clear();
        entry = current;
      }
      const delta = restarted ? 0 : Math.max(0, time - lastTime);
      lastTime = time;
      effects.forEach((effect, index) => {
        const elapsed = time - effect.start;
        const inWindow = elapsed >= 0 && elapsed < effect.duration;
        let live = active.get(index);
        if (inWindow && !live) {
          begin(effect, index, elapsed);
          live = active.get(index);
        }
        if (!inWindow && live) {
          live.sprites.forEach((sprite) => sprite.visible = false);
          active.delete(index);
          return;
        }
        if (!live) return;
        if (live.elapsed !== elapsed) live.run.advance(delta);
        live.elapsed = elapsed;
        draw(live);
      });
    },
    destroy: () => {
      clear();
      for (const texture of tiles.values()) texture.destroy();
      container.destroy();
    },
  };
}
