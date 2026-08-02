// Filter state for the two list pages, held outside React so navigating to a
// character and back restores the search rather than resetting it. Next.js
// unmounts the page component on every route change, so component state cannot
// survive the round trip; this store can.
//
// Deliberately in-memory only: it is a "where was I" convenience for one
// session, not a saved preference, and persisting it would make a stale filter
// outlive the reason for it.
import { create } from 'zustand';
import type { SkinKind } from '@/components/skinViewer/types';
import type { TypeTable } from '@/lib/characters';

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

const EMPTY_CHARACTERS: CharacterFilters = {
  query: '', npcs: false, unreleased: false, skinsOnly: false, star: null, picked: {},
};

const EMPTY_SKINS: SkinFilters = {
  query: '', kind: 'all', divergedOnly: false, selected: null,
};

type FilterStore = {
  characters: CharacterFilters;
  skins: SkinFilters;
  setCharacters: (patch: Partial<CharacterFilters>) => void;
  /**
   * Select a type value, or clear it when it is already selected. The key is
   * **deleted** rather than set to `undefined`: the page filters by walking
   * `Object.entries`, where a present-but-undefined entry would match no
   * character and empty the list.
   */
  toggleType: (table: TypeTable, value: number) => void;
  clearCharacterTypes: () => void;
  setSkins: (patch: Partial<SkinFilters>) => void;
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
  clearCharacterTypes: () => set((s) => ({
    characters: { ...s.characters, picked: {}, star: null },
  })),
  setSkins: (patch) => set((s) => ({ skins: { ...s.skins, ...patch } })),
}));
