// Only one line is ever audible: as in game, a new line replaces whatever is
// playing rather than layering over it.

import { voiceClipUrl } from '@/lib/cdn';
import { busAudio } from '@/lib/audioBus';

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
  }
}

function download(index: VoiceIndex | null, voiceId: string): Promise<string> | null {
  const folder = index?.clips[voiceId];
  if (!folder) return null;
  const started = downloading.get(voiceId);
  if (started) return started;
  const pending = (async () => {
    const url = await voiceClipUrl(folder, voiceId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`voice ${voiceId}: ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
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
  const cached = ready.get(voiceId);
  if (!cached) download(index, voiceId)?.catch(() => { /* streamed instead */ });
  const src = cached ?? await voiceClipUrl(folder, voiceId);
  if (mine !== token) return;
  if (!audio) audio = busAudio();
  audio.src = src;
  audio.currentTime = 0;
  audio.playbackRate = rate;
  try {
    await audio.play();
  } catch {
    // Autoplay refusal or a clip that is not on the CDN yet.
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
