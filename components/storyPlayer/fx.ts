import { createEmoteRun, type EmoteRun } from '@/components/skinViewer/particles';
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

  private draw(): void {
    let used = 0;
    for (const emitter of this.run.emitters) {
      if (!this.sheets.has(emitter.def.sheet)) continue;
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
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    this.container.destroy({ children: true });
    this.onEnd();
  }
}
