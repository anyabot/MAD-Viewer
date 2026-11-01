import { colorAt, createEmoteRun, valueAt, type EmoteRun, type Particle } from '@/components/skinViewer/particles';
import type { EmoteEmitter } from '@/lib/emoticons';

export type FxIndex = {
  spawn: Record<string, string>;
  characterFx: Record<string, string>;
  popups: Record<string, { image: string; size: [number, number] }>;
  prefabs: Record<string, EmoteEmitter[]>;
  sheets: Record<string, [number, number]>;
  cutscenes?: Record<string, string>;
};

const MAX_STEP = 0.333;

// A spawned prefab: its particle systems simulate in world units under one container that carries the spawn transform.
export class FxRun {
  readonly container: any;
  private readonly pool: { node: any; view: any }[] = [];
  private readonly ribbons: any[] = [];
  private readonly run: EmoteRun;
  private last: number;
  done = false;

  constructor(private readonly PIXI: any, parent: any, emitters: EmoteEmitter[], private readonly sheets: Map<string, any>,
    private readonly now: () => number, private readonly onEnd: () => void) {
    this.container = new PIXI.Container();
    this.container.eventMode = 'none';
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
        view.texture = this.tile(emitter.def.sheet, columns, rows, particle.frame);
        view.anchor.set(0.5 - emitter.def.pivot[0], 0.5 + emitter.def.pivot[1]);
        node.position.set(particle.x, -particle.y);
        node.rotation = -particle.angle;
        view.width = particle.size;
        view.height = particle.sizeY;
        view.tint = (Math.round(Math.min(1, Math.max(0, particle.r)) * 255) << 16)
          | (Math.round(Math.min(1, Math.max(0, particle.g)) * 255) << 8)
          | Math.round(Math.min(1, Math.max(0, particle.b)) * 255);
        view.alpha = Math.min(1, Math.max(0, particle.a));
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
