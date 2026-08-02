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

// One character from the game's master data, keyed by the same `CH####` code
// `SkinListEntry.character` carries. Only Korean columns are finished content,
// so `name`/`desc`/`artist`/`cv` come from them; `unfinished` is reference only.
//
// A character with no `Character_Base` row is **unreleased**: it has a
// resources row and a standing prefab but no types, rarity or profile. Those
// are emitted with `unreleased: true` and hidden by default, so a name that
// the game does not show yet is never presented as a released one.
export type CharacterEntry = {
  code: string;
  unreleased?: boolean;
  name: string;
  desc: string;
  iconPath: string | null;
  resourcesId: string | null;
  voiceGroupId: string | null;
  unfinished: { eng: string; jpn: string };
  artist: string | null;
  cv: string | null;
  id?: number;
  characterType?: number;
  nameKey?: string;
  // these index the matching table in `CharacterData.types`
  roleType?: number;
  divisionType?: number;
  factionType?: number;
  attributeType?: number;
  positionType?: number;
  tribeType?: number;
  charGrade?: number;
  defaultStar?: number;
  nameUppercaseKey?: string;
  birthday?: number[] | null;
  // profile-card text; absent when the row is still a placeholder
  hobby?: string | null;
  specialty?: string | null;
  likes?: string | null;
  comment?: string | null;
  birthdayComment?: string | null;
};

// A resolved `*_type` integer: its display name, its atlas icon, and (elements
// only) the colour the game tints it with. `icons` lists every icon column the
// table declares, in preference order — `icon` alone is not always extractable.
//
// `name` is the game's Korean label; `en` is the generated English one. Only
// the element rows have finished English in the game's own text table, so the
// rest is a fixed table in the generator — see `docs/WEB.md`.
export type TypeEntry = {
  name: string;
  en?: string | null;
  nameKey: string | null;
  icon: string | null;
  icons?: string[];
  color?: string;
};

export type CharacterData = {
  characters: Record<string, CharacterEntry>;
  types: {
    attribute: Record<string, TypeEntry>;
    role: Record<string, TypeEntry>;
    position: Record<string, TypeEntry>;
    division: Record<string, TypeEntry>;
    faction: Record<string, TypeEntry>;
  };
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

// Character names and the type-label tables from the master data. Codes that
// are not characters (event, screen and cut-in assets) and characters that are
// unreleased have no entry, so callers fall back to the code.
export function loadCharacters(): Promise<CharacterData> {
  return fetchJson<CharacterData>('characters.json');
}

// What the icon pipeline actually published under `public/icons/`. Used to
// decide whether an icon can be rendered; see `lib/icons.ts`.
export type IconManifest = {
  groups: Partial<Record<'ui' | 'char' | 'cutin' | 'skin', string[]>>;
};

export function loadIcons(): Promise<IconManifest> {
  return fetchJson<IconManifest>('icons.json');
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
