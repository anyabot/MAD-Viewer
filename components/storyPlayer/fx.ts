import { createGraphQuad, type GraphQuad } from '@/components/skinViewer/graphQuad';
import { colorAt, createEmoteRun, travelTurn, valueAt, type EmoteRun, type Particle } from '@/components/skinViewer/particles';
import type { EmoteEmitter } from '@/lib/emoticons';

export type FxIndex = {
  spawn: Record<string, string>;
  characterFx: Record<string, string>;
  popups: Record<string, { image: string; size: [number, number] }>;
  prefabs: Record<string, EmoteEmitter[]>;
  sheets: Record<string, [number, number]>;
  cutscenes?: Record<string, string>;
  // printer art: size and 9-slice border (top, right, bottom, left) in pixels
  ui?: Record<string, { size: [number, number]; border: [number, number, number, number] }>;
  avatars?: Record<string, string>;
  colors?: Record<string, string>;
};

const MAX_STEP = 0.333;

// A spawned prefab: its particle systems simulate in world units under one container that carries the spawn transform.
export class FxRun {
  readonly container: any;
  private readonly pool: { node: any; view: any; graph?: GraphQuad; graphDef?: unknown; mesh?: any; meshDef?: unknown }[] = [];
  private readonly ribbons: any[] = [];
  private readonly run: EmoteRun;
  private last: number;
  done = false;

  constructor(private readonly PIXI: any, parent: any, emitters: EmoteEmitter[], private readonly sheets: Map<string, any>,
    private readonly now: () => number, private readonly onEnd: () => void) {
    this.container = new PIXI.Container();
    this.container.eventMode = 'none';
    // emitters draw in their renderers' sorting order
    this.container.sortableChildren = true;
    parent.addChild(this.container);
    this.run = createEmoteRun(emitters.filter((e) => sheets.has(e.sheet)), Math.floor(Math.random() * 0xffffffff));
    this.last = now();
    this.run.advance(0);
    this.draw();
  }

  private tile(sheet: string, columns: number, rows: number, index: number): any {
    const base = this.sheets.get(sheet);
    const key = `${sheet}|${columns}x${rows}|${index}`;
    const cache = (this.sheets as Map<string, any>).get(key);
    if (cache) return cache;
    const width = base.width / columns;
    const height = base.height / rows;
    const texture = new this.PIXI.Texture({
      source: base.source,
      frame: new this.PIXI.Rectangle((index % columns) * width, Math.floor(index / columns) * height, width, height),
    });
    this.sheets.set(key, texture);
    return texture;
  }

  tick(): void {
    if (this.done) return;
    const at = this.now();
    this.run.advance(Math.max(0, Math.min(MAX_STEP, at - this.last)));
    this.last = at;
    if (this.run.finished()) { this.stop(); return; }
    this.draw();
  }

  // A trail is a ribbon along the particle's recorded path: Stretch maps the texture once from the particle back to the tail.
  private ribbon(index: number, particle: Particle, def: NonNullable<EmoteRun['emitters'][number]['def']['trail']>, sheet: string): void {
    const points = particle.trail!;
    const count = points.length / 2;
    let mesh = this.ribbons[index];
    if (!mesh) {
      mesh = new this.PIXI.MeshSimple({ texture: this.sheets.get(sheet), vertices: new Float32Array(4), uvs: new Float32Array(4) });
      this.container.addChildAt(mesh, 0);
      this.ribbons[index] = mesh;
    }
    mesh.texture = this.sheets.get(sheet);
    const vertices = new Float32Array(count * 4);
    const uvs = new Float32Array(count * 4);
    const indices = new Uint32Array((count - 1) * 6);
    const width = def.sizeAffectsWidth ? particle.size : 1;
    for (let i = 0; i < count; i += 1) {
      const a = Math.max(0, i - 1);
      const b = Math.min(count - 1, i + 1);
      let tx = points[b * 2] - points[a * 2];
      let ty = points[b * 2 + 1] - points[a * 2 + 1];
      const length = Math.hypot(tx, ty) || 1;
      tx /= length; ty /= length;
      const u = 1 - i / (count - 1);
      const half = (width * valueAt(def.width, u, 0.5)) / 2;
      const x = points[i * 2];
      const y = points[i * 2 + 1];
      vertices.set([x - ty * half, -(y + tx * half), x + ty * half, -(y - tx * half)], i * 4);
      uvs.set([u, 0, u, 1], i * 4);
      if (i < count - 1) indices.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    }
    mesh.geometry.positions = vertices;
    mesh.geometry.uvs = uvs;
    mesh.geometry.indices = indices;
    // The trail gradients only scale the inherited colour; every published trail authors them white, so one tint per ribbon is exact.
    const base = def.inheritParticleColor ? [particle.r, particle.g, particle.b, particle.a] : [1, 1, 1, 1];
    const over = colorAt(def.color, particle.life, 0.5);
    const c = (k: number) => Math.round(Math.min(1, Math.max(0, base[k] * over[k])) * 255);
    mesh.tint = (c(0) << 16) | (c(1) << 8) | c(2);
    mesh.alpha = Math.min(1, Math.max(0, base[3] * over[3]));
    mesh.visible = true;
  }

  private draw(): void {
    let used = 0;
    let trails = 0;
    for (const emitter of this.run.emitters) {
      if (!this.sheets.has(emitter.def.sheet)) continue;
      const trail = emitter.def.trail;
      if (trail) {
        for (const particle of emitter.particles) {
          if (particle.trail && particle.trail.length >= 4) this.ribbon(trails++, particle, trail, emitter.def.sheet);
        }
      }
      if (emitter.def.renderNone) continue;
      const [columns, rows] = emitter.def.tiles;
      for (const particle of emitter.particles) {
        let item = this.pool[used];
        if (!item) {
          const node = new this.PIXI.Container();
          const view = new this.PIXI.Sprite();
          node.addChild(view);
          this.container.addChild(node);
          item = { node, view };
          this.pool.push(item);
        }
        used += 1;
        const { node, view } = item;
        const def = emitter.def;
        const color = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        const alpha = Math.min(1, Math.max(0, particle.a));
        node.zIndex = def.order ?? 0;
        // the start rotation is clockwise; a Local-aligned quad (2) also takes the emitter transform's counter-clockwise turn
        const tilt = (def.angle ?? 0) * (Math.PI / 180);
        const spin = particle.angle - tilt - (def.align === 2 ? tilt : 0) + travelTurn(def, particle);
        if (def.mesh) {
          // mesh render mode: the mesh scaled by the particle size, turned z, then x, then y (Quaternion.Euler), seen orthographically
          view.visible = false;
          if (!item.mesh || item.meshDef !== def) {
            item.mesh?.destroy();
            item.graph?.mesh.destroy();
            item.graph = undefined;
            if (def.shaderGraph) {
              // a Shader Graph material shades the mesh with its own program
              const mask = def.shaderGraph.mask ? this.sheets.get(def.shaderGraph.mask) ?? null : null;
              item.graph = createGraphQuad(this.PIXI, def, this.sheets.get(def.sheet), mask,
                { uvs: def.mesh.uvs, tris: def.mesh.tris, count: def.mesh.verts.length / 3 });
              item.graphDef = def;
              item.mesh = item.graph.mesh;
            } else {
              item.mesh = new this.PIXI.MeshSimple({
                texture: this.sheets.get(def.sheet),
                vertices: new Float32Array((def.mesh.verts.length / 3) * 2),
                uvs: new Float32Array(def.mesh.uvs.length),
                indices: new Uint32Array(def.mesh.tris),
              });
            }
            item.meshDef = def;
            node.addChild(item.mesh);
          }
          node.position.set(particle.x, -particle.y);
          node.rotation = 0;
          node.scale.set(1, 1);
          node.skew.set(0, 0);
          const z = -spin;
          const [cz, sz] = [Math.cos(z), Math.sin(z)];
          const [cx, sx] = [Math.cos(particle.angleX), Math.sin(particle.angleX)];
          const [cy, sy] = [Math.cos(particle.angleY), Math.sin(particle.angleY)];
          const target = item.graph && item.graphDef === def ? item.graph.positions : item.mesh.geometry.getBuffer('aPosition').data as Float32Array;
          const src = def.mesh.verts;
          for (let k = 0, j = 0; k < src.length; k += 3, j += 2) {
            const bx = src[k] * particle.size;
            const by = src[k + 1] * particle.sizeY;
            const bz = src[k + 2] * particle.sizeZ;
            const zx = bx * cz - by * sz;
            const zy = bx * sz + by * cz;
            const ry = zy * cx - bz * sx;
            const rz = zy * sx + bz * cx;
            target[j] = zx * cy + rz * sy;
            target[j + 1] = -ry;
          }
          if (item.graph && item.graphDef === def) {
            item.graph.commit();
            item.graph.shade(particle);
            node.visible = true;
            continue;
          }
          item.mesh.geometry.getBuffer('aPosition').update();
          const frame = this.tile(def.sheet, columns, rows, particle.frame).frame;
          const sheet = this.sheets.get(def.sheet);
          const uvs = item.mesh.geometry.getBuffer('aUV').data as Float32Array;
          for (let k = 0; k < def.mesh.uvs.length; k += 2) {
            uvs[k] = frame.x / sheet.width + def.mesh.uvs[k] * (frame.width / sheet.width);
            uvs[k + 1] = frame.y / sheet.height + def.mesh.uvs[k + 1] * (frame.height / sheet.height);
          }
          item.mesh.geometry.getBuffer('aUV').update();
          item.mesh.blendMode = def.blend ?? 'normal';
          item.mesh.tint = color;
          item.mesh.alpha = alpha;
          item.mesh.visible = true;
          node.visible = true;
          continue;
        }
        if (item.mesh && item.meshDef) {
          item.mesh.destroy();
          if (item.graph?.mesh === item.mesh) item.graph = undefined;
          item.mesh = undefined;
          item.meshDef = undefined;
        }
        view.texture = this.tile(def.sheet, columns, rows, particle.frame);
        view.anchor.set(0.5 - def.pivot[0], 0.5 + def.pivot[1]);
        node.position.set(particle.x, -particle.y);
        const [flipX, flipY] = def.rendererFlip ?? [0, 0];
        node.skew.set(0, 0);
        node.scale.set(particle.pick < flipX ? -1 : 1, particle.pick < flipY ? -1 : 1);
        node.rotation = spin;
        if (def.align === 2 && (particle.angleX || particle.angleY)) {
          // 3D start rotation on a Local quad: the top-left 2x2 of Ry·Rx·Rz (Quaternion.Euler order), y-up to y-down, then the quad mirrors
          const z = -spin;
          const [cz, sz] = [Math.cos(z), Math.sin(z)];
          const [cx, sx] = [Math.cos(particle.angleX), Math.sin(particle.angleX)];
          const [cy, sy] = [Math.cos(particle.angleY), Math.sin(particle.angleY)];
          const [mx, my] = [node.scale.x, node.scale.y];
          node.setFromMatrix(new this.PIXI.Matrix((cy * cz + sy * sx * sz) * mx, -(cx * sz) * mx, -(-cy * sz + sy * sx * cz) * my, cx * cz * my, 0, 0));
          node.position.set(particle.x, -particle.y);
        }
        view.width = particle.size;
        view.height = particle.sizeY;
        view.tint = color;
        view.alpha = alpha;
        view.blendMode = def.blend ?? 'normal';
        view.visible = true;
        if (def.shaderGraph) {
          // the Shader Graph's own sampling replaces the sprite; a pooled quad is rebuilt when its emitter changes
          if (!item.graph || item.graphDef !== def) {
            item.graph?.mesh.destroy();
            const mask = def.shaderGraph.mask ? this.sheets.get(def.shaderGraph.mask) ?? null : null;
            item.graph = createGraphQuad(this.PIXI, def, this.sheets.get(def.sheet), mask);
            item.graphDef = def;
            node.addChild(item.graph.mesh);
          }
          item.graph.draw(-view.anchor.x * particle.size, -view.anchor.y * particle.sizeY, particle.size, particle.sizeY, particle);
          view.visible = false;
        } else if (item.graph) {
          item.graph.mesh.visible = false;
        }
        node.visible = true;
      }
    }
    for (let i = used; i < this.pool.length; i += 1) this.pool[i].node.visible = false;
    for (let i = trails; i < this.ribbons.length; i += 1) this.ribbons[i].visible = false;
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    this.container.destroy({ children: true });
    this.onEnd();
  }
}
