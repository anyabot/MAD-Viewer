// Three levels over one route, because `output: 'export'` prerenders every path
// and the stage set is runtime data: the hub, then one mode's groups, then that
// group's stages.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, HStack, Input, SimpleGrid, Spinner, Text, VStack, Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { StageCrumbs } from '@/components/stageCrumbs';
import { hasIcon } from '@/lib/icons';
import { FilterChip, FilterRow } from '@/components/filters';
import { typeLabel } from '@/lib/characters';
import {
  DROP_ICON_GROUPS, GROUP_ICON_GROUPS, dropAmount, dropName, enemyCodes, groupByKey,
  groupIsLive, groupLabel, groupWindow, levelRange, modeSummaries, stageDrops,
  stageGroups, stageName, type StageGrouping,
} from '@/lib/stages';
import { pick, useLang, useT, type Lang } from '@/lib/i18n';
import {
  loadCharacters, loadIcons, loadStages,
  type CharacterData, type IconManifest, type StageData, type StageEntry,
} from '@/lib/data';

const iconGroup = (
  icons: IconManifest | null, groups: readonly string[], name?: string | null,
) => (groups.find((g) => hasIcon(icons, g as never, name)) ?? groups[0]) as never;

export default function StagesPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const mode = typeof router.query.mode === 'string' ? router.query.mode : null;
  const groupKey = typeof router.query.group === 'string' ? router.query.group : null;

  const [data, setData] = useState<StageData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadStages().then(setData).catch((e) => setError(String(e)));
    // both are decoration: a failure must leave the list usable
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  useEffect(() => { setQuery(''); }, [mode, groupKey]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  const grouping = groupKey ? groupByKey(data, groupKey) : null;
  if (grouping) {
    return (
      <StageList grouping={grouping} data={data} chars={chars} icons={icons} lang={lang}
        query={query} onQuery={setQuery} />
    );
  }
  if (mode && data.modes.some((m) => m.key === mode)) {
    return <GroupList mode={mode} data={data} icons={icons} lang={lang} />;
  }
  return <ModeHub data={data} icons={icons} lang={lang} />;
}

// --- level 1: the modes ----------------------------------------------------

function ModeHub({ data, icons, lang }: {
  data: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const modes = useMemo(() => modeSummaries(data), [data]);
  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wide">
        {t('stageMode')}
      </Text>
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={3}>
        {modes.map((m) => (
          <Box key={m.key} as={NextLink} href={`/stages?mode=${m.key}`} borderWidth="1px"
            borderColor="whiteAlpha.200" borderRadius="md" overflow="hidden" minW={0}
            _hover={{ borderColor: 'yellow.400' }}>
            <Box position="relative" h="104px" bg="blackAlpha.400">
              {/* Event and Raid have no activity-screen tile. Event borrows its
                  newest event's logo, drawn whole; Raid falls back to zone art. */}
              {!m.tile && m.banner ? (
                <Center h="100%" px={3}>
                  {/* `GameIcon` defaults `boxSize`, which sets the height too —
                      an explicit `h` is required or `maxH` never applies. */}
                  <GameIcon manifest={icons} group="banner" name={m.banner}
                    h="84px" w="auto" maxW="100%" objectFit="contain"
                    reserve={false} />
                </Center>
              ) : (
                <GameIcon manifest={icons}
                  group={m.tile ? 'tile' : iconGroup(icons, GROUP_ICON_GROUPS, m.image)}
                  name={m.tile ?? m.image} w="100%" h="100%"
                  objectFit="cover" objectPosition="center" reserve={false} />
              )}
              <Box position="absolute" inset={0}
                bgGradient="linear(to-t, blackAlpha.800, blackAlpha.300 55%, transparent)" />
              <Flex position="absolute" left={3} right={3} bottom={2} align="baseline"
                gap={2} wrap="wrap">
                <Text fontSize="md" fontWeight="bold">{pick(m.label, lang)}</Text>
                {m.live && (
                  <Badge fontSize="0.6rem" colorScheme="green">{t('stageLive')}</Badge>
                )}
              </Flex>
            </Box>
            <Box p={3} minW={0}>
              <Text fontSize="xs" color="gray.500">
                {t('stageGroupCount', { n: m.groups })} · {t('stageCount', { n: m.stages })}
              </Text>
              {m.live && (
                <Text fontSize="xs" color="gray.400" noOfLines={1}>
                  {groupLabel(data, m.live, lang)}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </SimpleGrid>
    </VStack>
  );
}

// --- level 2: one mode's chapters, events or seasons -----------------------

function GroupList({ mode, data, icons, lang }: {
  mode: string; data: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const groups = useMemo(() => stageGroups(data, mode), [data, mode]);
  return (
    <VStack align="stretch" spacing={4}>
      <StageCrumbs data={data} mode={mode} lang={lang} />
      <ModeTabs data={data} mode={mode} lang={lang} />
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
        {groups.map(({ group, stages }) => (
          <Box key={group.key} as={NextLink} href={`/stages?group=${encodeURIComponent(group.key)}`}
            borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" p={3} minW={0}
            _hover={{ borderColor: 'yellow.400', bg: 'whiteAlpha.50' }}>
            <Flex align="center" gap={3}>
              {group.banner ? (
                <GameIcon manifest={icons} group="banner" name={group.banner}
                  h="60px" w="auto" maxW="140px" objectFit="contain" reserve={false} />
              ) : (
                <GameIcon manifest={icons}
                  group={iconGroup(icons, GROUP_ICON_GROUPS, group.image)} name={group.image}
                  boxSize="56px" borderRadius="md" objectFit="cover" reserve={false} />
              )}
              <Box minW={0}>
                <Flex align="center" gap={2} wrap="wrap">
                  <Text fontSize="sm" fontWeight="bold">{groupLabel(data, group, lang)}</Text>
                  {groupIsLive(group) && (
                    <Badge fontSize="0.6rem" colorScheme="green">{t('stageLive')}</Badge>
                  )}
                </Flex>
                <Text fontSize="xs" color="gray.500">
                  {t('stageCount', { n: stages.length })}
                </Text>
                {groupWindow(group) && (
                  <Text fontSize="xs" color="gray.600">{groupWindow(group)}</Text>
                )}
              </Box>
            </Flex>
          </Box>
        ))}
      </SimpleGrid>
    </VStack>
  );
}

// --- level 3: the stages, with what they field and what they pay -----------

function StageList({ grouping, data, chars, icons, lang, query, onQuery }: {
  grouping: StageGrouping; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang; query: string; onQuery: (v: string) => void;
}) {
  const t = useT();
  const { group } = grouping;
  const q = query.trim().toLowerCase();
  const stages = q
    ? grouping.stages.filter((s) =>
      stageName(data, s, lang).toLowerCase().includes(q)
      || String(s.id).includes(q)
      || enemyCodes(s).some((c) => c.toLowerCase().includes(q)
        || (data.enemies[c]?.name ?? '').toLowerCase().includes(q))
      || stageDrops(s).some((d) => dropName(data, d).toLowerCase().includes(q)))
    : grouping.stages;

  return (
    <VStack align="stretch" spacing={4}>
      <StageCrumbs data={data} mode={group.mode} group={group} lang={lang} />
      <Flex align="center" gap={3} wrap="wrap">
        {group.banner ? (
          <GameIcon manifest={icons} group="banner" name={group.banner}
            h={{ base: '68px', md: '108px' }} w="auto" objectFit="contain" reserve={false}
            title={groupLabel(data, group, lang)} />
        ) : (
          <>
            <GameIcon manifest={icons}
              group={iconGroup(icons, GROUP_ICON_GROUPS, group.image)} name={group.image}
              boxSize="48px" borderRadius="md" objectFit="cover" reserve={false} />
            <Text fontSize="lg" fontWeight="bold">{groupLabel(data, group, lang)}</Text>
          </>
        )}
        {groupIsLive(group) && (
          <Badge fontSize="0.6rem" colorScheme="green">{t('stageLive')}</Badge>
        )}
        {groupWindow(group) && (
          <Text fontSize="xs" color="gray.600">{groupWindow(group)}</Text>
        )}
        <Box flex="1" />
        <Input size="sm" maxW="260px" placeholder={t('search')} value={query}
          onChange={(e) => onQuery(e.target.value)} />
        <Text fontSize="xs" color="gray.500">{t('stageCount', { n: stages.length })}</Text>
      </Flex>

      {stages.length === 0 && <Text color="gray.500" fontSize="sm">{t('noMatch')}</Text>}

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={2}>
        {stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} data={data} chars={chars}
            icons={icons} lang={lang} />
        ))}
      </SimpleGrid>
    </VStack>
  );
}

function ModeTabs({ data, mode, lang }: { data: StageData; mode: string; lang: Lang }) {
  const t = useT();
  const router = useRouter();
  return (
    <FilterRow label={t('stageMode')}>
      {data.modes.map((m) => (
        <FilterChip key={m.key} active={m.key === mode}
          onClick={() => router.push(`/stages?mode=${m.key}`)}>
          {pick(m.label, lang)}
        </FilterChip>
      ))}
    </FilterRow>
  );
}

// The two previews are what a reader scans a list for: who is in it, and what it
// pays. Both are capped — a wave can field six and a drop list ten.
const PREVIEW = 8;

function StageCard({ stage, data, chars, icons, lang }: {
  stage: StageEntry; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const levels = levelRange(stage);
  const codes = enemyCodes(stage);
  const drops = stageDrops(stage);
  const weak = stage.weakAttribute != null && chars
    ? chars.types.attribute[String(stage.weakAttribute)] ?? null
    : null;
  return (
    <Box as={NextLink} href={`/stage?id=${stage.id}`} borderWidth="1px"
      borderColor="whiteAlpha.200" borderRadius="md" p={3} minW={0}
      _hover={{ borderColor: 'yellow.400', bg: 'whiteAlpha.50' }}>
      <Flex align="baseline" gap={2} wrap="wrap">
        <Text fontSize="sm" fontWeight="bold">{stageName(data, stage, lang)}</Text>
        <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">{stage.id}</Text>
      </Flex>

      <Wrap spacing={2} mt={1} align="center">
        {stage.recommendLevel && (
          <WrapItem>
            <Text fontSize="xs" color="gray.400">
              {t('stageRecommend', { level: stage.recommendLevel })}
            </Text>
          </WrapItem>
        )}
        {weak && (
          <WrapItem>
            <Flex align="center" gap={1}>
              <Text fontSize="0.6rem" color="gray.600">{t('stageWeakTo')}</Text>
              <GameIcon manifest={icons} group="ui" name={weak.icon} size={4}
                reserve={false} />
              <Text fontSize="xs" color={weak.color ?? 'gray.300'}>
                {typeLabel(weak, lang)}
              </Text>
            </Flex>
          </WrapItem>
        )}
        {stage.stamina ? (
          <WrapItem>
            <Text fontSize="xs" color="gray.500">
              {t('stageStamina', { n: stage.stamina })}
            </Text>
          </WrapItem>
        ) : null}
        <WrapItem>
          <Text fontSize="xs" color="gray.500">
            {t('stageWaves', { n: stage.waves.length })}
          </Text>
        </WrapItem>
        {levels && (
          <WrapItem>
            <Text fontSize="xs" color="gray.500">
              {levels[0] === levels[1]
                ? t('stageLevel', { n: levels[0] })
                : t('stageLevelRange', { from: levels[0], to: levels[1] })}
            </Text>
          </WrapItem>
        )}
      </Wrap>

      <Preview label={t('stageRoster')} count={codes.length}>
        {codes.slice(0, PREVIEW).map((code) => (
          <GameIcon key={code} manifest={icons} group="char"
            names={[data.enemies[code]?.iconPath, `Icon_${code}`]}
            title={data.enemies[code]?.name ?? code}
            boxSize="26px" borderRadius="sm" objectFit="cover" reserve={false} />
        ))}
      </Preview>

      {drops.length > 0 && (
        <Preview label={t('stageDrops')} count={drops.length}>
          {drops.slice(0, PREVIEW).map((drop, i) => {
            const entry = drop.ref ? data.drops[drop.ref] : null;
            return (
              <ItemIcon key={i} manifest={icons}
                group={iconGroup(icons, DROP_ICON_GROUPS, entry?.icon)}
                names={[entry?.icon]} grade={entry?.grade} count={dropAmount(drop)}
                title={`${dropName(data, drop)} ×${dropAmount(drop)}`} size="34px" />
            );
          })}
        </Preview>
      )}
    </Box>
  );
}

function Preview({ label, count, children }: {
  label: string; count: number; children: React.ReactNode;
}) {
  const shown = Array.isArray(children) ? children.length : 1;
  return (
    <Flex align="center" gap={2} mt={1.5} minW={0}>
      <Text fontSize="0.6rem" color="gray.600" minW="52px">{label}</Text>
      <HStack spacing={1} minW={0} overflow="hidden">
        {children}
        {count > shown && (
          <Text fontSize="0.6rem" color="gray.500">+{count - shown}</Text>
        )}
      </HStack>
    </Flex>
  );
}
