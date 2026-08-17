// Mirrored into `localStorage`, but the store starts empty so the exported HTML and the first client render agree.
import { create } from 'zustand';

const STORAGE_KEY = 'mad.tutorial';

export type TutorialState = {
  /** Tutorial key -> it has been shown and dismissed once. */
  seen: Record<string, true>;
};

type TutorialStore = TutorialState & {
  ready: boolean;
  markSeen: (key: string) => void;
  reset: (key: string) => void;
};

function persist(state: TutorialState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode or a blocked store: the tutorial simply shows again
  }
}

export const useTutorial = create<TutorialStore>((set) => ({
  seen: {},
  ready: false,
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

/** Only after `restoreTutorial` has run, so a first paint never flashes it. */
export function useShouldShow(key: string): boolean {
  return useTutorial((s) => s.ready && !s.seen[key]);
}

function flags(value: unknown): Record<string, true> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, on]) => on === true)
    .map(([key]) => [key, true]));
}

export function restoreTutorial(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    useTutorial.setState({ ready: true });
    return;
  }
  try {
    const doc = saved ? JSON.parse(saved) as Partial<TutorialState> : {};
    useTutorial.setState({ seen: flags(doc.seen), ready: true });
  } catch {
    useTutorial.setState({ ready: true });
  }
}
