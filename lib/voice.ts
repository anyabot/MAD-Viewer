// Voice playback for the viewer.
//
// The clips are Opus in an Ogg container, served from a jsDelivr bucket (see
// `lib/cdn.ts`). Only one line is ever audible: a new line replaces whatever is
// playing, which is what the game does — an interrupted reaction cuts its voice
// short rather than layering a second one over it.
//
// The viewer enables playback by default. Browsers still require a user
// gesture, which Lobby touches and scene advancement naturally provide.

import { voiceClipUrl } from '@/lib/cdn';

export type VoiceIndex = {
  generated: string;
  locale: string;
  /** Voice id -> the `<locale>/<char>/<category>` folder holding its clip. */
  clips: Record<string, string>;
  /** Scenario script path -> localization text id -> voice id. */
  scripts: Record<string, Record<string, string>>;
  /** Character code -> the lobby / UI interactions the game voices. */
  interactions: Record<string, VoiceInteraction[]>;
};

// One row of the master-data interaction table. `filter` is the game's own
// selector minus the character code: rig family, an optional situation, the
// context and the action (`['Desire', 'Situation1', 'Lobby', 'Touch']`).
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
// The viewer's playback rate. A line is staged by the animation it rides on,
// so speeding the rig up without speeding the voice up desynchronises them.
let rate = 1;

/** Follow the viewer's speed control, including for the line already playing. */
export function setVoiceRate(value: number) {
  rate = value;
  if (audio) audio.playbackRate = value;
}

// Downloaded clips, held as object URLs so playback starts on the same tick as
// the animation it belongs to, rather than a CDN round trip later.
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

/**
 * Start downloading clips before anything asks to play them. Call it as soon as
 * the set of lines a surface can speak is known — a character's lobby table, a
 * scene's dialogue — so the line is audible the moment it is triggered.
 */
export function prefetchVoice(index: VoiceIndex | null, voiceIds: Iterable<string>): void {
  for (const id of voiceIds) {
    if (ready.has(id)) continue;
    download(index, id)?.catch(() => { /* prefetch is best effort */ });
  }
}

/** Whether a line is still being spoken. */
export function voicePlaying(): boolean {
  return !!audio && !audio.paused && !audio.ended;
}

/** Stop whatever is playing. Safe before any line has played. */
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
 * Play one clip, replacing the current line. Resolves when playback has been
 * started, not when it ends; a rejected `play()` (autoplay policy, missing
 * clip) is swallowed so a silent failure never breaks the scene it belongs to.
 *
 * A prefetched clip plays without awaiting anything; one that is not cached yet
 * streams from its URL rather than waiting for a full download.
 */
export async function playVoice(index: VoiceIndex | null, voiceId: string): Promise<void> {
  const folder = index?.clips[voiceId];
  if (!folder) return;
  const mine = ++token;
  const cached = ready.get(voiceId);
  if (!cached) download(index, voiceId)?.catch(() => { /* streamed instead */ });
  const src = cached ?? await voiceClipUrl(folder, voiceId);
  if (mine !== token) return;
  if (!audio) audio = new Audio();
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
 * The interactions for one character that match a filter prefix, in table
 * order. `['Standing', 'Lobby', 'Touch']` selects the standing rig's lobby
 * touch lines; a row carrying extra selectors after the prefix (a situation, a
 * `Breast` sub-target) still matches, which is how the game groups variants.
 */
export function interactionsFor(
  index: VoiceIndex | null, code: string, wanted: string[],
): VoiceInteraction[] {
  const rows = index?.interactions[code] ?? [];
  return rows.filter((row) => wanted.every((part) => row.filter.includes(part)));
}
