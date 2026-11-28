import type { CaptureLabels, ExportControlsLabels } from '@altterisk/game-hub/capture';
import type { UiKey } from '@/lib/i18n';

type Translate = (key: UiKey) => string;

export function captureLabels(t: Translate): CaptureLabels {
  return { unsupported: t('videoUnsupported'), withAudio: t('videoWithAudio'), visualOnly: t('videoVisualOnly') };
}

export function exportLabels(t: Translate): ExportControlsLabels {
  return {
    record: t('btnRecord'),
    stop: t('btnStopRecording'),
    save: t('btnSave'),
    videoFormat: t('ariaVideoFormat'),
    videoLength: t('ariaVideoLength'),
    lengthRecord: t('optLengthRecord'),
    lengthLoop: t('optLengthLoop'),
    stillFormat: t('ariaStillFormat'),
    stillCrop: t('ariaStillCrop'),
    cropBounds: t('optCropBounds'),
    cropView: t('optCropView'),
  };
}
