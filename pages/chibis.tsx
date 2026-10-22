import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Box, Center, Spinner, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { PageHeader } from '@altterisk/game-hub';
import ChibiSticker from '@/components/chibiSticker';
import { eventArchiveUrls } from '@/lib/cdn';
import {
  loadEventArt, loadEvents, type EventArt, type EventArtIndex, type EventIndex, type EventSticker,
} from '@/lib/data';
import { gameText, useGameLang } from '@/lib/gameText';
import { useT } from '@/lib/i18n';
import { loadArchive, urlFor } from '@/lib/skinArchive';

const TILE = 112;

function tiles(art: EventArt): EventSticker[] {
  const runners = art.chibis.flatMap((c) => [...new Set([...(c.run.sprites ?? []), ...(c.idle.sprites ?? [])])]
    .map((sprite) => ({
      name: sprite,
      sprite,
      size: c.size,
      pivot: [0.5, 0] as [number, number],
      x: 0,
      rotation: 0,
      scale: [1, 1] as [number, number],
    })));
  return [...runners, ...art.stickers];
}

function EventStickers({ art }: { art: EventArt }) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const items = useMemo(() => tiles(art), [art]);
  useEffect(() => {
    let live = true;
    loadArchive(`event:${art.key}`, () => eventArchiveUrls(art.key)).then((files) => {
      if (live) {
        const names = items.map((s) => s.sprite);
        setUrls(Object.fromEntries(names.map((name) => [
          name, urlFor(`event:${art.key}`, files, `${name}.png`),
        ])));
      }
    }).catch(() => setUrls(null));
    return () => { live = false; };
  }, [art, items]);

  if (!urls) return <Spinner size="sm" />;
  return (
    <Wrap spacing={2}>
      {items.map((s) => (
        <WrapItem key={s.name} borderRadius="md" bg="whiteAlpha.50">
          <ChibiSticker sticker={s} src={urls[s.sprite]} size={TILE} />
        </WrapItem>
      ))}
    </Wrap>
  );
}

export default function ChibisPage() {
  const t = useT();
  const gameLang = useGameLang();
  const [art, setArt] = useState<EventArtIndex | null>(null);
  const [events, setEvents] = useState<EventIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEventArt().then(setArt).catch((e) => setError(String(e)));
    loadEvents().then(setEvents).catch(() => setEvents(null));
  }, []);

  const groups = Object.entries(art?.events ?? {})
    .filter(([, entry]) => entry.stickers.length > 0 || entry.chibis.length > 0)
    .sort(([a], [b]) => Number(b) - Number(a));

  return (
    <VStack align="stretch" spacing={6}>
      <Head><title>{`MAD Viewer — ${t('navChibis')}`}</title></Head>
      <PageHeader title={t('navChibis')} />
      {error && <Text color="red.400">{error}</Text>}
      {!art && !error && <Center py={20}><Spinner /></Center>}
      {groups.map(([id, entry]) => {
        const event = events?.events.find((e) => e.id === Number(id));
        return (
          <Box key={id}>
            <Text as={NextLink} href={`/event?id=${id}`} fontSize="lg" fontWeight="bold" mb={3} display="block">
              {event ? gameText(event.name, gameLang) : id}
            </Text>
            <EventStickers art={entry} />
          </Box>
        );
      })}
    </VStack>
  );
}
