// Skin gallery — every rig the pipeline produced, by asset key. Pick one and
// view it in the Spine viewer. There is no landing page: the gallery is what
// the viewer is for. Unit facts live on the character page, not here.
//
// Mobile-first — the picker collapses above the viewer on narrow screens and
// the chip rows wrap instead of overflowing.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, Grid, HStack, Input, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import SkinViewer from '@/components/skinViewer';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import { GameIcon } from '@/components/gameIcon';
import { KIND_ICON, skinIconNames } from '@/lib/characters';
import { resolveIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import {
  KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type IconManifest, type SkinListEntry,
} from '@/lib/data';

const KINDS: SkinKind[] = ['standing', 'affection', 'desire', 'pleasure'];

// A row reads "루시아 (Standing)". The asset key stays on the second line —
// it is what the pipeline calls the rig, not what the rig is.
function skinTitle(skin: SkinListEntry, name: string): string {
  return `${name || skin.character || skin.key} (${KIND_LABEL[skin.kind]})`;
}

export default function SkinsPage() {
  const [skins, setSkins] = useState<SkinListEntry[] | null>(null);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('onestore');
  // Filters and selection live in the store so leaving for a character page
  // and coming back restores the search rather than resetting it.
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skins ?? []).filter((s) =>
      (kind === 'all' || s.kind === kind)
      && (!divergedOnly || s.stores.length > 1)
      && (!q || s.key.toLowerCase().includes(q)
        || s.character.toLowerCase().includes(q)
        || nameOf(s).toLowerCase().includes(q)));
  }, [skins, kind, query, divergedOnly, nameOf]);

  const current = useMemo(
    () => (skins ?? []).find((s) => s.key === selected) ?? null, [skins, selected]);

  // Keep the store selection valid when switching to a skin that has only one.
  useEffect(() => {
    if (current && !current.stores.includes(store)) setStore(current.stores[0] ?? 'onestore');
  }, [current, store]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!skins) {
    return <Center py={20}><VStack><Spinner /><Text fontSize="sm" color="gray.500">loading skin list…</Text></VStack></Center>;
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Wrap spacing={2} align="center">
        <WrapItem>
          <HStack spacing={1}>
            <Chip active={kind === 'all'} onClick={() => set({ kind: 'all' })}>All</Chip>
            {KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => set({ kind: k })}>
                {KIND_LABEL[k]}
              </Chip>
            ))}
          </HStack>
        </WrapItem>
        <WrapItem>
          <Chip active={divergedOnly} onClick={() => set({ divergedOnly: !divergedOnly })}>
            Store diff only
          </Chip>
        </WrapItem>
        <WrapItem>
          <Input size="sm" maxW="220px" placeholder="filter by id or name…" value={query}
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
              const names = skinIconNames(s, entry);
              const thumb = resolveIcon(icons, 'skin', names.skin)
                ?? resolveIcon(icons, 'char', names.char);
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
                        {s.stores.length > 1 && (
                          <Badge colorScheme="yellow" fontSize="0.6rem">DIFF</Badge>
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
                  </HStack>
                </WrapItem>
                <WrapItem>
                  <Text fontFamily="mono" color="gray.400">{current.key}</Text>
                </WrapItem>
                {current.stores.length > 1 ? (
                  <WrapItem>
                    <Badge colorScheme="yellow">
                      store art differs — showing {STORE_META[store].short}
                    </Badge>
                  </WrapItem>
                ) : (
                  <WrapItem>
                    <Badge colorScheme="green">identical across stores</Badge>
                  </WrapItem>
                )}
                {current.hasBg && <WrapItem><Badge colorScheme="blue">background</Badge></WrapItem>}
                {charOf(current) && (
                  <WrapItem>
                    <Text as={NextLink} fontSize="xs" color="yellow.300"
                      href={{ pathname: '/character', query: { code: current.character } }}
                      _hover={{ color: 'yellow.200' }}>
                      character page →
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
      bg={active ? 'yellow.400' : 'whiteAlpha.150'} color={active ? 'gray.900' : 'gray.200'}
      fontWeight={active ? 'bold' : 'normal'}
      _hover={{ bg: active ? 'yellow.300' : 'whiteAlpha.300' }} transition="background 0.15s">
      {children}
    </Box>
  );
}
