// Runtime fetch of the generated game-data JSON. Nothing is bundled at build
// time: the generated files are fetched by the SPA, so refreshing data does
// not require a rebuild.
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import type { InteractionData } from '@/components/skinViewer/interactions';
import type { SceneTimelineData } from '@/components/skinViewer/scenes';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = (
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`
).replace(/\/$/, '');

// One gallery entry. The fields needed before an archive loads (`stores`) live
// here so the gallery can choose the correct archive immediately.
export type SkinListEntry = {
  key: string;              // asset key, e.g. "st_ch0001"
  kind: SkinKind;
  character: string;        // "CH0001"
  /** Store builds this skin was exported for. 2 entries = art diverges. */
  stores: StoreKey[];
  animations: number;
  faces: number;
  bodyGroups?: string[];
  hasBg: boolean;
  /** Uncensored attachments present in the ONE store build. */
  uncensored?: boolean;
  bytes?: Partial<Record<StoreKey, number>>;
};

export type SkinList = {
  version: string;
  generated: string;
  skins: SkinListEntry[];
};

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(name: string): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const res = await fetch(`${DATA_BASE}/${name}`);
      if (!res.ok) throw new Error(`failed to fetch ${name}: ${res.status}`);
      return res.json() as Promise<T>;
    })();
    cache.set(name, p as Promise<unknown>);
  }
  return p;
}

export function loadSkinList(): Promise<SkinList> {
  return fetchJson<SkinList>('skin_list.json');
}

// Per-rig desire-scene interaction tables decoded from Naninovel scenarios.
// Only desire rigs have one;
// the viewer falls back to its phase/region playback when this is unavailable,
// so a missing file must not break the gallery.
export function loadDesireInteractions(): Promise<InteractionData> {
  return fetchJson<InteractionData>('desire_interactions.json');
}

export function loadSceneTimelines(): Promise<SceneTimelineData> {
  return fetchJson<SceneTimelineData>('scene_timelines.json');
}

export const KIND_LABEL: Record<SkinKind, string> = {
  standing: 'Standing',
  affection: 'Affection',
  desire: 'Desire',
  pleasure: 'Pleasure',
};

// Short badge text for the gallery list.
export const KIND_BADGE: Record<SkinKind, string> = {
  standing: 'ST',
  affection: 'AF',
  desire: 'DS',
  pleasure: 'PL',
};

export const KIND_COLOR: Record<SkinKind, string> = {
  standing: 'gray',
  affection: 'purple',
  desire: 'pink',
  pleasure: 'orange',
};
