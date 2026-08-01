// Skin gallery — the app's only page. Pick a rig from the list, view it in the
// Spine viewer. There is no landing page: the gallery is what the viewer is for,
// and a separate index page was one click of nothing in front of it.
//
// Mobile-first — the picker collapses above the viewer on narrow screens and
// the chip rows wrap instead of overflowing.
import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Center, Flex, Grid, HStack, Input, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import SkinViewer from '@/components/skinViewer';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { SkinKind, StoreKey } from '@/components/skinViewer/types';
import {
  KIND_BADGE, KIND_COLOR, KIND_LABEL, loadSkinList, type SkinListEntry,
} from '@/lib/data';

const KINDS: SkinKind[] = ['standing', 'affection', 'desire', 'pleasure'];

export default function SkinsPage() {
  const [skins, setSkins] = useState<SkinListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SkinKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [divergedOnly, setDivergedOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('onestore');

  useEffect(() => {
    loadSkinList()
      .then((l) => {
        setSkins(l.skins);
        setSelected((s) => s ?? l.skins[0]?.key ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skins ?? []).filter((s) =>
      (kind === 'all' || s.kind === kind)
      && (!divergedOnly || s.stores.length > 1)
      && (!q || s.key.toLowerCase().includes(q) || s.character.toLowerCase().includes(q)));
  }, [skins, kind, query, divergedOnly]);

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
            <Chip active={kind === 'all'} onClick={() => setKind('all')}>All</Chip>
            {KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </Chip>
            ))}
          </HStack>
        </WrapItem>
        <WrapItem>
          <Chip active={divergedOnly} onClick={() => setDivergedOnly((v) => !v)}>
            Store diff only
          </Chip>
        </WrapItem>
        <WrapItem>
          <Input size="sm" maxW="220px" placeholder="filter by id…" value={query}
            onChange={(e) => setQuery(e.target.value)} bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
        </WrapItem>
        <WrapItem>
          <Text fontSize="xs" color="gray.500">{filtered.length} of {skins.length}</Text>
        </WrapItem>
      </Wrap>

      <Grid templateColumns={{ base: '1fr', lg: '260px 1fr' }} gap={4} alignItems="start">
        <Box maxH={{ base: '220px', lg: '75vh' }} overflowY="auto"
          border="1px solid" borderColor="whiteAlpha.200" borderRadius="md" p={1}>
          <VStack align="stretch" spacing={0.5}>
            {filtered.map((s) => (
              <Box key={s.key} as="button" textAlign="left" px={2} py={1.5} borderRadius="md"
                bg={s.key === selected ? 'whiteAlpha.300' : 'transparent'}
                _hover={{ bg: s.key === selected ? 'whiteAlpha.300' : 'whiteAlpha.100' }}
                onClick={() => setSelected(s.key)}>
                <Flex align="center" gap={2} wrap="wrap">
                  <Text fontSize="sm" fontFamily="mono">{s.key}</Text>
                  {s.stores.length > 1 && (
                    <Badge colorScheme="yellow" fontSize="0.6rem">DIFF</Badge>
                  )}
                  {s.kind !== 'standing' && (
                    <Badge colorScheme={KIND_COLOR[s.kind]} fontSize="0.6rem">
                      {KIND_BADGE[s.kind]}
                    </Badge>
                  )}
                </Flex>
                <Text fontSize="xs" color="gray.500">
                  {s.animations} anims{s.faces ? ` · ${s.faces} faces` : ''}
                </Text>
              </Box>
            ))}
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
                  <Text fontWeight="bold" fontFamily="mono">{current.key}</Text>
                </WrapItem>
                <WrapItem><Badge>{KIND_LABEL[current.kind]}</Badge></WrapItem>
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
