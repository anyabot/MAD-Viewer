import { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import {
  Badge, Box, Button, Collapse, Flex, HStack, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { Panel } from '@altterisk/game-hub';
import { RewardSlot } from '@/components/eventsBoard';
import { GameIcon } from '@/components/gameIcon';
import type {
  IconManifest, RewardIndex, RewardWindow, StageGroup,
} from '@/lib/data';
import { formatMoment, zoneLabel } from '@/lib/events';
import { gameText, type GameLang, type GameLocalized } from '@/lib/gameText';
import { hasIcon } from '@/lib/icons';
import { useLang, useT, type Localized, type UiKey } from '@/lib/i18n';

export type RewardCtx = {
  data: RewardIndex; icons: IconManifest | null; gameLang: GameLang; now: number; serverTime: boolean;
};

export type ArenaSeason = RewardIndex['arena']['seasons'][number];
export type NemesisSeason = RewardIndex['nemesis']['seasons'][number];
type ArenaCondition = NonNullable<ArenaSeason['during']>[number];
type NemesisZone = NonNullable<NemesisSeason['zones']>[number];
export type Phase = 'running' | 'upcoming' | 'ended';
// A row the common version has and this season does not.
type Removable<T> = T & { removed?: boolean };

export const ARENA_LABEL: Localized = { en: 'Arena', ko: '아레나' };

// A permanent entry's window ends in 2100.
export function bounded(w: RewardWindow | undefined): w is RewardWindow {
  return !!w && Date.parse(w.end) < Date.parse('2099-01-01');
}

export function phase(w: RewardWindow | undefined, now: number): Phase | null {
  if (!w) return null;
  if (now < Date.parse(w.start)) return 'upcoming';
  return now <= Date.parse(w.end) ? 'running' : 'ended';
}

export function arenaSeasonName(season: ArenaSeason): GameLocalized {
  return { en: `${ARENA_LABEL.en} · Season ${season.order}`, ko: `${ARENA_LABEL.ko} · 시즌 ${season.order}` };
}

// A season as a stage group, so the stage crumbs, cards and windows treat it like any other.
export function seasonGroup(
  mode: 'nemesis' | 'arena', id: number, name: GameLocalized | undefined, open: RewardWindow | undefined,
  banner?: string, order?: number,
): StageGroup {
  return {
    key: `${mode}:${id}`,
    mode,
    name: name ? { en: name.en ?? name.ko ?? '', ko: name.ko ?? name.en ?? '' } : undefined,
    order,
    banner,
    from: open?.start.slice(0, 10),
    to: open?.end.slice(0, 10),
  };
}

export function Rewards({ group, ctx }: { group?: string; ctx: RewardCtx }) {
  const list = group ? ctx.data.rewardGroups[group] ?? [] : [];
  return (
    <Wrap spacing={1}>
      {list.map((r, i) => (
        <WrapItem key={i}>
          <RewardSlot reward={r} refs={ctx.data.refs} icons={ctx.icons} gameLang={ctx.gameLang} link />
        </WrapItem>
      ))}
    </Wrap>
  );
}

export function Row({ label, children, removed }: { label: ReactNode; children: ReactNode; removed?: boolean }) {
  return (
    <Flex gap={3} py={1.5} align="center" borderBottomWidth="1px" borderColor="whiteAlpha.100"
      _last={{ borderBottomWidth: 0 }}>
      <Box w={{ base: '40%', sm: '14rem' }} flexShrink={0} fontSize="sm" minW={0}
        textDecoration={removed ? 'line-through' : undefined} opacity={removed ? 0.5 : 1}>{label}</Box>
      <Box minW={0} flex="1">{removed ? <Text color="gray.600">—</Text> : children}</Box>
    </Flex>
  );
}

export function WindowBadges({ items, ctx }: {
  items: [UiKey | null, RewardWindow | undefined][]; ctx: Pick<RewardCtx, 'now' | 'serverTime'>;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <Wrap spacing={1.5}>
      {items.filter(([, w]) => w).map(([key, w], i) => {
        const p = phase(w, ctx.now);
        return (
          <WrapItem key={i}>
            <Badge colorScheme={p === 'running' ? 'pink' : p === 'upcoming' ? 'blue' : 'gray'}
              textTransform="none" fontWeight="normal">
              {key ? `${t(key)} · ` : ''}
              {formatMoment(w!.start, lang, ctx.serverTime)} – {formatMoment(w!.end, lang, ctx.serverTime)} {zoneLabel(ctx.serverTime)}
            </Badge>
          </WrapItem>
        );
      })}
    </Wrap>
  );
}

export function SeasonWindows({ season, ctx }: {
  season: { open?: RewardWindow; progress?: RewardWindow; reward?: RewardWindow }; ctx: RewardCtx;
}) {
  return (
    <WindowBadges ctx={ctx}
      items={[[null, season.open], ['rewardsProgress', season.progress], ['rewardsPayout', season.reward]]} />
  );
}

function TierLabel({ name, icon, ctx, children }: {
  name?: GameLocalized; icon?: string; ctx: RewardCtx; children?: ReactNode;
}) {
  return (
    <HStack spacing={2}>
      <GameIcon manifest={ctx.icons} group="tier" name={icon} size={7} reserve={false} />
      <Text>{gameText(name, ctx.gameLang)}</Text>
      {children}
    </HStack>
  );
}

// --- sections: each renders one list, for one season or for a run of identical seasons ---

function EffectRows({ keys, ctx, from }: { keys: string[]; ctx: RewardCtx; from?: Record<string, number> }) {
  const t = useT();
  return (
    <VStack align="stretch" spacing={2}>
      {keys.map((key) => {
        const e = ctx.data.effects[key];
        if (!e) return null;
        return (
          <Flex key={key} gap={3} align="start">
            <GameIcon manifest={ctx.icons} group={hasIcon(ctx.icons, 'buff', e.icon) ? 'buff' : 'ui'}
              name={e.icon} size={8} />
            <Box minW={0}>
              <HStack spacing={2} wrap="wrap">
                <Text fontSize="sm" fontWeight="bold">{gameText(e.title, ctx.gameLang)}</Text>
                {from && from[key] > 1 && (
                  <Badge textTransform="none" fontSize="0.6rem">{t('seasonEffectFrom', { n: from[key] })}</Badge>
                )}
              </HStack>
              <Text fontSize="xs" color="gray.400" whiteSpace="pre-wrap">{gameText(e.desc, ctx.gameLang)}</Text>
            </Box>
          </Flex>
        );
      })}
    </VStack>
  );
}

export function ArenaEffects({ stage, ctx }: { stage: NonNullable<ArenaSeason['stage']>; ctx: RewardCtx }) {
  const t = useT();
  return (
    <VStack align="stretch" spacing={2}>
      <HStack spacing={2} wrap="wrap">
        <Text fontSize="sm" color="gray.300">{gameText(stage.name, ctx.gameLang)}</Text>
        {stage.time ? <Badge textTransform="none">{t('arenaTimeLimit', { n: stage.time })}</Badge> : null}
      </HStack>
      {stage.effects?.length
        ? <EffectRows keys={stage.effects} ctx={ctx} />
        : <Text fontSize="sm" color="gray.500">{t('arenaNoEffects')}</Text>}
    </VStack>
  );
}

export function NemesisEffects({ zones, ctx }: { zones: NemesisZone[]; ctx: RewardCtx }) {
  return (
    <VStack align="stretch" spacing={3}>
      {zones.map((z) => (
        <Box key={z.zone}>
          <Text fontSize="sm" fontWeight="bold" color="gray.300" mb={1.5}>{gameText(z.name, ctx.gameLang)}</Text>
          <EffectRows keys={z.effects.map((e) => e.key)} ctx={ctx}
            from={Object.fromEntries(z.effects.map((e) => [e.key, e.from]))} />
        </Box>
      ))}
    </VStack>
  );
}

function ArenaConditions({ list, ctx }: { list: Removable<ArenaCondition>[]; ctx: RewardCtx }) {
  const t = useT();
  const tierOf = (type: number) => ctx.data.arena.tiers.find((x) => x.type === type);
  const label = (c: ArenaCondition): ReactNode => {
    switch (c.condition) {
      case 'promotion_tier':
        return t('rewardsPromotion', { tier: gameText(tierOf(c.value)?.name, ctx.gameLang) || String(c.value) });
      case 'arrival_rank': return t('rewardsArrivalRank', { n: c.value });
      case 'end_rank': return t('rewardsEndRank', { n: c.value });
      case 'end_tier': return <TierLabel name={tierOf(c.value)?.name} icon={tierOf(c.value)?.icon} ctx={ctx} />;
      default: return `${c.condition} ${c.value}`;
    }
  };
  return (
    <>
      {list.map((c, i) => (
        <Row key={i} label={label(c)} removed={c.removed}><Rewards group={c.rewards} ctx={ctx} /></Row>
      ))}
    </>
  );
}

function ArenaTiers({ ctx }: { ctx: RewardCtx }) {
  const t = useT();
  return (
    <Wrap spacing={2}>
      {ctx.data.arena.tiers.map((tier) => (
        <WrapItem key={tier.type} px={2} py={1} borderRadius="md" bg="whiteAlpha.50">
          <TierLabel name={tier.name} icon={tier.icon} ctx={ctx}>
            <Text fontSize="xs" color="gray.500">{t('rewardsNeedScore', { n: tier.needScore.toLocaleString() })}</Text>
          </TierLabel>
        </WrapItem>
      ))}
    </Wrap>
  );
}

function NemesisScores({ list, ctx }: { list: Removable<NonNullable<NemesisSeason['scores']>[number]>[]; ctx: RewardCtx }) {
  return (
    <>
      {list.map((s) => (
        <Row key={s.score} removed={s.removed} label={<Text fontFamily="mono">{s.score.toLocaleString()}</Text>}>
          <Rewards group={s.rewards} ctx={ctx} />
        </Row>
      ))}
    </>
  );
}

function NemesisTiers({ list, ctx }: { list: Removable<NonNullable<NemesisSeason['tiers']>[number]>[]; ctx: RewardCtx }) {
  const t = useT();
  return (
    <>
      {list.map((s) => {
        const entry = ctx.data.nemesis.tiers.find((x) => x.type === s.tier);
        return (
          <Row key={s.tier} removed={s.removed} label={
            <TierLabel name={entry?.name ?? { en: String(s.tier) }} icon={entry?.icon} ctx={ctx}>
              {entry && <Text fontSize="xs" color="gray.500">{t('rewardsTopPercent', { n: entry.topPercent })}</Text>}
            </TierLabel>
          }>
            <Rewards group={s.rewards} ctx={ctx} />
          </Row>
        );
      })}
    </>
  );
}

// `[[2]]` is the mission's zone, `[0]` / `[1]` its values.
function nemesisMissionText(m: NonNullable<NemesisSeason['missions']>[number], lang: GameLang): string {
  const zones = (m.zones ?? []).map((z) => gameText(z, lang)).filter(Boolean).join(', ');
  return gameText(m.text, lang)
    .replace(/\[\[\d\]\]/g, zones ? `[${zones}]` : '')
    .replace(/\[(\d)\]/g, (whole, i: string) => String(m.values?.[Number(i)] ?? whole))
    .trim();
}

function NemesisMissions({ list, ctx }: { list: Removable<NonNullable<NemesisSeason['missions']>[number]>[]; ctx: RewardCtx }) {
  return (
    <>
      {list.map((m) => (
        <Row key={m.order} removed={m.removed} label={<Text>{m.order}. {nemesisMissionText(m, ctx.gameLang)}</Text>}>
          <Rewards group={m.rewards} ctx={ctx} />
        </Row>
      ))}
    </>
  );
}

// --- one season ---

export function NemesisSeasonRewards({ season, ctx }: { season: NemesisSeason; ctx: RewardCtx }) {
  const t = useT();
  return (
    <VStack align="stretch" spacing={4}>
      {season.zones?.length ? (
        <Panel title={t('seasonEffects')}><NemesisEffects zones={season.zones} ctx={ctx} /></Panel>
      ) : null}
      {season.scores?.length ? (
        <Panel title={t('rewardsScores')}><NemesisScores list={season.scores} ctx={ctx} /></Panel>
      ) : null}
      {season.tiers?.length ? (
        <Panel title={t('rewardsEndTier')}><NemesisTiers list={season.tiers} ctx={ctx} /></Panel>
      ) : null}
      {season.missions?.length ? (
        <Panel title={t('rewardsSeasonMissions')}><NemesisMissions list={season.missions} ctx={ctx} /></Panel>
      ) : null}
    </VStack>
  );
}

// --- every season at once: the version most seasons share, then each other version as its difference ---

type Variant<T> = { labels: string[]; value: T };

// A reward that differs between seasons only by its "[Season N]" suffix is the same reward.
function rewardSig(ctx: RewardCtx, group: string | undefined): string {
  return JSON.stringify((group ? ctx.data.rewardGroups[group] ?? [] : []).map((r) => {
    const name = r.ref?.startsWith('deco:') ? ctx.data.refs[r.ref]?.name?.en ?? '' : '';
    const seasonal = /\[Season \d+\]/.test(name);
    return [seasonal ? name.replace(/\s*\[Season \d+\]/, '') : r.ref ?? r.type, r.amount];
  }));
}

// Seasons in chronological order; each variant shows its newest season's list.
function variants<S, T>(
  seasons: S[], pick: (s: S) => T | undefined, sig: (value: T) => string, label: (s: S) => string,
): Variant<T>[] {
  const out = new Map<string, Variant<T>>();
  for (const s of seasons) {
    const value = pick(s);
    if (value == null || (Array.isArray(value) && value.length === 0)) continue;
    const key = sig(value);
    const found = out.get(key);
    if (found) {
      found.labels.push(label(s));
      found.value = value;
    } else {
      out.set(key, { labels: [label(s)], value });
    }
  }
  return [...out.values()];
}

// Rows of `value` that are new or changed against `base`, then the rows of `base` it lacks.
function rowDiff<I>(key: (i: I) => string, sig: (i: I) => string) {
  return (value: I[], base: I[]): Removable<I>[] => {
    const baseSig = new Map(base.map((i) => [key(i), sig(i)]));
    const own = new Set(value.map(key));
    return [
      ...value.filter((i) => baseSig.get(key(i)) !== sig(i)) as Removable<I>[],
      ...base.filter((i) => !own.has(key(i))).map((i) => ({ ...i, removed: true })),
    ];
  };
}

function DiffToggle({ labels, children }: { labels: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        leftIcon={<ChevronRightIcon transform={open ? 'rotate(90deg)' : undefined} transition="transform 0.15s" />}
        fontWeight="normal" color="gray.300" whiteSpace="normal" textAlign="left" h="auto" py={1}>
        {labels.join(', ')}
      </Button>
      <Collapse in={open} animateOpacity>
        <Box pl={6} pt={1}>{children}</Box>
      </Collapse>
    </Box>
  );
}

// The version most seasons share; on a tie, the newer one.
function baseOf<T>(list: Variant<T>[]): Variant<T> {
  return list.reduce((best, v) => (v.labels.length >= best.labels.length ? v : best), list[0]);
}

function VariantPanel<T>({ title, list, total, render, diff }: {
  title: string; list: Variant<T>[]; total: number; render: (value: T) => ReactNode;
  diff?: (value: T, base: T) => T;
}) {
  const t = useT();
  if (!list.length) return null;
  const base = baseOf(list);
  const others = list.filter((v) => v !== base);
  return (
    <Panel title={title}>
      <VStack align="stretch" spacing={3}>
        <Wrap spacing={1}>
          {base.labels.length === total
            ? <WrapItem><Badge colorScheme="green" textTransform="none">{t('seasonsAll')}</Badge></WrapItem>
            : base.labels.map((l) => (
              <WrapItem key={l}><Badge colorScheme="purple" textTransform="none" fontWeight="normal">{l}</Badge></WrapItem>
            ))}
        </Wrap>
        {render(base.value)}
        {others.length > 0 && (
          <Box borderTopWidth="1px" borderColor="whiteAlpha.200" pt={2}>
            <Text fontSize="xs" color="gray.500" mb={1}>{t('seasonsDiffer')}</Text>
            {others.map((v, i) => (
              <DiffToggle key={i} labels={v.labels}>{render(diff ? diff(v.value, base.value) : v.value)}</DiffToggle>
            ))}
          </Box>
        )}
      </VStack>
    </Panel>
  );
}

function byStart<S extends { open?: RewardWindow }>(list: S[]): S[] {
  return [...list].sort((a, b) => (a.open ? Date.parse(a.open.start) : 0) - (b.open ? Date.parse(b.open.start) : 0));
}

function arenaTools(ctx: RewardCtx) {
  const key = (c: ArenaCondition) => `${c.condition}:${c.value}`;
  const sig = (c: ArenaCondition) => rewardSig(ctx, c.rewards);
  const all = (list: ArenaCondition[]) => JSON.stringify(list.map((c) => [key(c), sig(c)]));
  return { key, sig, all, diff: rowDiff(key, sig) };
}

export function ArenaCombined({ ctx }: { ctx: RewardCtx }) {
  const t = useT();
  const seasons = byStart(ctx.data.arena.seasons);
  const label = (s: ArenaSeason) => t('seasonN', { n: s.order });
  const { all, diff } = arenaTools(ctx);
  return (
    <VStack align="stretch" spacing={4}>
      <Panel title={t('rewardsTiers')}><ArenaTiers ctx={ctx} /></Panel>
      <VariantPanel title={t('rewardsDuring')} total={seasons.length}
        list={variants(seasons, (s) => s.during, all, label)} diff={diff}
        render={(list) => <ArenaConditions list={list} ctx={ctx} />} />
      <VariantPanel title={t('rewardsSeasonEnd')} total={seasons.length}
        list={variants(seasons, (s) => s.end, all, label)} diff={diff}
        render={(list) => <ArenaConditions list={list} ctx={ctx} />} />
    </VStack>
  );
}

// One Arena season: its effects, then only the reward rows that differ from the common version.
export function ArenaSeasonDiff({ season, ctx }: { season: ArenaSeason; ctx: RewardCtx }) {
  const t = useT();
  const seasons = byStart(ctx.data.arena.seasons);
  const { all, diff } = arenaTools(ctx);
  const lists: [UiKey, (s: ArenaSeason) => ArenaCondition[] | undefined][] = [
    ['rewardsDuring', (s) => s.during],
    ['rewardsSeasonEnd', (s) => s.end],
  ];
  return (
    <VStack align="stretch" spacing={3}>
      {season.stage && <ArenaEffects stage={season.stage} ctx={ctx} />}
      {lists.map(([title, pick]) => {
        const own = pick(season);
        const found = variants(seasons, pick, all, String);
        if (!own?.length || !found.length) return null;
        const base = baseOf(found).value;
        if (all(own) === all(base)) return null;
        return (
          <Box key={title}>
            <Text fontSize="sm" fontWeight="bold" color="gray.300" mb={1}>{t(title)} · {t('seasonDiffers')}</Text>
            <ArenaConditions list={diff(own, base)} ctx={ctx} />
          </Box>
        );
      })}
    </VStack>
  );
}

export function NemesisCombined({ ctx }: { ctx: RewardCtx }) {
  const t = useT();
  const seasons = byStart(ctx.data.nemesis.seasons);
  const label = (s: NemesisSeason) => `${gameText(s.name, ctx.gameLang)} · ${s.open?.start.slice(0, 10) ?? s.id}`;
  type Score = NonNullable<NemesisSeason['scores']>[number];
  type Tier = NonNullable<NemesisSeason['tiers']>[number];
  type Mission = NonNullable<NemesisSeason['missions']>[number];
  const scoreKey = (x: Score) => String(x.score);
  const scoreSig = (x: Score) => rewardSig(ctx, x.rewards);
  const tierKey = (x: Tier) => String(x.tier);
  const tierSig = (x: Tier) => rewardSig(ctx, x.rewards);
  const missionKey = (m: Mission) => String(m.order);
  const missionSig = (m: Mission) => JSON.stringify([m.type, m.values, m.zones?.map((z) => z?.ko), rewardSig(ctx, m.rewards)]);
  return (
    <VStack align="stretch" spacing={4}>
      <VariantPanel title={t('seasonEffects')} total={seasons.length}
        list={variants(seasons, (s) => s.zones,
          (zones) => JSON.stringify(zones.map((z) => [z.name?.ko, z.effects])), label)}
        render={(zones) => <NemesisEffects zones={zones} ctx={ctx} />} />
      <VariantPanel title={t('rewardsScores')} total={seasons.length}
        list={variants(seasons, (s) => s.scores, (l) => JSON.stringify(l.map((x) => [scoreKey(x), scoreSig(x)])), label)}
        diff={rowDiff(scoreKey, scoreSig)}
        render={(list) => <NemesisScores list={list} ctx={ctx} />} />
      <VariantPanel title={t('rewardsEndTier')} total={seasons.length}
        list={variants(seasons, (s) => s.tiers, (l) => JSON.stringify(l.map((x) => [tierKey(x), tierSig(x)])), label)}
        diff={rowDiff(tierKey, tierSig)}
        render={(list) => <NemesisTiers list={list} ctx={ctx} />} />
      <VariantPanel title={t('rewardsSeasonMissions')} total={seasons.length}
        list={variants(seasons, (s) => s.missions, (l) => JSON.stringify(l.map((m) => [missionKey(m), missionSig(m)])), label)}
        diff={rowDiff(missionKey, missionSig)}
        render={(list) => <NemesisMissions list={list} ctx={ctx} />} />
    </VStack>
  );
}
