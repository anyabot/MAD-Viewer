// Character dialogue stays independent in `voice.ts`, so muting one channel
// does not mute the other.
import { fetchFirst, playFrom, sceneAudioClipUrls } from '@/lib/cdn';
import { busAudio } from '@/lib/audioBus';

export type BgmTrack = {
  id: string;
  group: string;
  loop: string;
  intro?: string;
  seconds: number;
};

export type SceneAudioIndex = {
  clips: Record<string, string>;
  animations: Record<string, Record<string, string>>;
  bgm?: BgmTrack[];
};

let effect: HTMLAudioElement | null = null;
let music: HTMLAudioElement | null = null;
let musicToken = 0;
// The clip a paused track holds, so playing it again resumes rather than restarts.
let pausedClip: string | null = null;
let musicClip: string | null = null;
// An animation sound is staged by its clip, so it follows the speed control.
// Music keeps its own tempo; only the authored cross-fade is scaled.
let effectRate = 1;

/** Applies to the sound already playing as well. */
export function setSceneSoundRate(value: number) {
  effectRate = Math.max(value, 0.01);
  if (effect) effect.playbackRate = effectRate;
  for (const player of Array.from(sfx.values())) player.playbackRate = effectRate;
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
    if (effect?.src === objectUrl || music?.src === objectUrl
      || Array.from(sfx.values()).some((p) => p.src === objectUrl)) live.add(clip);
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
    const res = await fetchFirst(await sceneAudioClipUrls(folder, clip));
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
async function urls(index: SceneAudioIndex | null, clip: string): Promise<string[] | null> {
  const cached = ready.get(clip);
  if (cached) return [cached];
  const folder = index?.clips[clip];
  if (!folder) return null;
  download(index, clip)?.catch(() => { /* streamed instead */ });
  return sceneAudioClipUrls(folder, clip);
}

export async function playSceneSound(
  index: SceneAudioIndex | null, rig: string, animation: string,
): Promise<void> {
  const clip = index?.animations[rig]?.[animation];
  if (!clip) return;
  const sources = await urls(index, clip);
  if (!sources) return;
  if (!effect) effect = busAudio();
  try { await playFrom(effect, sources, effectRate); } catch { /* autoplay refusal or unavailable CDN */ }
}

// While the scene clock is held (a voice still starting), the animation sound and SFX hold with it, so they stay on the clip's time.
let held: HTMLAudioElement[] = [];
export function holdSceneSound(hold: boolean): void {
  if (hold) {
    held = [effect, ...Array.from(sfx.values())].filter((p): p is HTMLAudioElement => !!p && !p.paused);
    for (const player of held) player.pause();
    return;
  }
  for (const player of held) void player.play().catch(() => {});
  held = [];
}

export function stopSceneSound() {
  if (!effect) return;
  detach(effect);
}

// Script sound effects, one player per clip so a loop and a one-shot overlap.
const sfx = new Map<string, HTMLAudioElement>();
let sfxToken = 0;

export async function playSfx(
  index: SceneAudioIndex | null, clip: string, loop: boolean, fade = 0,
): Promise<void> {
  const mine = sfxToken;
  const sources = await urls(index, clip);
  if (!sources || mine !== sfxToken) return;
  const player = sfx.get(clip) ?? busAudio();
  sfx.set(clip, player);
  player.pause();
  player.loop = loop;
  player.volume = fade > 0 ? 0 : 1;
  try { await playFrom(player, sources, effectRate); } catch { return; }
  if (fade > 0) rampVolume(player, 1, fade);
}

export function stopSfx(clip: string | null = null, fade = 0): void {
  if (clip === null) sfxToken += 1;
  for (const [name, player] of Array.from(sfx)) {
    if (clip !== null && name !== clip) continue;
    if (fade > 0) rampVolume(player, 0, fade, () => detach(player));
    else detach(player);
  }
}

function rampVolume(player: HTMLAudioElement, target: number, seconds: number, done?: () => void) {
  const from = player.volume;
  const started = performance.now();
  const span = (seconds * 1000) / effectRate;
  const tick = () => {
    const t = Math.min(1, (performance.now() - started) / span);
    player.volume = from + (target - from) * t;
    if (t < 1) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}

export async function playBgm(
  index: SceneAudioIndex | null, clip: string, intro?: string, fade = 0,
): Promise<void> {
  const mine = ++musicToken;
  if (music && pausedClip === clip && musicClip === clip) {
    pausedClip = null;
    music.volume = fade > 0 ? 0 : 1;
    try { await music.play(); } catch { return; }
    if (fade > 0) fadeVolume(music, 1, fade, mine);
    return;
  }
  pausedClip = null;
  const loopUrls = await urls(index, clip);
  if (!loopUrls || mine !== musicToken) return;
  musicClip = clip;
  const introUrls = intro ? await urls(index, intro) : null;
  if (mine !== musicToken) return;
  if (!music) music = busAudio();
  const player = music;
  player.pause();
  player.volume = fade > 0 ? 0 : 1;
  player.loop = !introUrls;
  player.onended = introUrls ? () => {
    if (mine !== musicToken) return;
    player.onended = null;
    player.loop = true;
    void playFrom(player, loopUrls).catch(() => {});
  } : null;
  try { await playFrom(player, introUrls ?? loopUrls); } catch { return; }
  if (fade > 0) fadeVolume(player, 1, fade, mine);
}

// An empty `src` string resolves against the document, so the browser would try
// to load the page as media; detaching the attribute clears it cleanly.
function detach(player: HTMLAudioElement) {
  player.pause();
  player.removeAttribute('src');
  player.load();
}

// `PlayBgm Pause:true`: the track fades out and holds its position.
export function pauseBgm(fade = 0) {
  const mine = ++musicToken;
  if (!music || music.paused) return;
  pausedClip = musicClip;
  const player = music;
  if (fade <= 0) { player.pause(); return; }
  fadeVolume(player, 0, fade, mine, () => player.pause());
}

export function stopBgm(fade = 0) {
  pausedClip = null;
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
