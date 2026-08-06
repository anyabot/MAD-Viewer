// Nothing here is bundled at build time, so refreshing the data does not
// require a rebuild.
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import type { SceneTimelineData } from '@/components/skinViewer/scenes';
import type { VoiceIndex } from '@/lib/voice';
import type { SceneAudioIndex } from '@/lib/sceneAudio';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = (
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`
).replace(/\/$/, '');

export type SkinListEntry = {
  key: string;
  kind: SkinKind;
  character: string;
  /** Two entries means the art diverges between store builds. */
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
  skins: SkinListEntry[];
};

// Only the Korean columns are finished content, so `name`/`desc`/`artist`/`cv`
// come from them and `unfinished` is reference only.
export type CharacterEntry = {
  code: string;
  /** No `Character_Base` row: a resources row and a prefab, nothing else. */
  unreleased?: boolean;
  /** Scenario-only rig — no base row either, and never fought. */
  storyOnly?: boolean;
  /** ISO date the skins become available; absent once they are listed. */
  skinsLockedUntil?: string;
  /** The id the scripts address this character by, e.g. `dandelion`. */
  actorId?: string;
  name: string;
  /** Playable roster only; the game's English column holds Japanese for NPCs. */
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
  // indices into the matching table in `CharacterData.types`
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
  // absent while the row is still a placeholder
  hobby?: string | null;
  specialty?: string | null;
  likes?: string | null;
  comment?: string | null;
  birthdayComment?: string | null;
  /** Three liked gift item ids, indexing `CharacterData.items`. */
  giftItems?: number[];
  /** The regions dates are chosen from; their venues are `places[division]`. */
  dateDivisions?: number[];
  /** The venues the date script visits, in the order it authors them. A region
   *  holds more venues than any one character uses. */
  datePlaces?: number[];
  /** Join key into `CharacterData.skillSets`. */
  skillSetGroup?: number;
  /** Three equipment slot type ids, indexing `CharacterData.equipment`. */
  equipmentSlots?: number[];
  /** `start` runs once at the opening, `repeat` loops. */
  battlePatterns?: { start?: BattlePattern[]; repeat?: BattlePattern[] };
  /** Level 1, keyed by star grade then `STAT_TYPE`. Grade 6 is a cap row equal
   *  to grade 5, not a grade that can be reached. */
  baseStats?: Record<string, Record<string, number>>;
  /** What each level after the first adds, keyed the same way as `baseStats`. */
  levelStats?: Record<string, Record<string, number>>;
  /** Per affection rank, index 0 being rank 1. Ranks accumulate, so rank N is
   *  the sum of the first N entries. */
  loveStats?: Record<string, number>[];
};

// `steps` are skill ids in `CharacterData.skills`. Alternatives are evaluated
// in `order`; condition 0 is unconditional, 20 and 21 test the state named in
// `conditionValue` against its threshold.
export type BattlePattern = {
  name: string | null;
  order: number;
  condition: number;
  conditionValue: string[];
  steps: number[];
};

/**
 * Value at equipment level L is `value + perLevel * (L - 1)`. `ADDTION` (the
 * game's own spelling) is a flat term, `MULTIPLICATION` a fraction of the base.
 */
export type EquipmentOption = {
  stat: string | null;
  calc: string | null;
  value: number;
  perLevel: number;
};

export type EquipmentTier = {
  tier: number;
  maxLevel: number;
  icon: string | null;
  options: EquipmentOption[];
};

// `icon` is the empty slot's art; a tier carries the filled art.
export type EquipmentEntry = {
  name: string | null;
  icon: string | null;
  tiers?: EquipmentTier[];
};

/**
 * `display` is `STAT_UI_DISPLAY_TYPE`: 1 truncates to a whole number, 2 keeps
 * two decimals as a percentage, 0 leaves the value alone. Rounding is not
 * cosmetic — the game rounds the base block and the equipment delta separately
 * before adding them.
 */
export type StatTypeEntry = {
  name: string | null;
  en: string | null;
  display: number;
  order: number;
};

export type StatCaps = {
  level: number;
  star: number;
  love: number;
};

// Magnitude and duration both scale with skill level, so these are carried per
// level alongside the description.
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

export type ItemEntry = {
  name: string | null;
  desc: string | null;
  flavor: string | null;
  icon: string | null;
};

export type PlaceEntry = {
  id: number;
  name: string | null;
  desc: string | null;
  thumbnail: string | null;
};

/**
 * Grows with skill level:
 *
 *     base + up * (L - 1) + extra * floor((L - 1) / SkillEntry.levelPeriod)
 *
 * One entry per slot of the effect row's value array, which the game's
 * description templates index; nearly every effect uses slot 0.
 */
export type SkillMagnitude = {
  base: number[];
  up: number[];
  extra: number[];
};

/** `name` is null for the internal markers a skill sets and then clears; the
 *  game shows the player nothing for those and `id` is all they have. */
export type SkillDetailValue = {
  name: string | null;
  id: string;
};

/**
 * `state` / `instant` values are individual states, not whole categories.
 * `durationCategory` values are `DURATION_CATEGORIZE_TYPE` constants and
 * `instantCategory` values are `ONETIME_CATEGORIZE_TYPE` constants.
 */
export type SkillDetail = {
  kind: 'state' | 'instant' | 'durationCategory' | 'instantCategory';
  values: SkillDetailValue[];
};

/**
 * `condition` is a `SKILL_EFFECT_GIVE_CONDITION` constant and decides what the
 * values mean: a resolved state, a `*_type` id to look up in
 * `CharacterData.types`, a character id, an HP fraction, or a stack count.
 */
export type SkillGate = {
  condition: string | null;
  /** Whose property is tested: `CASTER` or `HOLDER`. */
  on: string | null;
  values: SkillDetailValue[];
};

export type SkillOp = {
  kind: 'onetime' | 'duration';
  op: string | null;
  /** Who the operation lands on: `CASTER` or `HOLDER`. */
  applyTo: string | null;
  /** The stat the magnitude scales off, and whose stat it is. */
  scale: string | null;
  scaleOf: string | null;
  // how the work picks its targets
  team: string | null;
  pick: string | null;
  sort: string | null;
  count: number;
  /** The coefficient on `scale`, per skill level. Absent when it is all zero. */
  value?: SkillMagnitude;
  /** Which states or categories a clear/immunity operation names. */
  detail?: SkillDetail;
  /** The condition the effect is only given under. */
  gate?: SkillGate;
  // duration operations only
  name?: string | null;
  icon?: string | null;
  /** 1 buff, 2 debuff, 3 crowd control, 0 uncategorised. */
  categorize?: number;
  /** How long the state lasts, per skill level. */
  seconds?: SkillMagnitude;
  maxStack?: number;
  /** Seconds between ticks, when the state repeats its operation. */
  interval?: number;
};

// `count` is how many times the skill spawns this same hitbox — a multi-hit
// skill authors one event per hit.
export type SkillHit = {
  /** `X_AXIS`, `CIRCLE` or `GLOBAL`. */
  shape: string | null;
  range: number;
  /** Detections inside one spawn, and the seconds between them. */
  ticks: number;
  cycle: number;
  delay: number;
  count: number;
  /** What the hitbox anchors on, not who it affects. Authored per event, so
   *  one skill's hitboxes can anchor on different things. */
  cast?: {
    team: string | null;
    range: string | null;
    rangeValue: number;
    pick: string | null;
    sort: string | null;
    count: number;
  };
  ops: SkillOp[];
};

// A passive's flat grant, applied for the whole battle.
export type SkillStat = {
  stat: string | null;
  scale: string | null;
  multiple: number;
  /** A party-composition gate, when the grant is conditional. */
  condition: string | null;
  conditionValue: string[];
};

// `on` is a `PASSIVE_TRIGGER_TYPE`.
export type SkillTrigger = {
  on: string | null;
  check: string | null;
  cooldown: number;
  limit: number;
  ops: SkillOp[];
};

/**
 * An active skill has `hits`; a passive has `stats` and `triggers`.
 *
 * How the game turns an operation into a number against a defender is not
 * decoded, so nothing here may be combined into a damage or healing total.
 */
export type SkillBehaviour = {
  attack?: boolean;
  fever?: number;
  /** Non-hitbox events the cast fires, e.g. `MOVE_TO_TARGET`. */
  moves?: string[];
  hits?: SkillHit[];
  stats?: SkillStat[];
  triggers?: SkillTrigger[];
};

// `desc` is one pre-rendered description per skill level, length 1 when the
// skill cannot be levelled, carrying the game's own `<color=#rrggbb>` markup.
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
  /** The period of the extra growth step; see `SkillMagnitude`. */
  levelPeriod: number;
  /** What it does, as opposed to what its description says it does. */
  behaviour?: SkillBehaviour;
};

// A resolved `*_type` integer. `icons` lists every icon column the table
// declares, in preference order — `icon` alone is not always extractable.
// `name` is Korean; only the element rows have finished English in the game's
// own text table, so `en` is otherwise generated.
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
  /** Keyed by item id; only the ones some character likes. */
  items: Record<string, ItemEntry>;
  /** Keyed by division type. */
  places: Record<string, PlaceEntry[]>;
  /** Keyed by slot type id. */
  equipment: Record<string, EquipmentEntry>;
  /** Keyed by `STAT_TYPE` constant. */
  statTypes: Record<string, StatTypeEntry>;
  statCaps: StatCaps;
  /** Index 0 is affection level 1. */
  loveTitles: (string | null)[];
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

export function loadSceneTimelines(): Promise<SceneTimelineData> {
  return fetchJson<SceneTimelineData>('scene_timelines.json');
}

export function loadVoice(): Promise<VoiceIndex> {
  return fetchJson<VoiceIndex>('voice.json');
}

export function loadSceneAudio(): Promise<SceneAudioIndex> {
  return fetchJson<SceneAudioIndex>('scene_audio.json');
}

// Codes that are not characters (event, screen and cut-in assets) have no
// entry, so callers fall back to the code.
export function loadCharacters(): Promise<CharacterData> {
  return fetchJson<CharacterData>('characters.json');
}

// What the icon pipeline actually published, so an unpublished icon is never
// rendered as a broken image.
export type IconManifest = {
  groups: Partial<Record<
    'ui' | 'char' | 'cutin' | 'skin' | 'item' | 'skill' | 'place' | 'buff' | 'equip',
    string[]>>;
};

export function loadIcons(): Promise<IconManifest> {
  return fetchJson<IconManifest>('icons.json');
}

// An emote is a Unity particle prefab: the manifest carries its emitters with
// every module they enable, plus the untrimmed sheets. `height`/`aspect`
// describe the still, which is the primary emitter's entry tile.
//
// Placement is authored — an emote names a slot, a rig names the bone that slot
// hangs off and the offset from it. Only the particle-to-skeleton size factor
// is applied in code.
export type EmoticonSlot = 'Mouth' | 'OutsideHead' | 'InsideHead';

/**
 * Time, value, in slope, out slope. A null slope is Unity's infinite tangent:
 * the segment steps instead of interpolating, as a flipbook's frame curve does.
 */
export type EmoteCurveKey = [number, number, number | null, number | null];

/**
 * `m` is Unity's `MinMaxCurve` mode — 0 constant, 1 curve, 2 random between two
 * curves, 3 random between two constants — `s` the constant, curve multiplier
 * or maximum, and `n` the minimum of mode 3.
 */
export type EmoteCurve = {
  m: number;
  s: number;
  n?: number;
  k?: EmoteCurveKey[];
  j?: EmoteCurveKey[];
};

/** A `Gradient`: colour keys `[t, r, g, b]`, alpha keys `[t, a]`, `f` 1 = step. */
export type EmoteGradientStops = {
  c: [number, number, number, number][];
  a: [number, number][];
  f: number;
};

/**
 * `m` is Unity's `MinMaxGradient` mode — 0 colour, 1 gradient, 2 two colours,
 * 3 two gradients, 4 a random point of one gradient.
 */
export type EmoteGradient = {
  m: number;
  c?: [number, number, number, number];
  d?: [number, number, number, number];
  g?: EmoteGradientStops;
  h?: EmoteGradientStops;
};

export type EmoteBurst = {
  t: number;
  n: EmoteCurve;
  cycles: number;
  interval: number;
  probability: number;
};

export type EmoteEmitter = {
  name: string;
  /** Key into `EmoticonManifest.sheets`, and the file under `emoticons/fx/`. */
  sheet: string;
  tiles: [number, number];
  /** The emitter's own transform, relative to the prefab root. */
  position: [number, number];
  angle: number;
  scale: [number, number];
  duration: number;
  looping: boolean;
  startDelay: EmoteCurve;
  simulationSpeed: number;
  maxParticles: number;
  /** `ParticleSystemRenderer.renderAlignment`. */
  align: number;
  pivot: [number, number];
  start: {
    lifetime: EmoteCurve;
    speed: EmoteCurve;
    size: EmoteCurve;
    sizeY?: EmoteCurve;
    rotation: EmoteCurve;
    color: EmoteGradient;
    gravity: EmoteCurve;
    flipRotation: number;
  };
  emission?: { rate: EmoteCurve; bursts: EmoteBurst[] };
  shape?: {
    /** `ParticleSystemShapeType`: 10 circle, 12 single-sided edge. */
    type: number;
    radius: number;
    radiusThickness: number;
    arc: number;
    /** 0 random, 3 spread across one burst. */
    arcMode: number;
    rotation: number;
    position: [number, number];
    randomDirection: number;
    alignToDirection: boolean;
  };
  size?: { curve: EmoteCurve; y: EmoteCurve; separateAxes: boolean };
  color?: { gradient: EmoteGradient };
  velocity?: {
    x: EmoteCurve;
    y: EmoteCurve;
    radial: EmoteCurve;
    speedModifier: EmoteCurve;
    inWorldSpace: boolean;
  };
  spin?: { curve: EmoteCurve };
  force?: { x: EmoteCurve; y: EmoteCurve; randomizePerFrame: boolean };
  uv?: {
    frame: EmoteCurve;
    startFrame: EmoteCurve;
    cycles: number;
    animationType: number;
    rowMode: number;
    rowIndex: number;
  };
};

export type EmoticonManifest = {
  /** Sheet name -> pixel size, for the tile grid. */
  sheets: Record<string, [number, number]>;
  emotes: Record<string, {
    slot: EmoticonSlot;
    height: number;
    aspect: number;
    emitters: EmoteEmitter[];
  }>;
  actors: Record<string, {
    /** The rig's baked look direction. A right-facing actor mirrors its emote. */
    look: 'Center' | 'Left' | 'Right';
    bones: Record<EmoticonSlot, string>;
    offsets: Record<EmoticonSlot, [number, number]>;
  }>;
};

export function loadEmoticons(): Promise<EmoticonManifest> {
  return fetchJson<EmoticonManifest>('emoticons.json');
}

// `grades` is the result grades that pick this rig: the child rig covers 1 and
// 2, the adult rig covers 3.
export type GachaRig = {
  key: string;
  asset: string;
  skel: string;
  atlas: string;
  pages: string[];
  /** `SkeletonDataAsset.scale`, applied at parse time as the game applies it. */
  dataScale: number;
  grades: number[];
  animations: string[];
  durations: Record<string, number>;
  cameraBone: string | null;
  jiggleBone: string | null;
};

export type GachaIndex = {
  bundle: string;
  drawer: { pixelPerUnit: number };
  jiggler: { maxDistance: number; springStrength: number; springDamping: number };
  rigs: Record<'child' | 'adult', GachaRig>;
};

export function loadGachaIndex(): Promise<GachaIndex> {
  return fetchJson<GachaIndex>('gacha.json');
}

export const KIND_LABEL: Record<SkinKind, string> = {
  standing: 'Standing',
  affection: 'Affection',
  desire: 'Desire',
  pleasure: 'Pleasure',
};

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
