import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import {
  Box, Center, Flex, HStack, Input, SimpleGrid, Spinner, Text, VStack,
} from '@chakra-ui/react';
import { FilterChip, FilterRow } from '@/components/filters';
import { ItemIcon } from '@/components/itemIcon';
import { AmountField, Stepper } from '@/components/unitPlan';
import {
  loadCharacters, loadGrowth, loadIcons, loadItems,
  type CharacterData, type GrowthData, type IconManifest,
} from '@/lib/data';
import { useFarm } from '@/lib/farmStore';
import { gameText, useGameLang, type GameLang } from '@/lib/gameText';
import { pick, useLang, useT } from '@/lib/i18n';
import { hasIcon } from '@/lib/icons';
import {
  CATEGORY_LABEL, CATEGORY_ORDER, itemCategory, itemHref, planNeeds,
  type ItemCategory, type ItemEntry, type ItemIndex,
} from '@/lib/items';
import { DROP_ICON_GROUPS } from '@/lib/stages';

type View = 'all' | 'planner';

export default function ItemsPage() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const [index, setIndex] = useState<ItemIndex | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ItemCategory | null>(null);
  const [view, setView] = useState<View>('all');
  const inventory = useFarm((s) => s.inventory);
  const units = useFarm((s) => s.units);
  const setInventory = useFarm((s) => s.setInventory);

  useEffect(() => {
    loadItems().then(setIndex).catch((e) => setError(String(e)));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadGrowth().then(setGrowth).catch(() => setGrowth(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
  }, []);

  const needs = useMemo(
    () => (growth && chars ? planNeeds(growth, chars, units).total : {}), [growth, chars, units]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!index) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  const needle = query.trim().toLowerCase();
  const rows = Object.entries(index.items)
    .filter(([ref, e]) => (!category || itemCategory(e) === category)
      && (view === 'all' || (inventory[ref] ?? 0) > 0 || (needs[ref] ?? 0) > 0)
      && (!needle || Object.values(e.name).some((n) => n?.toLowerCase().includes(needle))))
    .sort(([a, ea], [b, eb]) => CATEGORY_ORDER.indexOf(itemCategory(ea)) - CATEGORY_ORDER.indexOf(itemCategory(eb))
      || (eb.grade ?? 0) - (ea.grade ?? 0) || a.localeCompare(b, undefined, { numeric: true }));

  return (
    <VStack align="stretch" spacing={4}>
      <Head><title>MAD Viewer — {t('navItems')}</title></Head>
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('navItems')}</Text>
        <Text fontSize="sm" color="gray.500">{t('countOf', { shown: rows.length, total: Object.keys(index.items).length })}</Text>
        <Box flex="1" />
      </Flex>
      <Flex gap={3} wrap="wrap" align="center">
        <Input size="sm" maxW="20rem" placeholder={t('search')} value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <HStack spacing={1}>
          <FilterChip active={view === 'all'} onClick={() => setView('all')}>{t('itemsAll')}</FilterChip>
          <FilterChip active={view === 'planner'} onClick={() => setView('planner')}>{t('itemsPlanner')}</FilterChip>
        </HStack>
      </Flex>
      <FilterRow label={t('itemsCategory')}>
        {[
          <FilterChip key="all" active={!category} onClick={() => setCategory(null)}>{t('itemsAll')}</FilterChip>,
          ...CATEGORY_ORDER.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {pick(CATEGORY_LABEL[c], lang)}
            </FilterChip>
          )),
        ]}
      </FilterRow>
      {CATEGORY_ORDER.map((c) => {
        const section = rows.filter(([, e]) => itemCategory(e) === c);
        if (!section.length) return null;
        return (
          <Box key={c}>
            <HStack spacing={2} mb={2}>
              <Text fontSize="sm" fontWeight="bold" color="gray.400" textTransform="uppercase" letterSpacing="wide">
                {pick(CATEGORY_LABEL[c], lang)}
              </Text>
              <Text fontSize="xs" color="gray.600">{section.length}</Text>
            </HStack>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing={2}>
              {section.map(([ref, entry]) => (
                <ItemTile key={ref} itemRef={ref} entry={entry} icons={icons} gameLang={gameLang}
                  held={inventory[ref] ?? 0} need={needs[ref] ?? 0} onHeld={(n) => setInventory(ref, n)} />
              ))}
            </SimpleGrid>
          </Box>
        );
      })}
    </VStack>
  );
}

function ItemTile({ itemRef, entry, icons, gameLang, held, need, onHeld }: {
  itemRef: string; entry: ItemEntry; icons: IconManifest | null; gameLang: GameLang;
  held: number; need: number; onHeld: (n: number) => void;
}) {
  const t = useT();
  const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry.icon)) ?? 'item';
  const short = Math.max(0, need - held);
  return (
    <HStack spacing={2} p={2} borderRadius="md" borderWidth="1px" minW={0}
      borderColor={short > 0 ? 'orange.400' : 'whiteAlpha.200'} bg="whiteAlpha.50">
      <ItemIcon manifest={icons} group={group} name={entry.icon} grade={entry.grade} size={10}
        href={itemHref(itemRef)} />
      <VStack align="stretch" spacing={1} minW={0} flex="1">
        <Text as={NextLink} href={itemHref(itemRef)} fontSize="sm" fontWeight="bold" noOfLines={1}
          _hover={{ color: 'yellow.300' }}>
          {gameText(entry.name, gameLang)}
        </Text>
        <HStack spacing={2} wrap="wrap">
          <Stepper value={held} onChange={onHeld}>
            <AmountField value={held} min={0} max={Number.MAX_SAFE_INTEGER}
              width={entry.kind === 'item' ? '4rem' : '5.5rem'} big onChange={onHeld} />
          </Stepper>
          {need > 0 && (
            <Text fontSize="2xs" color={short > 0 ? 'orange.300' : 'green.300'}>
              {short > 0 ? t('itemsShortN', { n: short.toLocaleString() }) : t('itemsNeedN', { n: need.toLocaleString() })}
            </Text>
          )}
        </HStack>
      </VStack>
    </HStack>
  );
}
