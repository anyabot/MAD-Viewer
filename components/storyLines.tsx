import { Fragment } from 'react';
import NextLink from 'next/link';
import { Box, Flex, IconButton, Text, VStack } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import type { CharacterData, IconManifest, StoryLine } from '@/lib/data';
import type { GameLang } from '@/lib/gameText';
import { useT } from '@/lib/i18n';
import { playVoice, type VoiceIndex } from '@/lib/voice';

const MARKUP = /\{player\}|<bouten>([\s\S]*?)<\/bouten>|<ruby=(?:"([^"]*)"|([^>]*))>([\s\S]*?)<\/ruby>/g;
const EMPHASIS = { textEmphasis: 'filled dot', WebkitTextEmphasis: 'filled dot', textEmphasisPosition: 'over right' };

export function LineText({ text }: { text: string }) {
  const t = useT();
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(MARKUP)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const key = m.index;
    if (m[0] === '{player}') {
      out.push(<Box key={key} as="span" color="yellow.300" fontWeight="semibold">{t('storyPlayer')}</Box>);
    } else if (m[1] !== undefined) {
      out.push(<Box key={key} as="span" sx={EMPHASIS}><LineText text={m[1]} /></Box>);
    } else {
      out.push(
        <ruby key={key}><LineText text={m[4]} /><Box as="rt" fontSize="0.6em" color="gray.400">{m[2] ?? m[3]}</Box></ruby>,
      );
    }
    at = key + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out.map((node, i) => <Fragment key={i}>{node}</Fragment>)}</>;
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
              — <LineText text={line.t} /> —
            </Text>
          );
        }
        if (line.k === 'narration') {
          return (
            <Text key={i} fontSize="sm" color="gray.400" fontStyle="italic" whiteSpace="pre-wrap">
              <LineText text={line.t} />
            </Text>
          );
        }
        if (line.k === 'choice') {
          return (
            <Box key={i} fontSize="sm" px={3} py={1.5} borderLeftWidth="3px" borderColor="yellow.400"
              bg="whiteAlpha.50" whiteSpace="pre-wrap"><LineText text={line.t} /></Box>
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
              <Text fontSize="sm" whiteSpace="pre-wrap"><LineText text={line.t} /></Text>
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
