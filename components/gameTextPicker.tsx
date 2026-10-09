import { HStack, Select, Text } from '@chakra-ui/react';
import { GAME_LANGS, useGameLangStore, type GameLangChoice } from '@/lib/gameText';
import { useT } from '@/lib/i18n';

export function GameTextPicker() {
  const t = useT();
  const choice = useGameLangStore((s) => s.choice);
  const setChoice = useGameLangStore((s) => s.setChoice);
  return (
    <HStack spacing={2}>
      <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">{t('gameText')}</Text>
      <Select size="sm" w="auto" value={choice} aria-label={t('gameText')}
        onChange={(e) => setChoice(e.target.value as GameLangChoice)}>
        <option value="auto">{t('gameTextAuto')}</option>
        {GAME_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </Select>
    </HStack>
  );
}
