import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Box, Button, Grid, HStack, Text, VStack, Wrap } from '@chakra-ui/react';
import { LoadState, PageHeader, Panel } from '@altterisk/game-hub';
import { ARTIST_LINKS, artistAnchor } from '@/lib/artists';
import { characterName, isPlayable, skinsByCharacter } from '@/lib/characters';
import { characterIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import { dataText, useLang, useT } from '@/lib/i18n';
import {
  loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type IconManifest, type SkinListEntry,
} from '@/lib/data';

export default function ArtistsPage() {
  const t = useT();
  const lang = useLang();
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusArtist = useFilters((s) => s.focusArtist);

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const byCharacter = useMemo(() => skinsByCharacter(skins), [skins]);

  const artists = useMemo(() => {
    const groups = new Map<string, CharacterEntry[]>();
    for (const c of Object.values(chars?.characters ?? {})) {
      if (!c.artist || !isPlayable(c)) continue;
      groups.set(c.artist, [...(groups.get(c.artist) ?? []), c]);
    }
    return [...groups.entries()]
      .map(([name, list]) => [name, list.sort((a, b) => a.code.localeCompare(b.code))] as const)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [chars]);

  // The browser's own hash scroll fires before the list has loaded.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (artists.length && id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [artists]);

  if (error || !chars) {
    return <LoadState loading error={error} labels={{ loading: t('loading'), error }} />;
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Head><title>MAD Viewer — {t('navArtists')}</title></Head>
      <PageHeader title={t('navArtists')} />
      <Grid gap={4} templateColumns={{ base: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }}>
        {artists.map(([name, list]) => (
          <Box key={name} id={artistAnchor(name)} scrollMarginTop="5rem">
          <Panel title={dataText(lang, name, list[0].artistEn)}
            actions={
              <Button as={NextLink} href="/characters" size="xs" variant="ghost"
                onClick={() => focusArtist(name)}>
                {t('artistUnits', { n: list.length })}
              </Button>
            }>
            <VStack align="stretch" spacing={3}>
              {(ARTIST_LINKS[name] ?? []).length > 0 && (
                <Wrap spacing={2}>
                  {ARTIST_LINKS[name].map((link) => (
                    <Button key={link.url} as="a" href={link.url} target="_blank"
                      rel="noopener noreferrer" size="sm" variant="outline">
                      {link.site}
                    </Button>
                  ))}
                </Wrap>
              )}
              <Grid gap={2} templateColumns="repeat(auto-fill, minmax(4.5rem, 1fr))">
                {list.map((c) => {
                  const art = characterIcon(icons, c, byCharacter.get(c.code) ?? []);
                  return (
                    <Box key={c.code} as={NextLink}
                      href={{ pathname: '/character', query: { code: c.code } }}
                      borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg"
                      overflow="hidden" _hover={{ borderColor: 'whiteAlpha.500' }}>
                      <Box bg="blackAlpha.400" sx={{ aspectRatio: '1 / 1' }}>
                        {art && <Box as="img" src={art} alt="" w="100%" h="100%" objectFit="contain" />}
                      </Box>
                      <HStack px={1} py={0.5}>
                        <Text fontSize="0.65rem" noOfLines={1}>{characterName(c, lang)}</Text>
                      </HStack>
                    </Box>
                  );
                })}
              </Grid>
            </VStack>
          </Panel>
          </Box>
        ))}
      </Grid>
    </VStack>
  );
}
