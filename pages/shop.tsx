import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Seo } from '@/components/seo';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronRightIcon, Badge, Box, Button, Collapse, HStack, SimpleGrid, Text, VStack, Wrap, WrapItem,
} from '@altterisk/game-hub/ui';
import { LoadState, PageHeader, Panel, TabPanel, UrlTabs, tabParam } from '@altterisk/game-hub';
import { nextRouterAdapter } from '@altterisk/game-hub/filters';
import {
  CostTag, PHASE_COLOR, PartnerChip, RewardSlot, TimeControls, useNow, useServerTime,
} from '@/components/eventsBoard';
import { GameIcon } from '@/components/gameIcon';
import { WindowBadges, bounded, phase } from '@/components/seasonRewards';
import {
  loadCharacters, loadIcons, loadShops,
  type CharacterData, type IconManifest, type ShopEntry, type ShopIndex, type ShopProduct,
} from '@/lib/data';
import { PHASE_LABEL, formatMoment, remaining, zoneLabel } from '@/lib/events';
import { gameText, useGameLang, type GameLang } from '@/lib/gameText';
import { pick, useLang, useT, type UiKey } from '@/lib/i18n';
import { isFuture, useSpoilerFilter, type SpoilerFacts } from '@/lib/spoilers';
import { eventHref } from '@/lib/routes';

// `Shop_Data.shop_id` of each common shop, in the game's own order.
const COMMON_TABS: [number, string][] = [
  [1001, 'normal'], [1002, 'memory'], [1003, 'nemesis'], [1004, 'arena'], [1005, 'exchange'],
];
const REFRESH: Record<string, UiKey> = { daily: 'rewardsDaily', weekly: 'rewardsWeekly', monthly: 'rewardsMonthly' };

type Ctx = {
  data: ShopIndex; icons: IconManifest | null; chars: CharacterData | null; gameLang: GameLang;
  now: number; serverTime: boolean;
};

type Ladder = NonNullable<ShopProduct['ladder']>;

const KST = 9 * 3600_000;

// The next reset moment: the rule's time (KST) on the next matching weekday, or day of the month.
function nextReset(shop: ShopEntry, now: number): number | null {
  const rule = shop.reset;
  if (!rule) return null;
  const [h, m, s] = rule.time.split(':').map(Number);
  const today = new Date(now + KST);
  for (let d = 0; d <= 62; d++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d, h, m, s));
    const key = shop.refresh === 'monthly' ? day.getUTCDate() : day.getUTCDay();
    const at = day.getTime() - KST;
    if (rule.days.includes(key) && at > now) return at;
  }
  return null;
}

function ResetLine({ shop, ctx }: { shop: ShopEntry; ctx: Ctx }) {
  const t = useT();
  const lang = useLang();
  const at = nextReset(shop, ctx.now);
  const closes = !at && bounded(shop.open) && phase(shop.open, ctx.now) === 'running' ? Date.parse(shop.open.end) : null;
  const when = at ?? closes;
  if (!when) return null;
  return (
    <Text fontSize="xs" color="gray.400">
      {t(at ? 'shopResetNext' : 'shopCloses', {
        when: `${formatMoment(new Date(when).toISOString(), lang, ctx.serverTime)} ${zoneLabel(ctx.serverTime)}`,
        left: remaining(when - ctx.now, lang),
      })}
    </Text>
  );
}

function ladderSig(ladder?: Ladder): string {
  return JSON.stringify(ladder ?? []);
}

function LadderText({ ladder }: { ladder: Ladder }) {
  const t = useT();
  let from = 1;
  const steps = ladder.map((step) => {
    const text = step.upTo
      ? t('shopLadderStep', { from, to: step.upTo, price: step.price })
      : t('shopLadderLast', { from, price: step.price });
    from = (step.upTo ?? from) + 1;
    return text;
  });
  return (
    <Text fontSize="xs" color="gray.400">{t('shopLadder')}: {steps.join(' · ')}</Text>
  );
}

function ProductCard({ product, ctx, sharedLadder }: { product: ShopProduct; ctx: Ctx; sharedLadder: boolean }) {
  const t = useT();
  const rewards = product.rewards ?? [];
  return (
    <VStack spacing={1.5} p={2} borderRadius="md" bg="whiteAlpha.50" align="center" minW={0}>
      <Wrap spacing={1} justify="center">
        {rewards.map((r, i) => (
          <WrapItem key={i}>
            {r.code
              ? <PartnerChip code={r.code} chars={ctx.chars} icons={ctx.icons} gameLang={ctx.gameLang} />
              : <RewardSlot reward={r} refs={ctx.data.refs} icons={ctx.icons} gameLang={ctx.gameLang} link />}
          </WrapItem>
        ))}
        {!rewards.length && product.code && (
          <WrapItem><PartnerChip code={product.code} chars={ctx.chars} icons={ctx.icons} gameLang={ctx.gameLang} /></WrapItem>
        )}
      </Wrap>
      {product.price && (product.price.amount > 0 || !product.ladder) && (
        <CostTag cost={product.price} refs={ctx.data.refs} icons={ctx.icons} />
      )}
      <Text fontSize="2xs" color="gray.500">
        {product.limit ? t('eventsLimit', { n: product.limit }) : t('eventsUnlimited')}
      </Text>
      {product.ladder && !sharedLadder && <LadderText ladder={product.ladder} />}
      {product.requires && (
        <HStack spacing={1}>
          <Text fontSize="2xs" color="gray.500">{t('shopRequires')}</Text>
          <PartnerChip code={product.requires} chars={ctx.chars} icons={ctx.icons} gameLang={ctx.gameLang} />
        </HStack>
      )}
    </VStack>
  );
}

function ProductGrid({ shop, ctx }: { shop: ShopEntry; ctx: Ctx }) {
  const t = useT();
  const ladders = new Set(shop.products.map((p) => ladderSig(p.ladder)));
  const shared = ladders.size === 1 && shop.products[0]?.ladder ? shop.products[0].ladder : null;
  const currency = shop.products.find((p) => p.price?.ref)?.price?.ref;
  return (
    <VStack align="stretch" spacing={3}>
      <HStack spacing={2} wrap="wrap">
        {currency && (
          <HStack spacing={1}>
            <GameIcon manifest={ctx.icons} group="item" name={ctx.data.refs[currency]?.icon} size={5} />
            <Text fontSize="sm">{gameText(ctx.data.refs[currency]?.name, ctx.gameLang)}</Text>
          </HStack>
        )}
        <Badge colorScheme={shop.refresh ? 'green' : 'gray'} textTransform="none">
          {shop.refresh ? t(REFRESH[shop.refresh]) : t('shopNever')}
        </Badge>
        <ResetLine shop={shop} ctx={ctx} />
      </HStack>
      {shared && <LadderText ladder={shared} />}
      <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 6 }} spacing={2}>
        {shop.products.map((p) => <ProductCard key={p.id} product={p} ctx={ctx} sharedLadder={!!shared} />)}
      </SimpleGrid>
    </VStack>
  );
}

function ChevronSection({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        leftIcon={<ChevronRightIcon transform={open ? 'rotate(90deg)' : undefined} transition="transform 0.15s" />}>
        {label}
      </Button>
      <Collapse in={open} animateOpacity>
        <VStack align="stretch" spacing={4} pt={2}>{children}</VStack>
      </Collapse>
    </Box>
  );
}

// Running and upcoming shops first, open; ended ones behind a chevron.
function TimedShops({ shops, ctx, title }: { shops: ShopEntry[]; ctx: Ctx; title: (s: ShopEntry) => ReactNode }) {
  const t = useT();
  const lang = useLang();
  const start = (s: ShopEntry) => (s.open ? Date.parse(s.open.start) : 0);
  const live = shops.filter((s) => phase(s.open, ctx.now) !== 'ended').sort((a, b) => start(a) - start(b));
  const past = shops.filter((s) => phase(s.open, ctx.now) === 'ended').sort((a, b) => start(b) - start(a));
  const exchangeOnly = (s: ShopEntry) => !!s.stagesEnd && ctx.now > Date.parse(s.stagesEnd)
    && phase(s.open, ctx.now) === 'running';
  const panel = (s: ShopEntry) => (
    <Panel key={s.id} title={title(s)}>
      <VStack align="stretch" spacing={3}>
        <Wrap spacing={1.5} align="center">
          {exchangeOnly(s) && (
            <WrapItem>
              <Badge colorScheme={PHASE_COLOR.exchange} variant="solid">{pick(PHASE_LABEL.exchange, lang)}</Badge>
            </WrapItem>
          )}
          {bounded(s.open) && <WrapItem><WindowBadges ctx={ctx} items={[[null, s.open]]} /></WrapItem>}
        </Wrap>
        <ProductGrid shop={s} ctx={ctx} />
      </VStack>
    </Panel>
  );
  return (
    <VStack align="stretch" spacing={4}>
      {live.map(panel)}
      {past.length > 0 && <ChevronSection label={t('shopPast', { n: past.length })}>{past.map(panel)}</ChevronSection>}
    </VStack>
  );
}

function withoutShopSpoilers(data: ShopIndex, facts: SpoilerFacts, now: number): ShopIndex {
  const unit = (code?: string) => !!code && facts.units.has(code);
  const shops = data.shops
    .filter((s) => !isFuture(s.open?.start, now) && !(s.event != null && facts.events.has(s.event)))
    .map((s) => ({
      ...s,
      products: s.products.filter((p) => !isFuture(p.open?.start, now) && !unit(p.code) && !unit(p.requires)
        && !(p.rewards ?? []).some((r) => unit(r.code))),
    }));
  return { ...data, shops };
}

export default function ShopPage() {
  const t = useT();
  const router = useRouter();
  const gameLang = useGameLang();
  const [data, setData] = useState<ShopIndex | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(60_000);

  const load = () => {
    setError(null);
    loadShops().then(setData).catch(setError);
  };
  useEffect(() => {
    load();
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
  }, []);

  const { hide, facts } = useSpoilerFilter();
  const shown = useMemo(
    () => (data && hide ? (facts ? withoutShopSpoilers(data, facts, now) : null) : data), [data, facts, hide, now]);
  const byId = new Map((shown?.shops ?? []).map((s) => [s.id, s]));
  const common = COMMON_TABS.filter(([id]) => byId.has(id));
  const mileage = (shown?.shops ?? []).filter((s) => s.kind === 'mileage');
  const events = (shown?.shops ?? []).filter((s) => s.kind === 'event');
  const tabItems = [
    ...common.map(([id, key]) => ({ id: key, label: gameText(byId.get(id)?.name, gameLang) || key })),
    ...(mileage.length ? [{ id: 'mileage', label: t('shopMileage') }] : []),
    ...(events.length ? [{ id: 'event', label: t('shopEvent') }] : []),
  ];
  const [tab, setTab] = tabParam(nextRouterAdapter(router), tabItems);
  const ctx: Ctx | null = shown ? { data: shown, icons, chars, gameLang, now, serverTime } : null;
  const commonShop = common.find(([, key]) => key === tab);

  return (
    <VStack align="stretch" spacing={4}>
      <Seo title={t('shopTitle')} description={t('seoDescShop')} />
      <PageHeader title={t('shopTitle')} actions={<TimeControls serverTime={serverTime} onChange={setServerTime} />} />
      {!ctx ? (
        <LoadState loading={!error} error={error} retry={load} labels={{ loading: t('loading') }} />
      ) : (
        <>
          <UrlTabs tabs={tabItems} active={tab} onChange={setTab} label={t('shopTitle')} idBase="shop" />
          <TabPanel tab={tab} idBase="shop">
            {commonShop && <ProductGrid shop={byId.get(commonShop[0])!} ctx={ctx} />}
            {tab === 'mileage' && (
              <TimedShops shops={mileage} ctx={ctx}
                title={(s) => gameText(s.bannerName, gameLang) || gameText(s.name, gameLang)} />
            )}
            {tab === 'event' && (
              <TimedShops shops={events} ctx={ctx} title={(s) => (s.event ? (
                <Text as={NextLink} href={eventHref(s.event)} _hover={{ color: 'accent.300' }}>
                  {gameText(s.eventName, gameLang) || gameText(s.name, gameLang)} ›
                </Text>
              ) : gameText(s.name, gameLang))} />
            )}
          </TabPanel>
        </>
      )}
    </VStack>
  );
}
