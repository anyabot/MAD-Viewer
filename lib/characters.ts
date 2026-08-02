// Shared reads over the character master data: which type row a character
// points at, which icon stands for a skin, and the filter axes the character
// list offers. Kept out of the pages so the gallery, the list and the
// character page agree on every label.
import type { SkinKind } from '@/components/skinViewer/types';
import type {
  CharacterData, CharacterEntry, EquipmentEntry, ItemEntry, PlaceEntry, SkillEntry,
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

// Date venues for a character: every venue in the division(s) the character's
// dates are chosen from. The game records the preference per region, not per
// venue, so this is the whole region's list — not one favourite.
export function datePlacesOf(
  entry: CharacterEntry, places: CharacterData['places'],
): { division: number; places: PlaceEntry[] }[] {
  return (entry.dateDivisions ?? []).map((division) => ({
    division, places: places[String(division)] ?? [],
  }));
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
