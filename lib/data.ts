// Runtime fetch of the generated game-data JSON. Nothing is bundled at build
// time: the generated files are fetched by the SPA, so refreshing data does
// not require a rebuild.
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import type { InteractionData } from '@/components/skinViewer/interactions';
import type { SceneTimelineData } from '@/components/skinViewer/scenes';
import type { VoiceIndex } from '@/lib/voice';
import type { SceneAudioIndex } from '@/lib/sceneAudio';

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
  /**
   * English display name. Playable characters only — `Lang_Data.eng` is
   * finished for that roster and holds Japanese (and, from NP0506 on, one
   * repeated wrong value) for every NPC. Six defective playable rows are
   * corrected in the generator.
   */
  nameEn: string | null;
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
  /** All-caps English gloss; the independent source that fixes `nameEn`. */
  nameUppercase?: string | null;
  birthday?: number[] | null;
  // profile-card text; absent when the row is still a placeholder
  hobby?: string | null;
  specialty?: string | null;
  likes?: string | null;
  comment?: string | null;
  birthdayComment?: string | null;
  /** Three liked gift item ids, indexing `CharacterData.items`. */
  giftItems?: number[];
  /**
   * The division(s) this character's dates are chosen from. The game records
   * the preference at region granularity; no table binds a character to one
   * venue. The venues in the region are `CharacterData.places[division]`.
   */
  dateDivisions?: number[];
  /** Join key into `CharacterData.skillSets`. */
  skillSetGroup?: number;
  /** Three equipment slot type ids, indexing `CharacterData.equipment`. */
  equipmentSlots?: number[];
  /**
   * The AI's skill rotation: `start` runs once at the opening, `repeat` loops.
   * Several rotations in one list are alternatives chosen by `condition`;
   * the one named 기본 패턴 is the unconditional fallback.
   */
  battlePatterns?: { start?: BattlePattern[]; repeat?: BattlePattern[] };
};

// One ordered rotation. `steps` are skill ids in `CharacterData.skills`.
// Alternatives are evaluated in `order`; condition 0 is unconditional, 20 and
// 21 test the state named in `conditionValue` against its threshold.
export type BattlePattern = {
  name: string | null;
  order: number;
  condition: number;
  conditionValue: string[];
  steps: number[];
};

// One of the 12 equipment slot types. `icon` is the empty slot's art.
export type EquipmentEntry = {
  name: string | null;
  icon: string | null;
};

// A lasting state a skill applies. Magnitude and duration both scale with the
// skill's level, so these are carried per level alongside the description.
export type BuffEntry = {
  name: string | null;
  desc: string | null;
  icon: string | null;
  /** 1 buff, 2 debuff, 3 crowd control, 0 uncategorised. */
  categorize: number;
  seconds: number;
  maxStack: number;
  dispellable: boolean;
};

// A gift item a character likes.
export type ItemEntry = {
  name: string | null;
  desc: string | null;
  flavor: string | null;
  icon: string | null;
};

// One date venue inside a division.
export type PlaceEntry = {
  id: number;
  name: string | null;
  desc: string | null;
  thumbnail: string | null;
};

// One skill slot. `desc` carries one pre-rendered description per skill level,
// so the app never has to walk the effect tables; length 1 when the skill
// cannot be levelled. Descriptions contain the game's own `<color=#rrggbb>`
// markup — split it into runs with `colorRuns`.
export type SkillEntry = {
  name: string | null;
  desc: string[];
  /** The states it applies, one list per skill level; aligned with `desc`. */
  buffs: BuffEntry[][];
  icon: string | null;
  /** Star grade at which the slot unlocks. Passive tiers are 3 / 4 / 5. */
  openStar: number;
  /** 1 attack, 2 active, 3 burst, 4 passive, 5 trigger. */
  categorize: number;
  /** Unique among one character's skills; a rotation step names it. */
  skillType: number;
  maxLevel: number;
  levelable: boolean;
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
  /** Gift items, keyed by item id; only the ones a character likes. */
  items: Record<string, ItemEntry>;
  /** Date venues, keyed by division type. */
  places: Record<string, PlaceEntry[]>;
  /** The 12 equipment slot types, keyed by type id. */
  equipment: Record<string, EquipmentEntry>;
  /** `skillSetGroup` -> star grade -> the skill ids that grade has. */
  skillSets: Record<string, Record<string, number[]>>;
  skills: Record<string, SkillEntry>;
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

// Which voice clip each scenario line and each lobby interaction plays, and
// where the clip is. Optional like the tables above: without it the viewer
// still shows subtitles that the scene timeline carries inline.
export function loadVoice(): Promise<VoiceIndex> {
  return fetchJson<VoiceIndex>('voice.json');
}

export function loadSceneAudio(): Promise<SceneAudioIndex> {
  return fetchJson<SceneAudioIndex>('scene_audio.json');
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
  groups: Partial<Record<
    'ui' | 'char' | 'cutin' | 'skin' | 'item' | 'skill' | 'place' | 'buff' | 'equip',
    string[]>>;
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
