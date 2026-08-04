// Saving the composed stage as a PNG at the art's native resolution.
import { mappedSourcePixelScale } from '@/components/skinViewer/types';
import { EXPORT_SCALE_PERCENTILE, MAX_EXPORT_DIM } from '@/components/skinViewer/constants';

/**
 * Source-atlas pixels per world unit for every drawn attachment in the current
 * pose. `RegionAttachment` and `MeshAttachment` come from the runtime's own
 * module, so they are passed in rather than imported here.
 */
export function attachmentScales(
  spine: any, RegionAttachment: any, MeshAttachment: any,
): number[] {
  if (!spine?.visible) return [];
  const scales: number[] = [];
  for (const slot of spine.skeleton.slots) {
    const attachment = slot.getAttachment();
    const page = attachment?.region?.page;
    if (!attachment || !page?.width || !page?.height) continue;
    let vertices: Float32Array;
    let indices: ArrayLike<number>;
    if (attachment instanceof RegionAttachment) {
      vertices = new Float32Array(8);
      attachment.computeWorldVertices(slot, vertices, 0, 2);
      indices = [0, 1, 2, 0, 2, 3];
    } else if (attachment instanceof MeshAttachment) {
      vertices = new Float32Array(attachment.worldVerticesLength);
      attachment.computeWorldVertices(
        slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
      indices = attachment.triangles;
    } else {
      continue;
    }
    const scale = mappedSourcePixelScale(
      vertices, attachment.uvs, indices, page.width, page.height,
      { a: spine.scale.x, b: 0, c: 0, d: spine.scale.y },
    );
    if (scale > 0 && Number.isFinite(scale)) scales.push(scale);
  }
  return scales;
}

/**
 * The scale a save should render at, in source pixels per world unit.
 *
 * A rig's real art occupies a narrow band of source-pixel scales, but every rig
 * also carries filler regions (`pixel`, `white`, skin-tone gap meshes) stretched
 * far past their own size. A low percentile of the band is near-native for the
 * detailed art and immune to those outliers. The background is a fallback only:
 * it is usually stretched well past its own resolution and would halve the
 * figure's export scale.
 */
export function sourcePixelScale(scales: number[], backgroundSprites: any[]): number {
  const sorted = scales.slice().sort((a, b) => a - b);
  if (sorted.length) {
    return sorted[Math.floor((sorted.length - 1) * EXPORT_SCALE_PERCENTILE)];
  }
  const bg = backgroundSprites.find((sprite) => sprite.visible);
  const source = bg?.texture?.source;
  if (bg?.visible && source?.width && source?.height) {
    return Math.max(Math.abs(bg.width) / source.width, Math.abs(bg.height) / source.height) || 1;
  }
  return 1;
}

/**
 * Render the whole stage to an off-screen texture at native resolution, crop it
 * to its non-transparent bounds and hand the browser the download.
 */
export function saveStagePng(options: {
  PIXI: any;
  app: any;
  root: any;
  /** Source pixels per world unit in the current pose. */
  pixelScale: number;
  fileName: string;
}): void {
  const { PIXI, app, root, pixelScale, fileName } = options;

  // fitScale: screen px per world unit (set by fit()).
  // 1/pixelScale: world units per atlas pixel in the current pose.
  const fitScale = root.scale.x;
  const screenBounds = root.getBounds();
  // Capped at the maximum texture dimension WebGL guarantees. Clamping rather
  // than bailing means an oversized rig still saves, one size down.
  const exportScale = Math.min(
    (1 / pixelScale) / fitScale,
    MAX_EXPORT_DIM / screenBounds.width,
    MAX_EXPORT_DIM / screenBounds.height,
  );
  const natW = Math.ceil(screenBounds.width * exportScale);
  const natH = Math.ceil(screenBounds.height * exportScale);
  if (!natW || !natH) return;

  const rt = PIXI.RenderTexture.create({ width: natW, height: natH });
  const matrix = new PIXI.Matrix(
    exportScale, 0, 0, exportScale,
    -screenBounds.x * exportScale, -screenBounds.y * exportScale);
  app.renderer.render({ container: app.stage, target: rt, transform: matrix, clear: true });
  // extract.canvas() is synchronous in PixiJS v8.
  const src = app.renderer.extract.canvas({ target: rt }) as HTMLCanvasElement;
  rt.destroy(true);

  // Tight-crop to the non-transparent bounds.
  const w = src.width, h = src.height;
  const px = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return;
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d')!.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = fileName;
  a.click();
}
