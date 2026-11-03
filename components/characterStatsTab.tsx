import { useEffect, useMemo, useState } from 'react';
import NextLink from '@/components/appLink';
import { useRouter } from 'next/router';
import { nextRouterAdapter } from '@altterisk/game-hub/filters';
import { Box, Button, Flex, HStack, Select, SimpleGrid, Text, VStack } from '@altterisk/game-hub/ui';
import { EmptyState, FilterChip, LevelControl, Panel } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { ShareButton } from '@/components/shareButton';
import {
  INFUSION_PATHS, characterName, computeStats, equipmentSlotsOf, infusionNodes, isPlayable, statText,
  type EquipInput, type TypeTable,
} from '@/lib/characters';
import type { CharacterData, CharacterEntry, IconManifest } from '@/lib/data';
import { passiveStats, unitStar } from '@/lib/dps';
import { useFilters } from '@/lib/filterStore';
import { dataText, useLang, useT } from '@/lib/i18n';
import { characterHref } from '@/lib/routes';

type Investment = {
  star: number; level: number; love: number; gearTier: number; gearLevel: number;
  surface: number; deep: number; passive: boolean;
};
type Row = { entry: CharacterEntry; star: number; stats: Record<string, number> };

type Sort = { stat: string; desc: boolean };

const TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division', 'faction'];
const DEFAULT_SORT: Sort = { stat: 'PHYSICS_ATTACK', desc: true };
const INVESTMENT_PARAMS: [Exclude<keyof Investment, 'passive'>, string][] = [
  ['level', 'lv'], ['star', 'star'], ['love', 'love'], ['gearTier', 'gt'], ['gearLevel', 'gl'],
  ['surface', 'sp'], ['deep', 'dp'],
];

const STICKY = { position: 'sticky', left: 0, zIndex: 1 } as const;
const CELL = { px: 2, py: 1.5, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'mono', fontSize: 'xs' } as const;

function gearTiers(data: CharacterData) {
  const caps = new Map<number, number>();
  for (const slot of Object.values(data.equipment)) {
    for (const row of slot.tiers ?? []) caps.set(row.tier, Math.max(caps.get(row.tier) ?? 0, row.maxLevel));
  }
  return [...caps].sort((a, b) => a[0] - b[0]).map(([tier, maxLevel]) => ({ tier, maxLevel }));
}

function infusionCaps(data: CharacterData) {
  const roster = Object.values(data.characters).filter(isPlayable);
  const most = (path: 'surface' | 'deep') => Math.max(0, ...roster.map((c) => infusionNodes(c, path).length));
  return { surface: most('surface'), deep: most('deep') };
}

function maxInvestment(data: CharacterData, passive: boolean): Investment {
  const top = gearTiers(data).at(-1);
  return {
    star: data.statCaps.star, level: data.statCaps.level, love: data.statCaps.love,
    gearTier: top?.tier ?? 0, gearLevel: top?.maxLevel ?? 1, ...infusionCaps(data), passive,
  };
}

function investmentFromUrl(get: (key: string) => string | null, data: CharacterData): Investment {
  const top = maxInvestment(data, get('passive') === '1');
  const out = { ...top };
  for (const [field, param] of INVESTMENT_PARAMS) {
    const raw = Number(get(param));
    const low = field === 'surface' || field === 'deep' || field === 'gearTier' ? 0 : 1;
    if (get(param) != null && Number.isInteger(raw)) out[field] = Math.min(Math.max(raw, low), top[field]);
  }
  return out;
}

function statsAt(entry: CharacterEntry, data: CharacterData, at: Investment): Row {
  const star = unitStar(entry, data, at);
  const equipment: EquipInput[] = equipmentSlotsOf(entry, data.equipment).flatMap((slot) => {
    const row = (slot.tiers ?? []).find((r) => r.tier === at.gearTier);
    return row ? [{ type: slot.type, tier: row.tier, level: Math.min(at.gearLevel, row.maxLevel) }] : [];
  });
  const rows = computeStats(entry, data, {
    level: at.level, star, love: at.love, equipment, infusion: { surface: at.surface, deep: at.deep },
  });
  const stats = Object.fromEntries(rows.map((r) => [r.stat, r.total]));
  if (at.passive) {
    for (const [stat, amount] of Object.entries(passiveStats(entry, data, star, stats))) {
      stats[stat] = (stats[stat] ?? 0) + amount;
    }
  }
  return { entry, star, stats };
}

export default function CharacterStatsTab({ list, chars, icons }: {
  list: CharacterEntry[]; chars: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const adapter = nextRouterAdapter(router);
  const [at, setAt] = useState<Investment>(() => investmentFromUrl(adapter.get, chars));
  const [sort, setSort] = useState<Sort>(() => {
    const stat = adapter.get('sort');
    return { stat: stat && chars.statTypes[stat] ? stat : DEFAULT_SORT.stat, desc: adapter.get('dir') !== 'asc' };
  });
  const { query, star, artist, picked } = useFilters((f) => f.characters);
  const setFilters = useFilters((f) => f.setCharacters);

  // only what differs from the defaults goes in the link
  const params = useMemo(() => {
    const top = maxInvestment(chars, false);
    const out: Record<string, string | null> = {};
    for (const [field, param] of INVESTMENT_PARAMS) out[param] = at[field] === top[field] ? null : String(at[field]);
    out.passive = at.passive ? '1' : null;
    out.sort = sort.stat === DEFAULT_SORT.stat ? null : sort.stat;
    out.dir = sort.desc ? null : 'asc';
    out.q = query || null;
    out.rarity = star == null ? null : String(star);
    out.artist = artist;
    for (const table of TABLES) out[table] = picked[table] == null ? null : String(picked[table]);
    return out;
  }, [chars, at, sort, query, star, artist, picked]);

  // a link naming a filter replaces the saved ones; the URL follows every change afterwards
  const [linkRead, setLinkRead] = useState(false);
  useEffect(() => {
    const number = (key: string) => { const v = adapter.get(key); return v == null || Number.isNaN(Number(v)) ? null : Number(v); };
    if (['q', 'rarity', 'artist', ...TABLES].some((key) => adapter.get(key) != null)) {
      setFilters({
        query: adapter.get('q') ?? '', star: number('rarity'), artist: adapter.get('artist'),
        picked: Object.fromEntries(TABLES.flatMap((table) => { const v = number(table); return v == null ? [] : [[table, v]]; })),
      });
    }
    setLinkRead(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!linkRead) return undefined;
    const timer = setTimeout(() => adapter.set(params), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, linkRead]);

  const rows = useMemo(() => list.map((c) => statsAt(c, chars, at)), [list, chars, at]);

  const set = (patch: Partial<Investment>) => setAt({ ...at, ...patch });
  const tiers = gearTiers(chars);
  const gearCap = tiers.find((r) => r.tier === at.gearTier)?.maxLevel ?? 0;
  const caps = infusionCaps(chars);
  // a stat every shown unit has at the same value compares nothing
  const columns = Object.entries(chars.statTypes)
    .sort((a, b) => a[1].order - b[1].order)
    .filter(([stat]) => new Set(rows.map((r) => r.stats[stat] ?? 0)).size > 1);
  const sorted = [...rows].sort((a, b) => {
    const diff = (a.stats[sort.stat] ?? 0) - (b.stats[sort.stat] ?? 0);
    return (sort.desc ? -diff : diff) || a.entry.code.localeCompare(b.entry.code);
  });
  const best = (stat: string) => Math.max(...rows.map((r) => r.stats[stat] ?? 0));
  const mean = (stat: string) => rows.reduce((sum, r) => sum + (r.stats[stat] ?? 0), 0) / Math.max(1, rows.length);
  const statName = (stat: string) => dataText(lang, chars.statTypes[stat]?.name, chars.statTypes[stat]?.en) || stat;
  const dial = (label: string) => <Text fontSize="xs">{label}</Text>;

  return (
    <VStack align="stretch" spacing={4}>
      <Panel title={t('statsInvestment')} actions={(
        <HStack spacing={1}>
          <ShareButton query={{ tab: 'stats', ...params }} />
          <Button size="xs" variant="outline" onClick={() => setAt(maxInvestment(chars, at.passive))}>{t('presetMax')}</Button>
          <Button size="xs" variant="outline" onClick={() => setAt({
            star: 1, level: 1, love: 1, gearTier: 0, gearLevel: 1, surface: 0, deep: 0, passive: at.passive,
          })}>{t('presetMin')}</Button>
        </HStack>
      )}>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
          <LevelControl label={dial(t('dialLevel'))} value={at.level} min={1} max={chars.statCaps.level}
            onChange={(level) => set({ level })} />
          <LevelControl label={dial(t('dialAffection'))} value={at.love} min={1} max={chars.statCaps.love}
            onChange={(love) => set({ love })} />
          {gearCap > 0 && (
            <LevelControl label={dial(t('statsGearLevel'))} value={Math.min(at.gearLevel, gearCap)} min={1} max={gearCap}
              onChange={(gearLevel) => set({ gearLevel })} />
          )}
          {INFUSION_PATHS.map((path) => {
            const name = chars.infusion?.paths[path];
            return (
              <LevelControl key={path} label={dial(dataText(lang, name?.name, name?.nameEn) || path)}
                value={at[path]} min={0} max={caps[path]} onChange={(n) => set({ [path]: n })} />
            );
          })}
        </SimpleGrid>
        <Flex gap={2} mt={3} wrap="wrap" align="center">
          <Select size="xs" w="7rem" aria-label={t('dialStar')} value={at.star}
            onChange={(e) => set({ star: Number(e.target.value) })}>
            {Array.from({ length: chars.statCaps.star }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{`${n}★`}</option>)}
          </Select>
          <Select size="xs" w="7rem" aria-label={t('statsGearTier')} value={at.gearTier}
            onChange={(e) => set({ gearTier: Number(e.target.value) })}>
            <option value={0}>{t('gearEmpty')}</option>
            {tiers.map((r) => <option key={r.tier} value={r.tier}>{t('gearTier', { n: r.tier })}</option>)}
          </Select>
          <FilterChip active={at.passive} onClick={() => set({ passive: !at.passive })}>
            <Text>{t('statsPassive')}</Text>
          </FilterChip>
        </Flex>
      </Panel>

      {rows.length === 0 ? <EmptyState title={t('noMatch')} /> : (
        <Box overflowX="auto">
          <Box as="table" minW="max-content" w="100%" style={{ borderCollapse: 'collapse' }}>
            <Box as="thead">
              <Box as="tr" borderBottomWidth="1px" borderColor="whiteAlpha.200">
                <Box as="th" {...STICKY} bg="gray.900" px={2} py={1.5} />
                {columns.map(([stat]) => (
                  <Box as="th" key={stat} px={2} py={1.5} textAlign="right" fontSize="xs" whiteSpace="nowrap"
                    aria-sort={sort.stat === stat ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                    <Box as="button" color={sort.stat === stat ? 'accent.200' : 'gray.400'}
                      onClick={() => setSort({ stat, desc: sort.stat === stat ? !sort.desc : true })}>
                      {statName(stat)}{sort.stat === stat ? (sort.desc ? ' ▼' : ' ▲') : ''}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              <Box as="tr" borderBottomWidth="1px" borderColor="whiteAlpha.200">
                <Box as="td" {...STICKY} bg="gray.900" px={2} py={1.5} fontSize="xs" color="gray.400">{t('statsAverage')}</Box>
                {columns.map(([stat, type]) => (
                  <Box as="td" key={stat} {...CELL} color="gray.400">{statText(type.display, mean(stat))}</Box>
                ))}
              </Box>
              {sorted.map(({ entry, star, stats }) => (
                <Box as="tr" key={entry.code} borderBottomWidth="1px" borderColor="whiteAlpha.100">
                  <Box as="td" {...STICKY} bg="gray.900" px={2} py={1}>
                    <Box as={NextLink} href={characterHref(entry.code)} display="flex" alignItems="center" gap={2}
                      _hover={{ color: 'accent.200' }}>
                      <GameIcon manifest={icons} group="char" name={entry.iconPath ?? ''} size={7} />
                      <Text fontSize="xs" maxW={{ base: '6.5rem', md: 'none' }} noOfLines={1}>{characterName(entry, lang)}</Text>
                      <Text fontSize="0.65rem" color="gray.500">{`${star}★`}</Text>
                    </Box>
                  </Box>
                  {columns.map(([stat, type]) => {
                    const value = stats[stat] ?? 0;
                    return (
                      <Box as="td" key={stat} {...CELL} color={value === best(stat) ? 'accent.200' : 'gray.200'}>
                        {statText(type.display, value)}
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </VStack>
  );
}
