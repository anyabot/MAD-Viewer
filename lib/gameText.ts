// In-game text follows its own setting; the site's own labels stay on the UI language.
import { create } from 'zustand';
import { useLang, type Lang } from '@/lib/i18n';

export type GameLang = 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'th' | 'es';
export type GameLangChoice = GameLang | 'auto';
export type GameLocalized = Partial<Record<GameLang, string>>;

export const GAME_LANGS: { value: GameLang; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'th', label: 'ไทย' },
  { value: 'es', label: 'Español' },
];

const STORAGE_KEY = 'mad.gameLang';

type GameLangStore = { choice: GameLangChoice; setChoice: (choice: GameLangChoice) => void };

export const useGameLangStore = create<GameLangStore>((set) => ({
  choice: 'auto',
  setChoice: (choice) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // private mode or a blocked store: the choice just does not persist
    }
    set({ choice });
  },
}));

export function restoreGameLang(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (saved && (saved === 'auto' || GAME_LANGS.some((l) => l.value === saved))) {
    useGameLangStore.setState({ choice: saved as GameLangChoice });
  }
}

export function resolveGameLang(choice: GameLangChoice, ui: Lang): GameLang {
  return choice === 'auto' ? ui : choice;
}

export function useGameLang(): GameLang {
  const ui = useLang();
  const choice = useGameLangStore((s) => s.choice);
  return resolveGameLang(choice, ui);
}

export function gameText(value: GameLocalized | null | undefined, lang: GameLang): string {
  if (!value) return '';
  return value[lang] || value.en || value.ko || '';
}
