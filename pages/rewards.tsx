import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Badge, Box, Button, Flex, HStack, Select, Text, VStack,
} from '@chakra-ui/react';
import { LoadState, PageHeader, Panel, TabPanel, UrlTabs, tabParam } from '@altterisk/game-hub';
import { nextRouterAdapter } from '@altterisk/game-hub/filters';
import { TimeControls, useNow, useServerTime } from '@/components/eventsBoard';
import {
  Row, Rewards, WindowBadges, bounded, phase, type RewardCtx,
} from '@/components/seasonRewards';
import {
  loadIcons, loadRewards,
  type IconManifest, type RewardIndex, type RewardMissionSet, type RewardQuest, type RewardWindow,
} from '@/lib/data';
import { formatMoment } from '@/lib/events';
import { gameText, useGameLang, type GameLang } from '@/lib/gameText';
import { useLang, useT, type UiKey } from '@/lib/i18n';
import { useSpoilerFilter, withoutRewardSpoilers } from '@/lib/spoilers';

type Ctx = RewardCtx;

const SET_TYPE: Record<string, UiKey> = {
  daily: 'rewardsDaily', weekly: 'rewardsWeekly', achievement: 'rewardsAchievement',
  event_hub: 'rewardsEventHub', main_event: 'rewardsMainEvent',
};
const RESET: Record<string, UiKey> = { daily: 'rewardsDaily', weekly: 'rewardsWeekly', monthly: 'rewardsMonthly' };

// The running entry, else the latest one already started, else the first.
function currentIndex(windows: (RewardWindow | undefined)[], now: number): number {
  const running = windows.findIndex((w) => phase(w, now) === 'running');
  if (running >= 0) return running;
  let best = -1;
  windows.forEach((w, i) => {
    if (w && Date.parse(w.start) <= now && (best < 0 || Date.parse(w.start) > Date.parse(windows[best]!.start))) best = i;
  });
  return best >= 0 ? best : 0;
}

function SeasonSelect({ options, value, onChange }: {
  options: string[]; value: number; onChange: (i: number) => void;
}) {
  const t = useT();
  return (
    <Select size="sm" maxW={{ base: '100%', sm: '30rem' }} value={value} aria-label={t('rewardsSeason')}
      onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((label, i) => <option key={i} value={i}>{label}</option>)}
    </Select>
  );
}

function seasonLabel(w: RewardWindow | undefined, lang: 'en' | 'ko', serverTime: boolean): string {
  return w ? formatMoment(w.start, lang, serverTime).replace(/,? \d{2}:\d{2}$/, '') : '';
}

function questTitle(q: RewardQuest, lang: GameLang, count: number): { title: string; sub: string } {
  const fill = (s: string) => s.replace(/\{\d\}\s*\/\s*\{\d\}/g, count.toLocaleString()).replace(/\{\d\}/g, count.toLocaleString());
  const name = fill(gameText(q.name, lang));
  const desc = fill(gameText(q.desc, lang));
  const usable = name && name !== '0';
  return usable ? { title: name, sub: desc } : { title: desc, sub: '' };
}

// Consecutive levels paying the same thing collapse into one row.
function levelRuns(levels: RewardQuest['levels']) {
  const runs: { from: number; to: number; first: number; last: number; points?: number; rewards?: string }[] = [];
  levels.forEach((l, i) => {
    const run = runs[runs.length - 1];
    if (run && run.rewards === l.rewards && run.points === l.points) {
      run.to = i + 1;
      run.last = l.count;
    } else {
      runs.push({ from: i + 1, to: i + 1, first: l.count, last: l.count, points: l.points, rewards: l.rewards });
    }
  });
  return runs;
}

function QuestRows({ quests, ctx, pointKey }: { quests: RewardQuest[]; ctx: Ctx; pointKey: UiKey }) {
  const t = useT();
  return (
    <>
      {quests.map((q) => {
        const runs = levelRuns(q.levels);
        const multi = q.levels.length > 1;
        return runs.map((run, i) => {
          const { title, sub } = questTitle(q, ctx.gameLang, run.first);
          return (
            <Row key={`${q.id}-${i}`} label={
              <Box>
                {i === 0 && <Text fontWeight="semibold">{title}</Text>}
                {i === 0 && sub && <Text fontSize="xs" color="gray.400">{sub}</Text>}
                <HStack spacing={2} fontSize="xs" color="gray.500" wrap="wrap">
                  {multi && (
                    <Text>{run.from === run.to ? t('rewardsLevel', { n: run.from }) : t('rewardsLevels', { from: run.from, to: run.to })}</Text>
                  )}
                  <Text fontFamily="mono">
                    ×{run.first.toLocaleString()}{run.last !== run.first ? ` → ${run.last.toLocaleString()}` : ''}
                  </Text>
                </HStack>
              </Box>
            }>
              <HStack spacing={2} wrap="wrap">
                {run.points ? <Badge colorScheme="purple" textTransform="none">{t(pointKey, { n: run.points })}</Badge> : null}
                <Rewards group={run.rewards} ctx={ctx} />
              </HStack>
            </Row>
          );
        });
      })}
    </>
  );
}

function MissionSet({ set, ctx }: { set: RewardMissionSet; ctx: Ctx }) {
  const t = useT();
  const title = gameText(set.name, ctx.gameLang)
    || (set.groups.length === 1 && gameText(set.groups[0].name, ctx.gameLang))
    || t('rewardsSet', { id: set.id ?? set.groups[0]?.id ?? '' });
  const p = phase(set.open, ctx.now);
  const typeLabel = set.type ? t(SET_TYPE[set.type]) : '';
  const resetLabel = set.reset ? t(RESET[set.reset]) : '';
  return (
    <Panel title={title} actions={
      <HStack spacing={1} wrap="wrap">
        {typeLabel && !title.startsWith(typeLabel) && <Badge textTransform="none">{typeLabel}</Badge>}
        {resetLabel && !title.startsWith(resetLabel) && <Badge colorScheme="green" textTransform="none">{resetLabel}</Badge>}
        {set.retired && <Badge textTransform="none">{t('rewardsRetired')}</Badge>}
        {p === 'ended' && !set.retired && <Badge textTransform="none">{t('rewardsEnded')}</Badge>}
        {p === 'upcoming' && <Badge colorScheme="blue" textTransform="none">{t('rewardsUpcoming')}</Badge>}
      </HStack>
    }>
      <VStack align="stretch" spacing={3}>
        {bounded(set.open) && (
          <WindowBadges ctx={ctx} items={[[null, set.open]]} />
        )}
        {set.point?.steps.length ? (
          <Box>
            <Text fontSize="sm" fontWeight="bold" color="gray.400" mb={1}>
              {t('rewardsPointSteps')}{set.point.name ? ` · ${gameText(set.point.name, ctx.gameLang)}` : ''}
            </Text>
            {set.point.steps.map((s) => (
              <Row key={s.need} label={<Text fontFamily="mono">{s.need.toLocaleString()}</Text>}>
                <Rewards group={s.rewards} ctx={ctx} />
              </Row>
            ))}
          </Box>
        ) : null}
        {set.groups.map((g) => (
          <Box key={g.id}>
            {set.groups.length > 1 && g.name && (
              <Text fontSize="sm" fontWeight="bold" color="gray.400" mb={1}>{gameText(g.name, ctx.gameLang)}</Text>
            )}
            <QuestRows quests={g.quests} ctx={ctx} pointKey="rewardsPoints" />
          </Box>
        ))}
      </VStack>
    </Panel>
  );
}

const PHASE_ORDER = { running: 0, upcoming: 1, ended: 2 } as const;

function MissionsTab({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const [showRetired, setShowRetired] = useState(false);
  const live = useMemo(() => ctx.data.missions.filter((m) => !m.retired)
    .map((m, i) => ({ m, i, p: phase(m.open, ctx.now) ?? 'running' }))
    .sort((a, b) => PHASE_ORDER[a.p] - PHASE_ORDER[b.p] || a.i - b.i), [ctx.data, ctx.now]);
  const retired = ctx.data.missions.filter((m) => m.retired);
  return (
    <VStack align="stretch" spacing={4}>
      {live.map(({ m, i }) => <MissionSet key={i} set={m} ctx={ctx} />)}
      {retired.length > 0 && (
        <Button size="sm" variant="outline" alignSelf="start" onClick={() => setShowRetired((v) => !v)}>
          {showRetired ? t('rewardsHideRetired') : t('rewardsShowRetired', { n: retired.length })}
        </Button>
      )}
      {showRetired && retired.map((m, i) => <MissionSet key={`r${i}`} set={m} ctx={ctx} />)}
    </VStack>
  );
}

function PassTab({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const lang = useLang();
  const { passes } = ctx.data;
  const [pick, setPick] = useState<number | null>(null);
  const index = pick ?? currentIndex(passes.map((p) => (p.type === 'mission' ? p.open : undefined)), ctx.now);
  const pass = passes[index];
  if (!pass) return null;
  return (
    <VStack align="stretch" spacing={4}>
      <SeasonSelect value={index} onChange={setPick}
        options={passes.map((p) => {
          const date = bounded(p.open) ? seasonLabel(p.open, lang, ctx.serverTime) : '';
          return `${gameText(p.name, ctx.gameLang) || p.id}${date ? ` · ${date}` : ''}`;
        })} />
      {bounded(pass.open) && (
        <WindowBadges ctx={ctx} items={[[null, pass.open]]} />
      )}
      <Text fontSize="sm" color="gray.400">{t('rewardsPassInfo', { exp: pass.levelExp, max: pass.maxLevel })}</Text>
      {pass.levels?.length ? (
        <Panel title={t('rewardsPassLevels')}>
          {pass.levels.map((l) => (
            <Row key={l.level} label={<Text fontFamily="mono">{t('rewardsLevel', { n: l.level })}</Text>}>
              <Flex gap={4} wrap="wrap">
                <HStack spacing={2} align="center">
                  <Text fontSize="xs" color="gray.500" w="2.5rem">{t('rewardsFree')}</Text>
                  <Box borderRadius="md" outline={l.highlightFree ? '1px solid' : undefined} outlineColor="yellow.400">
                    <Rewards group={l.free} ctx={ctx} />
                  </Box>
                </HStack>
                <HStack spacing={2} align="center">
                  <Text fontSize="xs" color="gray.500" w="2.5rem">{t('rewardsPaid')}</Text>
                  <Box borderRadius="md" outline={l.highlightPaid ? '1px solid' : undefined} outlineColor="yellow.400">
                    <Rewards group={l.paid} ctx={ctx} />
                  </Box>
                </HStack>
              </Flex>
            </Row>
          ))}
        </Panel>
      ) : null}
      {pass.categories?.map((c, i) => (
        <Panel key={i} title={gameText(c.name, ctx.gameLang) || '—'}
          actions={c.reset && RESET[c.reset] ? <Badge colorScheme="green" textTransform="none">{t(RESET[c.reset])}</Badge> : undefined}>
          <QuestRows quests={c.quests} ctx={ctx} pointKey="rewardsPassExp" />
        </Panel>
      ))}
    </VStack>
  );
}

export default function RewardsPage() {
  const t = useT();
  const router = useRouter();
  const gameLang = useGameLang();
  const [data, setData] = useState<RewardIndex | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(60_000);

  const load = () => {
    setError(null);
    loadRewards().then(setData).catch(setError);
  };
  useEffect(() => {
    load();
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const tabItems = [
    { id: 'missions', label: t('rewardsMissions') },
    { id: 'pass', label: t('rewardsPass') },
  ];
  const [tab, setTab] = tabParam(nextRouterAdapter(router), tabItems);
  const { hide, facts } = useSpoilerFilter();
  const shown = useMemo(() => (data && hide ? (facts ? withoutRewardSpoilers(data, facts) : null) : data), [data, facts, hide]);
  const ctx: Ctx | null = shown ? { data: shown, icons, gameLang, now, serverTime } : null;

  return (
    <VStack align="stretch" spacing={4}>
      <Head><title>{`MAD Viewer — ${t('rewardsTitle')}`}</title></Head>
      <PageHeader title={t('rewardsTitle')} actions={<TimeControls serverTime={serverTime} onChange={setServerTime} />} />
      {!ctx ? (
        <LoadState loading={!error} error={error} retry={load}
          labels={{ loading: t('loading') }} />
      ) : (
        <>
          <UrlTabs tabs={tabItems} active={tab} onChange={setTab} label={t('rewardsTitle')} idBase="rewards" />
          <TabPanel tab={tab} idBase="rewards">
            {tab === 'missions' && <MissionsTab ctx={ctx} />}
            {tab === 'pass' && <PassTab ctx={ctx} />}
          </TabPanel>
        </>
      )}
    </VStack>
  );
}

