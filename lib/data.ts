// Fetched at runtime: refreshing the data needs no rebuild.
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import type { Localized } from '@/lib/i18n';
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
  skins: SkinListEntry[];
};

export type SdCharacter = {
  code: string;
  name: string;
  archive: string;
  skel: string;
  atlas: string;
  textures: string[];
  animations: string[];
  bounds: { x: number; y: number; width: number; height: number };
  dataScale: number;
  ppu: number | null;
  defaultAnimation: string | null;
  loop: boolean | null;
  cutin: {
    animation: string;
    duration: number;
    loop: boolean;
    camera: { name: string | null; start: number; duration: number; timeScale: number }[];
    audio: { name: string | null; start: number; duration: number; timeScale: number }[];
    activations: {
      track: string; name: string | null; start: number; duration: number; timeScale: number;
    }[];
    effects: {
      track: string;
      name: string;
      start: number;
      duration: number;
      bone: string | null;
      anchor: 'bone' | 'character' | 'camera' | 'ground';
      emitters: (EmoteEmitter & { order?: number })[];
    }[];
    shakes: {
      name: string | null; start: number; duration: number; timeScale: number;
      minAmplitude: number; maxAmplitude: number; frequency: number; useCurve: boolean;
      curve: { time: number; value: number; inSlope: number; outSlope: number }[];
    }[];
    tracks: {
      name: string; parent: number | null; infiniteClip: string | null;
      clips: {
        name: string | null; start: number; duration: number;
        timeScale: number; asset: string | null;
      }[];
    }[];
    voiceMarkers: { time: number; fast: boolean }[];
  } | null;
};

export type SdIndex = {
  characters: Record<string, SdCharacter>;
};

// `*En` is the game's own English column, null where that row is untranslated.
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
  nameEn: string | null;
  desc: string;
  descEn: string | null;
  iconPath: string | null;
  resourcesId: string | null;
  voiceGroupId: string | null;
  artist: string | null;
  artistEn: string | null;
  cv: string | null;
  cvEn: string | null;
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
  /** All-caps English gloss; a second, independent romanisation. */
  nameUppercase?: string | null;
  birthday?: number[] | null;
  // absent while the row is still a placeholder
  hobby?: string | null;
  hobbyEn?: string | null;
  specialty?: string | null;
  specialtyEn?: string | null;
  likes?: string | null;
  likesEn?: string | null;
  comment?: string | null;
  commentEn?: string | null;
  birthdayComment?: string | null;
  birthdayCommentEn?: string | null;
  /** Three liked gift item ids, indexing `CharacterData.items`. */
  giftItems?: number[];
  /** The regions dates are chosen from; their venues are `places[division]`. */
  dateDivisions?: number[];
  /** The venues the date script visits, in author order; a region holds more. */
  datePlaces?: number[];
  /** Join key into `CharacterData.skillSets`. */
  skillSetGroup?: number;
  /** Join key into `GrowthData.skill.groups`; playable roster only. */
  skillMaterialGroup?: number | null;
  /** Three equipment slot type ids, indexing `CharacterData.equipment`. */
  equipmentSlots?: number[];
  /** `start` runs once at the opening, `repeat` loops. */
  battlePatterns?: { start?: BattlePattern[]; repeat?: BattlePattern[] };
  /** Level 1, by star grade then `STAT_TYPE`; grade 6 is a cap row, not reachable. */
  baseStats?: Record<string, Record<string, number>>;
  /** What each level after the first adds, keyed the same way as `baseStats`. */
  levelStats?: Record<string, Record<string, number>>;
  /** Per affection rank from index 0; ranks accumulate. */
  loveStats?: Record<string, number>[];
};

// Alternatives run in `order`; condition 0 is unconditional, 20 and 21 test `conditionValue`.
export type BattlePattern = {
  name: string | null;
  nameEn: string | null;
  order: number;
  condition: number;
  conditionValue: string[];
  steps: number[];
};

// Value at level L is `value + perLevel * (L - 1)`; `ADDTION` is flat, `MULTIPLICATION` a fraction of base.
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
  nameEn: string | null;
  icon: string | null;
  tiers?: EquipmentTier[];
};

// `STAT_UI_DISPLAY_TYPE`: 1 whole number, 2 two-decimal percentage, 0 raw; base and equipment delta round separately.
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

// Magnitude and duration are carried per skill level.
export type BuffEntry = {
  name: string | null;
  nameEn: string | null;
  desc: string | null;
  descEn: string | null;
  icon: string | null;
  /** 1 buff, 2 debuff, 3 crowd control, 0 uncategorised. */
  categorize: number;
  seconds: number;
  maxStack: number;
  dispellable: boolean;
};

export type ItemEntry = {
  name: string | null;
  nameEn: string | null;
  desc: string | null;
  descEn: string | null;
  flavor: string | null;
  flavorEn: string | null;
  icon: string | null;
};

export type PlaceEntry = {
  id: number;
  name: string | null;
  nameEn: string | null;
  desc: string | null;
  descEn: string | null;
  thumbnail: string | null;
};

// `base + up * (L - 1) + extra * floor((L - 1) / levelPeriod)`, one entry per value slot.
export type SkillMagnitude = {
  base: number[];
  up: number[];
  extra: number[];
};

/** `name` is null for the internal markers a skill sets and then clears. */
export type SkillDetailValue = {
  name: string | null;
  nameEn: string | null;
  id: string;
};

// Individual states, not categories; the category fields hold `DURATION_CATEGORIZE_TYPE` / `ONETIME_CATEGORIZE_TYPE`.
export type SkillDetail = {
  kind: 'state' | 'instant' | 'durationCategory' | 'instantCategory';
  values: SkillDetailValue[];
};

// `SKILL_EFFECT_GIVE_CONDITION` decides what the values mean: state, `*_type` id, character id, HP fraction or stacks.
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
  nameEn?: string | null;
  icon?: string | null;
  /** 1 buff, 2 debuff, 3 crowd control, 0 uncategorised. */
  categorize?: number;
  /** How long the state lasts, per skill level. */
  seconds?: SkillMagnitude;
  maxStack?: number;
  /** Seconds between ticks, when the state repeats its operation. */
  interval?: number;
};

// `count` is how many times the skill spawns this same hitbox.
export type SkillHit = {
  /** `X_AXIS`, `CIRCLE` or `GLOBAL`. */
  shape: string | null;
  range: number;
  /** Detections inside one spawn, and the seconds between them. */
  ticks: number;
  cycle: number;
  delay: number;
  count: number;
  /** What the hitbox anchors on, not who it affects; authored per event. */
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

// An active skill has `hits`, a passive `stats` and `triggers`; the battle arithmetic over them is not decoded.
export type SkillBehaviour = {
  attack?: boolean;
  fever?: number;
  /** Non-hitbox events the cast fires, e.g. `MOVE_TO_TARGET`. */
  moves?: string[];
  hits?: SkillHit[];
  stats?: SkillStat[];
  triggers?: SkillTrigger[];
};

// One pre-rendered `desc` per skill level, carrying the game's `<color=#rrggbb>` markup.
export type SkillEntry = {
  name: string | null;
  nameEn: string | null;
  desc: string[];
  descEn: string[] | null;
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

// `icons` is every icon column in preference order.
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
  loveTitles: { name: string | null; en: string | null }[];
  /** `skillSetGroup` -> star grade -> the skill ids that grade has. */
  skillSets: Record<string, Record<string, number[]>>;
  skills: Record<string, SkillEntry>;
};

// An enemy is a `Character_Base` row: same code, kit already in `skillSets` / `skills`.
export type StageEnemy = {
  code: string;
  name: string | null;
  nameEn: string | null;
  iconPath: string | null;
  roleType?: number | null;
  attributeType?: number | null;
  positionType?: number | null;
  skillSetGroup?: number | null;
};

/** One slot in a wave's line-up; the list keeps the game's own ordering. */
export type WaveSlot = {
  /** Absent when the id resolves to no character code. */
  code?: string;
  /** The raw id, only when it resolves to no code. */
  id?: number;
  level?: number | null;
};

export type WaveEvent = {
  trigger?: string | null;
  /** A named `WAVE_CUSTOM_ACTIVE_EVENT_TYPE`, or its raw constant. */
  kind: string;
  value?: string | null;
  lines?: { order: number; icon: string | null; text: Localized | null }[] | null;
};

export type StageWave = {
  sequence: number;
  encounter?: string | null;
  bossCode?: string;
  bgm?: string | null;
  events?: WaveEvent[] | null;
  enemies: WaveSlot[];
};

/** One payout row. `ref` keys `StageData.drops` when the reward names a thing. */
export type StageDrop = {
  /** A named `REWARD_TYPE`, or its raw constant. */
  type: string;
  id: number;
  /** One amount, or a min/max pair when the reward is authored as a range. */
  amount: number[];
  /** A named `DROP_TYPE`; `always` is guaranteed. */
  drop: string;
  /** Absent when the drop is certain. */
  chance?: number;
  ref?: string;
};

export type DropEntry = {
  name: string | null;
  nameEn: string | null;
  icon: string | null;
  grade?: number;
};

/** `first` is the one-time clear, `star` the mission reward, `repeat` per clear. */
export type StageRewards = Partial<Record<'first' | 'star' | 'repeat', StageDrop[]>>;

export type StageEntry = {
  id: number;
  mode: string;
  zoneId?: number;
  order?: number;
  /** The only difficulty signal a story stage carries. */
  nameKey?: string;
  /** The game's `{0}`-style template; the arguments are filled by `stageName`. */
  nameTemplate?: Localized;
  /** Korean authoring name, the only name a narrative stage has. */
  devName?: string;
  /** The Nemesis boss this stage fields, where the family names one. */
  bossName?: string;
  recommendLevel?: string;
  weakAttribute?: number;
  stamina?: number;
  /** What one clear costs and in which currency; varies by mode. `ref` keys `StageData.drops`. */
  entry?: { ref: string; amount: number };
  subMissionGroup?: string;
  /** Field prefab stem; the art itself is not extracted. */
  background?: string;
  bgm?: string;
  waveGroup: number;
  /** Key into `StageData.groups`. */
  group: string;
  rewards?: StageRewards;
  waves: StageWave[];
};

export type StageZone = {
  id: number;
  order?: number;
  difficulty?: string;
  /** Absent for the story zones, whose `zone_name_id` has no `Lang_Data` row. */
  name?: Localized;
  /** Korean authoring name; the story zones' only name. */
  devName?: string;
  /** `zone` icon group. Only the story and event zones have one. */
  image?: string;
};

// Not the same axis in every mode: a story chapter, a Nemesis season, or one event.
export type StageGroup = {
  key: string;
  mode: string;
  name?: Localized;
  devName?: string;
  /** Sort key within the mode. */
  order?: number;
  chapter?: number;
  difficulty?: string;
  /** Resolve through `GROUP_ICON_GROUPS`; a season's art is a boss portrait. */
  image?: string;
  /** The page logo, in the `banner` group; only extracted pages have one. */
  banner?: string;
  zoneId?: number;
  /** ISO dates, on the modes the game schedules. */
  from?: string;
  to?: string;
};

export type StageSubMission = {
  id: number;
  type: number;
  /** A party check's first value is a row of `checkTable`, not a count. */
  values: number[];
  checkTable?: keyof CharacterData['types'];
  text: Localized | null;
};

export type StageData = {
  modes: { key: string; label: Localized; tile?: string }[];
  /** Keyed by zone id. */
  zones: Record<string, StageZone>;
  /** Keyed by `StageEntry.group`. */
  groups: Record<string, StageGroup>;
  /** Keyed by sub-mission group id. */
  subMissions: Record<string, StageSubMission[]>;
  /** Keyed by character code. */
  enemies: Record<string, StageEnemy>;
  /** Keyed `<type>:<id>` — what a drop's `ref` points at. */
  drops: Record<string, DropEntry>;
  stages: StageEntry[];
  /** Per mode, the stages dropped because the pack carries no waves for them. */
  _skipped?: Record<string, number>;
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

export function loadSdIndex(): Promise<SdIndex> {
  return fetchJson<SdIndex>('sd.json');
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

// Event, screen and cut-in codes have no entry, so callers fall back to the code.
export function loadCharacters(): Promise<CharacterData> {
  return fetchJson<CharacterData>('characters.json');
}

// What the icon pipeline published, so an unpublished icon is never rendered.
export type IconManifest = {
  groups: Partial<Record<
    'ui' | 'char' | 'cutin' | 'skin' | 'item' | 'skill' | 'place' | 'buff' | 'equip'
    | 'zone' | 'tile' | 'banner',
    string[]>>;
};

export function loadStages(): Promise<StageData> {
  return fetchJson<StageData>('stages.json');
}

export function loadIcons(): Promise<IconManifest> {
  return fetchJson<IconManifest>('icons.json');
}

/** One line of a growth bill. `ref` is keyed the same way a stage drop is. */
export type MaterialCost = { ref: string; amount: number };

/** Charged per point of experience applied, on top of the experience itself. */
export type LevelFee = { ref: string; perExp: number } | null;

export type GrowthMaterial = {
  name?: string | null;
  nameEn?: string | null;
  icon?: string | null;
  /** What the tracker groups it under: `goods`, `skill`, `equipPiece`, … */
  kind?: string;
  grade?: number;
};

// `skill.costs` is keyed by the level being left; `accumExp` is a total, not a step.
export type GrowthData = {
  /** Keyed `<type>:<id>`, the same key a stage drop's `ref` uses. */
  materials: Record<string, GrowthMaterial>;
  /** Bills naming an item this pack ships no row for — tier 5 on eight slots. */
  _noItemRow?: string[];
  skill: {
    /** `SKILL_CATEGORIZE_TYPE` -> the level the material table reaches. */
    maxLevel: Record<string, number>;
    /** `CharacterEntry.skillMaterialGroup` -> categorize -> cost curve id. */
    groups: Record<string, Record<string, number>>;
    costs: Record<string, Record<string, MaterialCost[]>>;
  };
  equipment: {
    tiers: { tier: number; maxLevel: number }[];
    accumExp: Record<string, number>;
    /** The stored balance's ref — where a feed's excess ends up. */
    pool: string;
    /** Ref -> the experience it is worth; the balance itself is worth one. */
    expItems: Record<string, number>;
    levelFee: LevelFee;
    /** Tier reached -> slot type -> that tier's bill. */
    tierUp: Record<string, Record<string, MaterialCost[]>>;
  };
  unit: {
    accumExp: Record<string, number>;
    pool: string;
    expItems: Record<string, number>;
    levelFee: LevelFee;
  };
  star: StarGrowth;
};

/** A purchase tier holds through that lifetime count; a null `through` is the last, uncapped one. */
export type ExchangeTier = { through: number | null; price: number };

/** Memories, the second economy: a unit's own memory item plus the currency the shop takes. */
export type StarGrowth = {
  max: number;
  /** Star being left -> memories it costs. */
  upgrade: Record<string, number>;
  upgradeFee: Record<string, MaterialCost> | null;
  /** Default star -> memories to unlock an unowned unit. */
  open: Record<string, number>;
  /** Default star -> what one duplicate pays. */
  duplicate: Record<string, { pieces: number; amount: number }>;
  duplicateRef: string | null;
  /** Character code -> its memory item's ref. */
  pieces: Record<string, string>;
  exchange: {
    ref: string | null;
    name: string;
    resets: boolean;
    tiers: ExchangeTier[];
    codes: string[];
    /** Only the characters priced off the shared ladder. */
    ladders: Record<string, ExchangeTier[]> | null;
  } | null;
};

export function loadGrowth(): Promise<GrowthData> {
  return fetchJson<GrowthData>('growth.json');
}

// Placement is authored: an emote names a slot, a rig the bone and offset; only the size factor is applied in code.
export type EmoticonSlot = 'Mouth' | 'OutsideHead' | 'InsideHead';

// Time, value, in slope, out slope; a null slope is Unity's infinite tangent, which steps.
export type EmoteCurveKey = [number, number, number | null, number | null];

// Unity `MinMaxCurve`: `m` 0 constant, 1 curve, 2 two curves, 3 two constants; `s` value or maximum, `n` mode 3 minimum.
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

// Unity `MinMaxGradient`: `m` 0 colour, 1 gradient, 2 two colours, 3 two gradients, 4 a random point.
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
    /** The rig's baked look direction; mirrors an emote whose slot has no side. */
    look: 'Center' | 'Left' | 'Right';
    bones: Record<EmoticonSlot, string>;
    offsets: Record<EmoticonSlot, [number, number]>;
  }>;
};

export function loadEmoticons(): Promise<EmoticonManifest> {
  return fetchJson<EmoticonManifest>('emoticons.json');
}

// `grades` is the result grades that pick this rig: child 1 and 2, adult 3.
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
  drawer: { pixelPerUnit: number };
  jiggler: { maxDistance: number; springStrength: number; springDamping: number };
  rigs: Record<'child' | 'adult', GachaRig>;
};

export function loadGachaIndex(): Promise<GachaIndex> {
  return fetchJson<GachaIndex>('gacha.json');
}

export const KIND_LABEL: Record<SkinKind, Localized> = {
  standing: { en: 'Standing', ko: '스탠딩' },
  affection: { en: 'Affection', ko: '애정' },
  desire: { en: 'Desire', ko: '욕망' },
  pleasure: { en: 'Pleasure', ko: '쾌락' },
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
