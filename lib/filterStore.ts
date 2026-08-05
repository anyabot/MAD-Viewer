// Held outside React because Next.js unmounts the page component on every route
// change, so component state cannot survive a trip to a character and back.
// In-memory only: a stale filter must not outlive the session.
import { create } from 'zustand';
import type { SkinKind } from '@/components/skinViewer/types';
import type { TypeTable } from '@/lib/characters';
import type { EffectGroup, EffectSelection } from '@/lib/effects';

type CharacterFilters = {
  query: string;
  npcs: boolean;
  unreleased: boolean;
  skinsOnly: boolean;
  star: number | null;
  picked: Partial<Record<TypeTable, number>>;
};

type SkinFilters = {
  query: string;
  kind: SkinKind | 'all';
  divergedOnly: boolean;
  selected: string | null;
};

type EffectFilters = {
  query: string;
  npcs: boolean;
  unreleased: boolean;
  picked: EffectSelection;
};

const EMPTY_CHARACTERS: CharacterFilters = {
  query: '', npcs: false, unreleased: false, skinsOnly: false, star: null, picked: {},
};

const EMPTY_SKINS: SkinFilters = {
  query: '', kind: 'all', divergedOnly: false, selected: null,
};

const EMPTY_EFFECTS: EffectFilters = {
  query: '', npcs: false, unreleased: false, picked: {},
};

type FilterStore = {
  characters: CharacterFilters;
  skins: SkinFilters;
  effects: EffectFilters;
  setCharacters: (patch: Partial<CharacterFilters>) => void;
  /**
   * The key is deleted rather than set to `undefined`: the page filters by
   * walking `Object.entries`, where a present-but-undefined entry matches no
   * character and empties the list.
   */
  toggleType: (table: TypeTable, value: number) => void;
  /**
   * Reset every other filter, so the list shows precisely the characters that
   * share this value. `npcs` is forced on for an NPC, which the list hides by
   * default and would otherwise open empty.
   */
  focusType: (table: TypeTable, value: number, npcs?: boolean) => void;
  focusStar: (star: number) => void;
  clearCharacterTypes: () => void;
  setSkins: (patch: Partial<SkinFilters>) => void;
  setEffects: (patch: Partial<EffectFilters>) => void;
  /** Chips inside a group are alternatives; the groups themselves all apply. */
  toggleEffect: (group: EffectGroup, value: string) => void;
  clearEffects: () => void;
};

export const useFilters = create<FilterStore>((set) => ({
  characters: EMPTY_CHARACTERS,
  skins: EMPTY_SKINS,
  setCharacters: (patch) => set((s) => ({ characters: { ...s.characters, ...patch } })),
  toggleType: (table, value) => set((s) => {
    const picked = { ...s.characters.picked };
    if (picked[table] === value) delete picked[table];
    else picked[table] = value;
    return { characters: { ...s.characters, picked } };
  }),
  focusType: (table, value, npcs) => set((s) => ({
    characters: {
      ...EMPTY_CHARACTERS, npcs: npcs || s.characters.npcs, picked: { [table]: value },
    },
  })),
  focusStar: (star) => set((s) => ({
    characters: { ...EMPTY_CHARACTERS, npcs: s.characters.npcs, star },
  })),
  clearCharacterTypes: () => set((s) => ({
    characters: { ...s.characters, picked: {}, star: null },
  })),
  setSkins: (patch) => set((s) => ({ skins: { ...s.skins, ...patch } })),
  effects: EMPTY_EFFECTS,
  setEffects: (patch) => set((s) => ({ effects: { ...s.effects, ...patch } })),
  toggleEffect: (group, value) => set((s) => {
    const picked = { ...s.effects.picked };
    const values = picked[group] ?? [];
    const next = values.includes(value)
      ? values.filter((v) => v !== value) : [...values, value];
    if (next.length) picked[group] = next;
    else delete picked[group];
    return { effects: { ...s.effects, picked } };
  }),
  clearEffects: () => set((s) => ({ effects: { ...s.effects, picked: {} } })),
}));
