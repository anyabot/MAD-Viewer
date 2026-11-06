import { useEffect, useState } from 'react';
import { Box, Flex, HStack, SimpleGrid, Spinner, Text } from '@altterisk/game-hub/ui';
import NextLink from '@/components/appLink';
import ChibiSticker from '@/components/chibiSticker';
import { eventArchiveUrls } from '@/lib/cdn';
import type { EventArt, StoryChapter } from '@/lib/data';
import { gameText, useGameLang } from '@/lib/gameText';
import { loadArchive, urlFor } from '@/lib/skinArchive';

const TILE = 72;

// Each side story with the ghosts the lobby puts on the map for it; a `_DIE_1` sprite is the ghost after its story.
export default function EventSideStories({ art, chapter }: { art: EventArt; chapter: StoryChapter }) {
  const gameLang = useGameLang();
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    loadArchive(`event:${art.key}`, () => eventArchiveUrls(art.key)).then((files) => {
      if (live) {
        setUrls(Object.fromEntries(art.stickers.map((s) => [s.sprite, urlFor(`event:${art.key}`, files, `${s.sprite}.png`)])));
      }
    }).catch(() => setUrls(null));
    return () => { live = false; };
  }, [art]);

  const rows = chapter.scenes.map((scene, i) => ({
    scene,
    n: i + 1,
    ghosts: art.stickers.filter((s) => s.stories?.includes(scene.id) && !s.name.endsWith('_DIE_1')),
  }));
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
      {rows.map(({ scene, n, ghosts }) => (
        <Flex key={scene.id} gap={3} align="center" borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" p={2} minW={0}>
          <HStack spacing={0} flexShrink={0} minW={`${TILE}px`}>
            {ghosts.length === 0 ? <Box w={`${TILE}px`} />
              : !urls ? <Spinner size="sm" />
                : ghosts.map((s) => <ChibiSticker key={s.sprite} sticker={s} src={urls[s.sprite]} size={TILE} />)}
          </HStack>
          <Box minW={0}>
            <Text fontSize="xs" color="gray.500">{n}</Text>
            <Text as={NextLink} href={`/story?chapter=${chapter.id}&scene=${scene.id}`} fontSize="sm" color="accent.300">
              {gameText(scene.name, gameLang)}
            </Text>
          </Box>
        </Flex>
      ))}
    </SimpleGrid>
  );
}
