// Shared reads over the character master data: which type row a character
// points at, which icon stands for a skin, and the filter axes the character
// list offers. Kept out of the pages so the gallery, the list and the
// character page agree on every label.
import type { SkinKind } from '@/components/skinViewer/types';
import type {
  CharacterData, CharacterEntry, EquipmentEntry, EquipmentTier, ItemEntry, PlaceEntry,
  SkillDetail, SkillEntry, SkillGate, SkillHit, SkillMagnitude, SkillOp, SkillStat,
  SkinListEntry, TypeEntry,
} from '@/lib/data';

export type TypeTable = keyof CharacterData['types'];

// The `*_type` column on a character for each table it can be filtered by.
export const TYPE_FIELD: Record<TypeTable, keyof CharacterEntry> = {
  attribute: 'attributeType',
  role: 'roleType',
  position: 'positionType',
  division: 'divisionType',
  faction: 'factionType',
};

export const TYPE_LABEL: Record<TypeTable, string> = {
  attribute: 'Element',
  role: 'Role',
  position: 'Position',
  division: 'Division',
  faction: 'Faction',
};

export function typeValue(entry: CharacterEntry, table: TypeTable): number | null {
  const v = entry[TYPE_FIELD[table]];
  return typeof v === 'number' ? v : null;
}

// Every released character sharing one type value, in code order. Backs the
// faction hover list on the character page.
export function membersOfType(
  characters: Record<string, CharacterEntry>, table: TypeTable, value: number,
): CharacterEntry[] {
  return Object.values(characters)
    .filter((c) => !c.unreleased && typeValue(c, table) === value)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function typeOf(
  entry: CharacterEntry | null, types: CharacterData['types'] | null, table: TypeTable,
): TypeEntry | null {
  if (!entry || !types) return null;
  const v = typeValue(entry, table);
  return v == null ? null : types[table][String(v)] ?? null;
}

// Icon candidates for a type row. `icon` alone is not always extractable, so
// the table's whole candidate list is preferred when present.
export function typeIcons(t: TypeEntry | null): string[] {
  if (!t) return [];
  return t.icons?.length ? t.icons : (t.icon ? [t.icon] : []);
}

// The English label, falling back to the Korean one. Every type row the game
// currently ships has an English label; a newly added row would not until the
// generator's table is extended, and must still render.
export function typeLabel(t: TypeEntry | null): string {
  return t ? (t.en || t.name) : '';
}

// The colour to paint a type's icon in. Only `Attribute_Icon_Data` carries
// one, and its icons are flat white silhouettes the game tints — untinted,
// all four elements look identical.
export function typeTint(t: TypeEntry | null): string | null {
  return t?.color ?? null;
}

// Rows a filter row should offer. `attribute` 0 is 모든 속성 / "All
// Attributes" — a UI catch-all, not an element. No character carries it, so
// as a filter it selects nothing.
export function filterRows(
  types: CharacterData['types'], table: TypeTable,
): [string, TypeEntry][] {
  return Object.entries(types[table])
    .filter(([value]) => !(table === 'attribute' && value === '0'));
}

// `characterType` 1 is playable, 2 is an NPC. Only playable rows carry a
// rarity, role or faction, so the list defaults to them.
export function isPlayable(entry: CharacterEntry): boolean {
  return entry.characterType === 1;
}

// Which roster a rig's character belongs to, when it is not the playable one.
// A playable character gets no badge — that is the default and needs no note.
// An unknown character (a screen or cut-in asset, not a character at all) gets
// none either; the asset key already says what it is.
export function rosterNote(
  entry: CharacterEntry | null,
): { label: string; scheme: string } | null {
  if (!entry) return null;
  if (entry.unreleased) return { label: 'UNRELEASED', scheme: 'purple' };
  if (entry.storyOnly) return { label: 'STORY', scheme: 'teal' };
  if (entry.characterType === 2) return { label: 'NPC', scheme: 'gray' };
  return null;
}

// The game carries a second, independent English name for the playable roster
// (`name_uppercase_eng_id`) beside the localized one. It is usually the same
// name in caps, so it is only worth showing when the two genuinely differ —
// 라일라 is `Lila` in one column and `LAILA` in the other.
export function altNameEn(entry: CharacterEntry): string | null {
  const alt = entry.nameUppercase;
  if (!alt) return null;
  const plain = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return plain(alt) === plain(entry.nameEn ?? '') ? null : alt;
}

export function birthdayText(entry: CharacterEntry): string | null {
  const b = entry.birthday;
  if (!b || b.length < 2 || !b[0]) return null;
  return `${b[0]}월 ${b[1]}일`;
}

// The three gift items a character likes, in the order the master data lists
// them. An id with no `items` row is dropped rather than rendered as a blank.
export function giftsOf(
  entry: CharacterEntry, items: CharacterData['items'],
): (ItemEntry & { id: number })[] {
  return (entry.giftItems ?? []).flatMap((id) => {
    const item = items[String(id)];
    return item ? [{ ...item, id }] : [];
  });
}

// Date venues for a character, grouped by the region they sit in.
//
// The venues are the ones the character's own date script visits, in its own
// order. Only the region is in the master data, and a region carries venues no
// date uses, so a character with no script falls back to the whole region.
export function datePlacesOf(
  entry: CharacterEntry, places: CharacterData['places'],
): { division: number; places: PlaceEntry[] }[] {
  const picked = entry.datePlaces ?? [];
  return (entry.dateDivisions ?? []).map((division) => {
    const all = places[String(division)] ?? [];
    const own = picked.flatMap((id) => all.filter((p) => p.id === id));
    return { division, places: own.length ? own : all };
  });
}

// English for the 12 equipment slot types. The master data has no English
// column for them — the set is fixed and small, so this is a translation of the
// Korean label, keyed by the same type id.
export const EQUIP_EN: Record<number, string> = {
  1: 'Earring',
  2: 'Necklace',
  3: 'Bracelet',
  4: 'Ring',
  5: 'Hat',
  6: 'Shoes',
  7: 'Bag',
  8: 'Gloves',
  9: 'Keyring',
  10: 'Badge',
  11: 'Bra',
  12: 'Panties',
};

// The three equipment slots a character can fill, in the order the master data
// lists them (one from each group of four types).
export function equipmentSlotsOf(
  entry: CharacterEntry, equipment: CharacterData['equipment'],
): (EquipmentEntry & { type: number })[] {
  return (entry.equipmentSlots ?? []).flatMap((type) => {
    const slot = equipment[String(type)];
    return slot ? [{ ...slot, type }] : [];
  });
}

// What the player has put in one equipment slot. `level` is clamped to the
// tier's own cap.
export type EquipInput = { type: number; tier: number; level: number };

export type StatInput = {
  level: number;
  star: number;
  /**
   * Affection rank. **Every character starts at rank 1**, so 1 is the lowest a
   * unit is ever seen at and the rank-1 gain is part of its baseline; 0 is
   * accepted only to read the block without any affection at all.
   */
  love: number;
  equipment: EquipInput[];
};

// One stat, with each term kept apart so the page can show where the number
// comes from rather than only the total.
export type StatRow = {
  stat: string;
  label: string;
  name: string | null;
  display: number;
  base: number;
  equipment: number;
  love: number;
  total: number;
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value) || low));
}

// Truncation toward zero, which is what the game's own rounding does.
function truncate(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

/**
 * The game's per-stat rounding, by `StatTypeEntry.display`.
 *
 * It is applied twice — once to the base block and once to the equipment delta,
 * before the two are added — so a calculator that rounds only the total drifts
 * from the game on any stat whose display type is not 0.
 */
export function roundStat(display: number, value: number): number {
  if (display === 1) return truncate(value);
  if (display === 2) return truncate(value * 100) / 100;
  return value;
}

/** A stat value as the game prints it: a percentage when its display type is 2. */
export function statText(display: number, value: number): string {
  if (display === 2) return `${Number((value * 100).toFixed(2))}%`;
  return String(Number(value.toFixed(2)));
}

// The tier a slot input names, or null when the slot is empty.
function tierOf(
  data: CharacterData, slot: EquipInput,
): EquipmentTier | null {
  return (data.equipment[String(slot.type)]?.tiers ?? [])
    .find((t) => t.tier === slot.tier) ?? null;
}

/** What one filled slot grants, with its level already applied. */
export function equipmentGrants(
  data: CharacterData, slot: EquipInput,
): { stat: string; calc: string; value: number }[] {
  const tier = tierOf(data, slot);
  if (!tier) return [];
  const steps = Math.max(0, Math.min(slot.level, tier.maxLevel) - 1);
  return tier.options.flatMap((option) => (option.stat && option.calc
    ? [{
      stat: option.stat, calc: option.calc,
      value: option.value + option.perLevel * steps,
    }]
    : []));
}

// The star grades a stat block can be read at. The tables carry a row per
// grade whatever the character's rarity, plus a cap row above the ceiling that
// repeats the top grade — neither is a grade the character can be at.
export function statGrades(entry: CharacterEntry, data: CharacterData): number[] {
  const floor = entry.defaultStar ?? 1;
  return Object.keys(entry.baseStats ?? {}).map(Number)
    .filter((g) => g >= floor && g <= data.statCaps.star)
    .sort((a, b) => a - b);
}

/**
 * A character's stats at a level, star grade, equipment set and affection rank.
 *
 * The three terms are combined the way the game combines them:
 *
 *     base   = round(battle[stat] + perLevel[stat] * (level - 1))
 *     equip  = round(sum of flat options + base * sum of fractional options)
 *     total  = base + equip + sum of affection ranks 1..love
 *
 * Equipment scales off the base stat, so it has to be computed after the level
 * term and before the affection term. Stats that stay at zero throughout are
 * dropped — a character with no defence gain gets no defence row.
 */
export function computeStats(
  entry: CharacterEntry, data: CharacterData, input: StatInput,
): StatRow[] {
  const caps = data.statCaps;
  const star = String(clamp(input.star, 1, caps.star));
  const level = clamp(input.level, 1, caps.level);
  const base = entry.baseStats?.[star] ?? {};
  const perLevel = entry.levelStats?.[star] ?? {};

  const add: Record<string, number> = {};
  const mul: Record<string, number> = {};
  for (const slot of input.equipment) {
    for (const grant of equipmentGrants(data, slot)) {
      const into = grant.calc === 'MULTIPLICATION' ? mul
        : grant.calc === 'ADDTION' ? add : null;
      if (into) into[grant.stat] = (into[grant.stat] ?? 0) + grant.value;
    }
  }

  const love: Record<string, number> = {};
  const ranks = Math.min(Math.max(Math.round(input.love) || 0, 0), caps.love);
  for (const rank of (entry.loveStats ?? []).slice(0, ranks)) {
    for (const [stat, value] of Object.entries(rank)) {
      love[stat] = (love[stat] ?? 0) + value;
    }
  }

  const rows: StatRow[] = [];
  for (const [stat, type] of Object.entries(data.statTypes)) {
    const own = roundStat(type.display,
      (base[stat] ?? 0) + (perLevel[stat] ?? 0) * (level - 1));
    const gear = roundStat(type.display,
      (add[stat] ?? 0) + own * (mul[stat] ?? 0));
    const bond = love[stat] ?? 0;
    if (!own && !gear && !bond) continue;
    rows.push({
      stat,
      label: type.en || STAT_LABEL[stat] || prettyConst(stat),
      name: type.name,
      display: type.display,
      base: own,
      equipment: gear,
      love: bond,
      total: own + gear + bond,
    });
  }
  return rows.sort((a, b) =>
    (data.statTypes[a.stat]?.order ?? 0) - (data.statTypes[b.stat]?.order ?? 0));
}

// `duration_categorize_type` on a buff's define row.
export const BUFF_CATEGORY: Record<number, { label: string; scheme: string }> = {
  1: { label: 'Buff', scheme: 'green' },
  2: { label: 'Debuff', scheme: 'red' },
  3: { label: 'Control', scheme: 'purple' },
};

// Slot art has no per-slot label in the master data; `skill_categorize_type`
// is what the game groups by.
export const SKILL_CATEGORY_LABEL: Record<number, string> = {
  1: 'Normal attack',
  2: 'Skill',
  3: 'Burst',
  4: 'Passive',
  5: 'Trigger',
};

// The skills a character has at one star grade, in slot order. A grade below
// the character's own rarity is still listed by the master data; that is what
// makes the passive's 3★/4★/5★ tiers visible.
export function skillsAtGrade(
  entry: CharacterEntry, data: CharacterData, grade: number,
): (SkillEntry & { id: number })[] {
  const set = data.skillSets[String(entry.skillSetGroup ?? '')];
  const ids = set?.[String(grade)] ?? [];
  return ids.flatMap((id) => {
    const skill = data.skills[String(id)];
    return skill ? [{ ...skill, id }] : [];
  });
}

// The star grades this character can actually be at. The master data carries a
// set for grades 1..5 whatever the character's rarity, but one that starts at
// 3★ can never be 1★ or 2★, so those rows are unreachable.
export function skillGrades(entry: CharacterEntry, data: CharacterData): number[] {
  const set = data.skillSets[String(entry.skillSetGroup ?? '')];
  if (!set) return [];
  const floor = entry.defaultStar ?? 1;
  return Object.keys(set).map(Number).filter((g) => g >= floor).sort((a, b) => a - b);
}

// English for the behaviour graph's enum constants. The master data has no
// English column for any of them — the generator emits the game's own constant
// name so nothing is lost, and these are translations of it.
//
// A name with no entry here falls back to `prettyConst`, so a constant added by
// a client update renders readably instead of blank.

// `ONETIME_EFFECT_TYPE` and `DURATION_EFFECT_TYPE` share one table: an op is
// only ever one or the other, and the two sets do not collide.
export const OP_LABEL: Record<string, string> = {
  MARKER: 'Internal state',
  EMPTY_EFFECT: 'No effect',
  ADD_DAMAGE: 'Damage',
  ADD_HEAL: 'Heal',
  ADD_FORCE_CRITICAL_DAMAGE: 'Guaranteed critical',
  ADD_FORCE_PENETRATION_DAMAGE: 'Guaranteed penetration',
  REDUCE_BURST_COOLDOWN: 'Burst cooldown down',
  UNSUMMON: 'Unsummon',
  CLEAR_DURATION_DEFINE_ID: 'Remove a named state',
  CLEAR_DURATION_CATEGORIZE_TYPE: 'Cleanse',
  CC_KNOCKBACK: 'Knockback',
  CC_HIT_REACTION: 'Hit reaction',
  SUMMON_HP: 'Summon HP',
  BUFF_TOTAL_DAMAGE_BARRIER: 'Shield',
  BUFF_PHYSICS_ATTACK_UP: 'Attack up',
  BUFF_PHYSICS_DEFEND_UP: 'Defence up',
  BUFF_PHYSICS_CRITICAL_CHANCE_UP: 'Crit rate up',
  BUFF_PHYSICS_CRITICAL_POWER_ADD_UP: 'Crit damage up',
  BUFF_EVASION_UP: 'Evasion up',
  BUFF_ACCURACY_UP: 'Accuracy up',
  BUFF_HEAL_UP: 'Healing up',
  BUFF_MAX_HP_UP: 'Max HP up',
  BUFF_WEIGHT_UP: 'Weight up',
  BUFF_TOUGHNESS_UP: 'Toughness up',
  BUFF_PENETRATE_UP: 'Penetration up',
  BUFF_PENETRATE_DEFENSE_UP: 'Penetration resist up',
  BUFF_CRITICAL_CHANCE_RESIST: 'Crit rate resist up',
  BUFF_CRITICAL_POWER_ADD_RESIST: 'Crit damage resist up',
  BUFF_HEAL_RECEIVE: 'Healing received up',
  BUFF_ATTACK_SPEED_UP: 'Attack speed up',
  DAMAGE_REDUCE: 'Damage taken down',
  DEBUFF_PHYSICS_ATTACK_DOWN: 'Attack down',
  DEBUFF_PHYSICS_DEFEND_DOWN: 'Defence down',
  DEBUFF_PHYSICS_CRITICAL_CHANCE_DOWN: 'Crit rate down',
  DEBUFF_PHYSICS_CRITICAL_POWER_ADD_DOWN: 'Crit damage down',
  DEBUFF_EVASION_DOWN: 'Evasion down',
  DEBUFF_ACCURACY_DOWN: 'Accuracy down',
  DEBUFF_HEAL_DOWN: 'Healing down',
  DEBUFF_TOUGHNESS_DOWN: 'Toughness down',
  DEBUFF_PENETRATE_DOWN: 'Penetration down',
  DEBUFF_PENETRATE_DEFENSE_DOWN: 'Penetration resist down',
  DEBUFF_CRITICAL_CHANCE_RESIST: 'Crit rate resist down',
  DEBUFF_CRITICAL_POWER_ADD_RESIST: 'Crit damage resist down',
  DEBUFF_HEAL_RECEIVE: 'Healing received down',
  DEBUFF_ATTACK_SPEED_DOWN: 'Attack speed down',
  CC_PROVOKE: 'Provoke',
  CC_CHARM: 'Charm',
  CC_FEAR: 'Fear',
  CC_STUN: 'Stun',
  CC_SILENCE: 'Silence',
  CC_BIND: 'Bind',
  CC_FREEZE: 'Freeze',
  CC_GROGGY: 'Groggy',
  IMMUNE_PHYSICAL_DAMAGE: 'Damage immunity',
  IMMUNE_DURATION_DEFINE_ID: 'Immune to a named state',
  IMMUNE_DURATION_CATEGORIZE_TYPE: 'Immune to a state category',
  IMMUNE_ONETIME_DEFINE_ID: 'Immune to a named instant',
  IMMUNE_ONETIME_CATEGORIZE_TYPE: 'Immune to an instant category',
  OVERTIME_DAMAGE: 'Damage over time',
  OVERTIME_HEAL: 'Heal over time',
  EXCLUDE_CASTING_TARGET: 'Cannot be targeted by casts',
  EXCLUDE_DETECTING_TARGET: 'Cannot be hit',
};

// Which colour an op reads as. Falls back to the buff/debuff/CC category the
// state itself declares, so an unmapped op still gets the right tone.
export const OP_SCHEME: Record<string, string> = {
  ADD_DAMAGE: 'red',
  OVERTIME_DAMAGE: 'red',
  ADD_HEAL: 'green',
  OVERTIME_HEAL: 'green',
  MARKER: 'gray',
  EMPTY_EFFECT: 'gray',
};

// `STAT_MULTIPLE_TYPE` on an op, and `STAT_TYPE` on a passive's stat grant.
export const STAT_LABEL: Record<string, string> = {
  ATTACK_RATE: 'ATK',
  PHYSICAL_ATTACK_RATE: 'ATK',
  MAGICAL_ATTACK_RATE: 'magic ATK',
  TOTAL_ATTACK_RATE: 'total ATK',
  DEFENSE_RATE: 'DEF',
  PHYSICAL_DEFENSE_RATE: 'DEF',
  MAGICAL_DEFENSE_RATE: 'magic DEF',
  MAX_LIFE_RATE: 'max HP',
  LIFE_RATE: 'current HP',
  CRITICAL_CHANCE_RATE: 'crit rate',
  PHYSICAL_CRITICAL_CHANCE_RATE: 'crit rate',
  MAGICAL_CRITICAL_CHANCE_RATE: 'magic crit rate',
  CRITICAL_POWER_ADD_RATE: 'crit damage',
  PHYSICAL_CRITICAL_POWER_ADD_RATE: 'crit damage',
  MAGICAL_CRITICAL_POWER_ADD_RATE: 'magic crit damage',
  ACCURACY_RATE: 'accuracy',
  EVASION_RATE: 'evasion',
  HEAL_RATE: 'healing',
  TOTAL_HEAL_RATE: 'total healing',
  HEAL_RECEIVE_RATE: 'healing received',
  DAMAGE: 'damage dealt',
  ELEMENT_RATE: 'element',
  ATTACK_SPEED_RATE: 'attack speed',
  ANI_ATTACK_SPEED_RATE: 'animation speed',
  COOL_TIME_RATE: 'cooldown',
  RESIST_RATE: 'resistance',
  PENETRATION_RATE: 'penetration',
  PENETRATION_DEFEND_RATE: 'penetration resist',
  CRITICAL_CHANCE_RESIST_RATE: 'crit rate resist',
  CRITICAL_POWER_ADD_RESIST_RATE: 'crit damage resist',
  // STAT_TYPE
  PHYSICS_ATTACK: 'Attack',
  PHYSICS_DEFENSE: 'Defence',
  MAX_LIFE: 'Max HP',
  ACCURACY: 'Accuracy',
  EVASION: 'Evasion',
  PHYSICS_CRITICAL_CHANCE: 'Crit rate',
  PHYSICS_CRITICAL_DAMAGE: 'Crit damage',
  HEAL: 'Healing',
  WEIGHT: 'Weight',
  RESIST_NORMAL_DEBUFF: 'Debuff resist',
  CRITICAL_CHANCE_RESIST: 'Crit rate resist',
  CRITICAL_POWER_ADD_RESIST: 'Crit damage resist',
  HEAL_RECEIVE: 'Healing received',
  PENETRATION: 'Penetration',
  PENETRATION_DEFEND: 'Penetration resist',
  ATTACK_SPEED_NORMAL: 'Attack speed',
};

// `SKILL_TARGET_TYPE` on a cast or a work, and `CHECK_TARGET_TYPE` on a
// trigger. The two enums share every name they have in common.
export const TARGET_LABEL: Record<string, string> = {
  SELF: 'self',
  ENEMY: 'enemies',
  FRIENDLY: 'allies',
  FRIENDLY_NOT_SELF: 'other allies',
  ALL_UNIT: 'everyone',
  CAST_TARGET: 'the cast target',
  HOLDER: 'the holder',
  TRIGGER_TARGET: 'the trigger target',
  TRIGGER_INSTIGATOR: 'the instigator',
  SUMMON_MINE: 'own summons',
  SUMMON_ENEMY: 'enemy summons',
  SUMMON_FRIENDLY: 'allied summons',
  SUMMON_ALL: 'all summons',
};

// `STAT_MULTIPLE_TARGET_TYPE` / `APPLY_TARGET_TYPE`: whose stat, and who it
// lands on.
export const SIDE_LABEL: Record<string, string> = {
  CASTER: 'caster',
  HOLDER: 'target',
};

// `SKILL_TARGET_SORT_TYPE` — how a limited pick chooses between candidates.
export const SORT_LABEL: Record<string, string> = {
  DISTANCE_LOWEST: 'nearest',
  DISTANCE_HIGHEST: 'furthest',
  HP_RATE_LOWEST: 'lowest HP',
  HP_RATE_HIGHEST: 'highest HP',
  PHY_ATK_LOWEST: 'lowest ATK',
  PHY_ATK_HIGHEST: 'highest ATK',
  MAG_ATK_LOWEST: 'lowest magic ATK',
  MAG_ATK_HIGHEST: 'highest magic ATK',
  PHY_DEF_LOWEST: 'lowest DEF',
  PHY_DEF_HIGHEST: 'highest DEF',
  MAG_DEF_LOWEST: 'lowest magic DEF',
  MAG_DEF_HIGHEST: 'highest magic DEF',
  RANDOM: 'at random',
};

// `SKILL_RANGE_TYPE` on a hitbox, and `SKILL_CAST_TARGET_SELECT_RANGE` on the
// cast.
export const SHAPE_LABEL: Record<string, string> = {
  X_AXIS: 'Line',
  CIRCLE: 'Circle',
  GLOBAL: 'Whole field',
  FRONT: 'front',
  CENTER: 'centre',
  ALL: 'anywhere',
};

// `SKILL_EVENT_TYPE`, minus `SPAWN_DISPATCHER` — the non-hitbox things a cast
// does, which is how a skill's movement and summons show up.
export const MOVE_LABEL: Record<string, string> = {
  SPAWN_SUMMON: 'summons',
  SPAWN_SUMMON_REPLACE: 'replaces its summon',
  MOVE_TO_TARGET: 'dashes to the target',
  MOVE_TO_DIRECTION: 'moves in a direction',
  MOVE_TO_SAVE_POSITION: 'returns to its position',
  LOOK_TARGET: 'turns to the target',
};

// `PASSIVE_TRIGGER_TYPE` — the battle event that fires a passive.
export const TRIGGER_LABEL: Record<string, string> = {
  TRIGGER_TYPE_BATTLE_START: 'Battle start',
  TRIGGER_TYPE_WAVE_START: 'Wave start',
  TRIGGER_TYPE_ACTOR_DEAD: 'On death',
  TRIGGER_TYPE_KILL: 'On kill',
  TRIGGER_TYPE_HIT: 'When hit',
  TRIGGER_TYPE_HIT_CRI: 'When crit',
  TRIGGER_TYPE_ATTACK: 'On attack',
  TRIGGER_TYPE_ATTACK_CRI: 'On critical hit',
  TRIGGER_TYPE_HEAL: 'On heal',
  TRIGGER_TYPE_USE_SKILL: 'On skill use',
  TRIGGER_TYPE_DURATION_CATEGORIZE_APPLY: 'When a state category is applied',
  TRIGGER_TYPE_DURATION_CATEGORIZE_DISPEL: 'When a state category is dispelled',
  TRIGGER_TYPE_DURATION_CATEGORIZE_EXPIRED: 'When a state category expires',
  TRIGGER_TYPE_DURATION_DEFINE_APPLY: 'When a state is applied',
  TRIGGER_TYPE_DURATION_DEFINE_DISPEL: 'When a state is dispelled',
  TRIGGER_TYPE_DURATION_DEFINE_EXPIRED: 'When a state expires',
  TRIGGER_TYPE_ONETIME_CATEGORY_APPLY: 'When an instant category lands',
  TRIGGER_TYPE_ONETIME_DEFINE_APPLY: 'When an instant lands',
  TRIGGER_TYPE_SUMMON: 'On summon',
  TRIGGER_TYPE_SUMMON_DEAD: 'When a summon dies',
  TRIGGER_TYPE_SUMMON_AFTER: 'After summoning',
  TRIGGER_TYPE_UNSUMMON: 'On unsummon',
  TRIGGER_TYPE_REPEAT_COOLTIME: 'On a timer',
};

// `PASSIVE_SETUP_CONDITION` — the party-composition gate on a stat grant.
export const SETUP_CONDITION_LABEL: Record<string, string> = {
  CHARACTER_ID_INCLUDED_PARTY: 'with a named partner in the party',
  CHARACTER_ID_EXCLUDED_PARTY: 'without a named partner in the party',
  ATTRIBUTE_COUNT_MORE_PARTY: 'with enough of one element in the party',
  ATTRIBUTE_COUNT_LESS_PARTY: 'with few enough of one element in the party',
  DIVISION_COUNT_MORE_PARTY: 'with enough of one division in the party',
  DIVISION_COUNT_LESS_PARTY: 'with few enough of one division in the party',
  ROLE_COUNT_MORE_PARTY: 'with enough of one role in the party',
  ROLE_COUNT_LESS_PARTY: 'with few enough of one role in the party',
  FACTION_COUNT_MORE_PARTY: 'with enough of one faction in the party',
  FACTION_COUNT_LESS_PARTY: 'with few enough of one faction in the party',
};

// `SCREAMING_SNAKE` -> `Screaming snake`. The fallback for any constant the
// tables above do not name, so a client update never renders a blank chip.
export function prettyConst(name: string): string {
  const words = name.toLowerCase().replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

export function labelOf(table: Record<string, string>, name: string | null): string {
  if (!name) return '';
  return table[name] ?? prettyConst(name);
}

// "8 hits · circle r2" — the geometry of one hitbox, as a single line. `ticks`
// is how many detections one spawn makes; `count` how many times the skill
// spawns it.
export function hitSummary(hit: SkillHit): string {
  const parts: string[] = [];
  const lands = hit.count * Math.max(1, hit.ticks);
  if (lands > 1) parts.push(`${lands} hits`);
  if (hit.shape === 'GLOBAL') parts.push('whole field');
  else if (hit.shape) parts.push(`${labelOf(SHAPE_LABEL, hit.shape).toLowerCase()} ${hit.range}`);
  if (hit.ticks > 1 && hit.cycle) parts.push(`every ${hit.cycle}s`);
  return parts.join(' · ');
}

// Singular of `TARGET_LABEL`, for the one-target phrasing below.
const TARGET_ONE: Record<string, string> = {
  ENEMY: 'enemy',
  FRIENDLY: 'ally',
  FRIENDLY_NOT_SELF: 'other ally',
  ALL_UNIT: 'unit',
  SUMMON_MINE: 'own summon',
  SUMMON_ENEMY: 'enemy summon',
  SUMMON_FRIENDLY: 'allied summon',
  SUMMON_ALL: 'summon',
};

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/**
 * "the nearest enemy in front" — where a hitbox anchors.
 *
 * This is the *cast target*, which is what the hitbox centres on, not who the
 * hit affects: CH0068's 파도 가르기 anchors on `SELF` and its work then picks
 * every enemy in the circle. Who is affected is on the operation.
 */
export function castSummary(cast: NonNullable<SkillHit['cast']>): string {
  if (!cast.team) return '';
  if (cast.team === 'SELF') return 'self';
  const one = TARGET_ONE[cast.team] ?? labelOf(TARGET_LABEL, cast.team);
  const many = labelOf(TARGET_LABEL, cast.team);
  const where = cast.range && cast.range !== 'ALL'
    ? ` in ${cast.range === 'CENTER' ? 'the centre' : labelOf(SHAPE_LABEL, cast.range)}`
    : '';

  if (cast.pick === 'ALL') return `every ${one}${where}`;
  if (cast.sort === 'RANDOM') {
    return cast.count > 1 ? `${cast.count} random ${many}${where}` : `a random ${one}${where}`;
  }
  const how = cast.sort ? ` ${labelOf(SORT_LABEL, cast.sort)}` : '';
  if (cast.pick === 'NTH_TARGET_SELECT') {
    return `the ${ORDINAL[cast.count] ?? `${cast.count}th`}${how} ${one}${where}`;
  }
  return cast.count > 1
    ? `the ${cast.count}${how} ${many}${where}`
    : `the${how} ${one}${where}`;
}

// `DURATION_CATEGORIZE_TYPE` and `ONETIME_CATEGORIZE_TYPE`, as a clear or an
// immunity names them.
export const CATEGORY_LABEL: Record<string, string> = {
  CATEGORIZE_BUFF: 'buffs',
  CATEGORIZE_DEBUFF: 'debuffs',
  CATEGORIZE_CC: 'crowd control',
  DAMAGE: 'damage',
  HEAL: 'healing',
  MOVE_CONTROL: 'displacement',
  DISPELL: 'dispels',
};

/**
 * One slot of a magnitude at skill level `level`, using the same growth the
 * game's own descriptions use — the extra step lands every `period` levels
 * rather than on every level above it.
 */
export function growValue(
  m: SkillMagnitude, level: number, period: number, slot = 0,
): number {
  const steps = Math.max(0, level - 1);
  const at = (xs: number[]) => xs[slot] ?? 0;
  // deliberately unrounded: rounding here and again at format time is what
  // makes a grown value disagree with the game's own printed number
  return at(m.base) + at(m.up) * steps
    + (period ? at(m.extra) * Math.floor(steps / period) : 0);
}

/**
 * "84%" — an operation's coefficients at one level, one per value slot that
 * holds something.
 *
 * A `*_RATE` stat is a coefficient on that stat, so it reads as a percentage;
 * anything else stays a raw number. This is the magnitude the operation
 * carries, **not** a predicted damage or heal — the arithmetic against a
 * defender is not decoded.
 *
 * A coefficient with no stat to apply to means nothing on its own: a dispel's
 * `1.0` is not "100% of" anything. Those return nothing.
 */
export function opAmounts(op: SkillOp, level: number, period: number): string[] {
  if (!op.value || !op.scale) return [];
  const pct = op.scale.endsWith('_RATE');
  return op.value.base
    .map((_v, slot) => growValue(op.value as SkillMagnitude, level, period, slot))
    .filter((v) => v !== 0)
    .map((v) => (pct ? `${sixSigFigs(v * 100)}%` : `${v}`));
}

// The generator renders the game's description numbers with `%g`, i.e. six
// significant figures. An operation's own coefficient has to round the same
// way or the two disagree on 실패한 파도타기's 276.333%.
function sixSigFigs(v: number): number {
  return Number(v.toPrecision(6));
}

/** "5s", or "5s every 3 levels"-free: just the duration at this level. */
export function opSeconds(op: SkillOp, level: number, period: number): string {
  if (!op.seconds) return '';
  const s = growValue(op.seconds, level, period);
  // 99999 is the table's "for the whole battle"
  if (!s || s >= 9999) return '';
  return `${s}s`;
}

// "+5%" — a passive's flat stat grant. Every `STAT_MULTIPLE_TYPE` a grant uses
// is a `*_RATE`, i.e. a coefficient on the stat rather than a flat amount, so a
// rate reads as a percentage and anything else stays a raw multiplier.
export function statAmount(stat: SkillStat): string {
  if (stat.scale && !stat.scale.endsWith('_RATE')) return `×${stat.multiple}`;
  const pct = sixSigFigs(stat.multiple * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

// "ATK of the caster" — what the magnitude scales off. Empty when the
// operation does not scale off a stat at all.
export function scaleSummary(op: SkillOp | SkillStat): string {
  if (!op.scale) return '';
  const stat = labelOf(STAT_LABEL, op.scale);
  const side = 'scaleOf' in op && op.scaleOf ? SIDE_LABEL[op.scaleOf] ?? '' : '';
  return side ? `${stat} of the ${side}` : stat;
}

// "buffs, crowd control" or the states a clear/immunity addresses. An internal
// marker has no name the game ever shows, so it is named as what it is rather
// than by printing its table id.
export const INTERNAL_STATE = 'an internal state';

export function detailSummary(detail: SkillDetail): string[] {
  if (detail.kind.endsWith('Category')) {
    return detail.values.map((v) => labelOf(CATEGORY_LABEL, v.name ?? v.id));
  }
  const named = detail.values.filter((v) => v.name).map((v) => v.name as string);
  const internal = detail.values.length - named.length;
  if (!internal) return named;
  return [...named, internal > 1 ? `${internal} internal states` : INTERNAL_STATE];
}

/**
 * "only Midwen Corporation", "below 10% HP", "with 3+ 중독" — the condition an
 * effect is only given under.
 *
 * The condition constant decides what its values mean, which is why this needs
 * the type tables. `SAME_ATTRIBUTE_TYPE` / `SAME_POSITION_TYPE` also carry a
 * value whose role is not decoded, so only the comparison is stated.
 */
export function gateSummary(gate: SkillGate, data: CharacterData): string {
  const [first, second] = gate.values;
  const id = first?.id ?? '';
  const state = first?.name ?? INTERNAL_STATE;
  const n = second?.id ?? '';
  const pct = `${Number((Number(id) * 100).toPrecision(6))}%`;
  const typed = (table: TypeTable) => typeLabel(data.types[table][id] ?? null) || id;
  const named = () => Object.values(data.characters)
    .find((c) => c.id === Number(id))?.name ?? id;
  const category = labelOf(CATEGORY_LABEL,
    DURATION_CATEGORY_CONST[id] ?? id);

  switch (gate.condition) {
    case 'HP_GREATER_OR_EQUAL': return `at ${pct} HP or more`;
    case 'HP_LESS_OR_EQUAL': return `at ${pct} HP or less`;
    case 'HP_GREATER_THAN': return `above ${pct} HP`;
    case 'HP_LESS_THAN': return `below ${pct} HP`;
    case 'HAS_DURATIONS':
    case 'HAS_ANY_DURATIONS': return `with ${state}`;
    case 'LACKS_DURATIONS':
    case 'LACKS_ANY_DURATIONS': return `without ${state}`;
    case 'HAS_DURATION_STACK_SAME': return `with exactly ${n} ${state}`;
    case 'HAS_DURATION_STACK_NOT_SAME': return `without exactly ${n} ${state}`;
    case 'HAS_DURATION_STACK_MORE': return `with ${n}+ ${state}`;
    case 'HAS_DURATION_TYPE': return `with any ${category}`;
    case 'LACKS_DURATION_TYPE': return `without any ${category}`;
    case 'SAME_ATTRIBUTE_TYPE': return 'of the same element';
    case 'NOT_SAME_ATTRIBUTE_TYPE': return 'of a different element';
    case 'SAME_POSITION_TYPE': return 'in the same position';
    case 'CONDITION_CHECK_CHARACTER_ID': return `only ${named()}`;
    case 'CONDITION_CHECK_CHARACTER_FACTION': return `only ${typed('faction')}`;
    case 'CONDITION_CHECK_CHARACTER_DIVISION': return `only ${typed('division')}`;
    default: return gate.condition ? prettyConst(gate.condition) : '';
  }
}

// `DURATION_CATEGORIZE_TYPE` by value, for the gates that carry the integer
// rather than the constant.
const DURATION_CATEGORY_CONST: Record<string, string> = {
  1: 'CATEGORIZE_BUFF', 2: 'CATEGORIZE_DEBUFF', 3: 'CATEGORIZE_CC',
};

// Skill text carries the game's own `<color=#rrggbb>…</color>` markup around
// the numbers it wants to highlight. Split it into coloured runs rather than
// injecting HTML.
const COLOR_RE = /<color=(#[0-9a-fA-F]{3,8})>([\s\S]*?)<\/color>/g;

export function colorRuns(text: string): { text: string; color?: string }[] {
  const out: { text: string; color?: string }[] = [];
  let at = 0;
  for (const m of text.matchAll(COLOR_RE)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[2], color: m[1] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// The icon that stands for one skin: its own thumbnail when the game ships
// one, otherwise the character portrait — standing rigs have no separate
// thumbnail because the portrait *is* the standing art.
export function skinIconNames(skin: SkinListEntry, entry: CharacterEntry | null): {
  skin: string[]; char: string[];
} {
  const key = skin.key.toUpperCase();
  return {
    skin: [`Thumbnail_${key}`, `Thumbnail_Icon_${key}`],
    char: [entry?.iconPath ?? '', `Icon_${skin.character}`].filter(Boolean),
  };
}

// Which rig families a character has, in the order the game lists them.
export const KIND_ORDER: SkinKind[] = ['standing', 'affection', 'desire', 'pleasure'];

// In-game category art for a rig family. Standing has no category icon of its
// own; the profile icon is what the game shows for the plain portrait.
export const KIND_ICON: Record<SkinKind, string> = {
  standing: 'Talk_Icon_Profile',
  affection: 'Talk_Icon_Affection',
  desire: 'Talk_Icon_Desire',
  pleasure: 'Talk_Icon_Pleasure',
};

export function skinsByCharacter(skins: SkinListEntry[]): Map<string, SkinListEntry[]> {
  const out = new Map<string, SkinListEntry[]>();
  for (const s of skins) {
    if (!s.character) continue;
    const list = out.get(s.character) ?? [];
    list.push(s);
    out.set(s.character, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
      || a.key.localeCompare(b.key));
  }
  return out;
}
