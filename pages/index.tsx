import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, Grid, HStack, Input, Spinner, Tab, TabList, TabPanel,
  TabPanels, Tabs, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import GachaScene from '@/components/gachaScene';
import SkinViewer from '@/components/skinViewer';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import { GameIcon } from '@/components/gameIcon';
import { KIND_ICON, rosterNote } from '@/lib/characters';
import { skinIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import {
  KIND_COLOR, KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type IconManifest, type SkinListEntry,
} from '@/lib/data';

const KINDS: SkinKind[] = ['standing', 'affection', 'desire', 'pleasure'];

function skinTitle(skin: SkinListEntry, name: string): string {
  return name || skin.character || skin.key;
}

// Two things live on this route: the rig gallery, and the gacha result
// cutscene, which is its own scene rather than a gallery entry. `isLazy` keeps
// the cutscene's archives unfetched until its tab is opened.
export default function ViewerPage() {
  return (
    <Tabs variant="line" colorScheme="yellow" isLazy>
      <TabList borderColor="whiteAlpha.200" overflowX="auto">
        <Tab fontSize="sm" whiteSpace="nowrap">Skins</Tab>
        <Tab fontSize="sm" whiteSpace="nowrap">Gacha</Tab>
      </TabList>
      <TabPanels>
        <TabPanel px={0} pt={4}><SkinGallery /></TabPanel>
        <TabPanel px={0} pt={4}><GachaScene /></TabPanel>
      </TabPanels>
    </Tabs>
  );
}

function SkinGallery() {
  const [skins, setSkins] = useState<SkinListEntry[] | null>(null);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('onestore');
  // In the store so leaving for a character page and back restores the search.
  const { kind, query, divergedOnly, selected } = useFilters((s) => s.skins);
  const set = useFilters((s) => s.setSkins);

  useEffect(() => {
    loadSkinList()
      .then((l) => {
        setSkins(l.skins);
        set({ selected: useFilters.getState().skins.selected ?? l.skins[0]?.key ?? null });
      })
      .catch((e) => setError(String(e)));
  }, [set]);

  // Names and icons are decoration: a failed fetch must leave the gallery usable.
  useEffect(() => {
    loadCharacters().then(setCharData).catch(() => setCharData(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const charOf = useMemo(
    () => (s: SkinListEntry): CharacterEntry | null =>
      charData?.characters[s.character] ?? null, [charData]);
  const nameOf = useMemo(
    () => (s: SkinListEntry) => charOf(s)?.name ?? '', [charOf]);
  // Playable characters only; it is null for every NPC.
  const nameEnOf = useMemo(
    () => (s: SkinListEntry) => charOf(s)?.nameEn ?? '', [charOf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skins ?? []).filter((s) =>
      (kind === 'all' || s.kind === kind)
      && (!divergedOnly || s.stores.length > 1)
      && (!q || s.key.toLowerCase().includes(q)
        || s.character.toLowerCase().includes(q)
        || nameOf(s).toLowerCase().includes(q)
        || nameEnOf(s).toLowerCase().includes(q)));
  }, [skins, kind, query, divergedOnly, nameOf, nameEnOf]);

  const current = useMemo(
    () => (skins ?? []).find((s) => s.key === selected) ?? null, [skins, selected]);

  // Keep the store selection valid when switching to a skin that has only one.
  useEffect(() => {
    if (current && !current.stores.includes(store)) setStore(current.stores[0] ?? 'onestore');
  }, [current, store]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!skins) {
    return <Center py={20}><VStack><Spinner /><Text fontSize="sm" color="gray.500">loading…</Text></VStack></Center>;
  }

  const currentRoster = current ? rosterNote(charOf(current)) : null;

  return (
    <VStack align="stretch" spacing={4}>
      <Wrap spacing={2} align="center">
        <WrapItem>
          <Wrap spacing={1}>
            <WrapItem>
              <Chip active={kind === 'all'} onClick={() => set({ kind: 'all' })}>All</Chip>
            </WrapItem>
            {KINDS.map((k) => (
              <WrapItem key={k}>
                <Chip active={kind === k} onClick={() => set({ kind: k })}>
                  <GameIcon manifest={icons} group="ui" name={KIND_ICON[k]} size={4}
                    reserve={false} />
                  {KIND_LABEL[k]}
                </Chip>
              </WrapItem>
            ))}
          </Wrap>
        </WrapItem>
        <WrapItem>
          <Chip active={divergedOnly} onClick={() => set({ divergedOnly: !divergedOnly })}>
            Store diff
          </Chip>
        </WrapItem>
        <WrapItem>
          <Input size="sm" maxW="220px" placeholder="search…" value={query}
            onChange={(e) => set({ query: e.target.value })} bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
        </WrapItem>
        <WrapItem>
          <Text fontSize="xs" color="gray.500">{filtered.length} of {skins.length}</Text>
        </WrapItem>
      </Wrap>

      <Grid templateColumns={{ base: '1fr', lg: '260px 1fr' }} gap={4} alignItems="start">
        <Box maxH={{ base: '220px', lg: '75vh' }} overflowY="auto"
          border="1px solid" borderColor="whiteAlpha.200" borderRadius="md" p={1}>
          <VStack align="stretch" spacing={0.5}>
            {filtered.map((s) => {
              const entry = charOf(s);
              const thumb = skinIcon(icons, s, entry);
              const roster = rosterNote(entry);
              return (
                <Box key={s.key} as="button" textAlign="left" px={2} py={1.5} borderRadius="md"
                  bg={s.key === selected ? 'whiteAlpha.300' : 'transparent'}
                  _hover={{ bg: s.key === selected ? 'whiteAlpha.300' : 'whiteAlpha.100' }}
                  onClick={() => set({ selected: s.key })}>
                  <Flex align="center" gap={2}>
                    <Box w="32px" h="32px" flexShrink={0} borderRadius="sm"
                      bg="blackAlpha.400" overflow="hidden">
                      {thumb && (
                        <Box as="img" src={thumb} alt="" w="100%" h="100%" objectFit="contain" />
                      )}
                    </Box>
                    <Box minW={0} flex="1">
                      <Flex align="center" gap={1.5} wrap="wrap">
                        <GameIcon manifest={icons} group="ui" name={KIND_ICON[s.kind]}
                          size={3.5} title={KIND_LABEL[s.kind]} />
                        <Text fontSize="sm" noOfLines={1}>{skinTitle(s, nameOf(s))}</Text>
                        {nameEnOf(s) && (
                          <Text fontSize="xs" color="gray.500" noOfLines={1}>
                            {nameEnOf(s)}
                          </Text>
                        )}
                        <Badge colorScheme={KIND_COLOR[s.kind]} fontSize="0.55rem">
                          {KIND_LABEL[s.kind]}
                        </Badge>
                        {roster && (
                          <Badge colorScheme={roster.scheme} fontSize="0.55rem">
                            {roster.label}
                          </Badge>
                        )}
                        {s.stores.length > 1 && (
                          <Badge colorScheme="yellow" fontSize="0.55rem">DIFF</Badge>
                        )}
                      </Flex>
                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                        <Text as="span" fontFamily="mono">{s.key}</Text>
                        {' · '}
                        {s.animations} anims{s.faces ? ` · ${s.faces} faces` : ''}
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              );
            })}
            {filtered.length === 0 && (
              <Text fontSize="sm" color="gray.500" p={2}>no match</Text>
            )}
          </VStack>
        </Box>

        <Box minW={0}>
          {current ? (
            <VStack align="stretch" spacing={2}>
              <Wrap spacing={2} align="center">
                <WrapItem>
                  <HStack spacing={1.5}>
                    <GameIcon manifest={icons} group="ui" name={KIND_ICON[current.kind]}
                      size={5} title={KIND_LABEL[current.kind]} />
                    <Text fontWeight="bold" fontSize="lg">
                      {skinTitle(current, nameOf(current))}
                    </Text>
                    {nameEnOf(current) && (
                      <Text fontSize="md" color="gray.500">{nameEnOf(current)}</Text>
                    )}
                    <Badge colorScheme={KIND_COLOR[current.kind]}>
                      {KIND_LABEL[current.kind]}
                    </Badge>
                    {currentRoster && (
                      <Badge colorScheme={currentRoster.scheme}>
                        {currentRoster.label}
                      </Badge>
                    )}
                  </HStack>
                </WrapItem>
                <WrapItem>
                  <Text fontFamily="mono" color="gray.400">{current.key}</Text>
                </WrapItem>
                {current.stores.length > 1 && (
                  <WrapItem>
                    <Badge colorScheme="yellow" title="store art differs">
                      DIFF · {STORE_META[store].short}
                    </Badge>
                  </WrapItem>
                )}
                {current.hasBg && <WrapItem><Badge colorScheme="blue">background</Badge></WrapItem>}
                {charOf(current) && (
                  <WrapItem>
                    <Text as={NextLink} fontSize="xs" color="yellow.300"
                      href={{ pathname: '/character', query: { code: current.character } }}
                      _hover={{ color: 'yellow.200' }}>
                      character →
                    </Text>
                  </WrapItem>
                )}
              </Wrap>
              <SkinViewer key={current.key} skin={current.key} stores={current.stores}
                store={store} onStoreChange={setStore} height="70vh" />
            </VStack>
          ) : (
            <Center h="40vh"><Text color="gray.500">select a skin</Text></Center>
          )}
        </Box>
      </Grid>
    </VStack>
  );
}

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <Box as="button" onClick={onClick} px={3} py={1} borderRadius="full" fontSize="sm"
      display="flex" alignItems="center" gap={1.5}
      bg={active ? 'yellow.400' : 'whiteAlpha.150'} color={active ? 'gray.900' : 'gray.200'}
      fontWeight={active ? 'bold' : 'normal'}
      _hover={{ bg: active ? 'yellow.300' : 'whiteAlpha.300' }} transition="background 0.15s">
      {children}
    </Box>
  );
}
