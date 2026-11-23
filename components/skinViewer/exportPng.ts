import {
  attachmentScales as spineAttachmentScales, percentileScale, renderStageCanvas, tightCrop,
  type StageRenderOptions,
} from '@altterisk/game-hub/spine';
import { EXPORT_SCALE_PERCENTILE, MAX_EXPORT_DIM } from '@/components/skinViewer/constants';

export function attachmentScales(
  spine: any, RegionAttachment: any, MeshAttachment: any,
): number[] {
  return spineAttachmentScales(spine, { RegionAttachment, MeshAttachment });
}

// The background is a fallback only: it is usually stretched well past its own resolution.
export function sourcePixelScale(scales: number[], backgroundSprites: any[]): number {
  const scale = percentileScale(scales, EXPORT_SCALE_PERCENTILE);
  if (scale !== null) return scale;
  const bg = backgroundSprites.find((sprite) => sprite.visible);
  const source = bg?.texture?.source;
  if (bg?.visible && source?.width && source?.height) {
    return Math.max(Math.abs(bg.width) / source.width, Math.abs(bg.height) / source.height) || 1;
  }
  return 1;
}

// The whole figure at native resolution, cropped to its opaque pixels.
export function renderFigure(options: Omit<StageRenderOptions, 'maxDim' | 'oversize'>): HTMLCanvasElement | null {
  const canvas = renderStageCanvas({ ...options, maxDim: MAX_EXPORT_DIM, oversize: 'clamp' });
  return canvas && tightCrop(canvas);
}
