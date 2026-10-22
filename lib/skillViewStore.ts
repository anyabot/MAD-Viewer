import { createPersisted } from '@altterisk/game-hub/persist';
import { create } from 'zustand';

export type SkillView = { buffs: boolean; prose: boolean; details: boolean };

const DEFAULT: SkillView = { buffs: true, prose: true, details: false };

const stored = createPersisted<SkillView>({
  key: 'mad.skillView', version: 1, empty: () => DEFAULT,
  sanitize: (raw) => {
    const doc = (raw && typeof raw === 'object' ? raw : {}) as Partial<SkillView>;
    return {
      buffs: doc.buffs !== false,
      prose: doc.prose !== false,
      details: doc.details === true,
    };
  },
});

type SkillViewStore = SkillView & { toggle: (key: keyof SkillView) => void };

export const useSkillView = create<SkillViewStore>((set) => ({
  ...DEFAULT,
  toggle: (key) => set((s) => {
    const next = { buffs: s.buffs, prose: s.prose, details: s.details, [key]: !s[key] };
    stored.save(next);
    return { [key]: next[key] };
  }),
}));

export function restoreSkillView(): void {
  useSkillView.setState(stored.load());
}
