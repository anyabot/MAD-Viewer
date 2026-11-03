import { useEffect, useState } from 'react';
import { SITE_URL, Seo } from '@/components/seo';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import NextLink from '@/components/appLink';
import { useRouter } from 'next/router';
import { Badge, Box, Center, Flex, HStack, SimpleGrid, Text, VStack } from '@altterisk/game-hub/ui';
import {
  EventCard, TimeControls, useNow, useServerTime,
} from '@/components/eventsBoard';
import { ArtBox } from '@/components/artBox';
import { GameIcon } from '@/components/gameIcon';
import {
  dataUrl, loadArchive, loadCharacters, loadEvents, loadIcons, loadStages,
  type ArchiveIndex, type CharacterData, type EventIndex, type GameEvent, type IconManifest, type StageData,
} from '@/lib/data';
import { bannerNames, eventPhase, formatMoment, remaining, zoneLabel } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { characterName } from '@/lib/characters';
import type { IconGroup } from '@/lib/icons';
import { useLang, useT, type UiKey } from '@/lib/i18n';
import { isFuture, useHideSpoilers } from '@/lib/spoilers';
import { groupIsLive, groupLabel, groupWindow } from '@/lib/stages';
import { characterHref } from '@/lib/routes';
import { readData } from '@/lib/staticData';

const VIEWER_KEYS = ['skin', 'store', 'view', 'speed', 'bg', 'camera', 'aspect', 'body', 'face', 'overlay', 'stage', 'tab'];

const WEBSITE_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'MAD Viewer',
  alternateName: 'Make Drama Viewer',
  url: `${SITE_URL}/`,
};

const SECTIONS: { href: string; label: UiKey; desc: UiKey }[] = [
  { href: '/viewer', label: 'navViewer', desc: 'homeViewer' },
  { href: '/characters', label: 'navCharacters', desc: 'homeCharacters' },
  { href: '/story', label: 'navStory', desc: 'homeStory' },
  { href: '/jukebox', label: 'navJukebox', desc: 'homeJukebox' },
  { href: '/stages', label: 'navStages', desc: 'homeStages' },
  { href: '/items', label: 'navItems', desc: 'homeItems' },
  { href: '/farm', label: 'navFarm', desc: 'homeFarm' },
  { href: '/effects', label: 'navEffects', desc: 'homeEffects' },
  { href: '/changelog', label: 'navChangelog', desc: 'homeChangelog' },
];

type HomeLead = { builtAt: number; event: GameEvent; banners: EventIndex['banners']; chars: CharacterData; icons: IconManifest };

// The first event and banner are the page's largest paints, so the HTML carries them instead of waiting on the fetches.
export const getStaticProps: GetStaticProps<{ lead: HomeLead | null }> = () => {
  const builtAt = Date.now();
  const index = readData<EventIndex>('events.json');
  const event = index.events
    .filter((e) => eventPhase(e, builtAt) === 'running')
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end))[0];
  if (!event) return { props: { lead: null } };
  const { characters } = readData<CharacterData>('characters.json');
  const { groups } = readData<IconManifest>('icons.json');
  const banners = (index.banners ?? []).filter((b) => Date.parse(b.start) <= builtAt && builtAt <= Date.parse(b.end));
  const codes = [...(event.pickups ?? []), ...(event.bonus ?? []).map((b) => b.code), ...banners.flatMap((b) => b.codes)];
  const people = codes.map((c) => characters[c]).filter(Boolean);
  const { id, kind, name, desc, start, end, banner, goodsIcon, pickups, bonus } = event;
  return {
    props: JSON.parse(JSON.stringify({
      lead: {
        builtAt,
        event: { id, kind, name, desc, start, end, banner, goodsIcon, pickups, bonus },
        banners,
        chars: {
          characters: Object.fromEntries(people.map(({ code, name: ko, nameEn, iconPath }) => [code, { code, name: ko, nameEn, iconPath }])),
        },
        icons: {
          groups: {
            banner: groups.banner?.filter((n) => bannerNames(event, 'en').includes(n)) ?? [],
            item: groups.item?.filter((n) => n === goodsIcon) ?? [],
            char: groups.char?.filter((n) => people.some((p) => p.iconPath === n) || codes.some((c) => n === `Icon_${c}`)) ?? [],
          },
        },
      },
    })),
  };
};

export default function Home({ lead }: { lead: HomeLead | null }) {
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
  const now = useNow(30_000, lead?.builtAt);
  const hideSpoilers = useHideSpoilers();

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

  const live = (events?.events ?? (lead ? [lead.event] : []))
    .filter((e) => (hideSpoilers ? ['running'] : ['running', 'upcoming']).includes(eventPhase(e, now)))
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  const banners = (events?.banners ?? lead?.banners ?? [])
    .filter((b) => now <= Date.parse(b.end) && !(hideSpoilers && isFuture(b.start, now)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nemesis = stages ? Object.values(stages.groups).filter((g) => g.mode === 'nemesis'
    && (groupIsLive(g) || (!hideSpoilers && g.from && g.from > new Date(now).toISOString().slice(0, 10))))
    .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? '')) : [];
  const season = archive?.seasons.find((s) => s.open && now <= Date.parse(s.open.end)
    && !(hideSpoilers && isFuture(s.open.start, now)));
  const core = stages ? Object.values(stages.groups).filter((g) => g.mode === 'ascent' && groupIsLive(g)) : [];

  return (
    <VStack align="stretch" spacing={8}>
      <Seo jsonLd={WEBSITE_LD} />
      <Head>
        <link rel="preload" href={dataUrl('events.json')} as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href={dataUrl('icons.json')} as="fetch" crossOrigin="anonymous" />
      </Head>
      <VStack spacing={2} textAlign="center" pt={2}>
        <Text as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="bold">MAD Viewer</Text>
        <Text color="gray.400">{t('homeTagline')}</Text>
      </VStack>

      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="xl" fontWeight="bold">{t('homeNow')}</Text>
        <Box flex="1" />
        <TimeControls serverTime={serverTime} onChange={setServerTime} />
      </Flex>

      {/* holds the links below the fold until the sections above them have loaded */}
      <VStack align="stretch" spacing={8} style={{ minHeight: 'calc(100svh - 13rem)' }}>
      {live.length > 0 && (
        <Section title={t('homeEvents')} href="/stages?mode=event">
          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
            {live.map((event, i) => (
              <EventCard key={`${event.kind}:${event.id}`} event={event} now={now} serverTime={serverTime}
                chars={chars ?? lead?.chars ?? null} icons={icons ?? lead?.icons ?? null} priority={i === 0} />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {banners.length > 0 && (
        <Section title={t('homeBanners')}>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={3}>
            {banners.map((b, i) => (
              <BannerTile key={b.start} banner={b} now={now} serverTime={serverTime} priority={i === 0}
                chars={chars ?? lead?.chars ?? null} icons={icons ?? lead?.icons ?? null} />
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
      </VStack>

      <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={3}>
        {SECTIONS.map((s) => (
          <Box key={s.href} as={NextLink} href={s.href} p={4} borderRadius="lg" borderWidth="1px"
            borderColor="whiteAlpha.200" bg="whiteAlpha.50" _hover={{ borderColor: 'accent.400' }}>
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
        {href && <Text as={NextLink} href={href} fontSize="xs" color="accent.300">›</Text>}
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
      _hover={{ borderColor: 'accent.400' }}>
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
function BannerTile({ banner, now, serverTime, chars, icons, priority }: {
  banner: { start: string; end: string; codes: string[] }; now: number; serverTime: boolean;
  chars: CharacterData | null; icons: IconManifest | null; priority?: boolean;
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
        <Box as={NextLink} href={characterHref(code)} position="relative" aria-label={name}>
          <ArtBox manifest={icons} w="100%" priority={priority}
            sources={[['char', entry?.iconPath], ['char', `Icon_${code}`]]} />
        </Box>
      ) : (
        <Center as="button" onClick={() => setRevealed(true)} w="100%" sx={{ aspectRatio: '430 / 280' }}
          borderRadius="md" bg="blackAlpha.500" borderWidth="1px" borderStyle="dashed" borderColor="whiteAlpha.300"
          flexDirection="column" gap={1} _hover={{ borderColor: 'accent.400' }}>
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
