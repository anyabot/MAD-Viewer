// One route for the index and the reader, because `output: 'export'` prerenders every path and chapters are runtime data.
import { useEffect, useMemo, useState } from 'react';
import { Seo } from '@/components/seo';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel, Badge, Box, Center,
  Flex, HStack, SimpleGrid, Spinner, Text, VStack,
} from '@chakra-ui/react';
import { ArtBox } from '@/components/artBox';
import { SceneLines } from '@/components/storyLines';
import {
  loadCharacters, loadEvents, loadIcons, loadStoryChapter, loadStoryIndex, loadVoice,
  type CharacterData, type EventIndex, type IconManifest, type StoryChapter,
  type StoryChapterText, type StoryIndex,
} from '@/lib/data';
import { bannerNames, sceneCount } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { useT, type UiKey } from '@/lib/i18n';
import type { VoiceIndex } from '@/lib/voice';
import { chapterIsSpoiler, useSpoilerFilter } from '@/lib/spoilers';
import { useSpoilerGate } from '@/components/spoilers';

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

  const { hide, facts } = useSpoilerFilter();
  const asked = chapterId && index ? index.chapters[chapterId] : null;
  const gated = useSpoilerGate(index && facts && router.isReady ? !!asked && chapterIsSpoiler(asked, facts) : null, '/story');
  const shown = useMemo(() => (index && facts && hide ? {
    ...index,
    chapters: Object.fromEntries(Object.entries(index.chapters).filter(([, c]) => !chapterIsSpoiler(c, facts))),
  } : index), [index, facts, hide]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!index || !shown || !router.isReady || gated || (hide && !facts)) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const chapter = chapterId ? shown.chapters[chapterId] : null;
  if (chapter) {
    const scene = typeof router.query.scene === 'string' ? Number(router.query.scene) : null;
    return <Reader chapter={chapter} scene={scene} chars={chars} icons={icons} />;
  }
  return <StoryList index={shown} events={events} icons={icons} />;
}

function StoryList({ index, events, icons }: {
  index: StoryIndex; events: EventIndex | null; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useGameLang();
  const chapters = Object.values(index.chapters);
  return (
    <VStack align="stretch" spacing={5}>
      <Seo title={t('navStory')} description={t('seoDescStory')} />
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('navStory')}</Text>
        <Box flex="1" />
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
                const nemesis = chapter.kind === 'nemesis'
                  ? `Thumbnail_PastStory_Content_Nemesis_${String(chapter.episode % 100).padStart(4, '0')}` : null;
                return (
                  <Flex key={chapter.id} as={NextLink} href={`/story?chapter=${chapter.id}`} gap={3}
                    p={3} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" minW={0}
                    align="center" _hover={{ borderColor: 'yellow.400', bg: 'whiteAlpha.50' }}>
                    <ArtBox manifest={icons} w="104px" sources={[
                      ...(event ? bannerNames(event, lang).map((n) => ['banner', n] as ['banner', string]) : []),
                      ['banner', nemesis], ['story', chapter.background],
                    ]} />
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
      <Seo title={gameText(chapter.name, lang)} description={t('seoDescStory')} />
      <Flex align="center" gap={3} wrap="wrap">
        <Text as={NextLink} href="/story" color="yellow.300" fontSize="sm">{t('navStory')}</Text>
        <Text color="gray.600">/</Text>
        <Text fontSize="xl" fontWeight="bold">{gameText(chapter.name, lang)}</Text>
        <Box flex="1" />
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
