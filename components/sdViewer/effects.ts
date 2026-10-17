import { createEmoteRun, type EmoteRun } from '@/components/skinViewer/particles';
import type { SdCharacter } from '@/lib/data';
import { urlFor } from '@/lib/skinArchive';

type Effect = NonNullable<SdCharacter['cutin']>['effects'][number];

type ActiveEffect = {
  effect: Effect;
  run: EmoteRun;
  sprites: any[];
  // mesh-mode particles, pooled per emitter
  meshes: Map<number, any[]>;
  elapsed: number;
};

type ParticleMesh = { verts: number[]; uvs: number[]; tris: number[] };


const EFFECT_CAMERA_HEIGHT = 10;

export async function createCutinEffects(options: {
  PIXI: any;
  spine: any;
  files: Map<string, Blob>;
  cacheKey: string;
  effects: Effect[];
  skeletonOrder?: number;
  unitScale?: number;
  meshes?: Record<string, ParticleMesh>;
  screen: () => { width: number; height: number };
}) {
  const { PIXI, spine, files, cacheKey, effects, screen } = options;
  const unitScale = options.unitScale || 1;
  const skeletonOrder = options.skeletonOrder ?? 0;
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
  // Emitters sorted below the skeleton renderer draw behind it, in the skeleton's own space.
  const behind = new PIXI.Container();
  behind.eventMode = 'none';
  behind.sortableChildren = true;
  spine.parent?.addChildAt(behind, spine.parent.getChildIndex(spine));
  // Spawned cut-in prefabs sort on Unit_Front, above the character's whole Unit-layer group.
  const front = new PIXI.Container();
  front.eventMode = 'none';
  front.sortableChildren = true;
  spine.parent?.addChild(front);
  // CAMERA-reach prefabs sit under the orthographic EffectCamera (size 5): ten units span the screen height.
  const camera = new PIXI.Container();
  camera.eventMode = 'none';
  camera.sortableChildren = true;
  spine.parent?.addChild(camera);
  const layers = [container, behind, front, camera];
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
    for (const layer of layers) layer.removeChildren().forEach((sprite: any) => sprite.destroy());
  };

  // Particle space is y-up; the skeleton is y-down, so the identity flips y.
  const frameOf = (effect: Effect) => {
    const bone = effect.anchor !== 'camera' && effect.bone
      ? spine.skeleton.findBone(effect.bone) : null;
    if (!bone) return { a: 1, b: 0, c: 0, d: -1, x: 0, y: 0 };
    let { a, b, c, d } = bone;
    if (!effect.followRotation) {
      a = 1; b = 0; c = 0; d = -1;
    } else {
      // spine-unity's BoneFollower takes the world rotation but only the bone's local scale.
      const sx = Math.hypot(a, c) || 1;
      const sy = Math.hypot(b, d) || 1;
      a /= sx; c /= sx; b /= sy; d /= sy;
    }
    if (effect.followScale) {
      a *= bone.scaleX; c *= bone.scaleX; b *= bone.scaleY; d *= bone.scaleY;
    }
    const [ox, oy] = effect.offset ?? [0, 0];
    return { a, b, c, d, x: bone.worldX + a * ox + b * oy, y: bone.worldY + c * ox + d * oy };
  };

  const begin = (effect: Effect, index: number, elapsed: number) => {
    const usable = effect.emitters.filter((emitter) => sheets.has(emitter.sheet));
    if (!usable.length) return;
    const run = createEmoteRun(usable, (index + 1) * 0x9e3779b1);
    run.advance(Math.max(0, elapsed));
    active.set(index, { effect, run, sprites: [], meshes: new Map(), elapsed });
  };

  const draw = (live: ActiveEffect) => {
    const { a, b, c, d, x, y } = frameOf(live.effect);
    const scaleX = Math.hypot(a, c);
    const scaleY = Math.hypot(b, d);
    let used = 0;
    live.run.emitters.forEach((emitter, emitterIndex) => {
      const pool = live.meshes.get(emitterIndex) ?? [];
      live.meshes.set(emitterIndex, pool);
      let pooled = 0;
      const base = sheets.get(emitter.def.sheet);
      if (!base) return;
      const [columns, rows] = emitter.def.tiles;
      const def = emitter.def as Effect['emitters'][number];
      const order = def.order ?? 0;
      // Particle size follows `scalingMode`; layers in unit space already carry the unit root's scale.
      const root = live.effect.anchor === 'camera' ? 1 : unitScale;
      const sizeX = def.scaling === 1 ? (def.ownScale?.[0] ?? 1) / root
        : def.scaling === 2 ? 1 / root : scaleX * (def.scale?.[0] ?? 1);
      const sizeY = def.scaling === 1 ? (def.ownScale?.[1] ?? 1) / root
        : def.scaling === 2 ? 1 / root : scaleY * (def.scale?.[1] ?? 1);
      const meshX = sizeX / (scaleX || 1);
      const meshY = sizeY / (scaleY || 1);
      const spawned = live.effect.anchor === 'camera' || live.effect.layer === 'front';
      // A group authored at order 0 ties the highlighted caster; it draws behind, as in game captures.
      const tied = live.effect.layer === 'front' && (live.effect.groupOrder ?? 0) <= 0;
      const layer = live.effect.anchor === 'camera' ? camera
        : tied ? behind
          : live.effect.layer === 'front' ? front
            : order < skeletonOrder ? behind : container;
      const geometry = def.renderMode === 4 && def.mesh ? options.meshes?.[def.mesh] : undefined;
      for (const particle of emitter.particles) {
        if (geometry) {
          let mesh = pool[pooled];
          if (!mesh) {
            mesh = new PIXI.MeshSimple({
              texture: base,
              vertices: new Float32Array((geometry.verts.length / 3) * 2),
              uvs: new Float32Array(geometry.uvs.length),
              indices: new Uint32Array(geometry.tris),
            });
            mesh.eventMode = 'none';
            pool.push(mesh);
          }
          pooled += 1;
          if (mesh.parent !== layer) layer.addChild(mesh);
          // Unity applies a particle's 3D rotation Z, then X, then Y, in particle space.
          const cz = Math.cos(particle.angle), sz = Math.sin(particle.angle);
          const cx = Math.cos(particle.angleX), sx = Math.sin(particle.angleX);
          const cy = Math.cos(particle.angleY), sy = Math.sin(particle.angleY);
          const target = mesh.geometry.getBuffer('aPosition').data as Float32Array;
          const src = geometry.verts;
          for (let k = 0, j = 0; k < src.length; k += 3, j += 2) {
            const bx = src[k] * particle.size * meshX;
            const by = src[k + 1] * particle.sizeY * meshY;
            const bz = src[k + 2] * particle.sizeZ * meshX;
            const zx = bx * cz - by * sz;
            const zy = bx * sz + by * cz;
            const ry = zy * cx - bz * sx;
            const rz = zy * sx + bz * cx;
            const lx = particle.x + zx * cy + rz * sy;
            const ly = particle.y + ry;
            target[j] = a * lx + b * ly + x;
            target[j + 1] = c * lx + d * ly + y;
          }
          mesh.geometry.getBuffer('aPosition').update();
          const frame = tileTexture(base, emitter.def.sheet, columns, rows, particle.frame).frame;
          const u0 = frame.x / base.width, v0 = frame.y / base.height;
          const du = frame.width / base.width, dv = frame.height / base.height;
          const uvs = mesh.geometry.getBuffer('aUV').data as Float32Array;
          for (let k = 0; k < geometry.uvs.length; k += 2) {
            uvs[k] = u0 + geometry.uvs[k] * du;
            uvs[k + 1] = v0 + geometry.uvs[k + 1] * dv;
          }
          mesh.geometry.getBuffer('aUV').update();
          mesh.blendMode = def.blend ?? 'normal';
          mesh.zIndex = spawned ? (live.effect.groupOrder ?? 0) * 1000 + order : order;
          mesh.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
            | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
            | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
          mesh.alpha = Math.min(1, Math.max(0, particle.a));
          mesh.visible = true;
          continue;
        }
        let sprite = live.sprites[used];
        if (!sprite) {
          sprite = new PIXI.Sprite();
          sprite.eventMode = 'none';
          live.sprites.push(sprite);
        }
        if (sprite.parent !== layer) layer.addChild(sprite);
        used += 1;
        sprite.texture = tileTexture(
          base, emitter.def.sheet, columns, rows, particle.frame);
        sprite.anchor.set(
          0.5 - emitter.def.pivot[0], 0.5 + emitter.def.pivot[1]);
        sprite.position.set(
          a * particle.x + b * particle.y + x, c * particle.x + d * particle.y + y);
        sprite.width = particle.size * sizeX;
        sprite.height = particle.sizeY * sizeY;
        // Unity turns a particle clockwise; only a Local-aligned quad (2) also takes the transform's rotation.
        const turn = (def.angle ?? 0) * (Math.PI / 180);
        const own = particle.angle - turn;
        if (def.align === 2) {
          const cos = Math.cos(turn - own);
          const sin = Math.sin(turn - own);
          sprite.rotation = Math.atan2(c * cos + d * sin, a * cos + b * sin);
        } else {
          sprite.rotation = own;
        }
        sprite.blendMode = def.blend ?? 'normal';
        sprite.zIndex = spawned ? (live.effect.groupOrder ?? 0) * 1000 + order : order;
        sprite.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        sprite.alpha = Math.min(1, Math.max(0, particle.a));
        sprite.visible = true;
      }
      for (let i = pooled; i < pool.length; i += 1) pool[i].visible = false;
    });
    for (let i = used; i < live.sprites.length; i += 1) {
      live.sprites[i].visible = false;
    }
  };

  return {
    clear,
    tick: (current: any, enabled: boolean) => {
      for (const layer of [behind, front]) {
        layer.position.copyFrom(spine.position);
        layer.scale.copyFrom(spine.scale);
        layer.rotation = spine.rotation;
      }
      const view = screen();
      camera.position.set(view.width / 2, view.height / 2);
      camera.scale.set(view.height / EFFECT_CAMERA_HEIGHT);
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
          live.meshes.forEach((pool) => pool.forEach((mesh) => mesh.visible = false));
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
      for (const layer of layers) layer.destroy();
    },
  };
}
