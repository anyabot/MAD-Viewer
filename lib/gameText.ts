// In-game text follows its own setting; the site's own labels stay on the UI language.
import { useLang, type Lang } from '@/lib/i18n';
import { useGameLangStore, type GameLang, type GameLangChoice } from '@/lib/gameLangStore';

export { GAME_LANGS, restoreGameLang, useGameLangStore } from '@/lib/gameLangStore';
export type { GameLang, GameLangChoice } from '@/lib/gameLangStore';
export type GameLocalized = Partial<Record<GameLang, string>>;

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
