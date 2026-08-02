// Shared reads over the character master data: which type row a character
// points at, which icon stands for a skin, and the filter axes the character
// list offers. Kept out of the pages so the gallery, the list and the
// character page agree on every label.
import type { SkinKind } from '@/components/skinViewer/types';
import type { CharacterData, CharacterEntry, SkinListEntry, TypeEntry } from '@/lib/data';

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

export function birthdayText(entry: CharacterEntry): string | null {
  const b = entry.birthday;
  if (!b || b.length < 2 || !b[0]) return null;
  return `${b[0]}월 ${b[1]}일`;
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
