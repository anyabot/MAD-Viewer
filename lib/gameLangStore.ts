// No import from `lib/i18n`: that module reads this store, so the dependency runs one way.
import { create } from 'zustand';

export type GameLang = 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'th' | 'es';
export type GameLangChoice = GameLang | 'auto';

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
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = (
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`
).replace(/\/$/, '');

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
    if (choice !== 'auto') void ensureTextTable(choice);
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
    if (saved !== 'auto') void ensureTextTable(saved as GameLang);
  }
}

// Korean game string -> the same string in a locale the older data files do not carry.
export const useTextTables = create<{ tables: Partial<Record<GameLang, Record<string, string>>>; version: number }>(
  () => ({ tables: {}, version: 0 }));

const loading = new Set<GameLang>();

export async function ensureTextTable(lang: GameLang): Promise<void> {
  if (lang === 'ko' || lang === 'en' || loading.has(lang)) return;
  loading.add(lang);
  try {
    const res = await fetch(`${DATA_BASE}/text/${lang}.json`);
    if (!res.ok) return;
    const table = await res.json() as Record<string, string>;
    useTextTables.setState((s) => ({ tables: { ...s.tables, [lang]: table }, version: s.version + 1 }));
  } catch {
    loading.delete(lang);
  }
}
