// Redrawn every frame because the boxes are posed polygons, not static
// rectangles, and sits in `scene` beside the actor so pan, zoom and device
// staging carry it with the figure. The hit test runs against the same
// `SkeletonBounds`, never against this graphic.
import { EFFECT_COLOR } from '@/components/skinViewer/constants';
import type { TouchRegion } from '@/components/skinViewer/types';

export type TouchOverlay = {
  graphics: any;
  /** Register on the Pixi ticker. */
  tick: () => void;
};

export function createTouchOverlay(options: {
  PIXI: any;
  scene: any;
  spine: any;
  /** The `SkeletonBounds` the hit test also reads, so both see one pose. */
  bounds: any;
  regionByBox: Map<string, TouchRegion>;
  visible: boolean;
  /** A box that fails this is skipped, not dimmed: the overlay draws exactly
   *  what the input path would accept. */
  isLive: (box: string, region: TouchRegion | undefined, attachment: any) => boolean;
}): TouchOverlay {
  const { PIXI, scene, spine, bounds, regionByBox, visible, isLive } = options;

  const graphics = new PIXI.Graphics();
  graphics.zIndex = 20;
  graphics.eventMode = 'none';
  graphics.visible = visible;
  scene.addChild(graphics);

  return {
    graphics,
    tick: () => {
      if (!graphics.visible) return;
      graphics.clear();
      bounds.update(spine.skeleton, true);
      const polys = bounds.polygons ?? [];
      const boxes = bounds.boundingBoxes ?? [];
      for (let i = 0; i < polys.length; i++) {
        const verts = polys[i];
        if (!verts || verts.length < 6) continue;
        const name: string = boxes[i]?.name ?? '';
        const region = regionByBox.get(name);
        if (!isLive(name, region, boxes[i])) continue;
        // The Spine object already applies Pixi's y-down flip, so these
        // vertices are in its own local space; flipping again would mirror the
        // boxes off the figure.
        const pts: number[] = [];
        for (let v = 0; v < verts.length; v += 2) {
          const world = spine.toGlobal({ x: verts[v], y: verts[v + 1] });
          const local = scene.toLocal(world);
          pts.push(local.x, local.y);
        }
        // Colour encodes the resolved effect, not a guess from the name.
        const color = EFFECT_COLOR[region?.effect ?? 'generic'];
        graphics.poly(pts)
          .fill({ color, alpha: 0.14 })
          .stroke({ color, width: 0.06, alpha: 0.9 });
      }
    },
  };
}
