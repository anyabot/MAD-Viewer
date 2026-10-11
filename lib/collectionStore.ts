import { createPersisted } from '@altterisk/game-hub/persist';
import { create } from 'zustand';

type CollectionState = {
  collected: Record<string, true>;
  favorites: Record<string, true>;
};

type CollectionStore = CollectionState & {
  ready: boolean;
  setCollected: (code: string, value: boolean) => void;
  setCollectedMany: (codes: string[], value: boolean) => void;
  setFavorite: (code: string, value: boolean) => void;
};

const EMPTY: CollectionState = { collected: {}, favorites: {} };

function sanitize(raw: unknown): CollectionState {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Partial<CollectionState>;
  return { collected: flags(doc.collected), favorites: flags(doc.favorites) };
}

const stored = createPersisted<CollectionState>({
  key: 'mad.collection', version: 1, empty: () => EMPTY, sanitize,
});

// A blocked store leaves the collection available for this session.
function persist(state: CollectionState): void {
  stored.save(state);
}

function withFlag(flags: Record<string, true>, code: string, value: boolean): Record<string, true> {
  const next = { ...flags };
  if (value) next[code] = true;
  else delete next[code];
  return next;
}

export const useCollection = create<CollectionStore>((set) => ({
  ...EMPTY,
  ready: false,
  setCollected: (code, value) => set((state) => {
    const next = { collected: withFlag(state.collected, code, value), favorites: state.favorites };
    persist(next);
    return next;
  }),
  setCollectedMany: (codes, value) => set((state) => {
    const collected = { ...state.collected };
    for (const code of codes) {
      if (value) collected[code] = true;
      else delete collected[code];
    }
    const next = { collected, favorites: state.favorites };
    persist(next);
    return next;
  }),
  setFavorite: (code, value) => set((state) => {
    const next = { collected: state.collected, favorites: withFlag(state.favorites, code, value) };
    persist(next);
    return next;
  }),
}));

function flags(value: unknown): Record<string, true> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, enabled]) => enabled === true)
    .map(([code]) => [code, true]));
}

export function collectionRecord(): CollectionState {
  const { collected, favorites } = useCollection.getState();
  return { collected, favorites };
}

/** Replaces the whole record, as a restore would, and persists it. */
export function importCollection(doc: unknown): void {
  const next = sanitize(doc);
  persist(next);
  useCollection.setState({ ...next, ready: true });
}

export function restoreCollection(): void {
  useCollection.setState({ ...stored.load(), ready: true });
}
