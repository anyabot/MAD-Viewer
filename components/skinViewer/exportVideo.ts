import {
  startCanvasVideo as startVideo, type CanvasVideoOptions, type VideoRecording,
} from '@altterisk/game-hub/spine';
import { captureAudioTracks } from '@/lib/audioBus';

export { canRecordCanvas, type VideoRecording } from '@altterisk/game-hub/spine';

export function startCanvasVideo(
  options: Omit<CanvasVideoOptions, 'audioTracks'>,
): VideoRecording | null {
  return startVideo({ ...options, audioTracks: captureAudioTracks() });
}
