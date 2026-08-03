// Authored animation sounds and music used by the scene scripts. Character
// dialogue remains independent in voice.ts so muting one channel does not
// unexpectedly mute the other.
import { sceneAudioClipUrl } from '@/lib/cdn';

export type SceneAudioIndex = {
  generated: string;
  clips: Record<string, string>;
  animations: Record<string, Record<string, string>>;
};

let effect: HTMLAudioElement | null = null;
let music: HTMLAudioElement | null = null;
let musicToken = 0;

async function url(index: SceneAudioIndex | null, clip: string): Promise<string | null> {
  const folder = index?.clips[clip];
  return folder ? sceneAudioClipUrl(folder, clip) : null;
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
  try { await effect.play(); } catch { /* autoplay refusal or unavailable CDN */ }
}

export function stopSceneSound() {
  if (!effect) return;
  effect.pause();
  effect.src = '';
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

export function stopBgm(fade = 0) {
  const mine = ++musicToken;
  if (!music) return;
  if (fade <= 0) {
    music.pause();
    music.src = '';
    return;
  }
  fadeVolume(music, 0, fade, mine, () => {
    music?.pause();
    if (music) music.src = '';
  });
}

function fadeVolume(
  player: HTMLAudioElement, target: number, seconds: number, token: number,
  done?: () => void,
) {
  const from = player.volume;
  const started = performance.now();
  const tick = () => {
    if (token !== musicToken) return;
    const t = Math.min(1, (performance.now() - started) / (seconds * 1000));
    player.volume = from + (target - from) * t;
    if (t < 1) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}
