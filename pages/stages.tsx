// Three levels over one route, because `output: 'export'` prerenders every path and the stage set is runtime data.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Button, Center, Flex, HStack, Input, SimpleGrid, Spinner, Text, VStack, Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { ArtBox } from '@/components/artBox';
import { EventsBoard } from '@/components/eventsBoard';
import { gameText, useGameLang } from '@/lib/gameText';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { StageCrumbs } from '@/components/stageCrumbs';
import { ShareButton } from '@/components/shareButton';
import { hasIcon } from '@/lib/icons';
import { FilterChip, FilterRow } from '@/components/filters';
import { typeLabel } from '@/lib/characters';
import {
  DIFFICULTY_LABEL, DROP_ICON_GROUPS, GROUP_ICON_GROUPS, dropAmount, dropName, enemyCodes, groupByKey,
  groupIsLive, groupLabel, groupWindow, levelRange, modeSummaries, stageDrops,
  stageGroups, stageName, type StageGrouping,
} from '@/lib/stages';
import { dataText, pick, useLang, useT, type Lang, type UiKey } from '@/lib/i18n';
import {
  loadArchive, loadCharacters, loadIcons, loadStages, type ArchiveIndex,
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

const GROUP_NOUN: Record<string, UiKey> = {
  story: 'stageChapters', event: 'stageEventCount', nemesis: 'stageSeasons', archive: 'stageNodes',
};

function ModeHub({ data, icons, lang }: {
  data: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const modes = useMemo(() => modeSummaries(data).filter((m) => m.key !== 'archive'), [data]);
  return (
    <VStack align="stretch" spacing={3}>
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
        {modes.map((m) => {
          const art = m.live?.banner ?? (m.tile ? null : m.banner);
          return (
            <Flex key={m.key} as={NextLink} href={`/stages?mode=${m.key}`}
              direction={{ base: 'column', sm: 'row' }} gap={3} p={3} borderRadius="lg" minW={0}
              borderWidth={m.live ? '2px' : '1px'} borderColor={m.live ? 'pink.400' : 'whiteAlpha.200'}
              bg="whiteAlpha.50" _hover={{ borderColor: 'yellow.400' }}>
              <ArtBox manifest={icons} w={{ base: '100%', sm: '184px' }}
                sources={art ? [['banner', art]]
                  : [[m.tile ? 'tile' : iconGroup(icons, GROUP_ICON_GROUPS, m.image), m.tile ?? m.image]]} />
              <VStack align="stretch" spacing={1.5} minW={0} flex="1">
                <HStack spacing={2} wrap="wrap">
                  {m.live && <Badge colorScheme="pink" variant="solid">{t('stageLive')}</Badge>}
                  {m.live && groupWindow(m.live) && (
                    <Badge colorScheme="blue" textTransform="none" fontWeight="normal">{groupWindow(m.live)}</Badge>
                  )}
                </HStack>
                <Text fontWeight="bold" fontSize="lg">{pick(m.label, lang)} ›</Text>
                {m.live && (
                  <Text fontSize="sm" color="gray.300" noOfLines={1}>{groupLabel(data, m.live, lang)}</Text>
                )}
                <Text fontSize="sm" color="gray.500">
                  {t(GROUP_NOUN[m.key] ?? 'stageGroupCount', { n: m.groups })} · {t('stageCount', { n: m.stages })}
                </Text>
              </VStack>
            </Flex>
          );
        })}
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
      <Flex align="center" gap={3} wrap="wrap">
        <StageCrumbs data={data} mode={mode} lang={lang} />
        <Box flex="1" />
        <ShareButton query={{ mode }} />
      </Flex>
      <ModeTabs data={data} mode={mode} lang={lang} />
      {mode === 'archive' && (
        <Button as={NextLink} href="/archive" size="sm" colorScheme="yellow" alignSelf="start">
          {t('archiveOverview')}
        </Button>
      )}
      {mode === 'event' ? <EventsBoard /> : (
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
        {groups.map((grouping) => (
          <GroupCard key={grouping.group.key} grouping={grouping} data={data} icons={icons} lang={lang} />
        ))}
        {mode === 'ascent' && <InfinityCard data={data} icons={icons} />}
      </SimpleGrid>
      )}
    </VStack>
  );
}

function InfinityCard({ data, icons }: { data: StageData; icons: IconManifest | null }) {
  const t = useT();
  const [archive, setArchive] = useState<ArchiveIndex | null>(null);
  useEffect(() => { loadArchive().then(setArchive).catch(() => setArchive(null)); }, []);
  const gameLang = useGameLang();
  const season = archive?.seasons[0];
  const nodes = data.stages.filter((s) => s.mode === 'archive').length;
  const today = new Date().toISOString().slice(0, 10);
  const from = season?.open?.start.slice(0, 10);
  const to = season?.open?.end.slice(0, 10);
  const live = !!from && !!to && from <= today && today <= to;
  return (
    <Flex as={NextLink} href="/archive" direction={{ base: 'column', sm: 'row' }} gap={3} p={3}
      borderRadius="lg" minW={0} borderWidth={live ? '2px' : '1px'}
      borderColor={live ? 'pink.400' : 'whiteAlpha.200'} bg="whiteAlpha.50" _hover={{ borderColor: 'yellow.400' }}>
      <ArtBox manifest={icons} w={{ base: '100%', sm: '184px' }}
        sources={[['banner', 'Ascent_Infinity'], ['banner', 'Thumbnail_PastStory_Content_ArchiveAscent']]} />
      <VStack align="stretch" spacing={1.5} minW={0} flex="1">
        <Wrap spacing={1.5}>
          {live && <WrapItem><Badge colorScheme="pink" variant="solid">{t('stageLive')}</Badge></WrapItem>}
          {from && to && (
            <WrapItem><Badge colorScheme="blue" textTransform="none" fontWeight="normal">{from} – {to}</Badge></WrapItem>
          )}
        </Wrap>
        <Text fontWeight="bold" fontSize="lg">
          {gameText(archive?.title, gameLang) || t('archiveTitle')}
          {season ? ` · ${t('archiveSeason', { n: season.id })}` : ''} ›
        </Text>
        <Text fontSize="sm" color="gray.400">{t('stageCount', { n: nodes })} · {t('archivePacks')}</Text>
      </VStack>
    </Flex>
  );
}

function GroupCard({ grouping, data, icons, lang }: {
  grouping: StageGrouping; data: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const { group, stages } = grouping;
  const live = groupIsLive(group);
  const today = new Date().toISOString().slice(0, 10);
  const ended = !!group.to && !live && group.to < today;
  const upcoming = !!group.from && group.from > today;
  const enemies = [...new Set(stages.flatMap((s) => enemyCodes(s)))];
  const bosses = enemies.filter((c) => stages.some((s) => s.waves.some((w) => w.bossCode === c)));
  const shown = [...bosses, ...enemies.filter((c) => !bosses.includes(c))].slice(0, 8);
  const levels = stages.map(levelRange).filter((r): r is [number, number] => !!r);
  const low = levels.length ? Math.min(...levels.map((r) => r[0])) : null;
  const high = levels.length ? Math.max(...levels.map((r) => r[1])) : null;
  return (
    <Flex as={NextLink} href={`/stages?group=${encodeURIComponent(group.key)}`}
      direction={{ base: 'column', sm: 'row' }} gap={3} p={3} borderRadius="lg" minW={0}
      borderWidth={live ? '2px' : '1px'} borderColor={live ? 'pink.400' : 'whiteAlpha.200'}
      bg={ended ? 'blackAlpha.200' : 'whiteAlpha.50'} _hover={{ borderColor: 'yellow.400' }}>
      <ArtBox manifest={icons} w={{ base: '100%', sm: '184px' }} sources={[
        ['banner', group.banner],
        ['banner', group.mode === 'ascent' ? (group.from ? 'Ascent_Core' : 'Ascent_Basic') : null],
        [iconGroup(icons, GROUP_ICON_GROUPS, group.image), group.image],
        ['tile', data.modes.find((m) => m.key === group.mode)?.tile],
      ]} />
      <VStack align="stretch" spacing={1.5} minW={0} flex="1">
        <Wrap spacing={1.5} align="center">
          {live && <WrapItem><Badge colorScheme="pink" variant="solid">{t('stageLive')}</Badge></WrapItem>}
          {ended && <WrapItem><Badge variant="solid">{t('stageEnded')}</Badge></WrapItem>}
          {upcoming && <WrapItem><Badge colorScheme="blue" variant="solid">{t('stageUpcoming')}</Badge></WrapItem>}
          {groupWindow(group) && (
            <WrapItem>
              <Badge colorScheme="blue" textTransform="none" fontWeight="normal">{groupWindow(group)}</Badge>
            </WrapItem>
          )}
          {group.difficulty && (
            <WrapItem><Badge textTransform="none">{pick(DIFFICULTY_LABEL[group.difficulty], lang) || group.difficulty}</Badge></WrapItem>
          )}
        </Wrap>
        <Text fontWeight="bold" fontSize="lg" noOfLines={2}>{groupLabel(data, group, lang)} ›</Text>
        <Text fontSize="sm" color="gray.400">
          {t('stageCount', { n: stages.length })}
          {low != null && high != null && ` · ${t('stageLevelRange', { from: low, to: high })}`}
        </Text>
        {shown.length > 0 && (
          <HStack spacing={-1.5} pt={1}>
            {shown.map((code) => (
              <GameIcon key={code} manifest={icons} group="char"
                names={[data.enemies[code]?.iconPath, `Icon_${code}`]} size={8} borderRadius="full"
                borderWidth="2px" borderColor={bosses.includes(code) ? 'red.400' : 'gray.800'}
                title={dataText(lang, data.enemies[code]?.name, data.enemies[code]?.nameEn)} />
            ))}
          </HStack>
        )}
      </VStack>
    </Flex>
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
        || (data.enemies[c]?.name ?? '').toLowerCase().includes(q)
        || (data.enemies[c]?.nameEn ?? '').toLowerCase().includes(q))
      || stageDrops(s).some((d) => `${dropName(data, d, 'ko')} ${dropName(data, d, 'en')}`
        .toLowerCase().includes(q)))
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
        <ShareButton query={{ group: group.key }} />
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
      {data.modes.filter((m) => m.key !== 'archive').map((m) => (
        <FilterChip key={m.key} active={m.key === mode || (m.key === 'ascent' && mode === 'archive')}
          onClick={() => router.push(`/stages?mode=${m.key}`)}>
          {pick(m.label, lang)}
        </FilterChip>
      ))}
    </FilterRow>
  );
}

// Both previews are capped: a wave can field six and a drop list ten.
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
            title={dataText(lang, data.enemies[code]?.name, data.enemies[code]?.nameEn)
              || code}
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
                title={`${dropName(data, drop, lang)} ×${dropAmount(drop)}`} size="34px" />
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
