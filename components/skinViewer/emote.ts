// The emote container shares the actor's scene transform while particle units use their own scale.
import { EMOTE_UNIT_SCALE } from '@/components/skinViewer/constants';
import { createGraphQuad, type GraphQuad } from '@/components/skinViewer/graphQuad';
import { createEmoteRun, travelTurn, type EmoteRun } from '@/components/skinViewer/particles';
import type { EmotePlacement } from '@/lib/emoticons';

export type EmoteBubble = {
  // The caller hides the container while measuring the scene.
  sprite: any;
  show: (placement: EmotePlacement, onEnd?: () => void) => void;
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
  // Particle units per skeleton unit; the lobby's calibrated constant unless the caller knows its space.
  unit?: number;
}): EmoteBubble {
  const { PIXI, scene, spine, now, isDestroyed } = options;

  const container = new PIXI.Container();
  container.visible = false;
  container.eventMode = 'none';
  container.zIndex = 30;
  // emitters draw in their renderers' sorting order
  container.sortableChildren = true;
  scene.addChild(container);

  const pool: { node: any; view: any; graph?: GraphQuad; graphDef?: unknown }[] = [];
  // The emitter's grid makes each sheet-and-tile combination a distinct texture.
  const tiles = new Map<string, any>();
  const sheets = new Map<string, any>();
  let token = 0;
  let run: EmoteRun | null = null;
  let place: EmotePlacement | null = null;
  let last = 0;
  let ended: (() => void) | null = null;

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
    // The client turns the y-up offset by the bone's local rotation; `bone.worldY` is y-down.
    const turn = bone.rotation * Math.PI / 180;
    const [ox, oy] = place.offset;
    const originX = bone.worldX + ox * Math.cos(turn) - oy * Math.sin(turn);
    const originY = bone.worldY - (ox * Math.sin(turn) + oy * Math.cos(turn));
    const unit = options.unit ?? EMOTE_UNIT_SCALE;
    const scale = unit * Math.abs(spine.scale.y);
    // A mirrored placement flips positions, quads, pivots, and rotations about the slot.
    const mirror = place.mirror ? -1 : 1;
    // `SetFlip` sets the emote's world x sign; a mirrored parent (a story actor facing its other way) flips what is drawn inside it.
    const m = scene.worldTransform;
    const parent = m.a * m.d - m.b * m.c < 0 ? -1 : 1;
    const world = mirror * parent;

    let used = 0;
    for (const emitter of run.emitters) {
      const base = sheets.get(emitter.def.sheet);
      if (!base || emitter.def.renderNone) continue;
      const [columns, rows] = emitter.def.tiles;
      // `CharacterEmoticon.SetFlip`: the root mirror, then per system 4 re-mirrors its own transform, 1 toggles the texture flip, 2 flips rotation
      const flip = world < 0 ? emitter.def.flip ?? 0 : 0;
      const inner = (flip & 4 ? 1 : world) * parent;
      const quad = inner * (flip & 1 ? -1 : 1);
      const turn = inner * (flip & 2 ? -1 : 1);
      const [ex] = emitter.def.position;
      for (const particle of emitter.particles) {
        const { node, view } = sprite(used);
        used += 1;
        view.texture = tileTexture(
          base, emitter.def.sheet, columns, rows, particle.frame);
        // Pixi's anchor is Unity's renderer pivot with its authored y-up coordinate mirrored.
        view.anchor.set(0.5 - emitter.def.pivot[0], 0.5 + emitter.def.pivot[1]);
        const point = scene.toLocal(spine.toGlobal({
          x: originX + (ex * mirror + (particle.x - ex) * inner) * unit,
          y: originY - particle.y * unit,
        }));
        node.position.set(point.x, point.y);
        const [flipX, flipY] = emitter.def.rendererFlip ?? [0, 0];
        node.skew.set(0, 0);
        node.scale.set(quad * (particle.pick < flipX ? -1 : 1), particle.pick < flipY ? -1 : 1);
        // the start rotation is clockwise; a Local-aligned quad (2) also takes the emitter transform's counter-clockwise turn
        const tilt = (emitter.def.angle ?? 0) * (Math.PI / 180);
        node.rotation = (particle.angle - tilt - (emitter.def.align === 2 ? tilt : 0)) * turn + travelTurn(emitter.def, particle) * inner;
        if (emitter.def.align === 2 && (particle.angleX || particle.angleY)) {
          // 3D start rotation on a Local quad: the top-left 2x2 of Ry·Rx·Rz (Quaternion.Euler order), y-up to y-down, then the quad mirrors
          const z = -node.rotation;
          const [cz, sz] = [Math.cos(z), Math.sin(z)];
          const [cx, sx] = [Math.cos(particle.angleX), Math.sin(particle.angleX)];
          const [cy, sy] = [Math.cos(particle.angleY * inner), Math.sin(particle.angleY * inner)];
          const a00 = cy * cz + sy * sx * sz;
          const a01 = -cy * sz + sy * sx * cz;
          const a10 = cx * sz;
          const a11 = cx * cz;
          const [mx, my] = [node.scale.x, node.scale.y];
          const at = { x: node.position.x, y: node.position.y };
          node.setFromMatrix(new PIXI.Matrix(a00 * mx, -a10 * mx, -a01 * my, a11 * my, 0, 0));
          node.position.set(at.x, at.y);
        }
        view.position.set(0, 0);
        view.width = particle.size * scale;
        view.height = particle.sizeY * scale;
        view.scale.set(Math.abs(view.scale.x), Math.abs(view.scale.y));
        view.rotation = 0;
        view.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        view.alpha = Math.min(1, Math.max(0, particle.a));
        view.visible = true;
        view.blendMode = emitter.def.blend ?? 'normal';
        node.zIndex = emitter.def.order ?? 0;
        const item = pool[used - 1];
        const graph = emitter.def.shaderGraph;
        if (graph) {
          // the Shader Graph's own sampling replaces the sprite; a pooled quad is rebuilt when its emitter changes
          if (!item.graph || item.graphDef !== emitter.def) {
            item.graph?.mesh.destroy();
            const mask = graph.mask ? sheets.get(graph.mask) ?? null : null;
            item.graph = createGraphQuad(PIXI, emitter.def, base, mask);
            item.graphDef = emitter.def;
            node.addChild(item.graph.mesh);
          }
          const w = view.width;
          const h = view.height;
          item.graph.draw(-view.anchor.x * w, -view.anchor.y * h, w, h, particle);
          view.visible = false;
        } else if (item.graph) {
          item.graph.mesh.visible = false;
        }
        node.visible = true;
      }
    }
    for (let i = used; i < pool.length; i += 1) pool[i].node.visible = false;
  };

  const stop = () => {
    token += 1;
    const done = ended;
    ended = null;
    done?.();
    run = null;
    place = null;
    container.visible = false;
    for (const item of pool) item.node.visible = false;
  };

  return {
    sprite: container,
    show: (placement, onEnd) => {
      const previous = ended;
      ended = null;
      previous?.();
      const mine = ++token;
      ended = onEnd ?? null;
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
        .catch((err: unknown) => {
          console.warn('emote', err);
          if (mine === token) stop();
        });
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
