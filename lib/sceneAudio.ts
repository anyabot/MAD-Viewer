// Character dialogue stays independent in `voice.ts`, so muting one channel
// does not mute the other.
import { sceneAudioClipUrl } from '@/lib/cdn';

export type SceneAudioIndex = {
  generated: string;
  clips: Record<string, string>;
  animations: Record<string, Record<string, string>>;
};

let effect: HTMLAudioElement | null = null;
let music: HTMLAudioElement | null = null;
let musicToken = 0;
// An animation sound is staged by its clip, so it follows the speed control.
// Music keeps its own tempo; only the authored cross-fade is scaled.
let effectRate = 1;

/** Applies to the sound already playing as well. */
export function setSceneSoundRate(value: number) {
  effectRate = Math.max(value, 0.01);
  if (effect) effect.playbackRate = effectRate;
}

// Held as object URLs so a sound starts on the tick the animation staging it
// does, rather than a CDN round trip later.
const downloading = new Map<string, Promise<string>>();
const ready = new Map<string, string>();
const order: string[] = [];
// Enough for several rigs' animation sounds plus their music.
const MAX_CACHED = 64;

/** Clips currently loaded into a player; revoking these would cut playback. */
function inUse(): Set<string> {
  const live = new Set<string>();
  for (const [clip, objectUrl] of Array.from(ready)) {
    if (effect?.src === objectUrl || music?.src === objectUrl) live.add(clip);
  }
  return live;
}

function evict() {
  if (order.length <= MAX_CACHED) return;
  const live = inUse();
  let index = 0;
  while (order.length > MAX_CACHED && index < order.length) {
    const clip = order[index];
    if (live.has(clip)) {
      index += 1;
      continue;
    }
    order.splice(index, 1);
    const objectUrl = ready.get(clip);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    ready.delete(clip);
    downloading.delete(clip);
  }
}

function download(index: SceneAudioIndex | null, clip: string): Promise<string> | null {
  const folder = index?.clips[clip];
  if (!folder) return null;
  const started = downloading.get(clip);
  if (started) return started;
  const pending = (async () => {
    const res = await fetch(await sceneAudioClipUrl(folder, clip));
    if (!res.ok) throw new Error(`scene audio ${clip}: ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    ready.set(clip, objectUrl);
    order.push(clip);
    evict();
    return objectUrl;
  })();
  // A failed fetch must not be sticky: the next play retries it.
  pending.catch(() => downloading.delete(clip));
  downloading.set(clip, pending);
  return pending;
}

/** Runs as soon as the set of sounds a rig can make is known, so no cue is
 *  silent while its clip is still in flight. Unknown ids are ignored. */
export function prefetchSceneAudio(
  index: SceneAudioIndex | null, clips: Iterable<string>,
): void {
  for (const clip of clips) {
    if (ready.has(clip)) continue;
    download(index, clip)?.catch(() => { /* prefetch is best effort */ });
  }
}

// An uncached clip streams rather than waiting for a full download.
async function url(index: SceneAudioIndex | null, clip: string): Promise<string | null> {
  const cached = ready.get(clip);
  if (cached) return cached;
  const folder = index?.clips[clip];
  if (!folder) return null;
  download(index, clip)?.catch(() => { /* streamed instead */ });
  return sceneAudioClipUrl(folder, clip);
}

export async function playSceneSound(
  index: SceneAudioIndex | null, rig: string, animation: string,
): Promise<void> {
  const clip = index?.animations[rig]?.[animation];
  if (!clip) return;
  const source = await url(index, clip);
  if (!source) return;
  if (!effect) effect = new Audio();
  effect.src = source;
  effect.currentTime = 0;
  effect.playbackRate = effectRate;
  try { await effect.play(); } catch { /* autoplay refusal or unavailable CDN */ }
}

export function stopSceneSound() {
  if (!effect) return;
  detach(effect);
}

export async function playBgm(
  index: SceneAudioIndex | null, clip: string, intro?: string, fade = 0,
): Promise<void> {
  const mine = ++musicToken;
  const loopUrl = await url(index, clip);
  if (!loopUrl || mine !== musicToken) return;
  const introUrl = intro ? await url(index, intro) : null;
  if (mine !== musicToken) return;
  if (!music) music = new Audio();
  const player = music;
  player.pause();
  player.volume = fade > 0 ? 0 : 1;
  player.loop = !introUrl;
  player.src = introUrl ?? loopUrl;
  player.onended = introUrl ? () => {
    if (mine !== musicToken) return;
    player.src = loopUrl;
    player.loop = true;
    void player.play().catch(() => {});
  } : null;
  try { await player.play(); } catch { return; }
  if (fade > 0) fadeVolume(player, 1, fade, mine);
}

// An empty `src` string resolves against the document, so the browser would try
// to load the page as media; detaching the attribute clears it cleanly.
function detach(player: HTMLAudioElement) {
  player.pause();
  player.removeAttribute('src');
  player.load();
}

export function stopBgm(fade = 0) {
  const mine = ++musicToken;
  if (!music) return;
  if (fade <= 0) {
    detach(music);
    return;
  }
  fadeVolume(music, 0, fade, mine, () => {
    if (music) detach(music);
  });
}

function fadeVolume(
  player: HTMLAudioElement, target: number, seconds: number, token: number,
  done?: () => void,
) {
  const from = player.volume;
  const started = performance.now();
  const span = (seconds * 1000) / effectRate;
  const tick = () => {
    if (token !== musicToken) return;
    const t = span > 0 ? Math.min(1, (performance.now() - started) / span) : 1;
    player.volume = from + (target - from) * t;
    if (t < 1) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}
