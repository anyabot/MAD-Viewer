import { useEffect, useState } from 'react';
import {
  Badge, Box, Center, Flex, IconButton, SimpleGrid, Spinner, Text, VStack,
} from '@chakra-ui/react';
import { Panel } from '@/components/skillKit';
import { loadVoice, loadVoiceLines, type VoiceLine } from '@/lib/data';
import { gameText, useGameLang } from '@/lib/gameText';
import { pick, useLang, useT, type Localized } from '@/lib/i18n';
import { playVoice, type VoiceIndex } from '@/lib/voice';

const SECTION: { key: string; match: (cat: string) => boolean; label: Localized }[] = [
  { key: 'lobby', match: (c) => c.startsWith('lobby_'), label: { en: 'Lobby', ko: '로비' } },
  { key: 'scene', match: (c) => c === 'affection_lobby' || c === 'desire_lobby', label: { en: 'Affection & Desire lobby', ko: '어펙션·디자이어 로비' } },
  { key: 'menu', match: (c) => c.startsWith('outgame_'), label: { en: 'Menus', ko: '메뉴' } },
  { key: 'battle', match: (c) => c.startsWith('ingame_'), label: { en: 'Battle', ko: '전투' } },
  { key: 'event', match: (c) => c.startsWith('event_'), label: { en: 'Event', ko: '이벤트' } },
];

const WORD: Record<string, Localized> = {
  enter: { en: 'Enter', ko: '입장' }, touch: { en: 'Touch', ko: '터치' },
  birthday: { en: 'Birthday', ko: '생일' }, newyear: { en: 'New Year', ko: '새해' },
  valentine: { en: 'Valentine', ko: '발렌타인' }, halloween: { en: 'Halloween', ko: '할로윈' },
  christmas: { en: 'Christmas', ko: '크리스마스' }, summer: { en: 'Summer', ko: '여름' },
  charget: { en: 'Obtained', ko: '획득' }, select: { en: 'Selected', ko: '선택' },
  charlv: { en: 'Level up', ko: '레벨 업' }, skilllv: { en: 'Skill up', ko: '스킬 강화' },
  rankup: { en: 'Bond up', ko: '유대 상승' }, starup: { en: 'Star up', ko: '성급 상승' },
  gift: { en: 'Gift', ko: '선물' }, profile: { en: 'Profile', ko: '프로필' },
  dispatch: { en: 'Dispatch', ko: '파견' }, list: { en: 'List', ko: '목록' },
  win: { en: 'Victory', ko: '승리' }, lose: { en: 'Defeat', ko: '패배' }, die: { en: 'Down', ko: '전투 불능' },
  move: { en: 'Move', ko: '이동' }, skill: { en: 'Skill', ko: '스킬' }, burst: { en: 'Burst', ko: '버스트' },
  shop: { en: 'Shop', ko: '상점' }, buy: { en: 'Buy', ko: '구매' }, mission: { en: 'Mission', ko: '미션' },
  cleared: { en: 'Cleared', ko: '완료' }, end: { en: 'after the end', ko: '종료 후' },
  affection: { en: 'Affection', ko: '어펙션' }, desire: { en: 'Desire', ko: '디자이어' },
};
const SKIP = new Set(['lobby', 'outgame', 'ingame', 'event']);

function catLabel(cat: string, lang: 'en' | 'ko'): string {
  return cat.split('_').filter((w) => !SKIP.has(w))
    .map((w) => (WORD[w] ? pick(WORD[w], lang) : w)).join(' ');
}

export function VoiceLines({ code }: { code: string }) {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const [lines, setLines] = useState<VoiceLine[] | null>(null);
  const [voice, setVoice] = useState<VoiceIndex | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadVoiceLines().then((d) => setLines(d.characters[code] ?? [])).catch(() => setError(true));
    loadVoice().then(setVoice).catch(() => setVoice(null));
  }, [code]);

  if (error) return <Text color="red.400" fontSize="sm">{t('voiceMissing')}</Text>;
  if (!lines) return <Center py={10}><Spinner /></Center>;

  return (
    <VStack align="stretch" spacing={3}>
      {SECTION.map((section) => {
        const rows = lines.filter((l) => section.match(l.cat));
        if (!rows.length) return null;
        return (
          <Panel key={section.key} title={pick(section.label, lang)} note={String(rows.length)}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={2}>
              {rows.map((line) => (
                <Flex key={line.id} gap={2} align="start" p={2} borderRadius="md" bg="whiteAlpha.50">
                  <IconButton aria-label={t('storyPlayVoice')} size="xs" variant="outline"
                    icon={<Box as="span" aria-hidden>▶</Box>} isDisabled={!voice?.clips[line.id]}
                    onClick={() => { void playVoice(voice, line.id); }} />
                  <Box minW={0} flex="1">
                    <Badge fontSize="0.55rem" textTransform="none" mb={0.5}>{catLabel(line.cat, lang)}</Badge>
                    {line.text && (
                      <Text fontSize="sm" whiteSpace="pre-wrap" lang={gameLang}>{gameText(line.text, gameLang)}</Text>
                    )}
                  </Box>
                </Flex>
              ))}
            </SimpleGrid>
          </Panel>
        );
      })}
    </VStack>
  );
}
