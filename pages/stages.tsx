// Three levels over one route, because `output: 'export'` prerenders every path and the stage set is runtime data.
import { listState, nextRouterAdapter, textMatch, useUrlText } from '@altterisk/game-hub/filters';
import {
  BannerCard, EmptyState, IconPreview, ListToolbar, MetaChip, SearchBox, StageCard,
} from '@altterisk/game-hub';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Button, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap,
  WrapItem, Collapse,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { ArtBox } from '@/components/artBox';
import { EventsBoard, TimeControls, useNow, useServerTime } from '@/components/eventsBoard';
import {
  ARENA_LABEL, ArenaCombined, ArenaSeasonDiff, NemesisCombined, NemesisSeasonRewards, SeasonWindows,
  arenaSeasonName, phase,
  seasonGroup, type RewardCtx,
} from '@/components/seasonRewards';
import { gameText, useGameLang } from '@/lib/gameText';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { StageCrumbs } from '@/components/stageCrumbs';
import { ShareButton } from '@/components/shareButton';
import { hasIcon } from '@/lib/icons';
import { nextLink } from '@/lib/hubLink';
import { StageMeta } from '@/components/stageMeta';
import { NemesisRooms } from '@/components/nemesisRooms';
import { FilterChip, FilterRow } from '@/components/filters';
import {
  DIFFICULTY_LABEL, DROP_ICON_GROUPS, GROUP_ICON_GROUPS, dropAmount, dropName, enemyCodes, groupByKey,
  groupIsLive, groupLabel, groupWindow, levelRange, modeSummaries, stageDrops,
  stageGroups, stageName, type ModeSummary, type StageGrouping,
} from '@/lib/stages';
import { dataText, pick, useLang, useT, type Lang, type UiKey } from '@/lib/i18n';
import {
  groupIsSpoiler, isFuture, useSpoilerFilter, withoutRewardSpoilers, withoutStageSpoilers,
} from '@/lib/spoilers';
import { useSpoilerGate } from '@/components/spoilers';
import {
  loadArchive, loadCharacters, loadIcons, loadRewards, loadStages, type ArchiveIndex,
  type CharacterData, type IconManifest, type RewardIndex, type RewardWindow, type StageData,
  type StageEntry, type StageGroup,
} from '@/lib/data';
import { Seo } from '@/components/seo';

const iconGroup = (
  icons: IconManifest | null, groups: readonly string[], name?: string | null,
) => (groups.find((g) => hasIcon(icons, g as never, name)) ?? groups[0]) as never;

export default function StagesPage() {
  const t = useT();
  return <><Seo title={t('navStages')} description={t('seoDescStages')} /><StagesContent /></>;
}

function StagesContent() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const mode = typeof router.query.mode === 'string' ? router.query.mode : null;
  const groupKey = typeof router.query.group === 'string' ? router.query.group : null;

  const [data, setData] = useState<StageData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [rewards, setRewards] = useState<RewardIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(60_000);
  const gameLang = useGameLang();
  const list = listState(nextRouterAdapter(router));
  const [query, setQuery] = useUrlText(list, router.isReady);

  useEffect(() => {
    loadStages().then(setData).catch((e) => setError(String(e)));
    // both are decoration: a failure must leave the list usable
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadRewards().then(setRewards).catch(() => setRewards(null));
  }, []);
  const { hide, facts } = useSpoilerFilter();
  const shownData = useMemo(() => (data && facts && hide ? withoutStageSpoilers(data, facts) : data), [data, facts, hide]);
  const shownRewards = useMemo(
    () => (rewards && facts && hide ? withoutRewardSpoilers(rewards, facts) : rewards), [rewards, facts, hide]);
  const view = useMemo(
    () => (shownData && shownRewards ? withSeasonModes(shownData, shownRewards) : shownData), [shownData, shownRewards]);
  const nemesisKey = groupKey?.startsWith('nemesis:') ? groupKey : null;
  const askedSeason = typeof router.query.season === 'string' && (mode === 'nemesis' || mode === 'arena')
    ? `${mode}:${router.query.season}` : null;
  const gated = useSpoilerGate(!data || !rewards || !facts || !router.isReady ? null
    : (!!groupKey && !!data.groups[groupKey] && groupIsSpoiler(data.groups[groupKey], facts))
      || [nemesisKey, askedSeason].some((key) => !!key && seasonIsFuture(rewards, key, now)), '/stages');

  const urlQuery = list.text('q');
  useEffect(() => {
    if (router.isReady && groupKey?.startsWith('arena:')) {
      router.replace(`/stages?mode=arena&season=${encodeURIComponent(groupKey.slice('arena:'.length))}`);
    }
  }, [router, groupKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (router.isReady) setQuery(urlQuery); }, [mode, groupKey]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data || !view || !router.isReady || gated || (hide && !facts)) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  const ctx: RewardCtx | null = shownRewards ? { data: shownRewards, icons, gameLang, now, serverTime } : null;
  const time = <TimeControls serverTime={serverTime} onChange={setServerTime} />;
  const season = groupKey && ctx ? seasonOf(ctx.data, groupKey) : null;
  if (season && ctx) {
    return (
      <SeasonPage season={season} data={view} chars={chars} icons={icons} lang={lang} ctx={ctx}
        query={query} onQuery={setQuery} time={time} />
    );
  }
  const grouping = groupKey && shownData ? groupByKey(shownData, groupKey) : null;
  if (grouping && shownData) {
    return (
      <StageList grouping={grouping} data={shownData} chars={chars} icons={icons} lang={lang}
        query={query} onQuery={setQuery} />
    );
  }
  if ((mode === 'nemesis' || mode === 'arena') && ctx) {
    const openSeason = typeof router.query.season === 'string' ? router.query.season : null;
    return (
      <SeasonList mode={mode} data={view} icons={icons} lang={lang} ctx={ctx} time={time} openSeason={openSeason} />
    );
  }
  if (mode && view.modes.some((m) => m.key === mode)) {
    return <GroupList mode={mode} data={view} icons={icons} lang={lang} />;
  }
  return <ModeHub data={view} icons={icons} lang={lang} ctx={ctx} />;
}

// --- seasons: Nemesis and Arena list every season the master data schedules ----

type Season = {
  mode: 'nemesis' | 'arena';
  group: StageGroup;
  open?: RewardWindow;
  tile?: string;
  nemesis?: RewardIndex['nemesis']['seasons'][number];
  arena?: RewardIndex['arena']['seasons'][number];
};

function seasonsOf(rewards: RewardIndex, mode: 'nemesis' | 'arena'): Season[] {
  if (mode === 'nemesis') {
    return rewards.nemesis.seasons.map((s) => ({
      mode, nemesis: s, open: s.open, tile: s.tile ?? rewards.nemesis.tile,
      group: seasonGroup(mode, s.id, s.name, s.open, s.banner),
    }));
  }
  return rewards.arena.seasons.map((s) => ({
    mode, arena: s, open: s.open, tile: rewards.arena.tile,
    group: seasonGroup(mode, s.id, arenaSeasonName(s), s.open, rewards.arena.banner, s.order),
  }));
}

function seasonIsFuture(rewards: RewardIndex, key: string, now: number): boolean {
  const [mode, id] = key.split(':');
  const list: { id: number; open?: RewardWindow }[] = mode === 'arena' ? rewards.arena.seasons : rewards.nemesis.seasons;
  return isFuture(list.find((s) => String(s.id) === id)?.open?.start, now);
}

// Only Nemesis seasons have a page: an Arena season differs from the next in rewards alone.
function seasonOf(rewards: RewardIndex, key: string): Season | null {
  if (!key.startsWith('nemesis:')) return null;
  return seasonsOf(rewards, 'nemesis').find((s) => s.group.key === key) ?? null;
}

// Arena has no stage in the pack, so its mode exists only through the reward data.
function withSeasonModes(data: StageData, rewards: RewardIndex): StageData {
  const modes = [...data.modes];
  let at = modes.findIndex((m) => m.key === 'nemesis');
  if (at < 0) {
    modes.push({ key: 'nemesis', label: { en: 'Nemesis', ko: '네메시스' }, tile: rewards.nemesis.tile });
    at = modes.length - 1;
  }
  if (!modes.some((m) => m.key === 'arena')) {
    modes.splice(at + 1, 0, { key: 'arena', label: ARENA_LABEL, tile: rewards.arena.tile });
  }
  return { ...data, modes };
}

function seasonSummary(data: StageData, rewards: RewardIndex, mode: 'nemesis' | 'arena', now: number): ModeSummary {
  const seasons = seasonsOf(rewards, mode);
  const found = data.modes.find((m) => m.key === mode);
  return {
    key: mode,
    label: found?.label ?? ARENA_LABEL,
    groups: seasons.length,
    stages: data.stages.filter((s) => s.mode === mode).length,
    tile: found?.tile,
    live: seasons.find((s) => phase(s.open, now) === 'running')?.group ?? null,
  };
}

function seasonBadge(p: ReturnType<typeof phase>, t: ReturnType<typeof useT>): string {
  return p === 'running' ? t('stageLive') : p === 'upcoming' ? t('stageUpcoming') : t('stageEnded');
}

// The currency each mode pays out, and the shop tab that takes it.
const MODE_SHOP: Record<'nemesis' | 'arena', { goods: string; tab: string }> = {
  nemesis: { goods: 'goods:100', tab: 'nemesis' },
  arena: { goods: 'goods:110', tab: 'arena' },
};

function SeasonList({ mode, data, icons, lang, ctx, time, openSeason }: {
  mode: 'nemesis' | 'arena'; data: StageData; icons: IconManifest | null; lang: Lang; ctx: RewardCtx;
  time: ReactNode; openSeason: string | null;
}) {
  const t = useT();
  const seasons = seasonsOf(ctx.data, mode);
  const start = (s: Season) => (s.open ? Date.parse(s.open.start) : 0);
  const current = seasons.filter((s) => phase(s.open, ctx.now) !== 'ended').sort((a, b) => start(a) - start(b));
  const past = seasons.filter((s) => phase(s.open, ctx.now) === 'ended').sort((a, b) => start(b) - start(a));
  const sections: [UiKey, Season[]][] = [['seasonsCurrent', current], ['seasonsPast', past]];
  // Art every season shares is shown once, and the seasons become compact rows.
  const shared = new Set(seasons.map((s) => s.group.banner ?? s.tile)).size === 1 ? seasons[0] : null;
  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="center" gap={3} wrap="wrap">
        <StageCrumbs data={data} mode={mode} lang={lang} />
        <Box flex="1" />
        {time}
        <ShareButton query={{ mode }} />
      </Flex>
      <ModeTabs data={data} mode={mode} lang={lang} />
      <Flex gap={4} align="center" wrap="wrap">
        {shared && (
          <ArtBox manifest={icons} w={{ base: '100%', sm: '280px' }}
            sources={[['banner', shared.group.banner], ['tile', shared.tile]]} />
        )}
        <Button as={NextLink} href={`/shop?tab=${MODE_SHOP[mode].tab}`} size="sm" variant="outline"
          leftIcon={<GameIcon manifest={icons} group="item" name={ctx.data.refs[MODE_SHOP[mode].goods]?.icon} size={5} />}>
          {gameText(ctx.data.refs[MODE_SHOP[mode].goods]?.name, ctx.gameLang)} · {t('shopLink')}
        </Button>
      </Flex>
      {sections.filter(([, list]) => list.length > 0).map(([key, list]) => (
        <Box key={key}>
          <Text fontSize="lg" fontWeight="bold" mb={3}>{t(key)}</Text>
          {shared ? (
            <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={2} alignItems="start">
              {list.map((s) => (
                <SeasonRow key={s.group.key} season={s} data={data} lang={lang} ctx={ctx}
                  defaultOpen={openSeason != null && s.group.key === `${mode}:${openSeason}`} />
              ))}
            </SimpleGrid>
          ) : (
            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
              {list.map((s) => <SeasonCard key={s.group.key} season={s} data={data} icons={icons} lang={lang} ctx={ctx} />)}
            </SimpleGrid>
          )}
        </Box>
      ))}
      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={3}>{t('seasonsRewards')}</Text>
        {mode === 'nemesis' ? <NemesisCombined ctx={ctx} /> : <ArenaCombined ctx={ctx} />}
      </Box>
    </VStack>
  );
}

function SeasonRow({ season, data, lang, ctx, defaultOpen }: {
  season: Season; data: StageData; lang: Lang; ctx: RewardCtx; defaultOpen: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const p = phase(season.open, ctx.now);
  return (
    <Box borderRadius="md" borderWidth={p === 'running' ? '2px' : '1px'}
      borderColor={p === 'running' ? 'pink.400' : 'whiteAlpha.200'} bg="whiteAlpha.50" minW={0}>
      <Flex as="button" type="button" w="100%" p={3} gap={2} align="center" textAlign="left"
        aria-expanded={open} onClick={() => setOpen((v) => !v)} _hover={{ bg: 'whiteAlpha.50' }}>
        <ChevronRightIcon boxSize={5} color="gray.400" flexShrink={0}
          transform={open ? 'rotate(90deg)' : undefined} transition="transform 0.15s" />
        <Box minW={0}>
          <HStack spacing={2} wrap="wrap">
            <Badge colorScheme={p === 'running' ? 'pink' : p === 'upcoming' ? 'blue' : 'gray'}>{seasonBadge(p, t)}</Badge>
            <Text fontSize="xs" color="gray.400">{groupWindow(season.group)}</Text>
          </HStack>
          <Text fontWeight="bold" mt={1}>{groupLabel(data, season.group, lang)}</Text>
        </Box>
      </Flex>
      <Collapse in={open} animateOpacity>
        <Box px={3} pb={3}>
          {season.arena && <ArenaSeasonDiff season={season.arena} ctx={ctx} />}
        </Box>
      </Collapse>
    </Box>
  );
}

function SeasonCard({ season, data, icons, lang, ctx }: {
  season: Season; data: StageData; icons: IconManifest | null; lang: Lang; ctx: RewardCtx;
}) {
  const t = useT();
  const p = phase(season.open, ctx.now);
  const stages = data.stages.filter((s) => s.group === season.group.key);
  const enemies = [...new Set(stages.flatMap((s) => enemyCodes(s)))];
  const bosses = enemies.filter((c) => stages.some((s) => s.waves.some((w) => w.bossCode === c)));
  const stage = season.arena?.stage;
  const effects = (stage?.effects ?? []).map((k) => gameText(ctx.data.effects[k]?.title, ctx.gameLang)).filter(Boolean);
  return (
    <BannerCard href={`/stages?group=${encodeURIComponent(season.group.key)}`} renderLink={nextLink}
      className="mad-banner-row"
      highlight={p === 'running'}
      art={<ArtBox manifest={icons} w="100%"
        sources={[['banner', season.group.banner], ['tile', season.tile]]} />}
      badge={seasonBadge(p, t)}
      window={groupWindow(season.group) || undefined}
      title={groupLabel(data, season.group, lang)}
      count={
        <>
          {stages.length > 0 && t('stageCount', { n: stages.length })}
          {stage && gameText(stage.name, ctx.gameLang)}
          {effects.length > 0 && ` · ${effects.join(', ')}`}
          {bosses.length > 0 && (
            <HStack as="span" spacing={-1.5} pt={1.5}>
              {bosses.map((code) => (
                <GameIcon key={code} manifest={icons} group="char"
                  names={[data.enemies[code]?.iconPath, `Icon_${code}`]} size={8} borderRadius="full"
                  borderWidth="2px" borderColor="red.400"
                  title={dataText(lang, data.enemies[code]?.name, data.enemies[code]?.nameEn)} />
              ))}
            </HStack>
          )}
        </>
      } />
  );
}

function SeasonPage({ season, data, chars, icons, lang, ctx, query, onQuery, time }: {
  season: Season; data: StageData; chars: CharacterData | null; icons: IconManifest | null; lang: Lang;
  ctx: RewardCtx; query: string; onQuery: (v: string) => void; time: ReactNode;
}) {
  const t = useT();
  const grouping = groupByKey(data, season.group.key);
  const detail = season.nemesis ? (
    <VStack align="stretch" spacing={4}>
      <SeasonWindows season={season.nemesis} ctx={ctx} />
      <NemesisSeasonRewards season={season.nemesis} ctx={ctx} />
    </VStack>
  ) : null;
  if (grouping && season.nemesis) {
    return (
      <VStack align="stretch" spacing={4}>
        <StageCrumbs data={data} mode={grouping.group.mode} group={grouping.group} lang={lang} />
        <GroupHeader grouping={grouping} data={data} icons={icons} lang={lang} />
        <NemesisRooms grouping={grouping} data={data} chars={chars} icons={icons} lang={lang} />
        {time}
        {detail}
      </VStack>
    );
  }
  if (grouping) {
    return (
      <StageList grouping={grouping} data={data} chars={chars} icons={icons} lang={lang}
        query={query} onQuery={onQuery} extra={<>{time}{detail}</>} />
    );
  }
  const p = phase(season.open, ctx.now);
  return (
    <VStack align="stretch" spacing={4}>
      <StageCrumbs data={data} mode={season.mode} group={season.group} lang={lang} />
      <Flex align="center" gap={3} wrap="wrap">
        <ArtBox manifest={icons} w={{ base: '100%', sm: '240px' }}
          sources={[['banner', season.group.banner], ['tile', season.tile]]} />
        <VStack align="start" spacing={1}>
          <Text fontSize="xl" fontWeight="bold">{groupLabel(data, season.group, lang)}</Text>
          <Badge colorScheme={p === 'running' ? 'pink' : p === 'upcoming' ? 'blue' : 'gray'}>{seasonBadge(p, t)}</Badge>
        </VStack>
        <Box flex="1" />
        {time}
        <ShareButton query={{ group: season.group.key }} />
      </Flex>
      {detail}
    </VStack>
  );
}

// --- level 1: the modes ----------------------------------------------------

const GROUP_NOUN: Record<string, UiKey> = {
  story: 'stageChapters', event: 'stageEventCount', nemesis: 'stageSeasons', arena: 'stageSeasons',
  archive: 'stageNodes',
};

function ModeHub({ data, icons, lang, ctx }: {
  data: StageData; icons: IconManifest | null; lang: Lang; ctx: RewardCtx | null;
}) {
  const t = useT();
  const now = ctx?.now;
  const rewards = ctx?.data;
  const modes = useMemo(() => {
    const own = modeSummaries(data).filter((m) => m.key !== 'archive');
    if (!rewards || now == null) return own;
    const seasons = (['nemesis', 'arena'] as const).map((k) => seasonSummary(data, rewards, k, now));
    const order = data.modes.map((m) => m.key);
    return [...own.filter((m) => m.key !== 'nemesis'), ...seasons]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [data, rewards, now]);
  return (
    <VStack align="stretch" spacing={3}>
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
        {modes.map((m) => {
          const art = m.live?.banner ?? (m.tile ? null : m.banner);
          return (
            <BannerCard key={m.key} href={`/stages?mode=${m.key}`} renderLink={nextLink}
              className="mad-banner-row"
              highlight={!!m.live}
              art={<ArtBox manifest={icons} w="100%"
                sources={art ? [['banner', art]]
                  : [[m.tile ? 'tile' : iconGroup(icons, GROUP_ICON_GROUPS, m.image), m.tile ?? m.image]]} />}
              badge={m.live ? t('stageLive') : undefined}
              window={m.live ? groupWindow(m.live) || undefined : undefined}
              title={<>{pick(m.label, lang)}{m.live && <Text as="span" display="block" fontSize="sm" fontWeight="normal" color="gray.300" noOfLines={1}>{groupLabel(data, m.live, lang)}</Text>}</>}
              count={<>{t(GROUP_NOUN[m.key] ?? 'stageGroupCount', { n: m.groups })}{m.stages > 0 && <> · {t('stageCount', { n: m.stages })}</>}</>} />
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
    <BannerCard href="/archive" renderLink={nextLink} className="mad-banner-row" highlight={live}
      art={<ArtBox manifest={icons} w="100%"
        sources={[['banner', 'Ascent_Infinity'], ['banner', 'Thumbnail_PastStory_Content_ArchiveAscent']]} />}
      badge={live ? t('stageLive') : undefined}
      window={from && to ? `${from} – ${to}` : undefined}
      title={`${gameText(archive?.title, gameLang) || t('archiveTitle')}${season ? ` · ${t('archiveSeason', { n: season.id })}` : ''}`}
      count={`${t('stageCount', { n: nodes })} · ${t('archivePacks')}`} />
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
      className="mad-banner-row"
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

function StageList({ grouping, data, chars, icons, lang, query, onQuery, extra }: {
  grouping: StageGrouping; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang; query: string; onQuery: (v: string) => void; extra?: ReactNode;
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
      <GroupHeader grouping={grouping} data={data} icons={icons} lang={lang} />
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
      {extra}
    </VStack>
  );
}

function GroupHeader({ grouping, data, icons, lang }: {
  grouping: StageGrouping; data: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const { group } = grouping;
  return (
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
