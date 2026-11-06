import { useEffect, useMemo, useState } from 'react';
import { useSpoilerFilter } from '@/lib/spoilers';
import { Seo } from '@/components/seo';
import NextLink from '@/components/appLink';
import { Box, Center, Spinner, Text, VStack, Wrap, WrapItem } from '@altterisk/game-hub/ui';
import { PageHeader } from '@altterisk/game-hub';
import ChibiSticker from '@/components/chibiSticker';
import { eventArchiveUrls } from '@/lib/cdn';
import {
  loadEventArt, loadEvents, type EventArt, type EventArtIndex, type EventIndex, type EventSticker,
} from '@/lib/data';
import { gameText, useGameLang } from '@/lib/gameText';
import { useT } from '@/lib/i18n';
import { loadArchive, urlFor } from '@/lib/skinArchive';
import { eventHref } from '@/lib/routes';

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

function EventStickers({ art, shown }: { art: EventArt; shown: Set<string> }) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const items = useMemo(() => tiles(art).filter((s) => shown.has(s.sprite)), [art, shown]);
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

  const { hide, facts } = useSpoilerFilter();
  const visible = Object.entries(art?.events ?? {})
    .filter(([id]) => !hide || (!!facts && !facts.events.has(Number(id))))
    .filter(([, entry]) => entry.stickers.length > 0 || entry.chibis.length > 0)
    .sort(([a], [b]) => Number(a) - Number(b));
  // a picture two events share, renamed or not, is shown once, under the first event that used it
  const picture = (entry: EventArt, sprite: string) => entry.hashes?.[sprite] ?? sprite;
  const owner = new Map<string, string>();
  for (const [id, entry] of visible) for (const s of tiles(entry)) if (!owner.has(picture(entry, s.sprite))) owner.set(picture(entry, s.sprite), id);
  const groups = visible.map(([id, entry]) => {
    const all = tiles(entry);
    const own = new Set(all.filter((s) => owner.get(picture(entry, s.sprite)) === id).map((s) => s.sprite));
    const from = [...new Set(all.map((s) => owner.get(picture(entry, s.sprite))!).filter((o) => o !== id))];
    return { id, entry, own, shared: all.length - own.size, from };
  }).filter((g) => g.own.size > 0).reverse();

  return (
    <VStack align="stretch" spacing={6}>
      <Seo title={t('navChibis')} description={t('seoDescChibis')} />
      <PageHeader title={t('navChibis')} />
      {error && <Text color="red.400">{error}</Text>}
      {!art && !error && <Center py={20}><Spinner /></Center>}
      {groups.map(({ id, entry, own, shared, from }) => {
        const nameOf = (eid: string) => {
          const event = events?.events.find((e) => e.id === Number(eid));
          return event ? gameText(event.name, gameLang) : eid;
        };
        return (
          <Box key={id}>
            <Text as={NextLink} href={eventHref(id)} fontSize="lg" fontWeight="bold" mb={shared ? 1 : 3} display="block">
              {nameOf(id)}
            </Text>
            {shared > 0 && (
              <Text fontSize="xs" color="gray.500" mb={3}>
                {t('chibisShared', { n: shared, events: from.map(nameOf).join(', ') })}
              </Text>
            )}
            <EventStickers art={entry} shown={own} />
          </Box>
        );
      })}
    </VStack>
  );
}
