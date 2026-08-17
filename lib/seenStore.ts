// Mirrored into `localStorage`, but the store starts empty so the exported HTML and the first client render agree.
import { create } from 'zustand';

const STORAGE_KEY = 'mad.seen';

export type SeenState = {
  /** Notice key -> it has been shown and dismissed once. */
  seen: Record<string, true>;
};

type SeenStore = SeenState & {
  ready: boolean;
  /** No record at all when the page loaded: nothing to catch this visitor up on. */
  fresh: boolean;
  markSeen: (key: string) => void;
  reset: (key: string) => void;
};

function persist(state: SeenState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode or a blocked store: the notice simply shows again
  }
}

export const useSeen = create<SeenStore>((set) => ({
  seen: {},
  ready: false,
  fresh: false,
  markSeen: (key) => set((s) => {
    if (s.seen[key]) return {};
    const next = { seen: { ...s.seen, [key]: true as const } };
    persist(next);
    return next;
  }),
  reset: (key) => set((s) => {
    const seen = { ...s.seen };
    delete seen[key];
    persist({ seen });
    return { seen };
  }),
}));

/** Only after `restoreSeen` has run, so a first paint never flashes a notice. */
export function useShouldShow(key: string): boolean {
  return useSeen((s) => s.ready && !s.seen[key]);
}

function flags(value: unknown): Record<string, true> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, on]) => on === true)
    .map(([key]) => [key, true]));
}

export function restoreSeen(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    useSeen.setState({ ready: true, fresh: true });
    return;
  }
  try {
    const doc = saved ? JSON.parse(saved) as Partial<SeenState> : {};
    const seen = flags(doc.seen);
    useSeen.setState({ seen, ready: true, fresh: Object.keys(seen).length === 0 });
  } catch {
    useSeen.setState({ ready: true, fresh: true });
  }
}
