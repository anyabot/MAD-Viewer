// The touch-region overlay: the posed bounding boxes, drawn over the figure.
//
// Redrawn every frame because the boxes are posed polygons, not static
// rectangles. It lives in `scene` next to the actor, so pan, zoom and the device
// staging carry it exactly as they carry the figure, and it is `eventMode:
// 'none'` — the hit test runs against the same `SkeletonBounds`, never against
// this graphic.
import { EFFECT_COLOR } from '@/components/skinViewer/constants';
import type { TouchRegion } from '@/components/skinViewer/types';

export type TouchOverlay = {
  graphics: any;
  /** Redraw against the current pose. Register on the Pixi ticker. */
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
  /**
   * Whether a box can be touched right now, given its bounding-box attachment.
   * A box that cannot is not drawn at all, so the overlay shows the zones the
   * input path would actually accept and nothing else.
   */
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
        // The Spine display object already applies Pixi's y-down flip to the
        // skeleton's world transform, so these vertices are in the Spine
        // object's own local space — flipping y again would mirror the boxes off
        // the figure entirely.
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
