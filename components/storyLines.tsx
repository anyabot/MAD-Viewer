import { Fragment } from 'react';
import NextLink from 'next/link';
import { Box, Flex, IconButton, Text, VStack } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import type { CharacterData, IconManifest, StoryLine } from '@/lib/data';
import type { GameLang } from '@/lib/gameText';
import { useT } from '@/lib/i18n';
import { playVoice, type VoiceIndex } from '@/lib/voice';

const PLAYER = '{player}';

export function PlayerText({ text }: { text: string }) {
  const t = useT();
  if (!text.includes(PLAYER)) return <>{text}</>;
  return (
    <>
      {text.split(PLAYER).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <Box as="span" color="yellow.300" fontWeight="semibold">{t('storyPlayer')}</Box>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

export function SceneLines({ lines, chars, icons, voice, lang }: {
  lines: StoryLine[]; chars: CharacterData | null; icons: IconManifest | null;
  voice: VoiceIndex | null; lang: GameLang;
}) {
  const t = useT();
  if (!lines.length) return <Text fontSize="sm" color="gray.500">{t('storyNoText')}</Text>;
  return (
    <VStack align="stretch" spacing={2} maxW="48rem" mx="auto" lang={lang}>
      {lines.map((line, i) => {
        if (line.k === 'place') {
          return (
            <Text key={i} fontSize="xs" color="gray.500" textAlign="center" letterSpacing="wide" py={1}>
              — <PlayerText text={line.t} /> —
            </Text>
          );
        }
        if (line.k === 'narration') {
          return (
            <Text key={i} fontSize="sm" color="gray.400" fontStyle="italic" whiteSpace="pre-wrap">
              <PlayerText text={line.t} />
            </Text>
          );
        }
        if (line.k === 'choice') {
          return (
            <Box key={i} fontSize="sm" px={3} py={1.5} borderLeftWidth="3px" borderColor="yellow.400"
              bg="whiteAlpha.50" whiteSpace="pre-wrap"><PlayerText text={line.t} /></Box>
          );
        }
        const entry = line.c ? chars?.characters[line.c] : undefined;
        const playable = entry?.characterType === 1;
        return (
          <Flex key={i} gap={2} align="start">
            <GameIcon manifest={icons} group="char"
              names={line.c ? [entry?.iconPath, `Icon_${line.c}`] : []}
              size={8} borderRadius="full" mt={0.5} />
            <Box minW={0} flex="1">
              {line.n && (
                <Text fontSize="xs" fontWeight="bold" color={playable ? 'yellow.300' : 'gray.300'}
                  as={playable ? NextLink : undefined}
                  {...(playable ? { href: `/character?code=${line.c}` } : {})}>
                  {line.n}
                </Text>
              )}
              <Text fontSize="sm" whiteSpace="pre-wrap"><PlayerText text={line.t} /></Text>
            </Box>
            {line.v && voice?.clips[line.v] && (
              <IconButton aria-label={t('storyPlayVoice')} size="xs" variant="ghost"
                icon={<Box as="span" aria-hidden>▶</Box>}
                onClick={() => { void playVoice(voice, line.v!); }} />
            )}
          </Flex>
        );
      })}
    </VStack>
  );
}
