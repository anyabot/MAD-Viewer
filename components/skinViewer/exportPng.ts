import {
  attachmentScales as spineAttachmentScales, percentileScale, saveStagePng as saveStage,
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

export function saveStagePng(options: Omit<StageRenderOptions, 'maxDim' | 'oversize'> & {
  fileName: string;
}): Promise<boolean> {
  return saveStage({ ...options, maxDim: MAX_EXPORT_DIM, oversize: 'clamp' });
}
