import { captureAudioTracks } from '@/lib/audioBus';

export type VideoRecording = {
  stop: () => void; cancel: () => void; audio: boolean; width: number; height: number;
};

const MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

const AUDIO_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const FPS = 60;
// Bits per pixel per frame; the browser default is far below this for 60fps art.
const BITS_PER_PIXEL = 0.1;
const MIN_VIDEO_BITRATE = 6_000_000;
const MAX_VIDEO_BITRATE = 48_000_000;
const AUDIO_BITRATE = 160_000;

function videoBitrate(canvas: HTMLCanvasElement): number {
  const budget = canvas.width * canvas.height * FPS * BITS_PER_PIXEL;
  return Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, budget)));
}

export function canRecordCanvas(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export function startCanvasVideo(options: {
  canvas: HTMLCanvasElement;
  fileName: string;
  onStop: () => void;
}): VideoRecording | null {
  if (!canRecordCanvas()) return null;
  const video = options.canvas.captureStream(FPS);
  const audioTracks = captureAudioTracks();
  const types = audioTracks.length ? AUDIO_MIME_TYPES : MIME_TYPES;
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
  const stream = new MediaStream([...video.getVideoTracks(), ...audioTracks]);
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: videoBitrate(options.canvas),
    ...(audioTracks.length ? { audioBitsPerSecond: AUDIO_BITRATE } : {}),
  });
  const chunks: Blob[] = [];
  let download = true;

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    // The bus tracks are shared with the next recording, so only the canvas ends here.
    for (const track of video.getTracks()) track.stop();
    if (download && chunks.length) {
      const type = recorder.mimeType || mimeType || 'video/webm';
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(new Blob(chunks, { type }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${options.fileName}.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    options.onStop();
  };
  recorder.start(250);
  return {
    audio: audioTracks.length > 0,
    width: options.canvas.width,
    height: options.canvas.height,
    stop: () => { if (recorder.state !== 'inactive') recorder.stop(); },
    cancel: () => {
      download = false;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
