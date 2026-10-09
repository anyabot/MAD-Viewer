// One route for the index and the reader, because `output: 'export'` prerenders every path and chapters are runtime data.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel, Badge, Box, Center,
  Flex, HStack, IconButton, SimpleGrid, Spinner, Text, VStack,
} from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { GameTextPicker } from '@/components/gameTextPicker';
import {
  loadCharacters, loadEvents, loadIcons, loadStoryChapter, loadStoryIndex, loadVoice,
  type CharacterData, type EventIndex, type IconManifest, type StoryChapter,
  type StoryChapterText, type StoryIndex, type StoryLine,
} from '@/lib/data';
import { bannerNames, sceneCount } from '@/lib/events';
import { gameText, useGameLang, type GameLang } from '@/lib/gameText';
import { useT, type UiKey } from '@/lib/i18n';
import { playVoice, type VoiceIndex } from '@/lib/voice';

const KIND_ORDER: StoryChapter['kind'][] = ['main', 'event', 'nemesis'];
const KIND_LABEL: Record<StoryChapter['kind'], UiKey> = {
  main: 'storyMain', event: 'storyEvent', nemesis: 'storyNemesis',
};

export default function StoryPage() {
  const t = useT();
  const router = useRouter();
  const chapterId = typeof router.query.chapter === 'string' ? router.query.chapter : null;
  const [index, setIndex] = useState<StoryIndex | null>(null);
  const [events, setEvents] = useState<EventIndex | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStoryIndex().then(setIndex).catch((e) => setError(String(e)));
    loadEvents().then(setEvents).catch(() => setEvents(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!index || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const chapter = chapterId ? index.chapters[chapterId] : null;
  if (chapter) {
    const scene = typeof router.query.scene === 'string' ? Number(router.query.scene) : null;
    return <Reader chapter={chapter} scene={scene} chars={chars} icons={icons} />;
  }
  return <StoryList index={index} events={events} icons={icons} />;
}

function StoryList({ index, events, icons }: {
  index: StoryIndex; events: EventIndex | null; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useGameLang();
  const chapters = Object.values(index.chapters);
  return (
    <VStack align="stretch" spacing={5}>
      <Head><title>MAD Viewer — {t('navStory')}</title></Head>
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('navStory')}</Text>
        <Box flex="1" />
        <GameTextPicker />
      </Flex>
      {KIND_ORDER.map((kind) => {
        const list = chapters.filter((c) => c.kind === kind)
          .sort((a, b) => (kind === 'event' ? b.id - a.id : a.id - b.id));
        if (!list.length) return null;
        return (
          <VStack key={kind} align="stretch" spacing={2}>
            <Text fontSize="lg" fontWeight="bold">{t(KIND_LABEL[kind])}</Text>
            <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
              {list.map((chapter) => {
                const event = events?.events.find((e) => e.kind === 'main' && e.id === chapter.event);
                return (
                  <Flex key={chapter.id} as={NextLink} href={`/story?chapter=${chapter.id}`} gap={3}
                    p={3} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" minW={0}
                    align="center" _hover={{ borderColor: 'yellow.400', bg: 'whiteAlpha.50' }}>
                    {event?.banner && (
                      <GameIcon manifest={icons} group="banner" names={bannerNames(event, lang)}
                        h="56px" w="auto" maxW="120px" objectFit="contain" reserve={false} />
                    )}
                    <Box minW={0}>
                      <Text fontWeight="bold" fontSize="sm" noOfLines={1}>
                        {(event ? gameText(event.name, lang) : '') || gameText(chapter.name, lang)}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {sceneCount(t, chapter.scenes.length)}
                      </Text>
                    </Box>
                  </Flex>
                );
              })}
            </SimpleGrid>
          </VStack>
        );
      })}
    </VStack>
  );
}

function Reader({ chapter, scene, chars, icons }: {
  chapter: StoryChapter; scene: number | null; chars: CharacterData | null;
  icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useGameLang();
  const [text, setText] = useState<StoryChapterText | null>(null);
  const [voice, setVoice] = useState<VoiceIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const voiced = chapter.scenes.some((s) => s.voiced);

  useEffect(() => {
    setText(null);
    setFailed(false);
    loadStoryChapter(lang, chapter.id).then(setText).catch(() => setFailed(true));
  }, [lang, chapter.id]);

  useEffect(() => {
    if (voiced) loadVoice().then(setVoice).catch(() => setVoice(null));
  }, [voiced]);

  const open = useMemo(() => {
    const at = scene ? chapter.scenes.findIndex((s) => s.id === scene) : -1;
    return at >= 0 ? [at] : [0];
  }, [chapter, scene]);

  return (
    <VStack align="stretch" spacing={4}>
      <Head><title>MAD Viewer — {gameText(chapter.name, lang)}</title></Head>
      <Flex align="center" gap={3} wrap="wrap">
        <Text as={NextLink} href="/story" color="yellow.300" fontSize="sm">{t('navStory')}</Text>
        <Text color="gray.600">/</Text>
        <Text fontSize="xl" fontWeight="bold">{gameText(chapter.name, lang)}</Text>
        <Box flex="1" />
        <GameTextPicker />
      </Flex>
      {failed && <Text color="red.400" fontSize="sm">{t('storyMissing')}</Text>}
      <Accordion allowMultiple defaultIndex={open} key={`${chapter.id}:${open[0]}`}>
        {chapter.scenes.map((s, i) => (
          <AccordionItem key={s.id} borderColor="whiteAlpha.200">
            <AccordionButton px={2} py={3} _hover={{ bg: 'whiteAlpha.50' }}>
              <Box flex="1" textAlign="left" minW={0}>
                <HStack spacing={2} wrap="wrap">
                  <Text fontSize="xs" color="gray.500">{i + 1}</Text>
                  <Text fontWeight="bold" fontSize="sm">{gameText(s.name, lang)}</Text>
                  {s.route !== 'main' && <Badge fontSize="0.6rem">{t('storySide')}</Badge>}
                  {s.battle && <Badge fontSize="0.6rem" colorScheme="red">{t('storyBattle')}</Badge>}
                  {!!s.voiced && (
                    <Badge fontSize="0.6rem" colorScheme="purple">{t('storyVoiced', { n: s.voiced })}</Badge>
                  )}
                </HStack>
                {s.desc && (
                  <Text fontSize="xs" color="gray.400" mt={1} noOfLines={2}>{gameText(s.desc, lang)}</Text>
                )}
              </Box>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel px={{ base: 1, md: 4 }} pb={4}>
              {!text && !failed ? <Spinner size="sm" />
                : <SceneLines lines={text?.scenes[String(s.id)] ?? []} chars={chars} icons={icons}
                    voice={voice} lang={lang} />}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </VStack>
  );
}

function SceneLines({ lines, chars, icons, voice, lang }: {
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
              — {line.t} —
            </Text>
          );
        }
        if (line.k === 'narration') {
          return <Text key={i} fontSize="sm" color="gray.400" fontStyle="italic" whiteSpace="pre-wrap">{line.t}</Text>;
        }
        if (line.k === 'choice') {
          return (
            <Box key={i} fontSize="sm" px={3} py={1.5} borderLeftWidth="3px" borderColor="yellow.400"
              bg="whiteAlpha.50" whiteSpace="pre-wrap">{line.t}</Box>
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
              <Text fontSize="sm" whiteSpace="pre-wrap">{line.t}</Text>
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
