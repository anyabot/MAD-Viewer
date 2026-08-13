import type { StoreKey } from '@/components/skinViewer/types';
import type { CanvasAspect } from '@/lib/viewerStore';

export type SharedPlaybackContext = 'free_play' | 'lobby' | 'desire_view'
  | 'desire_story' | 'affection_view' | 'affection_story' | 'story';

export type ViewerShareState = {
  skin: string;
  store?: StoreKey;
  context?: SharedPlaybackContext;
  speed?: number;
  background?: boolean;
  camera?: 'free' | 'game';
  aspect?: CanvasAspect;
  body?: string;
  face?: string;
  overlay?: string;
  stage?: string;
};

const CONTEXTS = new Set<SharedPlaybackContext>([
  'free_play', 'lobby', 'desire_view', 'desire_story',
  'affection_view', 'affection_story', 'story',
]);
const ASPECTS = new Set<CanvasAspect>(['fill', '4:3', '16:10', '16:9', '19.5:9']);
const SHARE_KEYS = [
  'skin', 'store', 'view', 'speed', 'bg', 'camera', 'aspect', 'body', 'face', 'overlay', 'stage',
];

export function parseViewerShare(search: string): ViewerShareState | null {
  const query = new URLSearchParams(search);
  const skin = query.get('skin');
  if (!skin) return null;
  const state: ViewerShareState = { skin };
  const store = query.get('store');
  if (store === 'onestore' || store === 'google') state.store = store;
  const context = query.get('view') as SharedPlaybackContext | null;
  if (context && CONTEXTS.has(context)) state.context = context;
  const speed = Number(query.get('speed'));
  if (Number.isFinite(speed) && speed > 0 && speed <= 4) state.speed = speed;
  const background = query.get('bg');
  if (background === '0' || background === '1') state.background = background === '1';
  const camera = query.get('camera');
  if (camera === 'free' || camera === 'game') state.camera = camera;
  const aspect = query.get('aspect') as CanvasAspect | null;
  if (aspect && ASPECTS.has(aspect)) state.aspect = aspect;
  for (const key of ['body', 'face', 'overlay', 'stage'] as const) {
    const value = query.get(key);
    if (value) state[key] = value;
  }
  return state;
}

export function buildViewerShareUrl(currentUrl: string, state: ViewerShareState): string {
  const url = new URL(currentUrl);
  for (const key of SHARE_KEYS) url.searchParams.delete(key);
  url.searchParams.set('skin', state.skin);
  if (state.store) url.searchParams.set('store', state.store);
  if (state.context) url.searchParams.set('view', state.context);
  if (state.speed != null) url.searchParams.set('speed', String(state.speed));
  if (state.background != null) url.searchParams.set('bg', state.background ? '1' : '0');
  if (state.camera) url.searchParams.set('camera', state.camera);
  if (state.aspect) url.searchParams.set('aspect', state.aspect);
  for (const key of ['body', 'face', 'overlay', 'stage'] as const) {
    if (state[key]) url.searchParams.set(key, state[key]);
  }
  return url.toString();
}
