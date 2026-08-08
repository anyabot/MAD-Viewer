// Node suites load this module directly: no runtime import through `@/`.
import type { SkinKind } from '@/components/skinViewer/types';
import type { Lang, Localized } from '@/lib/i18n';
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

export const TYPE_LABEL: Record<TypeTable, Localized> = {
  attribute: { en: 'Element', ko: '속성' },
  role: { en: 'Role', ko: '역할' },
  position: { en: 'Position', ko: '포지션' },
  division: { en: 'Division', ko: '진영' },
  faction: { en: 'Faction', ko: '소속' },
};

export function typeValue(entry: CharacterEntry, table: TypeTable): number | null {
  const v = entry[TYPE_FIELD[table]];
  return typeof v === 'number' ? v : null;
}

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

// `icon` alone is not always extractable, so the whole candidate list is preferred.
export function typeIcons(t: TypeEntry | null): string[] {
  if (!t) return [];
  return t.icons?.length ? t.icons : (t.icon ? [t.icon] : []);
}

// A row the generator's table does not cover yet still has to render.
export function typeLabel(t: TypeEntry | null, lang: Lang = 'en'): string {
  if (!t) return '';
  return lang === 'ko' ? (t.name || t.en || '') : (t.en || t.name);
}

// Only `Attribute_Icon_Data` carries a colour; its icons are flat white silhouettes the game tints.
export function typeTint(t: TypeEntry | null): string | null {
  return t?.color ?? null;
}

// `attribute` 0 is 모든 속성, a UI catch-all no character carries.
export function filterRows(
  types: CharacterData['types'], table: TypeTable,
): [string, TypeEntry][] {
  return Object.entries(types[table])
    .filter(([value]) => !(table === 'attribute' && value === '0'));
}

// `characterType` 1 is playable, 2 an NPC; only playable rows carry a rarity, role or faction.
export function isPlayable(entry: CharacterEntry): boolean {
  return entry.characterType === 1;
}

// A playable character and a non-character asset both go unbadged.
const ROSTER_NOTE: Record<string, Localized> = {
  unreleased: { en: 'UNRELEASED', ko: '미출시' },
  story: { en: 'STORY', ko: '스토리' },
  npc: { en: 'NPC', ko: 'NPC' },
};

export function rosterNote(
  entry: CharacterEntry | null, lang: Lang = 'en',
): { label: string; scheme: string } | null {
  if (!entry) return null;
  if (entry.unreleased) return { label: ROSTER_NOTE.unreleased[lang], scheme: 'purple' };
  if (entry.storyOnly) return { label: ROSTER_NOTE.story[lang], scheme: 'teal' };
  if (entry.characterType === 2) return { label: ROSTER_NOTE.npc[lang], scheme: 'gray' };
  return null;
}

// Only playable characters carry an English name, so an NPC reads Korean in either language.
export function characterName(entry: CharacterEntry | null, lang: Lang = 'en'): string {
  if (!entry) return '';
  const primary = lang === 'ko' ? entry.name : (entry.nameEn || entry.name);
  return primary || entry.code;
}

export function characterSubName(entry: CharacterEntry | null, lang: Lang = 'en'): string {
  if (!entry || !entry.nameEn) return '';
  return lang === 'ko' ? entry.nameEn : entry.name;
}

// The second English column is usually the same name in caps, so show it only when the two differ.
export function altNameEn(entry: CharacterEntry): string | null {
  const alt = entry.nameUppercase;
  if (!alt) return null;
  const plain = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return plain(alt) === plain(entry.nameEn ?? '') ? null : alt;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function birthdayText(entry: CharacterEntry, lang: Lang = 'en'): string | null {
  const b = entry.birthday;
  if (!b || b.length < 2 || !b[0]) return null;
  if (lang === 'ko') return `${b[0]}월 ${b[1]}일`;
  return `${MONTHS[b[0] - 1] ?? b[0]} ${b[1]}`;
}

// UTC, or a local midnight shifts the stored date a day either way.
export function lockedUntilText(iso: string, lang: Lang = 'en'): string {
  const at = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

// An id with no `items` row is dropped rather than rendered as a blank.
export function giftsOf(
  entry: CharacterEntry, items: CharacterData['items'],
): (ItemEntry & { id: number })[] {
  return (entry.giftItems ?? []).flatMap((id) => {
    const item = items[String(id)];
    return item ? [{ ...item, id }] : [];
  });
}

// Only the region is in the master data, so a character with no script falls back to the whole region.
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

// The master data has no English column for equipment slots.
const EQUIP_EN: Record<number, string> = {
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

export function equipLabel(
  slot: { type: number; name?: string | null }, lang: Lang = 'en',
): string {
  const own = slot.name ?? '';
  if (lang === 'ko') return own || EQUIP_EN[slot.type] || String(slot.type);
  return EQUIP_EN[slot.type] ?? own ?? String(slot.type);
}

export function equipmentSlotsOf(
  entry: CharacterEntry, equipment: CharacterData['equipment'],
): (EquipmentEntry & { type: number })[] {
  return (entry.equipmentSlots ?? []).flatMap((type) => {
    const slot = equipment[String(type)];
    return slot ? [{ ...slot, type }] : [];
  });
}

/** `level` is clamped to the tier's own cap. */
export type EquipInput = { type: number; tier: number; level: number };

export type StatInput = {
  level: number;
  star: number;
  /** Rank 1 is part of a unit's baseline; 0 reads the block without any affection. */
  love: number;
  equipment: EquipInput[];
};

// The terms are kept apart so the page can show where the number comes from.
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

// The game truncates toward zero rather than rounding.
function truncate(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

// Applied to the base block and the equipment delta separately: rounding only the total drifts from the game.
export function roundStat(display: number, value: number): number {
  if (display === 1) return truncate(value);
  if (display === 2) return truncate(value * 100) / 100;
  return value;
}

/** As the game prints it: a percentage when the display type is 2. */
export function statText(display: number, value: number): string {
  if (display === 2) return `${Number((value * 100).toFixed(2))}%`;
  return String(Number(value.toFixed(2)));
}

function tierOf(
  data: CharacterData, slot: EquipInput,
): EquipmentTier | null {
  return (data.equipment[String(slot.type)]?.tiers ?? [])
    .find((t) => t.tier === slot.tier) ?? null;
}

/** With the slot's level already applied. */
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

// A row per grade whatever the rarity, plus a cap row repeating the top grade; neither is reachable.
export function statGrades(entry: CharacterEntry, data: CharacterData): number[] {
  const floor = entry.defaultStar ?? 1;
  return Object.keys(entry.baseStats ?? {}).map(Number)
    .filter((g) => g >= floor && g <= data.statCaps.star)
    .sort((a, b) => a - b);
}

// `base = round(battle + perLevel * (level - 1))`, `equip = round(flat + base * fractional)`, plus affection ranks 1..love.
export function computeStats(
  entry: CharacterEntry, data: CharacterData, input: StatInput, lang: Lang = 'en',
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
      label: (lang === 'ko' ? type.name : type.en) || labelOf(STAT_LABEL, stat, lang),
      name: lang === 'ko' ? type.en : type.name,
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
export const BUFF_CATEGORY: Record<number, { label: Localized; scheme: string }> = {
  1: { label: { en: 'Buff', ko: '버프' }, scheme: 'green' },
  2: { label: { en: 'Debuff', ko: '디버프' }, scheme: 'red' },
  3: { label: { en: 'Control', ko: '군중 제어' }, scheme: 'purple' },
};

// `skill_categorize_type`, which is what the game groups slots by.
export const SKILL_CATEGORY_LABEL: Record<number, Localized> = {
  1: { en: 'Normal attack', ko: '일반 공격' },
  2: { en: 'Skill', ko: '스킬' },
  3: { en: 'Burst', ko: '버스트' },
  4: { en: 'Passive', ko: '패시브' },
  5: { en: 'Trigger', ko: '트리거' },
};

// A grade below the character's own rarity is still listed, which is what makes the passive's tiers visible.
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

// The master data carries grades 1..5 whatever the rarity, but a 3★ character can never be 1★ or 2★.
export function skillGrades(entry: CharacterEntry, data: CharacterData): number[] {
  const set = data.skillSets[String(entry.skillSetGroup ?? '')];
  if (!set) return [];
  const floor = entry.defaultStar ?? 1;
  return Object.keys(set).map(Number).filter((g) => g >= floor).sort((a, b) => a - b);
}

// English for the behaviour graph's enum constants; anything missing falls back to `prettyConst`.

// `ONETIME_EFFECT_TYPE` and `DURATION_EFFECT_TYPE` share one table and do not collide.
export const OP_LABEL: Record<string, Localized> = {
  MARKER: { en: 'Internal state', ko: '내부 상태' },
  EMPTY_EFFECT: { en: 'No effect', ko: '효과 없음' },
  ADD_DAMAGE: { en: 'Damage', ko: '피해' },
  ADD_HEAL: { en: 'Heal', ko: '회복' },
  ADD_FORCE_CRITICAL_DAMAGE: { en: 'Guaranteed critical', ko: '치명타 확정' },
  ADD_FORCE_PENETRATION_DAMAGE: { en: 'Guaranteed penetration', ko: '관통 확정' },
  REDUCE_BURST_COOLDOWN: { en: 'Burst cooldown down', ko: '버스트 재사용 대기 감소' },
  UNSUMMON: { en: 'Unsummon', ko: '소환 해제' },
  CLEAR_DURATION_DEFINE_ID: { en: 'Remove a named state', ko: '지정 상태 해제' },
  CLEAR_DURATION_CATEGORIZE_TYPE: { en: 'Cleanse', ko: '상태 정화' },
  CC_KNOCKBACK: { en: 'Knockback', ko: '넉백' },
  CC_HIT_REACTION: { en: 'Hit reaction', ko: '피격 경직' },
  SUMMON_HP: { en: 'Summon HP', ko: '소환수 체력' },
  BUFF_TOTAL_DAMAGE_BARRIER: { en: 'Shield', ko: '보호막' },
  BUFF_PHYSICS_ATTACK_UP: { en: 'Attack up', ko: '공격력 증가' },
  BUFF_PHYSICS_DEFEND_UP: { en: 'Defence up', ko: '방어력 증가' },
  BUFF_PHYSICS_CRITICAL_CHANCE_UP: { en: 'Crit rate up', ko: '치명 증가' },
  BUFF_PHYSICS_CRITICAL_POWER_ADD_UP: { en: 'Crit damage up', ko: '치명 피해 증가' },
  BUFF_EVASION_UP: { en: 'Evasion up', ko: '회피 증가' },
  BUFF_ACCURACY_UP: { en: 'Accuracy up', ko: '명중 증가' },
  BUFF_HEAL_UP: { en: 'Healing up', ko: '치유력 증가' },
  BUFF_MAX_HP_UP: { en: 'Max HP up', ko: '최대 체력 증가' },
  BUFF_WEIGHT_UP: { en: 'Weight up', ko: '무게 증가' },
  BUFF_TOUGHNESS_UP: { en: 'Toughness up', ko: '강인함 증가' },
  BUFF_PENETRATE_UP: { en: 'Penetration up', ko: '관통력 증가' },
  BUFF_PENETRATE_DEFENSE_UP: { en: 'Penetration resist up', ko: '관통 저항 증가' },
  BUFF_CRITICAL_CHANCE_RESIST: { en: 'Crit rate resist up', ko: '치명 저항 증가' },
  BUFF_CRITICAL_POWER_ADD_RESIST: { en: 'Crit damage resist up', ko: '치명 피해 저항 증가' },
  BUFF_HEAL_RECEIVE: { en: 'Healing received up', ko: '받는 치유량 증가' },
  BUFF_ATTACK_SPEED_UP: { en: 'Attack speed up', ko: '공격 속도 증가' },
  DAMAGE_REDUCE: { en: 'Damage taken down', ko: '받는 피해 감소' },
  DEBUFF_PHYSICS_ATTACK_DOWN: { en: 'Attack down', ko: '공격력 감소' },
  DEBUFF_PHYSICS_DEFEND_DOWN: { en: 'Defence down', ko: '방어력 감소' },
  DEBUFF_PHYSICS_CRITICAL_CHANCE_DOWN: { en: 'Crit rate down', ko: '치명 감소' },
  DEBUFF_PHYSICS_CRITICAL_POWER_ADD_DOWN: { en: 'Crit damage down', ko: '치명 피해 감소' },
  DEBUFF_EVASION_DOWN: { en: 'Evasion down', ko: '회피 감소' },
  DEBUFF_ACCURACY_DOWN: { en: 'Accuracy down', ko: '명중 감소' },
  DEBUFF_HEAL_DOWN: { en: 'Healing down', ko: '치유력 감소' },
  DEBUFF_TOUGHNESS_DOWN: { en: 'Toughness down', ko: '강인함 감소' },
  DEBUFF_PENETRATE_DOWN: { en: 'Penetration down', ko: '관통력 감소' },
  DEBUFF_PENETRATE_DEFENSE_DOWN: { en: 'Penetration resist down', ko: '관통 저항 감소' },
  DEBUFF_CRITICAL_CHANCE_RESIST: { en: 'Crit rate resist down', ko: '치명 저항 감소' },
  DEBUFF_CRITICAL_POWER_ADD_RESIST: { en: 'Crit damage resist down', ko: '치명 피해 저항 감소' },
  DEBUFF_HEAL_RECEIVE: { en: 'Healing received down', ko: '받는 치유량 감소' },
  DEBUFF_ATTACK_SPEED_DOWN: { en: 'Attack speed down', ko: '공격 속도 감소' },
  CC_PROVOKE: { en: 'Provoke', ko: '도발' },
  CC_CHARM: { en: 'Charm', ko: '매혹' },
  CC_FEAR: { en: 'Fear', ko: '공포' },
  CC_STUN: { en: 'Stun', ko: '기절' },
  CC_SILENCE: { en: 'Silence', ko: '침묵' },
  CC_BIND: { en: 'Bind', ko: '속박' },
  CC_FREEZE: { en: 'Freeze', ko: '빙결' },
  CC_GROGGY: { en: 'Groggy', ko: '그로기' },
  IMMUNE_PHYSICAL_DAMAGE: { en: 'Damage immunity', ko: '피해 면역' },
  IMMUNE_DURATION_DEFINE_ID: { en: 'Immune to a named state', ko: '지정 상태 면역' },
  IMMUNE_DURATION_CATEGORIZE_TYPE: { en: 'Immune to a state category', ko: '상태 계열 면역' },
  IMMUNE_ONETIME_DEFINE_ID: { en: 'Immune to a named instant', ko: '지정 즉시 효과 면역' },
  IMMUNE_ONETIME_CATEGORIZE_TYPE: {
    en: 'Immune to an instant category', ko: '즉시 효과 계열 면역',
  },
  OVERTIME_DAMAGE: { en: 'Damage over time', ko: '지속 피해' },
  OVERTIME_HEAL: { en: 'Heal over time', ko: '지속 회복' },
  EXCLUDE_CASTING_TARGET: { en: 'Cannot be targeted by casts', ko: '시전 대상에서 제외' },
  EXCLUDE_DETECTING_TARGET: { en: 'Cannot be hit', ko: '판정 대상에서 제외' },
};

// Falls back to the buff/debuff/CC category the state declares, so an unmapped op still gets a tone.
export const OP_SCHEME: Record<string, string> = {
  ADD_DAMAGE: 'red',
  OVERTIME_DAMAGE: 'red',
  ADD_HEAL: 'green',
  OVERTIME_HEAL: 'green',
  MARKER: 'gray',
  EMPTY_EFFECT: 'gray',
};

// `STAT_MULTIPLE_TYPE` on an op, and `STAT_TYPE` on a passive's stat grant.
export const STAT_LABEL: Record<string, Localized> = {
  ATTACK_RATE: { en: 'ATK', ko: '공격력' },
  PHYSICAL_ATTACK_RATE: { en: 'ATK', ko: '공격력' },
  MAGICAL_ATTACK_RATE: { en: 'magic ATK', ko: '마법 공격력' },
  TOTAL_ATTACK_RATE: { en: 'total ATK', ko: '총 공격력' },
  DEFENSE_RATE: { en: 'DEF', ko: '방어력' },
  PHYSICAL_DEFENSE_RATE: { en: 'DEF', ko: '방어력' },
  MAGICAL_DEFENSE_RATE: { en: 'magic DEF', ko: '마법 방어력' },
  MAX_LIFE_RATE: { en: 'max HP', ko: '최대 체력' },
  LIFE_RATE: { en: 'current HP', ko: '현재 체력' },
  CRITICAL_CHANCE_RATE: { en: 'crit rate', ko: '치명' },
  PHYSICAL_CRITICAL_CHANCE_RATE: { en: 'crit rate', ko: '치명' },
  MAGICAL_CRITICAL_CHANCE_RATE: { en: 'magic crit rate', ko: '마법 치명' },
  CRITICAL_POWER_ADD_RATE: { en: 'crit damage', ko: '치명 피해율' },
  PHYSICAL_CRITICAL_POWER_ADD_RATE: { en: 'crit damage', ko: '치명 피해율' },
  MAGICAL_CRITICAL_POWER_ADD_RATE: { en: 'magic crit damage', ko: '마법 치명 피해율' },
  ACCURACY_RATE: { en: 'accuracy', ko: '명중' },
  EVASION_RATE: { en: 'evasion', ko: '회피' },
  HEAL_RATE: { en: 'healing', ko: '치유력' },
  TOTAL_HEAL_RATE: { en: 'total healing', ko: '총 치유력' },
  HEAL_RECEIVE_RATE: { en: 'healing received', ko: '받는 치유량' },
  DAMAGE: { en: 'damage dealt', ko: '주는 피해' },
  ELEMENT_RATE: { en: 'element', ko: '속성' },
  ATTACK_SPEED_RATE: { en: 'attack speed', ko: '공격 속도' },
  ANI_ATTACK_SPEED_RATE: { en: 'animation speed', ko: '동작 속도' },
  COOL_TIME_RATE: { en: 'cooldown', ko: '재사용 대기시간' },
  RESIST_RATE: { en: 'resistance', ko: '저항' },
  PENETRATION_RATE: { en: 'penetration', ko: '관통력' },
  PENETRATION_DEFEND_RATE: { en: 'penetration resist', ko: '관통 저항' },
  CRITICAL_CHANCE_RESIST_RATE: { en: 'crit rate resist', ko: '치명 저항' },
  CRITICAL_POWER_ADD_RESIST_RATE: { en: 'crit damage resist', ko: '치명 피해 저항' },
  // STAT_TYPE
  PHYSICS_ATTACK: { en: 'Attack', ko: '공격력' },
  PHYSICS_DEFENSE: { en: 'Defence', ko: '방어력' },
  MAX_LIFE: { en: 'Max HP', ko: '최대 체력' },
  ACCURACY: { en: 'Accuracy', ko: '명중' },
  EVASION: { en: 'Evasion', ko: '회피' },
  PHYSICS_CRITICAL_CHANCE: { en: 'Crit rate', ko: '치명' },
  PHYSICS_CRITICAL_DAMAGE: { en: 'Crit damage', ko: '치명 피해율' },
  HEAL: { en: 'Healing', ko: '치유력' },
  WEIGHT: { en: 'Weight', ko: '무게' },
  RESIST_NORMAL_DEBUFF: { en: 'Debuff resist', ko: '해로운 효과 저항' },
  CRITICAL_CHANCE_RESIST: { en: 'Crit rate resist', ko: '치명 저항' },
  CRITICAL_POWER_ADD_RESIST: { en: 'Crit damage resist', ko: '치명 피해 저항률' },
  HEAL_RECEIVE: { en: 'Healing received', ko: '받는 치유량' },
  PENETRATION: { en: 'Penetration', ko: '관통력' },
  PENETRATION_DEFEND: { en: 'Penetration resist', ko: '관통 저항' },
  ATTACK_SPEED_NORMAL: { en: 'Attack speed', ko: '공격 속도' },
};

// `SKILL_TARGET_TYPE` on a cast or work, `CHECK_TARGET_TYPE` on a trigger; the two share every common name.
export const TARGET_LABEL: Record<string, Localized> = {
  SELF: { en: 'self', ko: '자신' },
  ENEMY: { en: 'enemies', ko: '적' },
  FRIENDLY: { en: 'allies', ko: '아군' },
  FRIENDLY_NOT_SELF: { en: 'other allies', ko: '자신 외 아군' },
  ALL_UNIT: { en: 'everyone', ko: '모든 유닛' },
  CAST_TARGET: { en: 'the cast target', ko: '시전 대상' },
  HOLDER: { en: 'the holder', ko: '보유자' },
  TRIGGER_TARGET: { en: 'the trigger target', ko: '발동 대상' },
  TRIGGER_INSTIGATOR: { en: 'the instigator', ko: '발동시킨 대상' },
  SUMMON_MINE: { en: 'own summons', ko: '자신의 소환수' },
  SUMMON_ENEMY: { en: 'enemy summons', ko: '적 소환수' },
  SUMMON_FRIENDLY: { en: 'allied summons', ko: '아군 소환수' },
  SUMMON_ALL: { en: 'all summons', ko: '모든 소환수' },
};

// `STAT_MULTIPLE_TARGET_TYPE` / `APPLY_TARGET_TYPE`: whose stat, and who it lands on.
export const SIDE_LABEL: Record<string, Localized> = {
  CASTER: { en: 'caster', ko: '시전자' },
  HOLDER: { en: 'target', ko: '대상' },
};

// `SKILL_TARGET_SORT_TYPE` — how a limited pick chooses between candidates.
export const SORT_LABEL: Record<string, Localized> = {
  DISTANCE_LOWEST: { en: 'nearest', ko: '가장 가까운' },
  DISTANCE_HIGHEST: { en: 'furthest', ko: '가장 먼' },
  HP_RATE_LOWEST: { en: 'lowest HP', ko: '체력이 가장 낮은' },
  HP_RATE_HIGHEST: { en: 'highest HP', ko: '체력이 가장 높은' },
  PHY_ATK_LOWEST: { en: 'lowest ATK', ko: '공격력이 가장 낮은' },
  PHY_ATK_HIGHEST: { en: 'highest ATK', ko: '공격력이 가장 높은' },
  MAG_ATK_LOWEST: { en: 'lowest magic ATK', ko: '마법 공격력이 가장 낮은' },
  MAG_ATK_HIGHEST: { en: 'highest magic ATK', ko: '마법 공격력이 가장 높은' },
  PHY_DEF_LOWEST: { en: 'lowest DEF', ko: '방어력이 가장 낮은' },
  PHY_DEF_HIGHEST: { en: 'highest DEF', ko: '방어력이 가장 높은' },
  MAG_DEF_LOWEST: { en: 'lowest magic DEF', ko: '마법 방어력이 가장 낮은' },
  MAG_DEF_HIGHEST: { en: 'highest magic DEF', ko: '마법 방어력이 가장 높은' },
  RANDOM: { en: 'at random', ko: '무작위' },
};

// `SKILL_RANGE_TYPE` on a hitbox, `SKILL_CAST_TARGET_SELECT_RANGE` on the cast.
export const SHAPE_LABEL: Record<string, Localized> = {
  X_AXIS: { en: 'Line', ko: '직선' },
  CIRCLE: { en: 'Circle', ko: '원형' },
  GLOBAL: { en: 'Whole field', ko: '전체 필드' },
  FRONT: { en: 'front', ko: '전방' },
  CENTER: { en: 'centre', ko: '중앙' },
  ALL: { en: 'anywhere', ko: '전 범위' },
};

// `SKILL_EVENT_TYPE` minus `SPAWN_DISPATCHER`: the non-hitbox things a cast does.
export const MOVE_LABEL: Record<string, Localized> = {
  SPAWN_SUMMON: { en: 'summons', ko: '소환' },
  SPAWN_SUMMON_REPLACE: { en: 'replaces its summon', ko: '소환수 교체' },
  MOVE_TO_TARGET: { en: 'dashes to the target', ko: '대상에게 돌진' },
  MOVE_TO_DIRECTION: { en: 'moves in a direction', ko: '지정 방향으로 이동' },
  MOVE_TO_SAVE_POSITION: { en: 'returns to its position', ko: '원위치로 복귀' },
  LOOK_TARGET: { en: 'turns to the target', ko: '대상을 바라봄' },
};

// `PASSIVE_TRIGGER_TYPE` — the battle event that fires a passive.
export const TRIGGER_LABEL: Record<string, Localized> = {
  TRIGGER_TYPE_BATTLE_START: { en: 'Battle start', ko: '전투 시작 시' },
  TRIGGER_TYPE_WAVE_START: { en: 'Wave start', ko: '웨이브 시작 시' },
  TRIGGER_TYPE_ACTOR_DEAD: { en: 'On death', ko: '사망 시' },
  TRIGGER_TYPE_KILL: { en: 'On kill', ko: '적 처치 시' },
  TRIGGER_TYPE_HIT: { en: 'When hit', ko: '피격 시' },
  TRIGGER_TYPE_HIT_CRI: { en: 'When crit', ko: '치명타 피격 시' },
  TRIGGER_TYPE_ATTACK: { en: 'On attack', ko: '공격 시' },
  TRIGGER_TYPE_ATTACK_CRI: { en: 'On critical hit', ko: '치명타 공격 시' },
  TRIGGER_TYPE_HEAL: { en: 'On heal', ko: '치유 시' },
  TRIGGER_TYPE_USE_SKILL: { en: 'On skill use', ko: '스킬 사용 시' },
  TRIGGER_TYPE_DURATION_CATEGORIZE_APPLY: {
    en: 'When a state category is applied', ko: '상태 계열 적용 시',
  },
  TRIGGER_TYPE_DURATION_CATEGORIZE_DISPEL: {
    en: 'When a state category is dispelled', ko: '상태 계열 해제 시',
  },
  TRIGGER_TYPE_DURATION_CATEGORIZE_EXPIRED: {
    en: 'When a state category expires', ko: '상태 계열 만료 시',
  },
  TRIGGER_TYPE_DURATION_DEFINE_APPLY: { en: 'When a state is applied', ko: '상태 적용 시' },
  TRIGGER_TYPE_DURATION_DEFINE_DISPEL: { en: 'When a state is dispelled', ko: '상태 해제 시' },
  TRIGGER_TYPE_DURATION_DEFINE_EXPIRED: { en: 'When a state expires', ko: '상태 만료 시' },
  TRIGGER_TYPE_ONETIME_CATEGORY_APPLY: {
    en: 'When an instant category lands', ko: '즉시 효과 계열 적중 시',
  },
  TRIGGER_TYPE_ONETIME_DEFINE_APPLY: { en: 'When an instant lands', ko: '즉시 효과 적중 시' },
  TRIGGER_TYPE_SUMMON: { en: 'On summon', ko: '소환 시' },
  TRIGGER_TYPE_SUMMON_DEAD: { en: 'When a summon dies', ko: '소환수 사망 시' },
  TRIGGER_TYPE_SUMMON_AFTER: { en: 'After summoning', ko: '소환 직후' },
  TRIGGER_TYPE_UNSUMMON: { en: 'On unsummon', ko: '소환 해제 시' },
  TRIGGER_TYPE_REPEAT_COOLTIME: { en: 'On a timer', ko: '일정 시간마다' },
};

// `PASSIVE_SETUP_CONDITION` — the party-composition gate on a stat grant.
export const SETUP_CONDITION_LABEL: Record<string, Localized> = {
  CHARACTER_ID_INCLUDED_PARTY: {
    en: 'with a named partner in the party', ko: '파티에 지정 캐릭터가 있을 때',
  },
  CHARACTER_ID_EXCLUDED_PARTY: {
    en: 'without a named partner in the party', ko: '파티에 지정 캐릭터가 없을 때',
  },
  ATTRIBUTE_COUNT_MORE_PARTY: {
    en: 'with enough of one element in the party', ko: '파티의 같은 속성이 일정 수 이상일 때',
  },
  ATTRIBUTE_COUNT_LESS_PARTY: {
    en: 'with few enough of one element in the party', ko: '파티의 같은 속성이 일정 수 이하일 때',
  },
  DIVISION_COUNT_MORE_PARTY: {
    en: 'with enough of one division in the party', ko: '파티의 같은 진영이 일정 수 이상일 때',
  },
  DIVISION_COUNT_LESS_PARTY: {
    en: 'with few enough of one division in the party', ko: '파티의 같은 진영이 일정 수 이하일 때',
  },
  ROLE_COUNT_MORE_PARTY: {
    en: 'with enough of one role in the party', ko: '파티의 같은 역할이 일정 수 이상일 때',
  },
  ROLE_COUNT_LESS_PARTY: {
    en: 'with few enough of one role in the party', ko: '파티의 같은 역할이 일정 수 이하일 때',
  },
  FACTION_COUNT_MORE_PARTY: {
    en: 'with enough of one faction in the party', ko: '파티의 같은 소속이 일정 수 이상일 때',
  },
  FACTION_COUNT_LESS_PARTY: {
    en: 'with few enough of one faction in the party', ko: '파티의 같은 소속이 일정 수 이하일 때',
  },
};

// `SCREAMING_SNAKE` -> `Screaming snake`, so a constant the tables miss never renders blank.
export function prettyConst(name: string): string {
  const words = name.toLowerCase().replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

export function labelOf(
  table: Record<string, Localized>, name: string | null, lang: Lang = 'en',
): string {
  if (!name) return '';
  const entry = table[name];
  return entry ? entry[lang] : prettyConst(name);
}

export function secondsText(value: number, lang: Lang = 'en'): string {
  return lang === 'ko' ? `${value}초` : `${value}s`;
}

export function everySecondsText(value: number, lang: Lang = 'en'): string {
  return lang === 'ko' ? `${value}초마다` : `every ${value}s`;
}

// `ticks` is detections per spawn, `count` how many times the skill spawns it.
export function hitSummary(hit: SkillHit, lang: Lang = 'en'): string {
  const parts: string[] = [];
  const lands = hit.count * Math.max(1, hit.ticks);
  if (lands > 1) parts.push(lang === 'ko' ? `${lands}회 타격` : `${lands} hits`);
  if (hit.shape === 'GLOBAL') parts.push(labelOf(SHAPE_LABEL, 'GLOBAL', lang).toLowerCase());
  else if (hit.shape) {
    const shape = labelOf(SHAPE_LABEL, hit.shape, lang);
    parts.push(`${lang === 'ko' ? shape : shape.toLowerCase()} ${hit.range}`);
  }
  if (hit.ticks > 1 && hit.cycle) parts.push(everySecondsText(hit.cycle, lang));
  return parts.join(' · ');
}

// Singular of `TARGET_LABEL`.
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

// What the hitbox centres on; who is affected is on the operation.
export function castSummary(
  cast: NonNullable<SkillHit['cast']>, lang: Lang = 'en',
): string {
  if (!cast.team) return '';
  if (lang === 'ko') return castSummaryKo(cast);
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

// The Korean reads modifier-first, so it is built rather than translated phrase by phrase.
function castSummaryKo(cast: NonNullable<SkillHit['cast']>): string {
  if (cast.team === 'SELF') return '자신';
  const who = labelOf(TARGET_LABEL, cast.team, 'ko');
  const where = cast.range && cast.range !== 'ALL'
    ? `${labelOf(SHAPE_LABEL, cast.range, 'ko')}의 `
    : '';
  if (cast.pick === 'ALL') return `${where}모든 ${who}`;
  const how = cast.sort ? `${labelOf(SORT_LABEL, cast.sort, 'ko')} ` : '';
  if (cast.pick === 'NTH_TARGET_SELECT') return `${where}${how}${who} 중 ${cast.count}번째`;
  return cast.count > 1 ? `${where}${how}${who} ${cast.count}명` : `${where}${how}${who}`;
}

// `DURATION_CATEGORIZE_TYPE` and `ONETIME_CATEGORIZE_TYPE`, as a clear or immunity names them.
export const CATEGORY_LABEL: Record<string, Localized> = {
  CATEGORIZE_BUFF: { en: 'buffs', ko: '버프' },
  CATEGORIZE_DEBUFF: { en: 'debuffs', ko: '디버프' },
  CATEGORIZE_CC: { en: 'crowd control', ko: '군중 제어' },
  DAMAGE: { en: 'damage', ko: '피해' },
  HEAL: { en: 'healing', ko: '치유' },
  MOVE_CONTROL: { en: 'displacement', ko: '이동 효과' },
  DISPELL: { en: 'dispels', ko: '해제 효과' },
};

// The extra step lands every `period` levels, as the game's own descriptions grow it.
export function growValue(
  m: SkillMagnitude, level: number, period: number, slot = 0,
): number {
  const steps = Math.max(0, level - 1);
  const at = (xs: number[]) => xs[slot] ?? 0;
  // Unrounded: rounding here and again at format time disagrees with the game's printed number.
  return at(m.base) + at(m.up) * steps
    + (period ? at(m.extra) * Math.floor(steps / period) : 0);
}

// The magnitude the operation carries, not a damage or heal; a coefficient with no stat returns nothing.
export function opAmounts(op: SkillOp, level: number, period: number): string[] {
  if (!op.value || !op.scale) return [];
  const pct = op.scale.endsWith('_RATE');
  return op.value.base
    .map((_v, slot) => growValue(op.value as SkillMagnitude, level, period, slot))
    .filter((v) => v !== 0)
    .map((v) => (pct ? `${sixSigFigs(v * 100)}%` : `${v}`));
}

// The generator renders description numbers with `%g`, so a coefficient must round the same way.
function sixSigFigs(v: number): number {
  return Number(v.toPrecision(6));
}

export function opSeconds(
  op: SkillOp, level: number, period: number, lang: Lang = 'en',
): string {
  if (!op.seconds) return '';
  const s = growValue(op.seconds, level, period);
  // 99999 is the table's "for the whole battle"
  if (!s || s >= 9999) return '';
  return secondsText(s, lang);
}

// A `*_RATE` is a coefficient on the stat, so it reads as a percentage.
export function statAmount(stat: SkillStat): string {
  if (stat.scale && !stat.scale.endsWith('_RATE')) return `×${stat.multiple}`;
  const pct = sixSigFigs(stat.multiple * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export function scaleSummary(op: SkillOp | SkillStat, lang: Lang = 'en'): string {
  if (!op.scale) return '';
  const stat = labelOf(STAT_LABEL, op.scale, lang);
  const side = 'scaleOf' in op && op.scaleOf
    ? labelOf(SIDE_LABEL, op.scaleOf, lang) : '';
  if (!side) return stat;
  return lang === 'ko' ? `${side}의 ${stat}` : `${stat} of the ${side}`;
}

// A marker has no name the game shows, so it is named rather than printed as a table id.
export const INTERNAL_STATE: Localized = { en: 'an internal state', ko: '내부 상태' };

export function detailSummary(detail: SkillDetail, lang: Lang = 'en'): string[] {
  if (detail.kind.endsWith('Category')) {
    return detail.values.map((v) => labelOf(CATEGORY_LABEL, v.name ?? v.id, lang));
  }
  const named = detail.values.filter((v) => v.name).map((v) => v.name as string);
  const internal = detail.values.length - named.length;
  if (!internal) return named;
  const more = lang === 'ko'
    ? `내부 상태 ${internal}종` : `${internal} internal states`;
  return [...named, internal > 1 ? more : INTERNAL_STATE[lang]];
}

// The condition constant decides what its values mean; `SAME_ATTRIBUTE_TYPE` / `SAME_POSITION_TYPE` carry an undecoded value.
export function gateSummary(
  gate: SkillGate, data: CharacterData, lang: Lang = 'en',
): string {
  const [first, second] = gate.values;
  const id = first?.id ?? '';
  const state = first?.name ?? INTERNAL_STATE[lang];
  const n = second?.id ?? '';
  const pct = `${Number((Number(id) * 100).toPrecision(6))}%`;
  const typed = (table: TypeTable) => typeLabel(data.types[table][id] ?? null, lang) || id;
  const named = () => {
    const c = Object.values(data.characters).find((entry) => entry.id === Number(id));
    return c ? characterName(c, lang) : id;
  };
  const category = labelOf(CATEGORY_LABEL, DURATION_CATEGORY_CONST[id] ?? id, lang);

  if (lang === 'ko') {
    switch (gate.condition) {
      case 'HP_GREATER_OR_EQUAL': return `체력 ${pct} 이상일 때`;
      case 'HP_LESS_OR_EQUAL': return `체력 ${pct} 이하일 때`;
      case 'HP_GREATER_THAN': return `체력 ${pct} 초과일 때`;
      case 'HP_LESS_THAN': return `체력 ${pct} 미만일 때`;
      case 'HAS_DURATIONS':
      case 'HAS_ANY_DURATIONS': return `${state} 보유 시`;
      case 'LACKS_DURATIONS':
      case 'LACKS_ANY_DURATIONS': return `${state} 미보유 시`;
      case 'HAS_DURATION_STACK_SAME': return `${state} 정확히 ${n}중첩일 때`;
      case 'HAS_DURATION_STACK_NOT_SAME': return `${state} ${n}중첩이 아닐 때`;
      case 'HAS_DURATION_STACK_MORE': return `${state} ${n}중첩 이상일 때`;
      case 'HAS_DURATION_TYPE': return `${category} 보유 시`;
      case 'LACKS_DURATION_TYPE': return `${category} 미보유 시`;
      case 'SAME_ATTRIBUTE_TYPE': return '같은 속성일 때';
      case 'NOT_SAME_ATTRIBUTE_TYPE': return '다른 속성일 때';
      case 'SAME_POSITION_TYPE': return '같은 포지션일 때';
      case 'CONDITION_CHECK_CHARACTER_ID': return `${named()}만`;
      case 'CONDITION_CHECK_CHARACTER_FACTION': return `${typed('faction')}만`;
      case 'CONDITION_CHECK_CHARACTER_DIVISION': return `${typed('division')}만`;
      default: return gate.condition ? prettyConst(gate.condition) : '';
    }
  }

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

// `DURATION_CATEGORIZE_TYPE` by value, for gates carrying the integer rather than the constant.
const DURATION_CATEGORY_CONST: Record<string, string> = {
  1: 'CATEGORIZE_BUFF', 2: 'CATEGORIZE_DEBUFF', 3: 'CATEGORIZE_CC',
};

// Skill text carries the game's own markup; it becomes runs rather than HTML.
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

// A standing rig has no thumbnail: the portrait is the standing art.
export function skinIconNames(skin: SkinListEntry, entry: CharacterEntry | null): {
  skin: string[]; char: string[];
} {
  const key = skin.key.toUpperCase();
  return {
    skin: [`Thumbnail_${key}`, `Thumbnail_Icon_${key}`],
    char: [entry?.iconPath ?? '', `Icon_${skin.character}`].filter(Boolean),
  };
}

// The order the game lists rig families in.
export const KIND_ORDER: SkinKind[] = ['standing', 'affection', 'desire', 'pleasure'];

// Standing has no category icon of its own; the game shows the profile one.
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
