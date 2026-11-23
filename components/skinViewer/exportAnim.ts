import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { MAX_RECORD_DIM } from '@/components/skinViewer/constants';

export type StillFormat = 'png' | 'webp';
export type AnimFormat = 'webp-anim' | 'apng' | 'gif';

export type VideoFormat = 'webm' | AnimFormat;
export type StillCrop = 'bounds' | 'view';

export const ANIM_FPS: Record<AnimFormat, number> = { 'webp-anim': 30, apng: 30, gif: 25 };
export const ANIM_MAX_DIM: Record<AnimFormat, number> = { 'webp-anim': MAX_RECORD_DIM, apng: 1080, gif: 1080 };

export const VIDEO_FORMATS: { value: VideoFormat; label: string }[] = [
  { value: 'webm', label: 'WebM' },
  { value: 'webp-anim', label: 'WebP (anim)' },
  { value: 'apng', label: 'APNG' },
  { value: 'gif', label: 'GIF' },
];

export const STILL_FORMATS: { value: StillFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

export const ANIM_EXT: Record<AnimFormat, string> = { 'webp-anim': 'webp', apng: 'png', gif: 'gif' };

export function stillBlob(canvas: HTMLCanvasElement, format: StillFormat): Promise<Blob> {
  return canvasBlob(canvas, `image/${format}`, 1);
}

export async function encodeAnimation({
  format, count, width, height, frame, progress, cancelled = () => false, delays: given,
}: {
  format: AnimFormat;
  count: number;
  width: number;
  height: number;
  frame: (index: number) => HTMLCanvasElement;
  progress?: (done: number, total: number) => void;
  cancelled?: () => boolean;
  delays?: number[];
}): Promise<Blob | null> {
  const delays = given ?? frameDelays(count, ANIM_FPS[format]);
  const gif = format === 'gif' ? createGif(width, height) : null;
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    if (cancelled()) return null;
    let canvas = frame(i);
    if (canvas.width !== width || canvas.height !== height) {
      const sized = document.createElement('canvas');
      sized.width = width;
      sized.height = height;
      sized.getContext('2d')!.drawImage(canvas, 0, 0, width, height);
      canvas = sized;
    }
    if (gif) {
      gif.add(canvas.getContext('2d')!.getImageData(0, 0, width, height).data, delays[i]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } else {
      const blob = await canvasBlob(canvas, format === 'apng' ? 'image/png' : 'image/webp', format === 'apng' ? 1 : 0.92);
      frames.push(new Uint8Array(await blob.arrayBuffer()));
    }
    progress?.(i + 1, count);
  }
  if (gif) return gif.finish();
  return format === 'apng' ? muxApng(frames, delays) : muxAnimatedWebp(frames, width, height, delays);
}

export type VideoLength = 'record' | 'loop';
export const LIVE_MAX_SECONDS = 30;

export type LiveCapture = {
  width: number;
  height: number;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
};

// Snapshots the app canvas after each render at up to `fps`; frame timing comes from the real clock.
export function startLiveCapture({ app, format, resolution, onLimit, progress }: {
  app: any;
  format: AnimFormat;
  resolution: number;
  onLimit: () => void;
  progress?: (done: number, total: number) => void;
}): LiveCapture {
  const fps = ANIM_FPS[format];
  const restore = app.renderer.resolution;
  const longEdge = Math.max(app.screen.width, app.screen.height, 1);
  app.renderer.resolution = Math.max(0.25, Math.min(resolution, ANIM_MAX_DIM[format] / longEdge));
  const width = app.canvas.width;
  const height = app.canvas.height;
  const shots: Promise<ImageBitmap>[] = [];
  const times: number[] = [];
  let last = -Infinity;
  let live = true;
  const grab = () => {
    const now = performance.now();
    if (now - last < 1000 / fps - 2) return;
    last = now;
    shots.push(createImageBitmap(app.canvas));
    times.push(now);
    if (times.length === fps * LIVE_MAX_SECONDS) onLimit();
  };
  app.ticker.add(grab, undefined, -50);
  const end = () => {
    if (!live) return false;
    live = false;
    app.ticker.remove(grab);
    app.renderer.resolution = restore;
    return true;
  };
  return {
    width,
    height,
    stop: async () => {
      if (!end()) return null;
      const bitmaps = await Promise.all(shots);
      if (!bitmaps.length) return null;
      const delays = times.map((at, i) => Math.max(10, Math.round((times[i + 1] ?? at + 1000 / fps) - at)));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      try {
        return await encodeAnimation({
          format, count: bitmaps.length, width, height, delays, progress,
          frame: (i) => {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(bitmaps[i], 0, 0, width, height);
            return canvas;
          },
        });
      } finally {
        for (const bitmap of bitmaps) bitmap.close();
      }
    },
    cancel: () => {
      if (end()) void Promise.all(shots).then((bitmaps) => bitmaps.forEach((bitmap) => bitmap.close()));
    },
  };
}

// Drives Pixi tickers on a fixed step; `performance.now` reads the same clock only while a step runs.
export function steppedClock(tickers: any[]) {
  const running = tickers.map((ticker) => ticker.started);
  for (const ticker of tickers) ticker.stop();
  let now = performance.now();
  const realNow = performance.now.bind(performance);
  return {
    advance(ms: number) {
      now += ms;
      Object.defineProperty(performance, 'now', { value: () => now, configurable: true, writable: true });
      try {
        for (const ticker of tickers) ticker.update(now);
      } finally {
        delete (performance as any).now;
      }
    },
    async finish() {
      const ahead = now - realNow();
      if (ahead > 0) await new Promise((resolve) => setTimeout(resolve, ahead + 1));
      tickers.forEach((ticker, i) => {
        ticker.lastTime = realNow();
        if (running[i]) ticker.start();
      });
    },
  };
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob && blob.type === type) resolve(blob);
      else reject(new Error(`${type} unsupported`));
    }, type, quality);
  });
}

export function frameDelays(count: number, fps: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.round((i + 1) * 1000 / fps) - Math.round(i * 1000 / fps));
}

function u24(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
}

function riffChunk(tag: string, payload: Uint8Array): Uint8Array {
  const padded = payload.length + (payload.length & 1);
  const out = new Uint8Array(8 + padded);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i += 1) out[i] = tag.charCodeAt(i);
  view.setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const WEBP_IMAGE_CHUNKS = new Set(['ALPH', 'VP8 ', 'VP8L']);

function webpImageChunks(bytes: Uint8Array): Uint8Array[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size & 1);
    if (WEBP_IMAGE_CHUNKS.has(tag)) chunks.push(bytes.subarray(at, end));
    at = end;
  }
  return chunks;
}

export function muxAnimatedWebp(frames: Uint8Array[], width: number, height: number, delays: number[]): Blob {
  const vp8x: number[] = [0x12, 0, 0, 0];
  u24(vp8x, width - 1);
  u24(vp8x, height - 1);
  const parts = [riffChunk('VP8X', new Uint8Array(vp8x)), riffChunk('ANIM', new Uint8Array([0, 0, 0, 0, 0, 0]))];
  frames.forEach((frame, i) => {
    const head: number[] = [];
    u24(head, 0);
    u24(head, 0);
    u24(head, width - 1);
    u24(head, height - 1);
    u24(head, delays[i]);
    head.push(0x02);
    parts.push(riffChunk('ANMF', concat([new Uint8Array(head), ...webpImageChunks(frame)])));
  });
  const body = concat(parts);
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, body.length + 4, true);
  header.set([0x57, 0x45, 0x42, 0x50], 8);
  return new Blob([header, body as Uint8Array<ArrayBuffer>], { type: 'image/webp' });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(tag: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = tag.charCodeAt(i);
  out.set(payload, 8);
  view.setUint32(8 + payload.length, crc32(out.subarray(4, 8 + payload.length)));
  return out;
}

function pngChunks(bytes: Uint8Array): { tag: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { tag: string; data: Uint8Array }[] = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const size = view.getUint32(at);
    chunks.push({ tag: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), data: bytes.subarray(at + 8, at + 8 + size) });
    at += 12 + size;
  }
  return chunks;
}

export function muxApng(frames: Uint8Array[], delays: number[]): Blob {
  const parsed = frames.map(pngChunks);
  const ihdr = parsed[0].find((chunk) => chunk.tag === 'IHDR')!.data;
  const key = (data: Uint8Array) => Array.from(data).join(',');
  if (parsed.some((chunks) => key(chunks.find((chunk) => chunk.tag === 'IHDR')!.data) !== key(ihdr))) {
    throw new Error('APNG frames differ in format');
  }
  const width = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(0);
  const height = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(4);
  const actl = new Uint8Array(8);
  new DataView(actl.buffer).setUint32(0, frames.length);
  const parts = [frames[0].subarray(0, 8), pngChunk('IHDR', ihdr), pngChunk('acTL', actl)];
  let seq = 0;
  parsed.forEach((chunks, i) => {
    const fctl = new Uint8Array(26);
    const view = new DataView(fctl.buffer);
    view.setUint32(0, seq);
    seq += 1;
    view.setUint32(4, width);
    view.setUint32(8, height);
    view.setUint16(20, delays[i]);
    view.setUint16(22, 1000);
    parts.push(pngChunk('fcTL', fctl));
    for (const chunk of chunks) {
      if (chunk.tag !== 'IDAT') continue;
      if (i === 0) {
        parts.push(pngChunk('IDAT', chunk.data));
        continue;
      }
      const fdat = new Uint8Array(4 + chunk.data.length);
      new DataView(fdat.buffer).setUint32(0, seq);
      seq += 1;
      fdat.set(chunk.data, 4);
      parts.push(pngChunk('fdAT', fdat));
    }
  });
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: 'image/png' });
}

export function createGif(width: number, height: number) {
  const gif = GIFEncoder();
  return {
    add(rgba: Uint8ClampedArray, delay: number) {
      const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(data, palette, 'rgba4444');
      const transparentIndex = palette.findIndex((color: number[]) => color[3] === 0);
      gif.writeFrame(index, width, height, {
        palette, delay, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex),
      });
    },
    finish(): Blob {
      gif.finish();
      return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
    },
  };
}
