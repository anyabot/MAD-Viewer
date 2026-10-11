// Three levels over one route, because `output: 'export'` prerenders every path and the stage set is runtime data.
import { listState, nextRouterAdapter, textMatch, useUrlText } from '@altterisk/game-hub/filters';
import {
  BannerCard, EmptyState, IconPreview, ListToolbar, MetaChip, SearchBox, StageCard,
} from '@altterisk/game-hub';
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Button, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap,
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
import { nextLink } from '@/lib/hubLink';
import { StageMeta } from '@/components/stageMeta';
import { FilterChip, FilterRow } from '@/components/filters';
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
  const list = listState(nextRouterAdapter(router));
  const [query, setQuery] = useUrlText(list, router.isReady);

  useEffect(() => {
    loadStages().then(setData).catch((e) => setError(String(e)));
    // both are decoration: a failure must leave the list usable
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const urlQuery = list.text('q');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (router.isReady) setQuery(urlQuery); }, [mode, groupKey]);

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
            <BannerCard key={m.key} href={`/stages?mode=${m.key}`} renderLink={nextLink}
              highlight={!!m.live}
              art={<ArtBox manifest={icons} w="100%"
                sources={art ? [['banner', art]]
                  : [[m.tile ? 'tile' : iconGroup(icons, GROUP_ICON_GROUPS, m.image), m.tile ?? m.image]]} />}
              badge={m.live ? t('stageLive') : undefined}
              window={m.live ? groupWindow(m.live) || undefined : undefined}
              title={<>{pick(m.label, lang)}{m.live && <Text as="span" display="block" fontSize="sm" fontWeight="normal" color="gray.300" noOfLines={1}>{groupLabel(data, m.live, lang)}</Text>}</>}
              count={<>{t(GROUP_NOUN[m.key] ?? 'stageGroupCount', { n: m.groups })} · {t('stageCount', { n: m.stages })}</>} />
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
  const status = live ? t('stageLive') : ended ? t('stageEnded') : upcoming ? t('stageUpcoming') : undefined;
  const difficulty = group.difficulty ? pick(DIFFICULTY_LABEL[group.difficulty], lang) || group.difficulty : null;
  return (
    <BannerCard href={`/stages?group=${encodeURIComponent(group.key)}`} renderLink={nextLink}
      highlight={live}
      art={<ArtBox manifest={icons} w="100%" sources={[
        ['banner', group.banner],
        ['banner', group.mode === 'ascent' ? (group.from ? 'Ascent_Core' : 'Ascent_Basic') : null],
        [iconGroup(icons, GROUP_ICON_GROUPS, group.image), group.image],
        ['tile', data.modes.find((m) => m.key === group.mode)?.tile],
      ]} />}
      badge={status}
      window={groupWindow(group) || undefined}
      title={groupLabel(data, group, lang)}
      count={
        <>
          {difficulty && <>{difficulty} · </>}
          {t('stageCount', { n: stages.length })}
          {low != null && high != null && ` · ${t('stageLevelRange', { from: low, to: high })}`}
          {shown.length > 0 && (
            <HStack as="span" spacing={-1.5} pt={1.5}>
              {shown.map((code) => (
                <GameIcon key={code} manifest={icons} group="char"
                  names={[data.enemies[code]?.iconPath, `Icon_${code}`]} size={8} borderRadius="full"
                  borderWidth="2px" borderColor={bosses.includes(code) ? 'red.400' : 'gray.800'}
                  title={dataText(lang, data.enemies[code]?.name, data.enemies[code]?.nameEn)} />
              ))}
            </HStack>
          )}
        </>
      } />
  );
}

// --- level 3: the stages, with what they field and what they pay -----------

function StageList({ grouping, data, chars, icons, lang, query, onQuery }: {
  grouping: StageGrouping; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang; query: string; onQuery: (v: string) => void;
}) {
  const t = useT();
  const { group } = grouping;
  const q = query.trim();
  const stages = q
    ? grouping.stages.filter((s) => textMatch(q, [
      stageName(data, s, lang), s.id,
      ...enemyCodes(s).flatMap((c) => [c, data.enemies[c]?.name, data.enemies[c]?.nameEn]),
      ...stageDrops(s).flatMap((d) => [dropName(data, d, 'ko'), dropName(data, d, 'en')]),
    ]))
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
      </Flex>
      <ListToolbar
        search={<SearchBox value={query} onChange={onQuery} placeholder={t('search')} clearLabel={t('clearSearch')} />}
        count={t('stageCount', { n: stages.length })}
        actions={<ShareButton query={{ group: group.key }} />} />

      {stages.length === 0 && <EmptyState title={t('noMatch')} />}

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={2}>
        {stages.map((stage) => {
          const codes = enemyCodes(stage);
          const drops = stageDrops(stage);
          return (
            <StageCard key={stage.id} href={`/stage?id=${stage.id}`} renderLink={nextLink}
              title={stageName(data, stage, lang)} id={stage.id}
              meta={<StageMeta stage={stage} chars={chars} icons={icons} lang={lang} />}
              previews={
                <>
                  <IconPreview label={t('stageRoster')} count={codes.length} max={PREVIEW}>
                    {codes.map((code) => (
                      <GameIcon key={code} manifest={icons} group="char"
                        names={[data.enemies[code]?.iconPath, `Icon_${code}`]}
                        title={dataText(lang, data.enemies[code]?.name, data.enemies[code]?.nameEn)
                          || code}
                        boxSize="26px" borderRadius="sm" objectFit="cover" reserve={false} />
                    ))}
                  </IconPreview>
                  {drops.length > 0 && (
                    <IconPreview label={t('stageDrops')} count={drops.length} max={PREVIEW}>
                      {drops.map((drop, i) => {
                        const entry = drop.ref ? data.drops[drop.ref] : null;
                        return (
                          <ItemIcon key={i} manifest={icons}
                            group={iconGroup(icons, DROP_ICON_GROUPS, entry?.icon)}
                            names={[entry?.icon]} grade={entry?.grade} count={dropAmount(drop)}
                            title={`${dropName(data, drop, lang)} ×${dropAmount(drop)}`} size="34px" />
                        );
                      })}
                    </IconPreview>
                  )}
                </>
              } />
          );
        })}
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
