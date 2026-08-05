// Runtime fetch of the generated game-data JSON. Nothing is bundled at build
// time: the generated files are fetched by the SPA, so refreshing data does
// not require a rebuild.
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
  /**
   * A rig that exists only in the scenario: no `Character_Base` row, so no
   * types, rarity, kit or stats — the character is never fought. Its `name`
   * and `actorId` come from the scripts rather than the master data.
   */
  storyOnly?: boolean;
  /** The id the scripts address this character by, e.g. `dandelion`. */
  actorId?: string;
  name: string;
  /**
   * English display name. Playable characters only — the game's English column
   * is finished for that roster and holds Japanese for every NPC. Defective
   * playable rows are corrected in the generator.
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
   * the preference at region granularity; the venues in a region are
   * `CharacterData.places[division]`.
   */
  dateDivisions?: number[];
  /**
   * The venues the character's date script actually visits, in the order it
   * authors them. A region holds more venues than any one character uses —
   * Humanitas lists ten and every Humanitas date visits five — so this is the
   * real list and `dateDivisions` only names the region it came from.
   */
  datePlaces?: number[];
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
  /**
   * The stat block at level 1, keyed by star grade then `STAT_TYPE` constant.
   * Grade 6 is a cap row equal to grade 5, not a grade that can be reached.
   */
  baseStats?: Record<string, Record<string, number>>;
  /** What each level after the first adds, keyed the same way as `baseStats`. */
  levelStats?: Record<string, Record<string, number>>;
  /**
   * What each affection rank adds, index 0 being rank 1. The ranks accumulate,
   * so the bonus at rank N is the sum of the first N entries.
   */
  loveStats?: Record<string, number>[];
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

/**
 * One option a filled equipment slot grants.
 *
 * Its value at equipment level L is `value + perLevel * (L - 1)`. `calc` says
 * how it reaches the stat: `ADDTION` (the game's own spelling) is a flat term,
 * `MULTIPLICATION` a fraction of the base stat.
 */
export type EquipmentOption = {
  stat: string | null;
  calc: string | null;
  value: number;
  perLevel: number;
};

/** One tier of an equipment slot, with its own level cap and filled-slot art. */
export type EquipmentTier = {
  tier: number;
  maxLevel: number;
  icon: string | null;
  options: EquipmentOption[];
};

// One of the 12 equipment slot types. `icon` is the empty slot's art; `tiers`
// is what filling it actually grants.
export type EquipmentEntry = {
  name: string | null;
  icon: string | null;
  tiers?: EquipmentTier[];
};

/**
 * A stat's display name and how the game rounds it.
 *
 * `display` is `STAT_UI_DISPLAY_TYPE`: 1 truncates to a whole number, 2 keeps
 * two decimals and is shown as a percentage, 0 leaves the value alone. Rounding
 * is not cosmetic — the game applies it to the base block and again to the
 * equipment delta before the two are added, so `roundStat` has to run at both
 * points.
 */
export type StatTypeEntry = {
  name: string | null;
  en: string | null;
  display: number;
  order: number;
};

/** The ceilings a stat calculation has to respect. */
export type StatCaps = {
  level: number;
  star: number;
  love: number;
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

// One operation a skill performs, as the game's own enum constant names —
// `lib/characters.ts` turns those into labels. A `null` field is the game's
// `NONE`.
//
// `op` is an `ONETIME_EFFECT_TYPE` when `kind` is `onetime` and a
// `DURATION_EFFECT_TYPE` when it is `duration`, plus the synthetic `MARKER`
// for a lasting state that carries no effect at all — those exist only to be
// tested by a condition or a trigger.
/**
 * A value that grows with the skill level:
 *
 *     base + up * (L - 1) + extra * floor((L - 1) / SkillEntry.levelPeriod)
 *
 * One entry per slot of the effect row's own value array — the game's
 * description templates index it, and slot 0 is the one nearly every effect
 * uses. Grow it with `growValue`.
 */
export type SkillMagnitude = {
  base: number[];
  up: number[];
  extra: number[];
};

/**
 * One thing a clear, an immunity or a gate points at.
 *
 * `name` is what to show. It is **null for the internal markers a skill sets
 * and then clears** — over half the states a clear names are those, the game
 * shows the player nothing for them, and `id` is all that identifies them.
 */
export type SkillDetailValue = {
  name: string | null;
  id: string;
};

/**
 * What a clear or immunity operation names.
 *
 * `state` / `instant` values are states — CH0001's dispel names 지속 회복, i.e.
 * it strips heal-over-time rather than a whole category. `durationCategory`
 * values are `DURATION_CATEGORIZE_TYPE` constants and `instantCategory` values
 * are `ONETIME_CATEGORIZE_TYPE` constants.
 */
export type SkillDetail = {
  kind: 'state' | 'instant' | 'durationCategory' | 'instantCategory';
  values: SkillDetailValue[];
};

/**
 * The condition an effect is only given under.
 *
 * `Skill_Effect_Data_V2` is not only the alias table: a row can gate the effect
 * it points at, and a row pointing at its own id exists purely to carry a gate.
 * CH0022's burst is the readable case — its shield is gated
 * `CONDITION_CHECK_CHARACTER_FACTION` on faction 103, so it reaches only Midwen
 * Corporation partners.
 *
 * `condition` is a `SKILL_EFFECT_GIVE_CONDITION` constant and decides what the
 * values mean: a state (already resolved), a `*_type` id the app looks up in
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

// One hitbox the cast opens. `count` is how many times the skill spawns this
// same hitbox — a multi-hit skill authors one event per hit.
export type SkillHit = {
  /** `X_AXIS`, `CIRCLE` or `GLOBAL`. */
  shape: string | null;
  range: number;
  /** Detections inside one spawn, and the seconds between them. */
  ticks: number;
  cycle: number;
  delay: number;
  count: number;
  /**
   * What the hitbox anchors on — not who it affects, which is on the
   * operation. It is authored per event, so one skill's hitboxes can anchor on
   * different things.
   */
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

// A flat stat grant a passive applies for the whole battle.
export type SkillStat = {
  stat: string | null;
  scale: string | null;
  multiple: number;
  /** A party-composition gate, when the grant is conditional. */
  condition: string | null;
  conditionValue: string[];
};

// A passive's event hook. `on` is a `PASSIVE_TRIGGER_TYPE`.
export type SkillTrigger = {
  on: string | null;
  check: string | null;
  cooldown: number;
  limit: number;
  ops: SkillOp[];
};

/**
 * What a skill mechanically does, read out of the game's behaviour tables.
 *
 * An operation carries its own coefficient and the stat that coefficient
 * applies to, so "84% of the caster's attack" is readable here even for the
 * effects a skill's description never mentions. What is **not** decoded is how
 * the game turns that into a number against a defender — nothing here may be
 * combined into a computed damage or healing total.
 *
 * An active skill has `hits`; a passive has `stats` and `triggers`.
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
  /** The period of the extra growth step; see `SkillMagnitude`. */
  levelPeriod: number;
  /** What it does, as opposed to what its description says it does. */
  behaviour?: SkillBehaviour;
};

// A resolved `*_type` integer: its display name, its atlas icon, and (elements
// only) the colour the game tints it with. `icons` lists every icon column the
// table declares, in preference order — `icon` alone is not always extractable.
//
// `name` is the game's Korean label; `en` is the generated English one. Only
// the element rows have finished English in the game's own text table, so the
// rest is a fixed table in the generator.
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
  /** Every stat a unit has, keyed by `STAT_TYPE` constant. */
  statTypes: Record<string, StatTypeEntry>;
  statCaps: StatCaps;
  /** The relationship title at each affection level; index 0 is level 1. */
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

// The ordered command list of each rig's scenario scripts — the program the
// scene interpreter runs. A missing file leaves the viewer on its phase/region
// playback rather than breaking the gallery.
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

// The lobby emotes published under `public/emoticons/`. A line's
// `[@emo <name>]` names one; the manifest exists so an unknown name renders
// nothing instead of a broken image.
//
// An emote is a Unity particle prefab, so what the manifest carries is its
// emitters — every module they enable, with the curves and gradients intact —
// plus the untrimmed texture sheets under `public/emoticons/fx/`. The still in
// `public/emoticons/<name>.webp` is the primary emitter's entry tile and is
// what `height`/`aspect` describe.
//
// Placement is authored, not guessed. Each emote declares one of the game's
// three slots, and each standing rig declares which bone that slot hangs off
// and the x/y offset from it. The particle-to-skeleton size factor is the one
// part the game applies in code.
export type EmoticonSlot = 'Mouth' | 'OutsideHead' | 'InsideHead';

/**
 * An `AnimationCurve` key: time, value, in slope, out slope. A null slope is
 * Unity's infinite tangent — the segment steps instead of interpolating, which
 * is what a flipbook's frame curve is made of.
 */
export type EmoteCurveKey = [number, number, number | null, number | null];

/**
 * A `MinMaxCurve`. `m` is Unity's mode — 0 constant, 1 curve, 2 random between
 * two curves, 3 random between two constants — `s` the constant, the curve
 * multiplier or the maximum, and `n` the minimum of mode 3.
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
 * A `MinMaxGradient`. `m` is Unity's mode — 0 colour, 1 gradient, 2 two
 * colours, 3 two gradients, 4 a random point of one gradient.
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
