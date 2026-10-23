// A query parameter, not a route segment, because `output: 'export'` prerenders every path and events are runtime data.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import {
  Box, Button, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import {
  AttendancePanel, EventArt, EventTiming, ExchangePanel, PartnerChip, TimeControls, useNow, useServerTime,
} from '@/components/eventsBoard';
import EventBoxArt from '@/components/eventBoxArt';
import EventChibis from '@/components/eventChibis';
import {
  loadCharacters, loadEventArt, loadEvents, loadIcons,
  type CharacterData, type EventArtIndex, type EventIndex, type IconManifest,
} from '@/lib/data';
import { remaining, sceneCount } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { useLang, useT } from '@/lib/i18n';
import { isFuture, useHideSpoilers } from '@/lib/spoilers';
import { useSpoilerGate } from '@/components/spoilers';

export default function EventPage() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? Number(router.query.id) : null;
  const [data, setData] = useState<EventIndex | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [eventArt, setEventArt] = useState<EventArtIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(30_000);

  useEffect(() => {
    loadEvents().then(setData).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadEventArt().then(setEventArt).catch(() => setEventArt(null));
  }, []);

  const hideSpoilers = useHideSpoilers();
  const found = data?.events.find((e) => e.id === id);
  const gated = useSpoilerGate(data && router.isReady ? !!found && isFuture(found.start, now) : null, '/events');

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data || !router.isReady || gated) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const event = found;
  if (!event) return <Text color="gray.500">{t('noMatch')}</Text>;

  const name = gameText(event.name, gameLang);
  const pickups = event.pickups ?? [];
  const bonus = event.bonus ?? [];
  const cast = (event.cast ?? [])
    .filter((c) => !bonus.some((b) => b.code === c) && !pickups.includes(c)
      && chars?.characters[c]?.characterType === 1);
  const art = eventArt?.events[String(event.id)];
  const ordered = data.events.filter((e) => !hideSpoilers || !isFuture(e.start, now)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id - b.id);
  const at = ordered.findIndex((e) => e.id === event.id);
  const prev = ordered[at - 1];
  const next = ordered[at + 1];
  const boxDraws = event.exchange?.find((ex) => ex.kind === 'box')?.maxDraws;
  const stagesOpen = event.stagesEnd && now < Date.parse(event.stagesEnd) && now >= Date.parse(event.start);

  return (
    <VStack align="stretch" spacing={6}>
      <Head><title>{`MAD Viewer — ${name}`}</title></Head>
      <Flex align="center" gap={2} wrap="wrap" fontSize="sm">
        <Text as={NextLink} href="/stages?mode=event" color="yellow.300">{t('navStages')}</Text>
        <Text color="gray.600">/</Text>
        <Text color="gray.400">{name}</Text>
        <Box flex="1" />
        <TimeControls serverTime={serverTime} onChange={setServerTime} />
      </Flex>

      <Flex gap={2} wrap="wrap" justify="space-between">
        {prev ? (
          <Button as={NextLink} href={`/event?id=${prev.id}`} size="sm" variant="ghost"
            leftIcon={<ChevronLeftIcon />} maxW="100%" whiteSpace="normal" textAlign="left">
            {gameText(prev.name, gameLang)}
          </Button>
        ) : <Box />}
        {next && (
          <Button as={NextLink} href={`/event?id=${next.id}`} size="sm" variant="ghost"
            rightIcon={<ChevronRightIcon />} maxW="100%" whiteSpace="normal" textAlign="right" ml="auto">
            {gameText(next.name, gameLang)}
          </Button>
        )}
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

      {art && art.chibis.length > 0 && <EventChibis art={art} />}

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

      {event.attendance && (
        <AttendancePanel attendance={event.attendance} refs={data.refs} icons={icons} gameLang={gameLang} />
      )}

      {event.exchange && (
        <ExchangePanel exchange={event.exchange} refs={data.refs} icons={icons} gameLang={gameLang}
          boxArt={art && art.rigs.length > 0
            ? <EventBoxArt art={art} maxDraws={boxDraws} /> : undefined} />
      )}
    </VStack>
  );
}
