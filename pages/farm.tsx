// The farm tracker: what the tracked units still need, what the player already
// holds, and which stages pay it. Every number here is a material count or a
// stamina total — nothing is a battle number.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, HStack, Input, SimpleGrid, Spinner, Tab, TabList,
  TabPanel, TabPanels, Tabs, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { Panel } from '@/components/skillKit';
import { FilterChip } from '@/components/filters';
import { hasIcon } from '@/lib/icons';
import { useFarm } from '@/lib/farmStore';
import {
  MATERIAL_ICON_GROUPS, MATERIAL_KIND_LABEL, billCovered, billIsEmpty, emptyPlan,
  farmPlan, farmStages, formatAmount, gearLevelCap, isHardStage, levellableSkills,
  mergeBills, needLabel, parseAmount, skillCap, spendBill, unitBill,
  type Bill, type FarmPlan, type FarmRoute, type NeedPlan, type StageSource,
  type UnitPlan,
} from '@/lib/farm';

type NeedLabel = ReturnType<typeof needLabel>;
import {
  SKILL_CATEGORY_LABEL, characterName, equipLabel, equipmentSlotsOf, isPlayable,
} from '@/lib/characters';
import { groupLabel, stageName } from '@/lib/stages';
import { pick, useLang, useT, type Lang } from '@/lib/i18n';
import {
  loadCharacters, loadGrowth, loadIcons, loadStages,
  type CharacterData, type CharacterEntry, type GrowthData, type IconManifest,
  type StageData, type StageEntry,
} from '@/lib/data';

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

  // A hidden unit keeps its plan and stays out of the bill — "raise it, but not
  // now" is the whole reason the toggle exists.
  //
  // A prioritised unit is costed against the whole inventory and everything
  // else against what that leaves, so the plan says what still has to be farmed
  // to finish the priority first and stock up for the rest.
  const plans = useMemo(() => {
    if (!growth || !chars) return null;
    const billOf = (wanted: boolean) => mergeBills(
      Object.entries(units).flatMap(([code, pair]) => {
        const entry = chars.characters[code];
        return entry && !pair.hidden && !!pair.priority === wanted
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

  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('navFarm')}</Text>
        <Box flex="1" />
        <FilterChip active={sweepOnly} onClick={() => setSweepOnly(!sweepOnly)}>
          {t('farmSweepOnly')}
          <Text as="span" color="gray.500">{t('farmSweepHint')}</Text>
        </FilterChip>
        <FilterChip active={hardStages} onClick={() => setHardStages(!hardStages)}>
          {t('farmHardStages')}
          <Text as="span" color="gray.500">{t('farmHardHint')}</Text>
        </FilterChip>
      </Flex>

      <Tabs variant="line" colorScheme="yellow" isLazy>
        <TabList borderColor="whiteAlpha.200" overflowX="auto">
          <Tab fontSize="sm" whiteSpace="nowrap">
            <HStack spacing={2}>
              <Text>{t('farmTabUnits')}</Text>
              <Badge fontSize="0.6rem">
                {Object.values(units).filter((u) => !u.hidden).length}
                {Object.values(units).some((u) => u.hidden)
                  ? `/${Object.keys(units).length}` : ''}
              </Badge>
            </HStack>
          </Tab>
          <Tab fontSize="sm" whiteSpace="nowrap">{t('farmTabPlan')}</Tab>
          <Tab fontSize="sm" whiteSpace="nowrap">{t('farmTabItems')}</Tab>
          <Tab fontSize="sm" whiteSpace="nowrap">
            <HStack spacing={2}>
              <Text>{t('farmTabClears')}</Text>
              <Badge fontSize="0.6rem">{recorded}/{pool.length}</Badge>
            </HStack>
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0} pt={4}>
            <Units data={chars} growth={growth} icons={icons} leftover={plans.leftover} />
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
            <Inventory growth={growth} icons={icons} />
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <Clears data={stages} pool={pool} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
}

/**
 * A text field over a number: it accepts `2.5m` and `150k`, keeps what is being
 * typed in local state, and commits on blur so a half-typed value never
 * reaches the store. It re-syncs from the store, but not while it has focus.
 */
function AmountField({ value, min, max, onChange, width = '4.5rem', big, disabled }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
  width?: string; big?: boolean; disabled?: boolean;
}) {
  const shown = big ? formatAmount(value) : String(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setText(shown); }, [shown, editing]);

  return (
    <Input size="xs" value={text} w={width} textAlign="right" fontFamily="mono"
      borderColor="whiteAlpha.300" inputMode="decimal" isDisabled={disabled}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseAmount(text);
        if (parsed != null) onChange(Math.min(max, Math.max(min, parsed)));
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }} />
  );
}

// The step is one because that is how loot arrives; a stack is typed instead,
// with the `k`/`m` suffix for the materials that come in millions.
function Stepper({
  value, min = 0, max = Number.MAX_SAFE_INTEGER, onChange, disabled, children,
}: {
  value: number; min?: number; max?: number; onChange: (v: number) => void;
  disabled?: boolean; children: React.ReactNode;
}) {
  const button = {
    px: 1.5, borderWidth: '1px', borderRadius: 'md', borderColor: 'whiteAlpha.200',
    color: 'gray.400', lineHeight: 1.4, fontSize: 'sm', flexShrink: 0,
    _hover: { borderColor: 'yellow.400', color: 'yellow.200' },
  } as const;
  const spent = { opacity: 0.35, pointerEvents: 'none' } as const;
  return (
    <HStack spacing={1}>
      <Box as="button" aria-label="minus one" {...button}
        {...(disabled || value <= min ? spent : {})}
        onClick={() => onChange(Math.max(min, value - 1))}>−</Box>
      {children}
      <Box as="button" aria-label="plus one" {...button}
        {...(disabled || value >= max ? spent : {})}
        onClick={() => onChange(Math.min(max, value + 1))}>+</Box>
    </HStack>
  );
}

function SideHeads({ t }: { t: (k: 'farmCurrent' | 'farmTarget') => string }) {
  return (
    <>
      <Text fontSize="0.6rem" color="gray.500" textAlign="right">{t('farmCurrent')}</Text>
      <Text fontSize="0.6rem" color="gray.500" textAlign="right">{t('farmTarget')}</Text>
    </>
  );
}

function Units({ data, growth, icons, leftover }: {
  data: CharacterData; growth: GrowthData; icons: IconManifest | null;
  /** What is left once the prioritised units have taken their share. */
  leftover: Record<string, number>;
}) {
  const t = useT();
  const lang = useLang();
  const units = useFarm((s) => s.units);
  const addUnit = useFarm((s) => s.addUnit);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);

  // Only the playable roster carries a material group, so only it can be costed.
  const roster = useMemo(() => Object.values(data.characters)
    .filter((e) => isPlayable(e) && e.skillMaterialGroup)
    .sort((a, b) => characterName(a, lang).localeCompare(characterName(b, lang))),
  [data, lang]);

  const needle = query.trim().toLowerCase();
  const matches = roster.filter((e) => !units[e.code]
    && (!needle || characterName(e, lang).toLowerCase().includes(needle)
      || e.code.toLowerCase().includes(needle)
      || (e.nameEn ?? '').toLowerCase().includes(needle)));

  const tracked = Object.keys(units)
    .flatMap((code) => (data.characters[code] ? [data.characters[code]] : []));

  const choose = (code: string) => {
    addUnit(code);
    setQuery('');
    setOpen(false);
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Box position="relative" maxW="320px" zIndex={2}>
        <Input size="sm" value={query} placeholder={t('farmSearchUnit')}
          borderColor="whiteAlpha.300"
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && matches[0]) choose(matches[0].code);
          }} />
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

      {tracked.length === 0 ? (
        <Text fontSize="sm" color="gray.500">{t('farmNoUnits')}</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3} alignItems="start">
          {tracked.map((entry) => (
            <UnitCard key={entry.code} entry={entry} data={data} growth={growth}
              icons={icons} leftover={leftover} open={shown === entry.code}
              onToggle={() => setShown(shown === entry.code ? null : entry.code)} />
          ))}
        </SimpleGrid>
      )}
    </VStack>
  );
}

function UnitCard({ entry, data, growth, icons, leftover, open, onToggle }: {
  entry: CharacterEntry; data: CharacterData; growth: GrowthData;
  icons: IconManifest | null; leftover: Record<string, number>;
  open: boolean; onToggle: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const pair = useFarm((s) => s.units[entry.code]);
  const inventory = useFarm((s) => s.inventory);
  const removeUnit = useFarm((s) => s.removeUnit);
  const setHidden = useFarm((s) => s.setHidden);
  const setPriority = useFarm((s) => s.setPriority);
  const completeUnit = useFarm((s) => s.completeUnit);
  const setPlan = useFarm((s) => s.setPlan);
  const setSkill = useFarm((s) => s.setSkill);
  const setGear = useFarm((s) => s.setGear);
  const current = pair?.current ?? emptyPlan();
  const target = pair?.target ?? emptyPlan();
  const hidden = pair?.hidden ?? false;
  const priority = pair?.priority ?? false;
  const levelCap = data.statCaps.level;
  const skills = levellableSkills(entry, data);
  const slots = equipmentSlotsOf(entry, data.equipment);

  const gearOf = (plan: UnitPlan, slot: number) => plan.gear[String(slot)] ?? { tier: 0, level: 1 };
  const bill: Bill | null = pair ? unitBill(growth, entry, data, pair) : null;
  const owing = bill && (bill.unitExp || bill.equipExp
    || Object.keys(bill.materials).length > 0);
  // A prioritised unit spends out of the whole inventory, everything else out
  // of what those have left. Completing is only offered once that covers the
  // bill — the plan is a record of what was actually raised.
  const covered = !!bill && billCovered(growth, bill, priority ? inventory : leftover);

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md"
      bg="whiteAlpha.50" p={3} opacity={hidden ? 0.5 : 1}>
      <Flex align="center" gap={2} mb={open ? 3 : 0} wrap="wrap">
        <Box as="button" fontSize="xs" color="gray.500" w={3} flexShrink={0}
          aria-expanded={open} _hover={{ color: 'yellow.200' }} onClick={onToggle}>
          {open ? '▾' : '▸'}
        </Box>
        <GameIcon manifest={icons} group="char" size={7}
          names={[entry.iconPath, `Icon_${entry.code}`]} />
        <Text as={NextLink} href={{ pathname: '/character', query: { code: entry.code } }}
          fontWeight="bold" _hover={{ color: 'yellow.300' }}>
          {characterName(entry, lang)}
        </Text>
        <Text fontFamily="mono" fontSize="xs" color="gray.600">{entry.code}</Text>
        <Box flex="1" />
        <Box as="button" fontSize="xs" color={priority ? 'yellow.300' : 'gray.500'}
          _hover={{ color: 'yellow.200' }} title={t('farmPriorityHint')}
          onClick={() => setPriority(entry.code, !priority)}>
          {t('farmPriority')}
        </Box>
        <Box as="button" fontSize="xs" color={hidden ? 'gray.600' : 'gray.400'}
          _hover={{ color: 'yellow.200' }}
          onClick={() => setHidden(entry.code, !hidden)}>
          {hidden ? t('farmShow') : t('farmHide')}
        </Box>
        {owing && (
          <Box as="button" fontSize="xs" disabled={!covered}
            color={covered ? 'green.300' : 'gray.600'}
            cursor={covered ? 'pointer' : 'not-allowed'}
            _hover={covered ? { color: 'green.200' } : undefined}
            title={covered ? t('farmCompleteHint') : t('farmCompleteShort')}
            onClick={() => covered
              && completeUnit(entry.code, spendBill(growth, bill, inventory))}>
            {t('farmComplete')}
          </Box>
        )}
        <Box as="button" fontSize="xs" color="gray.500" _hover={{ color: 'red.300' }}
          onClick={() => removeUnit(entry.code)}>{t('farmRemove')}</Box>
      </Flex>

      <Box overflowX="auto" display={open ? undefined : 'none'}>
        <Box display="grid" minW="520px" alignItems="center" gap={1.5}
          gridTemplateColumns="minmax(0, 1fr) auto auto">
          <Box />
          <SideHeads t={t} />

          <Text fontSize="sm">{t('dialLevel')}</Text>
          <Stepper value={current.level} min={1} max={levelCap}
            onChange={(v) => setPlan(entry.code, 'current', { level: v })}>
            <AmountField value={current.level} min={1} max={levelCap}
              onChange={(v) => setPlan(entry.code, 'current', { level: v })} />
          </Stepper>
          <Stepper value={target.level} min={1} max={levelCap}
            onChange={(v) => setPlan(entry.code, 'target', { level: v })}>
            <AmountField value={target.level} min={1} max={levelCap}
              onChange={(v) => setPlan(entry.code, 'target', { level: v })} />
          </Stepper>

          {skills.map(({ id, skill }) => {
            const cap = skillCap(growth, skill);
            return (
              <Box key={id} display="contents">
                <HStack spacing={1.5} minW={0}>
                  <GameIcon manifest={icons} group="skill" name={skill.icon} size={5} />
                  <Text fontSize="sm" noOfLines={1}>{skill.name ?? id}</Text>
                  <Badge fontSize="0.55rem" colorScheme="gray">
                    {pick(SKILL_CATEGORY_LABEL[skill.categorize], lang)}
                  </Badge>
                </HStack>
                <Stepper value={current.skills[String(id)] ?? 1} min={1} max={cap}
                  onChange={(v) => setSkill(entry.code, 'current', id, v)}>
                  <AmountField value={current.skills[String(id)] ?? 1} min={1} max={cap}
                    onChange={(v) => setSkill(entry.code, 'current', id, v)} />
                </Stepper>
                <Stepper value={target.skills[String(id)] ?? 1} min={1} max={cap}
                  onChange={(v) => setSkill(entry.code, 'target', id, v)}>
                  <AmountField value={target.skills[String(id)] ?? 1} min={1} max={cap}
                    onChange={(v) => setSkill(entry.code, 'target', id, v)} />
                </Stepper>
              </Box>
            );
          })}

          {slots.map((slot) => {
            const cur = gearOf(current, slot.type);
            const tgt = gearOf(target, slot.type);
            return (
              <Box key={slot.type} display="contents">
                <HStack spacing={1.5} minW={0}>
                  <GameIcon manifest={icons} group="equip" size={5}
                    name={(slot.tiers ?? []).find((r) => r.tier === tgt.tier)?.icon
                      ?? slot.icon} />
                  <Text fontSize="sm" noOfLines={1}>{equipLabel(slot, lang)}</Text>
                </HStack>
                <GearField growth={growth} slot={slot} gear={cur}
                  onChange={(g) => setGear(entry.code, 'current', slot.type, g)} />
                <GearField growth={growth} slot={slot} gear={tgt}
                  onChange={(g) => setGear(entry.code, 'target', slot.type, g)} />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

// A slot is re-tiered by feeding it a higher piece, so a new tier arrives at
// that tier's cap.
function GearField({ growth, slot, gear, onChange }: {
  growth: GrowthData; slot: { type: number; tiers?: { tier: number }[] };
  gear: { tier: number; level: number }; onChange: (g: { tier: number; level: number }) => void;
}) {
  const cap = gearLevelCap(growth, gear.tier);
  const tierCap = (slot.tiers ?? []).reduce((n, row) => Math.max(n, row.tier), 0);
  const empty = gear.tier === 0;
  const setTier = (tier: number) =>
    onChange({ tier, level: gearLevelCap(growth, tier) });
  const setLevel = (level: number) => onChange({ tier: gear.tier, level });
  return (
    <HStack spacing={1} justify="flex-end">
      <Stepper value={gear.tier} min={0} max={tierCap} onChange={setTier}>
        <AmountField value={gear.tier} min={0} max={tierCap} width="2.75rem"
          onChange={setTier} />
      </Stepper>
      <Stepper value={Math.min(gear.level, cap)} min={1} max={cap} disabled={empty}
        onChange={setLevel}>
        <AmountField value={Math.min(gear.level, cap)} min={1} max={cap} width="3.5rem"
          disabled={empty} onChange={setLevel} />
      </Stepper>
    </HStack>
  );
}

function Inventory({ growth, icons }: { growth: GrowthData; icons: IconManifest | null }) {
  const t = useT();
  const lang = useLang();
  const inventory = useFarm((s) => s.inventory);
  const setInventory = useFarm((s) => s.setInventory);
  const clearInventory = useFarm((s) => s.clearInventory);
  const missing = new Set(growth._noItemRow ?? []);

  // The stored experience balance leads its group; the items that feed it are
  // what a player has fewer opinions about.
  const pools = new Set([growth.unit.pool, growth.equipment.pool]);
  const byKind = useMemo(() => {
    const out = new Map<string, { ref: string; name: string; icon: string | null;
      grade: number | null; big: boolean }[]>();
    for (const [ref, material] of Object.entries(growth.materials)) {
      if (missing.has(ref)) continue;
      const kind = material.kind ?? 'goods';
      out.set(kind, [...(out.get(kind) ?? []), {
        ref,
        name: material.name || ref,
        icon: material.icon ?? null,
        grade: material.grade ?? null,
        big: kind === 'goods' || pools.has(ref),
      }]);
    }
    for (const rows of out.values()) {
      rows.sort((a, b) => Number(pools.has(b.ref)) - Number(pools.has(a.ref)));
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // both sets are rebuilt each render from the same document
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growth]);

  const total = byKind.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <VStack align="stretch" spacing={3}>
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="sm" color="gray.500">{t('farmItemsHint', { n: total })}</Text>
        <Box as="button" fontSize="xs" color="gray.500" _hover={{ color: 'red.300' }}
          onClick={clearInventory}>{t('clear')}</Box>
      </Flex>
      {byKind.map(([kind, rows]) => (
        <Panel key={kind} title={pick(MATERIAL_KIND_LABEL[kind], lang) || kind}
          note={String(rows.length)}>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={2}>
            {rows.map((row) => {
              const held = inventory[row.ref] ?? 0;
              return (
                <HStack key={row.ref} spacing={2}>
                  <ItemIcon manifest={icons} group={materialGroup(icons, row.icon)}
                    name={row.icon} grade={row.grade} size={10} />
                  <Text fontSize="sm" noOfLines={1} flex="1" minW={0} title={row.name}>
                    {row.name}
                  </Text>
                  <Stepper value={held} onChange={(v) => setInventory(row.ref, v)}>
                    <AmountField value={held} min={0} max={999_999_999} big={row.big}
                      width="5rem" onChange={(v) => setInventory(row.ref, v)} />
                  </Stepper>
                </HStack>
              );
            })}
          </SimpleGrid>
        </Panel>
      ))}
    </VStack>
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
      {groups.map(({ group, stages }) => (
        <Panel key={group.key} title={groupLabel(data, group, lang)}
          note={`${stages.length}`}>
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
        </Panel>
      ))}
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

// What the stage is on the list for is the row: the same clear covering two
// needs is the whole reason the run list is not one stage per material.
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

// Only the repeat channel is farm income. A ref listed twice, guaranteed and on
// a chance, is still one thing to count.
function repeatDrops(stage: StageEntry): string[] {
  const seen = new Set<string>();
  for (const drop of stage.rewards?.repeat ?? []) if (drop.ref) seen.add(drop.ref);
  return [...seen];
}

// A ref outside `growth.materials` has no Items-tab row, so this is the only
// place its count can be read back.
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

// A locked stage is dimmed rather than dropped: "what is available" is answered
// by seeing what is not.
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
