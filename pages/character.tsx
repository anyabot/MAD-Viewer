// One character: a wiki-style infobox of the non-gameplay master data, then
// every skin the character has — standing, affection, desire — in the Spine
// viewer.
//
// The route is `/character?code=CH0001` rather than a `[code]` segment: all
// game data is fetched at runtime, so a build-time path list would have to be
// regenerated whenever a character is added.
//
// Mobile-first: the infobox sits above the viewer on `base` and beside it from
// `lg`; the skin strip scrolls inside its own box.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Divider, Flex, Grid, HStack, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import SkinViewer from '@/components/skinViewer';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { StoreKey } from '@/components/skinViewer/types';
import { GameIcon, StarRating } from '@/components/gameIcon';
import { resolveIcon } from '@/lib/icons';
import {
  KIND_ICON, TYPE_LABEL, birthdayText, skinIconNames, skinsByCharacter, typeIcons,
  typeLabel, typeOf, typeTint, type TypeTable,
} from '@/lib/characters';
import {
  KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type IconManifest, type SkinListEntry,
} from '@/lib/data';

const INFO_TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division', 'faction'];

export default function CharacterPage() {
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : null;

  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('onestore');

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const mine = useMemo(
    () => (code ? skinsByCharacter(skins).get(code) ?? [] : []), [skins, code]);

  // Reset the selection when the route changes to a different character.
  useEffect(() => { setSelected(null); }, [code]);
  const current = useMemo(
    () => mine.find((s) => s.key === selected) ?? mine[0] ?? null, [mine, selected]);

  useEffect(() => {
    if (current && !current.stores.includes(store)) setStore(current.stores[0] ?? 'onestore');
  }, [current, store]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!chars || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">loading…</Text></VStack>
      </Center>
    );
  }

  const entry: CharacterEntry | null = code ? chars.characters[code] ?? null : null;
  if (!entry) {
    return (
      <VStack align="start" spacing={3} py={10}>
        <Text color="gray.400">
          {code ? `no character data for ${code}` : 'no character selected'}
        </Text>
        <Text as={NextLink} href="/characters" color="yellow.300" fontSize="sm">
          ← back to the character list
        </Text>
      </VStack>
    );
  }

  const element = typeOf(entry, chars.types, 'attribute');

  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="baseline" gap={3} wrap="wrap">
        <Text as={NextLink} href="/characters" fontSize="sm" color="gray.500"
          _hover={{ color: 'gray.200' }}>← characters</Text>
        <Text fontSize="2xl" fontWeight="bold">{entry.name || entry.code}</Text>
        {entry.unfinished?.eng && (
          <Text fontSize="md" color="gray.500">{entry.unfinished.eng}</Text>
        )}
        <Text fontFamily="mono" fontSize="sm" color="gray.600">{entry.code}</Text>
        {entry.unreleased && (
          <Badge colorScheme="purple">unreleased — no profile data in the game yet</Badge>
        )}
      </Flex>

      <Grid templateColumns={{ base: '1fr', lg: '300px 1fr' }} gap={4} alignItems="start">
        <Infobox entry={entry} types={chars.types} icons={icons} accent={element?.color} />

        <VStack align="stretch" spacing={3} minW={0}>
          {mine.length > 0 ? (
            <>
              <SkinStrip skins={mine} entry={entry} icons={icons}
                selected={current?.key ?? null} onSelect={setSelected} />
              {current && (
                <VStack align="stretch" spacing={2}>
                  <Wrap spacing={2} align="center">
                    <WrapItem>
                      <Text fontWeight="bold" fontFamily="mono" color="gray.400">
                        {current.key}
                      </Text>
                    </WrapItem>
                    <WrapItem><Badge>{KIND_LABEL[current.kind]}</Badge></WrapItem>
                    {current.stores.length > 1 ? (
                      <WrapItem>
                        <Badge colorScheme="yellow">
                          store art differs — showing {STORE_META[store].short}
                        </Badge>
                      </WrapItem>
                    ) : (
                      <WrapItem><Badge colorScheme="green">identical across stores</Badge></WrapItem>
                    )}
                    {current.hasBg && <WrapItem><Badge colorScheme="blue">background</Badge></WrapItem>}
                  </Wrap>
                  <SkinViewer key={current.key} skin={current.key} stores={current.stores}
                    store={store} onStoreChange={setStore} height="70vh" />
                </VStack>
              )}
            </>
          ) : (
            <Center h="30vh" borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md">
              <Text color="gray.500" fontSize="sm">no skin archive for this character</Text>
            </Center>
          )}

          {entry.desc && (
            <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" p={3}>
              <Text fontSize="xs" color="gray.500" textTransform="uppercase"
                letterSpacing="wide" mb={1}>Profile</Text>
              <Text fontSize="sm" whiteSpace="pre-wrap">{entry.desc}</Text>
            </Box>
          )}
        </VStack>
      </Grid>
    </VStack>
  );
}

// The wiki infobox: cut-in art, then every non-gameplay fact the master data
// carries. Rows with no value are omitted entirely rather than shown empty.
function Infobox({ entry, types, icons, accent }: {
  entry: CharacterEntry; types: CharacterData['types'];
  icons: IconManifest | null; accent?: string;
}) {
  const rows: { label: string; node: React.ReactNode }[] = [];

  for (const table of INFO_TABLES) {
    const t = typeOf(entry, types, table);
    if (!t) continue;
    rows.push({
      label: TYPE_LABEL[table],
      node: (
        <HStack spacing={1.5}>
          <GameIcon manifest={icons} group="ui" names={typeIcons(t)} size={5}
            tint={typeTint(t)} />
          <Text color={t.color}>{typeLabel(t)}</Text>
          <Text color="gray.500" fontSize="xs">{t.name}</Text>
        </HStack>
      ),
    });
  }
  if (entry.defaultStar) {
    rows.splice(1, 0, {
      label: 'Rarity',
      node: <StarRating manifest={icons} star={entry.defaultStar} size={4} />,
    });
  }

  const text: [string, string | null | undefined][] = [
    ['Birthday', birthdayText(entry)],
    ['Artist', entry.artist],
    ['CV', entry.cv],
    ['Hobby', entry.hobby],
    ['Specialty', entry.specialty],
    ['Likes', entry.likes],
  ];
  for (const [label, value] of text) {
    if (value) rows.push({ label, node: <Text>{value}</Text> });
  }

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.300" borderRadius="md"
      borderTopWidth="3px" borderTopColor={accent ?? 'whiteAlpha.400'}
      bg="whiteAlpha.50" overflow="hidden">
      <Center bg="blackAlpha.400" py={2}>
        <GameIcon manifest={icons} group="cutin"
          names={[`Cut_${entry.code}`, `CUT_${entry.code}`]}
          size="auto" maxH="260px" w="auto" />
      </Center>

      <VStack align="stretch" spacing={0} fontSize="sm">
        {rows.map(({ label, node }) => (
          <Flex key={label} px={3} py={1.5} gap={2} align="center"
            borderTopWidth="1px" borderColor="whiteAlpha.100">
            <Text minW="82px" color="gray.500" fontSize="xs" textTransform="uppercase"
              letterSpacing="wide">{label}</Text>
            <Box flex="1" minW={0}>{node}</Box>
          </Flex>
        ))}
      </VStack>

      {(entry.comment || entry.birthdayComment) && (
        <>
          <Divider borderColor="whiteAlpha.200" />
          <VStack align="stretch" spacing={2} px={3} py={2} fontSize="sm">
            {entry.comment && (
              <Box>
                <Text fontSize="xs" color="gray.500">Status message</Text>
                <Text>{entry.comment}</Text>
              </Box>
            )}
            {entry.birthdayComment && (
              <Box>
                <Text fontSize="xs" color="gray.500">Birthday message</Text>
                <Text>{entry.birthdayComment}</Text>
              </Box>
            )}
          </VStack>
        </>
      )}
    </Box>
  );
}

// Every rig this character has. Scrolls horizontally on a narrow screen rather
// than widening the page.
function SkinStrip({ skins, entry, icons, selected, onSelect }: {
  skins: SkinListEntry[]; entry: CharacterEntry; icons: IconManifest | null;
  selected: string | null; onSelect: (key: string) => void;
}) {
  return (
    <Box overflowX="auto" pb={1}>
      <HStack spacing={2} minW="max-content" align="stretch">
        {skins.map((s) => {
          const names = skinIconNames(s, entry);
          // a standing rig has no thumbnail of its own — the portrait is its art
          const src = resolveIcon(icons, 'skin', names.skin)
            ?? resolveIcon(icons, 'char', names.char);
          const active = s.key === selected;
          return (
            <Box key={s.key} as="button" onClick={() => onSelect(s.key)}
              borderWidth="1px" borderRadius="md" overflow="hidden" w="92px"
              borderColor={active ? 'yellow.400' : 'whiteAlpha.200'}
              bg={active ? 'whiteAlpha.200' : 'whiteAlpha.50'}
              _hover={{ borderColor: active ? 'yellow.400' : 'whiteAlpha.500' }}>
              <Box position="relative" bg="blackAlpha.400" sx={{ aspectRatio: '1 / 1' }}>
                {src && (
                  <Box as="img" src={src} alt="" w="100%" h="100%" objectFit="contain" />
                )}
                <Box position="absolute" bottom={0.5} left={0.5}>
                  <GameIcon manifest={icons} group="ui" name={KIND_ICON[s.kind]} size={4} />
                </Box>
                {s.stores.length > 1 && (
                  <Badge position="absolute" top={0.5} right={0.5} colorScheme="yellow"
                    fontSize="0.55rem">DIFF</Badge>
                )}
              </Box>
              <Text fontSize="0.6rem" fontFamily="mono" px={1} py={0.5} noOfLines={1}
                color={active ? 'gray.100' : 'gray.500'}>{s.key}</Text>
            </Box>
          );
        })}
      </HStack>
    </Box>
  );
}
