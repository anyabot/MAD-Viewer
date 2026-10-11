// No import from `lib/i18n`: that module reads this store, so the dependency runs one way.
import { createJsonLoader, trimSlash } from '@altterisk/game-hub/data';
import { createPersisted } from '@altterisk/game-hub/persist';
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

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = trimSlash(
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`,
);

type GameLangStore = { choice: GameLangChoice; setChoice: (choice: GameLangChoice) => void };

const storedChoice = createPersisted<GameLangChoice>({
  key: 'mad.gameLang', version: 1, empty: () => 'auto',
  sanitize: (raw) => (GAME_LANGS.some((l) => l.value === raw) ? raw as GameLang : 'auto'),
});

export const useGameLangStore = create<GameLangStore>((set) => ({
  choice: 'auto',
  setChoice: (choice) => {
    storedChoice.save(choice);
    set({ choice });
    if (choice !== 'auto') void ensureTextTable(choice);
  },
}));

export function restoreGameLang(): void {
  const choice = storedChoice.load();
  useGameLangStore.setState({ choice });
  if (choice !== 'auto') void ensureTextTable(choice);
}

// Korean game string -> the same string in a locale the older data files do not carry.
export const useTextTables = create<{ tables: Partial<Record<GameLang, Record<string, string>>>; version: number }>(
  () => ({ tables: {}, version: 0 }));

const textTables = createJsonLoader({ urls: (lang) => [`${DATA_BASE}/text/${lang}.json`] });

export async function ensureTextTable(lang: GameLang): Promise<void> {
  if (lang === 'ko' || lang === 'en' || textTables.peek(lang)) return;
  try {
    const table = await textTables.load<Record<string, string>>(lang);
    useTextTables.setState((s) => ({ tables: { ...s.tables, [lang]: table }, version: s.version + 1 }));
  } catch {
    // the table stays missing and the Korean string shows
  }
}
