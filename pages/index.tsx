import { useEffect, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Badge, Box, Center, Flex, HStack, SimpleGrid, Text, VStack,
} from '@chakra-ui/react';
import {
  EventCard, TimeControls, useNow, useServerTime,
} from '@/components/eventsBoard';
import { ArtBox } from '@/components/artBox';
import { GameIcon } from '@/components/gameIcon';
import {
  loadArchive, loadCharacters, loadEvents, loadIcons, loadStages,
  type ArchiveIndex, type CharacterData, type EventIndex, type IconManifest, type StageData,
} from '@/lib/data';
import { eventPhase, formatMoment, remaining, zoneLabel } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { characterName } from '@/lib/characters';
import type { IconGroup } from '@/lib/icons';
import { useLang, useT, type UiKey } from '@/lib/i18n';
import { groupIsLive, groupLabel, groupWindow } from '@/lib/stages';

const VIEWER_KEYS = ['skin', 'store', 'view', 'speed', 'bg', 'camera', 'aspect', 'body', 'face', 'overlay', 'stage', 'tab'];

const SECTIONS: { href: string; label: UiKey; desc: UiKey }[] = [
  { href: '/viewer', label: 'navViewer', desc: 'homeViewer' },
  { href: '/characters', label: 'navCharacters', desc: 'homeCharacters' },
  { href: '/story', label: 'navStory', desc: 'homeStory' },
  { href: '/stages', label: 'navStages', desc: 'homeStages' },
  { href: '/items', label: 'navItems', desc: 'homeItems' },
  { href: '/farm', label: 'navFarm', desc: 'homeFarm' },
  { href: '/effects', label: 'navEffects', desc: 'homeEffects' },
  { href: '/changelog', label: 'navChangelog', desc: 'homeChangelog' },
];

export default function Home() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const router = useRouter();
  const [events, setEvents] = useState<EventIndex | null>(null);
  const [stages, setStages] = useState<StageData | null>(null);
  const [archive, setArchive] = useState<ArchiveIndex | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(30_000);

  // Share links from before the viewer had its own route.
  useEffect(() => {
    if (!router.isReady) return;
    const query = new URLSearchParams(window.location.search);
    if (VIEWER_KEYS.some((k) => query.has(k))) void router.replace(`/viewer${window.location.search}`);
  }, [router]);

  useEffect(() => {
    loadEvents().then(setEvents).catch(() => setEvents(null));
    loadStages().then(setStages).catch(() => setStages(null));
    loadArchive().then(setArchive).catch(() => setArchive(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const live = (events?.events ?? []).filter((e) => eventPhase(e, now) !== 'ended')
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  const banners = (events?.banners ?? [])
    .filter((b) => now <= Date.parse(b.end))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nemesis = stages ? Object.values(stages.groups).filter((g) => g.mode === 'nemesis'
    && (groupIsLive(g) || (g.from && g.from > new Date(now).toISOString().slice(0, 10))))
    .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? '')) : [];
  const season = archive?.seasons.find((s) => s.open && now <= Date.parse(s.open.end));
  const core = stages ? Object.values(stages.groups).filter((g) => g.mode === 'ascent' && groupIsLive(g)) : [];

  return (
    <VStack align="stretch" spacing={8}>
      <Head><title>MAD Viewer</title></Head>
      <VStack spacing={2} textAlign="center" pt={2}>
        <Text fontSize={{ base: '3xl', md: '4xl' }} fontWeight="bold">MAD Viewer</Text>
        <Text color="gray.400">{t('homeTagline')}</Text>
      </VStack>

      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="xl" fontWeight="bold">{t('homeNow')}</Text>
        <Box flex="1" />
        <TimeControls serverTime={serverTime} onChange={setServerTime} />
      </Flex>

      {live.length > 0 && (
        <Section title={t('homeEvents')} href="/stages?mode=event">
          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
            {live.map((event) => (
              <EventCard key={`${event.kind}:${event.id}`} event={event} now={now} serverTime={serverTime}
                chars={chars} icons={icons} />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {banners.length > 0 && (
        <Section title={t('homeBanners')}>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={3}>
            {banners.map((b) => (
              <BannerTile key={b.start} banner={b} now={now} serverTime={serverTime} chars={chars} icons={icons} />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {(nemesis.length > 0 || season?.open || core.length > 0) && (
        <Section title={t('homeSeasonal')} href="/stages">
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={3}>
            {season?.open && (
              <Tile href="/archive" live={now >= Date.parse(season.open.start)}
                art={[['banner', 'Ascent_Infinity'], ['banner', 'Thumbnail_PastStory_Content_ArchiveAscent']]} icons={icons}
                title={`${gameText(archive?.title, gameLang) || t('archiveTitle')} · ${t('archiveSeason', { n: season.id })}`}
                note={t('eventsEndsIn', { time: remaining(Date.parse(season.open.end) - now, lang) })} />
            )}
            {core.map((g) => (
              <Tile key={g.key} href={`/stages?group=${encodeURIComponent(g.key)}`} live icons={icons}
                art={[['banner', 'Ascent_Core'], ['tile', stages?.modes.find((m) => m.key === 'ascent')?.tile]]}
                title={stages ? groupLabel(stages, g, lang) : ''} note={groupWindow(g) ?? ''} />
            ))}
            {nemesis.map((g) => (
              <Tile key={g.key} href={`/stages?group=${encodeURIComponent(g.key)}`} live={groupIsLive(g)}
                icons={icons} art={[['banner', g.banner], ['zone', g.image]]}
                title={`${t('homeNemesis')} · ${stages ? groupLabel(stages, g, lang) : ''}`} note={groupWindow(g) ?? ''} />
            ))}
          </SimpleGrid>
        </Section>
      )}

      <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={3}>
        {SECTIONS.map((s) => (
          <Box key={s.href} as={NextLink} href={s.href} p={4} borderRadius="lg" borderWidth="1px"
            borderColor="whiteAlpha.200" bg="whiteAlpha.50" _hover={{ borderColor: 'yellow.400' }}>
            <Text fontWeight="bold" mb={1}>{t(s.label)}</Text>
            <Text fontSize="sm" color="gray.400">{t(s.desc)}</Text>
          </Box>
        ))}
      </SimpleGrid>
    </VStack>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <VStack align="stretch" spacing={2}>
      <HStack spacing={3}>
        <Text fontSize="sm" fontWeight="bold" color="gray.400" textTransform="uppercase" letterSpacing="wide">
          {title}
        </Text>
        {href && <Text as={NextLink} href={href} fontSize="xs" color="yellow.300">›</Text>}
      </HStack>
      {children}
    </VStack>
  );
}

function Tile({ href, live, art, icons, title, note }: {
  href: string; live: boolean; art: [IconGroup, string | null | undefined][];
  icons: IconManifest | null; title: string; note: string;
}) {
  const t = useT();
  return (
    <VStack as={NextLink} href={href} align="stretch" spacing={2} p={2} borderRadius="lg" minW={0}
      borderWidth={live ? '2px' : '1px'} borderColor={live ? 'pink.400' : 'whiteAlpha.200'} bg="whiteAlpha.50"
      _hover={{ borderColor: 'yellow.400' }}>
      <ArtBox manifest={icons} w="100%" sources={art} />
      <HStack spacing={1.5} wrap="wrap">
        <Badge colorScheme={live ? 'pink' : 'blue'} variant="solid">{live ? t('stageLive') : t('stageUpcoming')}</Badge>
        <Text fontSize="xs" color="gray.400">{note}</Text>
      </HStack>
      <Text fontSize="sm" fontWeight="bold" noOfLines={2}>{title}</Text>
    </VStack>
  );
}

// A banner not yet open names a partner the game has not announced in-client, so it stays covered until asked.
function BannerTile({ banner, now, serverTime, chars, icons }: {
  banner: { start: string; end: string; codes: string[] }; now: number; serverTime: boolean;
  chars: CharacterData | null; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const running = now >= Date.parse(banner.start);
  const [revealed, setRevealed] = useState(running);
  const code = banner.codes[0];
  const entry = chars?.characters[code];
  const name = banner.codes.map((c) => characterName(chars?.characters[c] ?? null, lang) || c).join(' · ');
  const when = running
    ? t('eventsEndsIn', { time: remaining(Date.parse(banner.end) - now, lang) })
    : t('eventsStartsIn', { time: remaining(Date.parse(banner.start) - now, lang) });
  return (
    <VStack align="stretch" spacing={2} p={2} borderRadius="lg" minW={0}
      borderWidth={running ? '2px' : '1px'} borderColor={running ? 'pink.400' : 'whiteAlpha.200'} bg="whiteAlpha.50">
      {revealed ? (
        <Box as={NextLink} href={`/character?code=${code}`} position="relative">
          <ArtBox manifest={icons} w="100%"
            sources={[['char', entry?.iconPath], ['char', `Icon_${code}`]]} />
        </Box>
      ) : (
        <Center as="button" onClick={() => setRevealed(true)} w="100%" sx={{ aspectRatio: '430 / 280' }}
          borderRadius="md" bg="blackAlpha.500" borderWidth="1px" borderStyle="dashed" borderColor="whiteAlpha.300"
          flexDirection="column" gap={1} _hover={{ borderColor: 'yellow.400' }}>
          <Text fontSize="2xl" color="gray.500">?</Text>
          <Text fontSize="xs" color="gray.400">{t('homeReveal')}</Text>
        </Center>
      )}
      <HStack spacing={1.5} wrap="wrap">
        <Badge colorScheme={running ? 'pink' : 'blue'} variant="solid">{running ? t('stageLive') : t('stageUpcoming')}</Badge>
        <Text fontSize="xs" color="gray.400">{when}</Text>
      </HStack>
      <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
        {t('homePickup')}{revealed ? ` · ${name}` : ''}
      </Text>
      <Text fontSize="2xs" color="gray.500">
        {formatMoment(banner.start, lang, serverTime)} – {formatMoment(banner.end, lang, serverTime)} {zoneLabel(serverTime)}
      </Text>
    </VStack>
  );
}
