import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckIcon, ChevronDownIcon, CloseIcon, StarIcon, ViewIcon, ViewOffIcon,
} from '@chakra-ui/icons';
import NextLink from 'next/link';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel,
  Badge, Box, Center, Flex, HStack, Input, SimpleGrid, Spinner, Tab, TabList,
  TabPanel, TabPanels, Tabs, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { Panel } from '@/components/skillKit';
import { FilterChip } from '@/components/filters';
import { InventoryDialog } from '@/components/inventoryDialog';
import { UnitPlanDialog } from '@/components/unitPlanDialog';
import { MaterialNeeds } from '@/components/materialNeeds';
import { PlannerTutorial, TutorialReplay } from '@/components/plannerTutorial';
import { AmountField, Stepper } from '@/components/unitPlan';
import { hasIcon } from '@/lib/icons';
import { useFarm } from '@/lib/farmStore';
import { useCollection } from '@/lib/collectionStore';
import { exportPlan, importPlan, planFileName } from '@/lib/planFile';
import {
  MATERIAL_ICON_GROUPS, billCovered, billIsEmpty, farmPlan, farmStages, isHardStage,
  mergeBills, needLabel, needsOf, planStar, spendBill, unitBill,
  type Bill, type FarmPlan, type FarmRoute, type NeedPlan, type StageSource,
  type UnitPlanPair,
} from '@/lib/farm';
import { memoryPlan, starCap, stepCost, type MemoryPlan } from '@/lib/rank';

type NeedLabel = ReturnType<typeof needLabel>;
import { characterName, isPlayable } from '@/lib/characters';
import { groupLabel, stageName } from '@/lib/stages';
import { dataText, useLang, useT, type Lang } from '@/lib/i18n';
import {
  loadCharacters, loadGrowth, loadIcons, loadStages,
  type CharacterData, type CharacterEntry, type GrowthData, type IconManifest,
  type StageData, type StageEntry,
} from '@/lib/data';

type UnitSort = 'name' | 'memories' | 'materials' | 'star';

const UNIT_SORTS: { key: UnitSort; label: 'planSortName' | 'planSortMemories'
  | 'planSortMaterials' | 'planSortStar' }[] = [
  { key: 'name', label: 'planSortName' },
  { key: 'memories', label: 'planSortMemories' },
  { key: 'materials', label: 'planSortMaterials' },
  { key: 'star', label: 'planSortStar' },
];

const materialGroup = (icons: IconManifest | null, name?: string | null) =>
  (MATERIAL_ICON_GROUPS.find((g) => hasIcon(icons, g, name))
    ?? MATERIAL_ICON_GROUPS[0]) as never;

const STARS = [0, 1, 2, 3];

export default function FarmPage() {
  const t = useT();
  const lang = useLang();
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [stages, setStages] = useState<StageData | null>(null);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInventory, setShowInventory] = useState(false);

  const units = useFarm((s) => s.units);
  const inventory = useFarm((s) => s.inventory);
  const clears = useFarm((s) => s.clears);
  const sweepOnly = useFarm((s) => s.sweepOnly);
  const setSweepOnly = useFarm((s) => s.setSweepOnly);
  const hardStages = useFarm((s) => s.hardStages);
  const setHardStages = useFarm((s) => s.setHardStages);

  useEffect(() => {
    loadGrowth().then(setGrowth).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadStages().then(setStages).catch((e) => setError(String(e)));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const pool = useMemo(
    () => (growth && stages ? farmStages(growth, stages) : []), [growth, stages]);

  // Routes only: the clear record still covers every stage.
  const routePool = useMemo(
    () => (hardStages ? pool : pool.filter((s) => !isHardStage(s))), [pool, hardStages]);

  // A hidden unit keeps its plan and stays off the bill; a prioritised one is costed against the whole inventory, the rest against what is left.
  const plans = useMemo(() => {
    if (!growth || !chars) return null;
    const billOf = (wanted: boolean) => mergeBills(
      Object.entries(units).flatMap(([code, pair]) => {
        const entry = chars.characters[code];
        return entry && pair.listed && !pair.hidden && !!pair.priority === wanted
          ? [unitBill(growth, entry, chars, pair)] : [];
      }));
    const first = billOf(true);
    const rest = billOf(false);
    if (billIsEmpty(first)) {
      return {
        main: farmPlan(growth, routePool, rest, inventory, clears, sweepOnly),
        rest: null,
        leftover: inventory,
      };
    }
    const leftover = spendBill(growth, first, inventory);
    return {
      main: farmPlan(growth, routePool, first, inventory, clears, sweepOnly),
      rest: farmPlan(growth, routePool, rest, leftover, clears, sweepOnly),
      leftover,
    };
  }, [growth, chars, units, inventory, clears, sweepOnly, routePool]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!growth || !chars || !stages || !plans) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  const recorded = Object.values(clears).filter((n) => n > 0).length;
  const counted = Object.values(inventory).filter((n) => n > 0).length;

  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('planTitle')}</Text>
        <Box flex="1" />
        <TutorialReplay />
        <PlanFile />
        <FilterChip active={false} onClick={() => setShowInventory(true)}>
          {t('planInventory')}
          <Text as="span" color="gray.500">{counted || ''}</Text>
        </FilterChip>
        <FilterChip active={sweepOnly} onClick={() => setSweepOnly(!sweepOnly)}>
          {t('farmSweepOnly')}
          <Text as="span" color="gray.500">{t('farmSweepHint')}</Text>
        </FilterChip>
        <FilterChip active={hardStages} onClick={() => setHardStages(!hardStages)}>
          {t('farmHardStages')}
          <Text as="span" color="gray.500">{t('farmHardHint')}</Text>
        </FilterChip>
      </Flex>

      <InventoryDialog growth={growth} icons={icons} isOpen={showInventory}
        onClose={() => setShowInventory(false)} />
      <PlannerTutorial />

      <Tabs variant="line" colorScheme="yellow" isLazy>
        <TabList borderColor="whiteAlpha.200" overflowX="auto">
          <Tab fontSize="sm" whiteSpace="nowrap">
            <HStack spacing={2}>
              <Text>{t('farmTabUnits')}</Text>
              <Badge fontSize="0.6rem">
                {Object.values(units).filter((u) => u.listed && !u.hidden).length}
                {Object.values(units).some((u) => u.listed && u.hidden)
                  ? `/${Object.values(units).filter((u) => u.listed).length}` : ''}
              </Badge>
            </HStack>
          </Tab>
          <Tab fontSize="sm" whiteSpace="nowrap">{t('farmTabPlan')}</Tab>
          <Tab fontSize="sm" whiteSpace="nowrap">
            <HStack spacing={2}>
              <Text>{t('farmTabClears')}</Text>
              <Badge fontSize="0.6rem">{recorded}/{pool.length}</Badge>
            </HStack>
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0} pt={4}>
            <Units data={chars} growth={growth} stages={stages} pool={pool} icons={icons}
              leftover={plans.leftover} />
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <VStack align="stretch" spacing={5}>
              <PlanPanel plan={plans.main} growth={growth} stages={stages} icons={icons}
                title={plans.rest ? t('farmPriority') : undefined} />
              {plans.rest && (
                <PlanPanel plan={plans.rest} growth={growth} stages={stages} icons={icons}
                  title={t('farmRest')} />
              )}
            </VStack>
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <Clears data={stages} pool={pool} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
}

function PlanFile() {
  const t = useT();
  const units = useFarm((s) => s.units);
  const clears = useFarm((s) => s.clears);
  const inventory = useFarm((s) => s.inventory);
  const [failed, setFailed] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const save = () => {
    const url = URL.createObjectURL(
      new Blob([exportPlan()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = planFileName();
    link.click();
    URL.revokeObjectURL(url);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    const held = Object.keys(units).length || Object.keys(clears).length
      || Object.keys(inventory).length;
    if (held && !window.confirm(t('farmImportConfirm'))) return;
    setFailed(!importPlan(await file.text()));
  };

  return (
    <HStack spacing={2}>
      {failed && <Text fontSize="xs" color="red.300">{t('farmImportFailed')}</Text>}
      <Box as="button" fontSize="xs" color="gray.400" _hover={{ color: 'yellow.200' }}
        onClick={save}>{t('farmExport')}</Box>
      <Box as="button" fontSize="xs" color="gray.400" _hover={{ color: 'yellow.200' }}
        onClick={() => picker.current?.click()}>{t('farmImport')}</Box>
      <Input ref={picker} type="file" accept="application/json,.json" display="none"
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }} />
    </HStack>
  );
}

function Units({ data, growth, stages, pool, icons, leftover }: {
  data: CharacterData; growth: GrowthData; stages: StageData; pool: StageEntry[];
  icons: IconManifest | null;
  /** What is left once the prioritised units have taken their share. */
  leftover: Record<string, number>;
}) {
  const t = useT();
  const lang = useLang();
  const units = useFarm((s) => s.units);
  const inventory = useFarm((s) => s.inventory);
  const addUnit = useFarm((s) => s.addUnit);
  const addUnits = useFarm((s) => s.addUnits);
  const collected = useCollection((s) => s.collected);
  const favorites = useCollection((s) => s.favorites);
  const [query, setQuery] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [favesOnly, setFavesOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<UnitSort>('name');
  const [shown, setShown] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [totalsOpen, setTotalsOpen] = useState(false);

  // Only the playable roster carries a material group, so only it can be costed.
  const roster = useMemo(() => Object.values(data.characters)
    .filter((e) => isPlayable(e) && e.skillMaterialGroup)
    .sort((a, b) => characterName(a, lang).localeCompare(characterName(b, lang))),
  [data, lang]);

  const hard = useMemo(() => pool.filter(isHardStage), [pool]);

  const needle = query.trim().toLowerCase();
  const matches = roster.filter((e) => !units[e.code]?.listed
    && (!ownedOnly || collected[e.code])
    && (!favesOnly || favorites[e.code])
    && (!needle || characterName(e, lang).toLowerCase().includes(needle)
      || e.code.toLowerCase().includes(needle)
      || (e.nameEn ?? '').toLowerCase().includes(needle)));

  // Costed once per render, then reused by the sort and by every row.
  const tracked = useMemo(() => Object.entries(units)
    .flatMap(([code, pair]) => {
      const entry = data.characters[code];
      if (!entry || !pair.listed) return [];
      const bill = unitBill(growth, entry, data, pair);
      const from = planStar(pair.current, entry);
      const to = Math.min(planStar(pair.target, entry), starCap(growth.star));
      const ref = growth.star?.pieces[code] ?? null;
      return [{
        entry,
        pair,
        bill,
        from,
        to,
        memories: memoryPlan(growth.star, code, stepCost(growth.star, from, to),
          ref ? inventory[ref] ?? 0 : 0, pair.bought ?? 0, hard),
        materials: needsOf(growth, bill, inventory)
          .reduce((n, need) => n + need.short, 0),
      }];
    }), [units, data, growth, inventory, hard]);

  const totalBill = useMemo(
    () => mergeBills(tracked.filter((r) => !r.pair.hidden).map((r) => r.bill)), [tracked]);
  const totalShort = useMemo(
    () => needsOf(growth, totalBill, inventory).filter((n) => n.short > 0).length,
    [growth, totalBill, inventory]);

  const ordered = useMemo(() => [...tracked].sort((a, b) => {
    const away = Number(!!a.pair.hidden) - Number(!!b.pair.hidden);
    if (away) return away;
    const name = () => characterName(a.entry, lang).localeCompare(characterName(b.entry, lang));
    switch (sort) {
      case 'memories': return b.memories.short - a.memories.short || name();
      case 'materials': return b.materials - a.materials || name();
      case 'star': return a.from - b.from || b.to - a.to || name();
      default: return name();
    }
  }), [tracked, sort, lang]);

  const choose = (code: string) => {
    addUnit(code);
    setQuery('');
    setOpen(false);
    setShown(code);
  };

  const unlisted = roster.filter((e) => !units[e.code]?.listed);
  const pending = unlisted.filter((e) => collected[e.code]);
  const pendingFaves = unlisted.filter((e) => favorites[e.code]);

  return (
    <VStack align="stretch" spacing={3}>
      <Flex align="center" gap={2} wrap="wrap">
        {/* the entry point people missed: full width until the list has units */}
        <Box position="relative" flex="1" minW={{ base: '100%', md: '22rem' }}
          maxW={{ base: 'none', md: tracked.length ? '26rem' : 'none' }} zIndex={2}>
          <Input size="lg" value={query} placeholder={t('farmSearchUnit')}
            fontSize="md" fontWeight="600" pl={12} h="3.25rem"
            borderWidth="2px" borderColor={open ? 'yellow.400' : 'yellow.500'}
            bg="whiteAlpha.100" _hover={{ borderColor: 'yellow.400' }}
            _placeholder={{ color: 'gray.300', fontWeight: '600' }}
            _focusVisible={{ borderColor: 'yellow.300', boxShadow: '0 0 0 1px var(--chakra-colors-yellow-300)' }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && matches[0]) choose(matches[0].code);
            }} />
          <Text position="absolute" left={5} top="50%" transform="translateY(-50%)"
            fontSize="2xl" lineHeight={1} fontWeight="800" color="yellow.400"
            pointerEvents="none" aria-hidden>+</Text>
          {open && matches.length > 0 && (
            // Without this the blur closes the list before the click lands.
            <VStack align="stretch" spacing={0} position="absolute" top="100%" left={0}
              right={0} mt={1} maxH="18rem" overflowY="auto" borderWidth="1px"
              borderColor="whiteAlpha.300" borderRadius="md" bg="gray.800"
              boxShadow="lg" onMouseDown={(e) => e.preventDefault()}>
              {matches.map((entry) => (
                <Box as="button" key={entry.code} px={2} py={1} textAlign="left"
                  _hover={{ bg: 'whiteAlpha.200' }} onClick={() => choose(entry.code)}>
                  <HStack spacing={2}>
                    <GameIcon manifest={icons} group="char" size={6}
                      names={[entry.iconPath, `Icon_${entry.code}`]} />
                    <Text fontSize="sm" noOfLines={1}>{characterName(entry, lang)}</Text>
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </Box>
        <FilterChip active={ownedOnly} onClick={() => setOwnedOnly(!ownedOnly)}>
          {t('farmOnlyCollected')}
        </FilterChip>
        <FilterChip active={favesOnly} onClick={() => setFavesOnly(!favesOnly)}>
          {t('farmOnlyFavorites')}
        </FilterChip>
        {pending.length > 0 && (
          <FilterChip active={false}
            onClick={() => addUnits(pending.map((e) => e.code))}>
            {t('farmAddCollected')}
            <Text as="span" color="gray.500">{pending.length}</Text>
          </FilterChip>
        )}
        {pendingFaves.length > 0 && (
          <FilterChip active={false}
            onClick={() => addUnits(pendingFaves.map((e) => e.code))}>
            {t('farmAddFavorites')}
            <Text as="span" color="gray.500">{pendingFaves.length}</Text>
          </FilterChip>
        )}
      </Flex>

      {tracked.length > 1 && (
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontSize="0.65rem" color="gray.500" textTransform="uppercase"
            letterSpacing="0.11em" fontWeight="700">{t('rankSortBy')}</Text>
          {UNIT_SORTS.map(({ key, label }) => (
            <FilterChip key={key} active={sort === key} onClick={() => setSort(key)}>
              {t(label)}
            </FilterChip>
          ))}
        </Flex>
      )}

      {tracked.length > 0 && (
        <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg"
          bg="whiteAlpha.50">
          <Flex as="button" w="100%" align="center" gap={2} px={3} py={2.5}
            aria-expanded={totalsOpen} onClick={() => setTotalsOpen(!totalsOpen)}
            _hover={{ bg: 'whiteAlpha.100' }} borderRadius="lg">
            <Text fontSize="0.65rem" color="gray.400" textTransform="uppercase"
              fontWeight="700" letterSpacing="0.11em">{t('planTotalNeeds')}</Text>
            <Text fontSize="xs" color={totalShort ? 'yellow.200' : 'green.300'}
              fontFamily="mono">
              {totalShort ? t('planShortCount', { n: totalShort }) : t('planAllCovered')}
            </Text>
            <Box flex="1" />
            <ChevronDownIcon color="gray.500" boxSize={4}
              transform={totalsOpen ? 'rotate(180deg)' : undefined}
              transition="transform 0.15s" />
          </Flex>
          {totalsOpen && (
            <Box px={3} pb={3} pt={0.5}>
              <MaterialNeeds bill={totalBill} growth={growth} icons={icons} lang={lang}
                inventory={inventory} />
            </Box>
          )}
        </Box>
      )}

      {ordered.length === 0 ? (
        <Box borderWidth="1px" borderStyle="dashed" borderColor="whiteAlpha.300"
          borderRadius="xl" py={10} px={6} textAlign="center">
          <Text fontSize="md" fontWeight="700" color="gray.200">{t('farmNoUnits')}</Text>
          <Text fontSize="sm" color="gray.500" mt={1}>{t('planAddHint')}</Text>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={2} alignItems="start">
          {ordered.map((row) => (
            <UnitRow key={row.entry.code} row={row} growth={growth} icons={icons}
              leftover={leftover} lang={lang} onOpen={() => setShown(row.entry.code)}
              open={!!expanded[row.entry.code]}
              onExpand={() => setExpanded((held) => {
                const next = { ...held };
                if (next[row.entry.code]) delete next[row.entry.code];
                else next[row.entry.code] = true;
                return next;
              })} />
          ))}
        </SimpleGrid>
      )}

      <UnitPlanDialog entry={shown ? data.characters[shown] ?? null : null} data={data}
        growth={growth} stages={stages} hard={hard} icons={icons} leftover={leftover}
        isOpen={!!shown} onClose={() => setShown(null)} />
    </VStack>
  );
}

type TrackedUnit = {
  entry: CharacterEntry;
  pair: UnitPlanPair;
  bill: Bill;
  from: number;
  to: number;
  memories: MemoryPlan;
  materials: number;
};

function RowAction({ label, hint, active, disabled, danger, onClick, children }: {
  /** The accessible name: what the button does, never its current state. */
  label: string; hint?: string; active?: boolean; disabled?: boolean;
  danger?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const idle = active ? 'yellow.300' : 'gray.500';
  return (
    <Box as="button" aria-label={label} title={hint ?? label} aria-pressed={active}
      aria-disabled={disabled || undefined}
      px={1.5} py={1} borderRadius="md" lineHeight={1} flexShrink={0}
      color={disabled ? 'whiteAlpha.300' : idle}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      _hover={disabled ? undefined
        : { bg: 'whiteAlpha.200', color: danger ? 'red.300' : 'yellow.200' }}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}>
      {children}
    </Box>
  );
}

// The row is a summary plus its own actions; the dialog is only for editing.
function UnitRow({ row, growth, icons, leftover, lang, onOpen, open, onExpand }: {
  row: TrackedUnit; growth: GrowthData; icons: IconManifest | null;
  leftover: Record<string, number>; lang: Lang; onOpen: () => void;
  open: boolean; onExpand: () => void;
}) {
  const t = useT();
  const inventory = useFarm((s) => s.inventory);
  const setHidden = useFarm((s) => s.setHidden);
  const setPriority = useFarm((s) => s.setPriority);
  const setListed = useFarm((s) => s.setListed);
  const removeUnit = useFarm((s) => s.removeUnit);
  const completeUnit = useFarm((s) => s.completeUnit);
  const collected = useCollection((s) => !!s.collected[row.entry.code]);
  const { entry, pair, bill, from, to, memories, materials } = row;
  const priority = pair.priority ?? false;
  const hidden = pair.hidden ?? false;
  const owing = !!(bill.unitExp || bill.equipExp || Object.keys(bill.materials).length > 0);
  const covered = billCovered(growth, bill, priority ? inventory : leftover);
  const material = memories.ref ? growth.materials[memories.ref] : null;
  const gear = Object.values(pair.target.gear ?? {})
    .reduce((n, g) => Math.max(n, g.tier), 0);

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md"
      bg="whiteAlpha.50" opacity={hidden ? 0.45 : 1}
      _hover={{ borderColor: 'yellow.400' }}>
    <Flex align="center" gap={2} px={3} py={2} w="100%">
      <Flex as="button" onClick={onOpen} align="center" gap={2.5} flex="1" minW={0}
        textAlign="left" title={t('planOpenPlan')}>
        <GameIcon manifest={icons} group="char" size={8}
          names={[entry.iconPath, `Icon_${entry.code}`]} />
        <Box minW={0} flex="1">
          <HStack spacing={1.5}>
            <Text fontWeight="bold" fontSize="sm" noOfLines={1}>
              {characterName(entry, lang)}
            </Text>
            {priority && (
              <Badge fontSize="0.5rem" colorScheme="yellow">{t('farmPriority')}</Badge>
            )}
          </HStack>
          <HStack spacing={2} fontSize="0.65rem" color="gray.500">
            <Text fontFamily="mono" color={to > from ? 'yellow.300' : 'gray.600'}>
              {from === to ? `${from}★` : `${from}★→${to}★`}
            </Text>
            <Text fontFamily="mono">
              {t('dialLevel')} {pair.current.level}
              {pair.target.level > pair.current.level ? `→${pair.target.level}` : ''}
            </Text>
            {gear > 0 && <Text fontFamily="mono">T{gear}</Text>}
          </HStack>
        </Box>

        {memories.short > 0 && (
          <HStack spacing={1.5} flexShrink={0}>
            <ItemIcon manifest={icons} group={materialGroup(icons, material?.icon)}
              name={material?.icon} grade={material?.grade} size={6}
              title={dataText(lang, material?.name, material?.nameEn) || undefined} />
            <Text fontSize="sm" fontFamily="mono" color="yellow.200">
              {memories.short.toLocaleString()}
            </Text>
          </HStack>
        )}

        <Box textAlign="right" flexShrink={0} minW="3.5rem">
          <Text fontSize="0.6rem" color="gray.500" textTransform="uppercase"
            letterSpacing="0.08em">{t('planShort')}</Text>
          <Text fontSize="sm" fontFamily="mono"
            color={materials ? 'gray.200' : 'green.300'}>
            {materials ? materials.toLocaleString() : covered ? '✓' : '—'}
          </Text>
        </Box>
      </Flex>

      <HStack spacing={0} flexShrink={0} borderLeftWidth="1px"
        borderColor="whiteAlpha.200" pl={1.5}>
        <RowAction label={t('farmPriority')} active={priority}
          onClick={() => setPriority(entry.code, !priority)}>
          <StarIcon boxSize={3} />
        </RowAction>
        <RowAction label={hidden ? t('farmShow') : t('farmHide')} active={hidden}
          onClick={() => setHidden(entry.code, !hidden)}>
          {hidden ? <ViewOffIcon boxSize={3.5} /> : <ViewIcon boxSize={3.5} />}
        </RowAction>
        <RowAction label={t('farmComplete')} disabled={!owing || !covered}
          hint={!owing ? t('planNothingOwed')
            : covered ? t('farmCompleteHint') : t('farmCompleteShort')}
          onClick={() => completeUnit(entry.code, spendBill(growth, bill, inventory))}>
          <CheckIcon boxSize={3} color={owing && covered ? 'green.300' : undefined} />
        </RowAction>
        <RowAction label={t('farmRemove')} danger
          onClick={() => (collected ? setListed(entry.code, false)
            : removeUnit(entry.code))}>
          <CloseIcon boxSize={2.5} />
        </RowAction>
        <RowAction label={t('planShowMaterials')} active={open} onClick={onExpand}>
          <ChevronDownIcon boxSize={4}
            transform={open ? 'rotate(180deg)' : undefined} transition="transform 0.15s" />
        </RowAction>
      </HStack>
    </Flex>
      {open && (
        <Box px={3} pb={3} borderTopWidth="1px" borderColor="whiteAlpha.100" pt={2.5}>
          {owing ? (
            <MaterialNeeds bill={bill} growth={growth} icons={icons} lang={lang}
              inventory={priority ? inventory : leftover} size={6} />
          ) : (
            <Text fontSize="xs" color="gray.600">{t('planNothingOwed')}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

function Clears({ data, pool }: { data: StageData; pool: StageEntry[] }) {
  const t = useT();
  const lang = useLang();
  const clears = useFarm((s) => s.clears);
  const setStars = useFarm((s) => s.setStars);
  const setStarsMany = useFarm((s) => s.setStarsMany);

  const groups = useMemo(() => {
    const byKey = new Map<string, StageEntry[]>();
    for (const stage of pool) byKey.set(stage.group, [...(byKey.get(stage.group) ?? []), stage]);
    return [...byKey.entries()].flatMap(([key, stages]) => {
      const group = data.groups[key];
      return group ? [{ group, stages: [...stages].sort((a, b) => a.id - b.id) }] : [];
    });
  }, [pool, data]);

  const recorded = pool.filter((s) => (clears[String(s.id)] ?? 0) > 0).length;

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.500">
        {t('farmClearsHint', { n: recorded, total: pool.length })}
      </Text>
      {/* every zone collapsed: 259 stages over 21 lists is not a page you scroll */}
      <Accordion allowMultiple reduceMotion>
        <VStack align="stretch" spacing={2}>
          {groups.map(({ group, stages }) => {
            const done = stages.filter((s) => (clears[String(s.id)] ?? 0) > 0).length;
            return (
              <AccordionItem key={group.key} border="none">
                <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="xl"
                  bg="linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))"
                  boxShadow="0 12px 32px rgba(0,0,0,0.12)" overflow="hidden">
                  <AccordionButton px={{ base: 3, md: 4 }} py={3}
                    _hover={{ bg: 'whiteAlpha.100' }}>
                    <Flex flex="1" align="baseline" gap={2} wrap="wrap" textAlign="left">
                      <Text fontSize="0.65rem" color="gray.400" textTransform="uppercase"
                        fontWeight="700" letterSpacing="0.11em">
                        {groupLabel(data, group, lang)}
                      </Text>
                      <Text fontSize="xs" fontFamily="mono"
                        color={done === stages.length ? 'green.300'
                          : done ? 'yellow.200' : 'gray.600'}>
                        {done}/{stages.length}
                      </Text>
                    </Flex>
                    <AccordionIcon color="gray.500" />
                  </AccordionButton>
                  <AccordionPanel px={{ base: 3, md: 4 }} pb={4} pt={0}>
                    <Wrap spacing={1} mb={2}>
                      {STARS.map((star) => (
                        <WrapItem key={star}>
                          <Box as="button" px={2} py={0.5} fontSize="xs" borderWidth="1px"
                            borderRadius="md" borderColor="whiteAlpha.200" color="gray.400"
                            _hover={{ borderColor: 'yellow.400', color: 'yellow.200' }}
                            onClick={() => setStarsMany(stages.map((s) => s.id), star)}>
                            {t('farmSetAll')} {star ? `${star}★` : t('farmUncleared')}
                          </Box>
                        </WrapItem>
                      ))}
                    </Wrap>
                    <Box overflowX="auto">
                      <VStack align="stretch" spacing={0.5} minW="300px">
                        {stages.map((stage) => {
                          const stars = clears[String(stage.id)] ?? 0;
                          return (
                            <Flex key={stage.id} align="center" gap={2} py={0.5}
                              borderTopWidth="1px" borderColor="whiteAlpha.100">
                              <Text as={NextLink} fontSize="sm" flex="1" minW={0} noOfLines={1}
                                href={{ pathname: '/stage', query: { id: stage.id } }}
                                _hover={{ color: 'yellow.300' }}>
                                {stageName(data, stage, lang)}
                              </Text>
                              {stage.stamina != null && (
                                <Text fontSize="0.6rem" color="gray.600" whiteSpace="nowrap">
                                  {t('farmStamina', { n: stage.stamina })}
                                </Text>
                              )}
                              <HStack spacing={0.5}>
                                {STARS.map((star) => (
                                  <Box key={star} as="button" px={1.5} py={0.5} fontSize="xs"
                                    borderWidth="1px" borderRadius="md" lineHeight={1.2}
                                    borderColor={star === stars ? 'yellow.400' : 'whiteAlpha.200'}
                                    color={star === stars ? 'yellow.200' : 'gray.500'}
                                    onClick={() => setStars(stage.id, star)}
                                    aria-label={`${stageName(data, stage, lang)} ${star}`}>
                                    {star ? `${star}★` : '—'}
                                  </Box>
                                ))}
                              </HStack>
                            </Flex>
                          );
                        })}
                      </VStack>
                    </Box>
                  </AccordionPanel>
                </Box>
              </AccordionItem>
            );
          })}
        </VStack>
      </Accordion>
    </VStack>
  );
}

function PlanPanel({ plan, growth, stages, icons, title }: {
  plan: FarmPlan; growth: GrowthData; stages: StageData; icons: IconManifest | null;
  title?: string;
}) {
  const t = useT();
  const lang = useLang();
  const short = plan.needs.filter((p) => p.need.short > 0);
  const labels = new Map(plan.needs.map(
    (p) => [p.need.key, needLabel(growth, p.need, lang)] as const));

  if (plan.needs.length === 0) {
    return (
      <Text fontSize="sm" color="gray.500">
        {title ? `${title} — ${t('farmNoPlan')}` : t('farmNoPlan')}
      </Text>
    );
  }

  return (
    <VStack align="stretch" spacing={3}>
      {title && (
        <Text fontSize="xs" color="gray.500" textTransform="uppercase"
          letterSpacing="wide">{title}</Text>
      )}
      {/* one figure per entry currency: a story clear and a daily clear do not
          spend the same stamina, so a single total would be a fiction */}
      <Wrap spacing={4}>
        <WrapItem>
          <Total label={t('farmTotalRuns')} value={plan.runs.toLocaleString()} />
        </WrapItem>
        {Object.entries(plan.cost).map(([ref, amount]) => (
          <WrapItem key={ref}>
            <Total value={amount.toLocaleString()}
              label={stages.drops[ref]?.name || ref}
              icon={<ItemIcon manifest={icons} group={materialGroup(icons,
                stages.drops[ref]?.icon)} name={stages.drops[ref]?.icon} size={5}
                grade={stages.drops[ref]?.grade} />} />
          </WrapItem>
        ))}
      </Wrap>

      {plan.blocked.length > 0 && (
        <Text fontSize="xs" color="orange.300">{t('farmBlockedNote')}</Text>
      )}

      {short.length === 0 ? (
        <Text fontSize="sm" color="green.300">{t('farmDone')}</Text>
      ) : null}

      {plan.routes.length > 0 && (
        <Panel title={t('farmRunList')} note={t('farmRuns', { n: plan.runs.toLocaleString() })}>
          <VStack align="stretch" spacing={1}>
            {plan.routes.map((route) => (
              <RouteLine key={route.stage.id} route={route} labels={labels}
                growth={growth} stages={stages} icons={icons} lang={lang} />
            ))}
          </VStack>
        </Panel>
      )}

      <VStack align="stretch" spacing={2}>
        {plan.needs.map((row) => (
          <NeedRow key={row.need.key} row={row} growth={growth} stages={stages}
            icons={icons} lang={lang} />
        ))}
      </VStack>
    </VStack>
  );
}

// The same clear covering two needs is why the run list is not one stage per material.
function RouteLine({ route, labels, growth, stages, icons, lang }: {
  route: FarmRoute; labels: Map<string, NeedLabel>; growth: GrowthData;
  stages: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const spend = route.entry ? stages.drops[route.entry.ref] : null;
  const drops = repeatDrops(route.stage);
  return (
    <Box borderTopWidth="1px" borderColor="whiteAlpha.100" py={0.5}>
      <Flex align="center" gap={2} wrap="wrap">
        <Text as={NextLink} fontSize="sm" _hover={{ color: 'yellow.300' }}
          href={{ pathname: '/stage', query: { id: route.stage.id } }}>
          {stageName(stages, route.stage, lang)}
        </Text>
        <Text fontSize="0.65rem" color="gray.300" fontFamily="mono">
          {t('farmRuns', { n: route.runs.toLocaleString() })}
        </Text>
        {drops.length > 0 && (
          <Box as="button" fontSize="0.65rem" color={open ? 'gray.200' : 'gray.500'}
            _hover={{ color: 'gray.200' }} onClick={() => setOpen(!open)}>
            {t('farmDrops')} ({drops.length})
          </Box>
        )}
        <Box flex="1" />
        <HStack spacing={1}>
          {Object.entries(route.covers).map(([key, amount]) => {
            const label = labels.get(key);
            return label ? (
              <ItemIcon key={key} manifest={icons}
                group={materialGroup(icons, label.icon)} name={label.icon}
                grade={label.grade} size={6}
                title={`${label.name} ${Math.round(amount).toLocaleString()}`} />
            ) : null;
          })}
        </HStack>
        {route.cost != null && (
          <HStack spacing={1}>
            <GameIcon manifest={icons} group={materialGroup(icons, spend?.icon)}
              name={spend?.icon} size={3.5} reserve={false}
              title={spend?.name ?? undefined} />
            <Text fontSize="0.65rem" color="cyan.300" fontFamily="mono">
              {route.cost.toLocaleString()}
            </Text>
          </HStack>
        )}
      </Flex>
      {open && (
        <Wrap spacing={3} mt={1} pl={2}>
          {drops.map((ref) => (
            <WrapItem key={ref}>
              <DropCell dropRef={ref} growth={growth} stages={stages} icons={icons} />
            </WrapItem>
          ))}
        </Wrap>
      )}
    </Box>
  );
}

// Repeat channel only, and a ref listed twice is still one thing to count.
function repeatDrops(stage: StageEntry): string[] {
  const seen = new Set<string>();
  for (const drop of stage.rewards?.repeat ?? []) if (drop.ref) seen.add(drop.ref);
  return [...seen];
}

// A ref outside `growth.materials` has no Items-tab row, so its count can only be read back here.
function DropCell({ dropRef, growth, stages, icons }: {
  dropRef: string; growth: GrowthData; stages: StageData; icons: IconManifest | null;
}) {
  const inventory = useFarm((s) => s.inventory);
  const setInventory = useFarm((s) => s.setInventory);
  const entry = stages.drops[dropRef];
  const material = growth.materials[dropRef];
  const held = inventory[dropRef] ?? 0;
  return (
    <VStack spacing={1}>
      <ItemIcon manifest={icons} group={materialGroup(icons, entry?.icon)}
        name={entry?.icon} grade={entry?.grade} size={10}
        title={entry?.name || dropRef} />
      <Stepper value={held} onChange={(v) => setInventory(dropRef, v)}>
        <AmountField value={held} min={0} max={999_999_999} width="4rem"
          big={material?.kind === 'goods'}
          onChange={(v) => setInventory(dropRef, v)} />
      </Stepper>
    </VStack>
  );
}

function Total({ label, value, icon }: {
  label: string; value: string; icon?: React.ReactNode;
}) {
  return (
    <Box>
      <HStack spacing={1}>
        {icon}
        <Text fontSize="xs" color="gray.500" textTransform="uppercase"
          letterSpacing="wide">{label}</Text>
      </HStack>
      <Text fontSize="xl" fontWeight="bold" fontFamily="mono" color="yellow.200">
        {value}
      </Text>
    </Box>
  );
}

function NeedRow({ row, growth, stages, icons, lang }: {
  row: NeedPlan; growth: GrowthData; stages: StageData; icons: IconManifest | null;
  lang: Lang;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const inventory = useFarm((s) => s.inventory);
  const setInventory = useFarm((s) => s.setInventory);
  const { need } = row;
  const label = needLabel(growth, need, lang);
  const missing = (growth._noItemRow ?? []).includes(need.key);
  // A pool total is a weighted sum over several items, not one slot.
  const held = need.kind === 'material' ? need.key : null;

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md"
      bg="whiteAlpha.50" px={3} py={2}>
      <Flex align="center" gap={2} wrap="wrap">
        <ItemIcon manifest={icons} group={materialGroup(icons, label.icon)}
          name={label.icon} grade={label.grade} size={10} />
        <Text fontSize="sm" flex="1" minW="8rem">{label.name}</Text>
        <Stat label={t('farmNeed')} value={need.required} />
        {held ? (
          <Box textAlign="right">
            <Text fontSize="0.6rem" color="gray.600">{t('farmHave')}</Text>
            <Stepper value={inventory[held] ?? 0} onChange={(v) => setInventory(held, v)}>
              <AmountField value={inventory[held] ?? 0} min={0} max={999_999_999}
                width="5rem" onChange={(v) => setInventory(held, v)} />
            </Stepper>
          </Box>
        ) : (
          <Stat label={t('farmHave')} value={need.have} muted />
        )}
        <Stat label={t('farmShort')} value={need.short}
          color={need.short ? 'orange.300' : 'green.300'} />
      </Flex>

      {missing ? (
        <Text fontSize="xs" color="gray.600" mt={1}>{t('farmNoItemRow')}</Text>
      ) : need.short > 0 && (
        <Box mt={1.5} pt={1.5} borderTopWidth="1px" borderColor="whiteAlpha.100">
          {row.best ? (
            <SourceLine source={row.best} stages={stages} icons={icons} lang={lang} best />
          ) : (
            <Text fontSize="xs" color="orange.300">{t('farmBlocked')}</Text>
          )}
          {row.sources.length > 1 && (
            <Flex gap={2} align="center" mt={1}>
              <Box as="button" fontSize="0.65rem" color="gray.500"
                _hover={{ color: 'gray.200' }} onClick={() => setOpen(!open)}>
                {t('farmShowAllSources')} ({row.sources.length})
              </Box>
              {row.locked > 0 && (
                <Text fontSize="0.65rem" color="gray.600">
                  {t('farmLocked', { n: row.locked })}
                </Text>
              )}
            </Flex>
          )}
          {open && (
            <VStack align="stretch" spacing={0.5} mt={1}>
              {row.sources.map((source) => (
                <SourceLine key={source.stage.id} source={source} stages={stages}
                  icons={icons} lang={lang} />
              ))}
            </VStack>
          )}
        </Box>
      )}
    </Box>
  );
}

function Stat({ label, value, muted, color }: {
  label: string; value: number; muted?: boolean; color?: string;
}) {
  return (
    <Box textAlign="right" minW="4.5rem">
      <Text fontSize="0.6rem" color="gray.600">{label}</Text>
      <Text fontFamily="mono" fontSize="sm"
        color={color ?? (muted ? 'gray.400' : 'gray.100')}>
        {value.toLocaleString()}
      </Text>
    </Box>
  );
}

// A locked stage is dimmed rather than dropped.
function SourceLine({ source, stages, icons, lang, best }: {
  source: StageSource; stages: StageData; icons: IconManifest | null;
  lang: Lang; best?: boolean;
}) {
  const t = useT();
  const perRun = source.perRun >= 1
    ? Math.round(source.perRun * 10) / 10
    : Number(source.perRun.toPrecision(2));
  const spend = source.entry ? stages.drops[source.entry.ref] : null;
  return (
    <Flex align="center" gap={2} wrap="wrap" opacity={source.open ? 1 : 0.45}>
      {best && <Badge fontSize="0.55rem" colorScheme="yellow">{t('farmBestRoute')}</Badge>}
      <Text as={NextLink} fontSize="xs" _hover={{ color: 'yellow.300' }}
        href={{ pathname: '/stage', query: { id: source.stage.id } }}>
        {stageName(stages, source.stage, lang)}
      </Text>
      <Text fontSize="0.65rem" color="gray.500">
        {source.stars ? `${source.stars}★` : t('farmUncleared')}
      </Text>
      <Box flex="1" />
      <Text fontSize="0.65rem" color="gray.500" fontFamily="mono">
        {t('farmPerRun', { n: perRun })}
      </Text>
      <Text fontSize="0.65rem" color="gray.300" fontFamily="mono">
        {t('farmRuns', { n: (source.runs ?? 0).toLocaleString() })}
      </Text>
      {source.cost != null && (
        <HStack spacing={1}>
          <GameIcon manifest={icons} group={materialGroup(icons, spend?.icon)}
            name={spend?.icon} size={3.5} reserve={false}
            title={spend?.name ?? undefined} />
          <Text fontSize="0.65rem" color="cyan.300" fontFamily="mono">
            {source.cost.toLocaleString()}
          </Text>
        </HStack>
      )}
    </Flex>
  );
}
