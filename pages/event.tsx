// A query parameter, not a route segment, because `output: 'export'` prerenders every path and events are runtime data.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Box, Button, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import {
  EventArt, EventTiming, ExchangePanel, PartnerChip, TimeControls, useNow, useServerTime,
} from '@/components/eventsBoard';
import {
  loadCharacters, loadEvents, loadIcons,
  type CharacterData, type EventIndex, type IconManifest,
} from '@/lib/data';
import { remaining, sceneCount } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { useLang, useT } from '@/lib/i18n';

export default function EventPage() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? Number(router.query.id) : null;
  const [data, setData] = useState<EventIndex | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(30_000);

  useEffect(() => {
    loadEvents().then(setData).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const event = data.events.find((e) => e.id === id);
  if (!event) return <Text color="gray.500">{t('noMatch')}</Text>;

  const name = gameText(event.name, gameLang);
  const pickups = event.pickups ?? [];
  const bonus = event.bonus ?? [];
  const cast = (event.cast ?? [])
    .filter((c) => !bonus.some((b) => b.code === c) && !pickups.includes(c)
      && chars?.characters[c]?.characterType === 1);
  const stagesOpen = event.stagesEnd && now < Date.parse(event.stagesEnd) && now >= Date.parse(event.start);

  return (
    <VStack align="stretch" spacing={6}>
      <Head><title>MAD Viewer — {name}</title></Head>
      <Flex align="center" gap={2} wrap="wrap" fontSize="sm">
        <Text as={NextLink} href="/stages?mode=event" color="yellow.300">{t('navStages')}</Text>
        <Text color="gray.600">/</Text>
        <Text color="gray.400">{name}</Text>
        <Box flex="1" />
        <TimeControls serverTime={serverTime} onChange={setServerTime} />
      </Flex>

      <Flex direction={{ base: 'column', md: 'row' }} gap={5}>
        <Box w={{ base: '100%', md: '360px' }} flexShrink={0}>
          <EventArt event={event} icons={icons} />
        </Box>
        <VStack align="stretch" spacing={2} minW={0} flex="1">
          <EventTiming event={event} now={now} serverTime={serverTime} />
          <Text fontSize="2xl" fontWeight="bold">{name}</Text>
          {event.desc && (
            <Text fontSize="sm" color="gray.300" whiteSpace="pre-wrap">{gameText(event.desc, gameLang)}</Text>
          )}
          {event.accountDays && (
            <Text fontSize="xs" color="gray.500">{t('eventsAccountDays', { n: event.accountDays })}</Text>
          )}
          {stagesOpen && (
            <Text fontSize="xs" color="gray.500">
              {t('eventsStagesClose', { time: remaining(Date.parse(event.stagesEnd!) - now, lang) })}
            </Text>
          )}
          <HStack spacing={2} pt={2} wrap="wrap">
            {event.chapter && (
              <Button as={NextLink} href={`/story?chapter=${event.chapter}`} size="sm" colorScheme="yellow">
                {t('eventsReadStory')} · {sceneCount(t, event.scenes ?? 0)}
              </Button>
            )}
            {event.stageGroup && (
              <Button as={NextLink} href={`/stages?group=${encodeURIComponent(event.stageGroup)}`}
                size="sm" variant="outline">
                {t('eventsStages')}
              </Button>
            )}
          </HStack>
        </VStack>
      </Flex>

      {(bonus.length > 0 || pickups.length > 0) && (
        <Box>
          <HStack spacing={3} mb={3} wrap="wrap" align="baseline">
            <Text fontSize="lg" fontWeight="bold">{t('eventsBonusUnits')}</Text>
            {bonus.length > 0 && (
              <Text fontSize="xs" color="gray.500">
                {t('eventsBonusNote', { max: data.bonusMax ?? 0 })}
              </Text>
            )}
          </HStack>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={2}>
            {(bonus.length ? bonus : pickups.map((code) => ({ code, rate: undefined }))).map((b) => (
              <PartnerChip key={b.code} code={b.code} chars={chars} icons={icons} gameLang={gameLang}
                pickup={pickups.includes(b.code)} rate={b.rate} />
            ))}
          </SimpleGrid>
        </Box>
      )}

      {cast.length > 0 && (
        <Box>
          <Text fontSize="lg" fontWeight="bold" mb={3}>{t('eventsCast')}</Text>
          <Wrap spacing={2}>
            {cast.map((code) => (
              <WrapItem key={code}>
                <PartnerChip code={code} chars={chars} icons={icons} gameLang={gameLang} />
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      )}

      {event.exchange && (
        <ExchangePanel exchange={event.exchange} refs={data.refs} icons={icons} gameLang={gameLang} />
      )}
    </VStack>
  );
}
