// Web Audio rather than an `Audio` element, so the intro hands over to the loop without a gap.
import { fetchFirst, sceneAudioClipUrls } from '@/lib/cdn';
import type { BgmTrack } from '@/lib/sceneAudio';

type Buffers = { intro: AudioBuffer | null; loop: AudioBuffer };

const MAX_CACHED = 4;
const cache = new Map<string, Promise<Buffers>>();

let context: AudioContext | null = null;
let output: GainNode | null = null;

function audio(): { ctx: AudioContext; gain: GainNode } {
  if (!context || !output) {
    context = new AudioContext();
    output = context.createGain();
    output.connect(context.destination);
  }
  return { ctx: context, gain: output };
}

async function decode(clip: string): Promise<AudioBuffer> {
  const res = await fetchFirst(await sceneAudioClipUrls('bgm', clip));
  return audio().ctx.decodeAudioData(await res.arrayBuffer());
}

function load(track: BgmTrack): Promise<Buffers> {
  const cached = cache.get(track.id);
  if (cached) return cached;
  const pending = Promise.all([track.intro ? decode(track.intro) : null, decode(track.loop)])
    .then(([intro, loop]) => ({ intro, loop }));
  pending.catch(() => cache.delete(track.id));
  cache.set(track.id, pending);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  return pending;
}

export class Jukebox {
  private buffers: Buffers | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private loopNode: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private token = 0;
  private repeating = true;
  onEnded: (() => void) | null = null;

  async play(track: BgmTrack, from = 0): Promise<void> {
    const mine = ++this.token;
    this.stopSources();
    this.buffers = null;
    const buffers = await load(track);
    if (mine !== this.token) return;
    this.buffers = buffers;
    const { ctx } = audio();
    if (ctx.state === 'suspended') await ctx.resume();
    if (mine !== this.token) return;
    this.start(from);
  }

  get duration(): number {
    if (!this.buffers) return 0;
    return (this.buffers.intro?.duration ?? 0) + this.buffers.loop.duration;
  }

  get position(): number {
    if (!this.buffers || !context) return 0;
    const intro = this.buffers.intro?.duration ?? 0;
    const elapsed = Math.max(0, context.currentTime - this.startedAt);
    if (elapsed < intro) return elapsed;
    return intro + ((elapsed - intro) % this.buffers.loop.duration);
  }

  get paused(): boolean {
    return context?.state === 'suspended';
  }

  async pause(): Promise<void> {
    if (context?.state === 'running') await context.suspend();
  }

  async resume(): Promise<void> {
    if (context?.state === 'suspended') await context.resume();
  }

  seek(seconds: number): void {
    if (!this.buffers) return;
    this.stopSources();
    this.start(Math.min(Math.max(0, seconds), this.duration - 0.01));
  }

  set repeat(value: boolean) {
    this.repeating = value;
    if (this.loopNode) this.loopNode.loop = value;
  }

  set volume(value: number) {
    audio().gain.gain.value = value;
  }

  stop(): void {
    ++this.token;
    this.stopSources();
    this.buffers = null;
  }

  private start(from: number) {
    const { ctx, gain } = audio();
    const { intro, loop } = this.buffers!;
    const introLength = intro?.duration ?? 0;
    const at = ctx.currentTime + 0.05;
    this.startedAt = at - from;
    const node = (buffer: AudioBuffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      return source;
    };
    const looped = node(loop);
    looped.loop = this.repeating;
    looped.onended = () => {
      if (this.loopNode === looped) this.onEnded?.();
    };
    if (intro && from < introLength) {
      const first = node(intro);
      first.start(at, from);
      looped.start(at + introLength - from);
      this.sources = [first, looped];
    } else {
      looped.start(at, from - introLength);
      this.sources = [looped];
    }
    this.loopNode = looped;
  }

  private stopSources() {
    const sources = this.sources;
    this.sources = [];
    this.loopNode = null;
    for (const source of sources) {
      try { source.stop(); } catch { /* never started */ }
      source.disconnect();
    }
  }
}
