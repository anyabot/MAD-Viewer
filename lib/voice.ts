// Only one line is ever audible: as in game, a new line replaces whatever is
// playing rather than layering over it.

import { fetchFirst, playFrom, voiceClipUrls } from '@/lib/cdn';
import { busAudio } from '@/lib/audioBus';
import { analyzeLipSync, sampleLipSync, type LipAnalysis } from '@/lib/lipSync';

export type VoiceIndex = {
  /** Voice id -> the `<locale>/<char>/<category>` folder holding its clip. */
  clips: Record<string, string>;
  /** Scenario script path -> localization text id -> voice id. */
  scripts: Record<string, Record<string, string>>;
  /** Character code -> the lobby / UI interactions the game voices. */
  interactions: Record<string, VoiceInteraction[]>;
};

// `filter` is the game's own selector minus the character code: rig family, an
// optional situation, the context and the action.
export type VoiceInteraction = {
  id: string;
  filter: string[];
  priority?: number;
  text?: string;
  textEn?: string;
  voice?: string;
  /** Body clip, face clip and emoticon the line is staged with. */
  ani?: string;
  face?: string;
  emo?: string;
  /** Seconds after which the follow-up expression is taken. */
  wait?: number;
};

let audio: HTMLAudioElement | null = null;
let token = 0;
let starting = 0;
let current: string | null = null;
// Opus decodes at 48 kHz, the clip frequency the game analyses in.
const CLIP_RATE = 48000;
const analyses = new Map<string, LipAnalysis | null>();

async function analyze(voiceId: string, blob: Blob): Promise<void> {
  const buffer = await new OfflineAudioContext(1, 1, CLIP_RATE).decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  analyses.set(voiceId, analyzeLipSync(channels, buffer.length));
}

// Mouth-track alpha for the last clip played; null before any clip, as the game skips the update then.
export function voiceLipValue(): number | null {
  if (!current) return null;
  const analysis = analyses.get(current);
  if (!analysis) return 0;
  const frame = voicePlaying() && audio ? Math.floor(audio.currentTime * CLIP_RATE) : 0;
  return sampleLipSync(analysis, frame);
}
// A line is staged by the animation it rides on, so the two speeds must match.
let rate = 1;

/** Applies to the line already playing as well. */
export function setVoiceRate(value: number) {
  rate = value;
  if (audio) audio.playbackRate = value;
}

// Held as object URLs so playback starts on the same tick as the animation it
// belongs to, rather than a CDN round trip later.
const downloading = new Map<string, Promise<string>>();
const ready = new Map<string, string>();
const order: string[] = [];
// Enough for a character's whole lobby table plus a scene's dialogue.
const MAX_CACHED = 400;

function evict() {
  while (order.length > MAX_CACHED) {
    const id = order.shift();
    if (id === undefined) return;
    const url = ready.get(id);
    if (url) URL.revokeObjectURL(url);
    ready.delete(id);
    downloading.delete(id);
    analyses.delete(id);
  }
}

function download(index: VoiceIndex | null, voiceId: string): Promise<string> | null {
  const folder = index?.clips[voiceId];
  if (!folder) return null;
  const started = downloading.get(voiceId);
  if (started) return started;
  const pending = (async () => {
    const res = await fetchFirst(await voiceClipUrls(folder, voiceId));
    const blob = await res.blob();
    analyze(voiceId, blob).catch(() => { /* the mouth stays shut */ });
    const objectUrl = URL.createObjectURL(blob);
    ready.set(voiceId, objectUrl);
    order.push(voiceId);
    evict();
    return objectUrl;
  })();
  // A failed fetch must not be sticky: the next play retries it.
  pending.catch(() => downloading.delete(voiceId));
  downloading.set(voiceId, pending);
  return pending;
}

/** A line must be audible the moment it is triggered, so this runs as soon as
 *  the set a surface can speak is known. */
export function prefetchVoice(index: VoiceIndex | null, voiceIds: Iterable<string>): void {
  for (const id of voiceIds) {
    if (ready.has(id)) continue;
    download(index, id)?.catch(() => { /* prefetch is best effort */ });
  }
}

export function voicePlaying(): boolean {
  return !!audio && !audio.paused && !audio.ended;
}

// Also true while the latest line is still loading, so a wait on it does not pass before it starts.
export function voiceBusy(): boolean {
  return (starting !== 0 && starting === token) || voicePlaying();
}

// Requested but not yet audible: the load and audio start-up before `playing`.
export function voiceStarting(): boolean {
  return starting !== 0 && starting === token;
}

export function stopVoice() {
  token += 1;
  if (!audio) return;
  audio.pause();
  // An empty `src` resolves against the document, so the browser tries to
  // load the page as media; detaching the attribute clears it cleanly.
  audio.removeAttribute('src');
  audio.load();
}

/**
 * Resolves when playback has started, not when it ends. A refused `play()` is
 * swallowed so a silent failure never breaks the scene it belongs to, and an
 * uncached clip streams rather than waiting for a full download.
 */
export async function playVoice(index: VoiceIndex | null, voiceId: string): Promise<void> {
  const folder = index?.clips[voiceId];
  if (!folder) return;
  const mine = ++token;
  starting = mine;
  current = voiceId;
  try {
    const cached = ready.get(voiceId);
    if (!cached) download(index, voiceId)?.catch(() => { /* streamed instead */ });
    const sources = cached ? [cached] : await voiceClipUrls(folder, voiceId);
    if (mine !== token) return;
    if (!audio) audio = busAudio();
    await playFrom(audio, sources, rate);
  } catch {
    // Autoplay refusal or a clip that is not on the CDN yet.
  } finally {
    if (starting === mine) starting = 0;
  }
}

/**
 * Matches on a filter prefix, in table order. A row carrying extra selectors
 * after the prefix still matches, which is how the game groups variants.
 */
export function interactionsFor(
  index: VoiceIndex | null, code: string, wanted: string[],
): VoiceInteraction[] {
  const rows = index?.interactions[code] ?? [];
  return rows.filter((row) => wanted.every((part) => row.filter.includes(part)));
}
