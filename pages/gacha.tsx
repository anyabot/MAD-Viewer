import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import {
  Badge, Box, Button, Collapse, Flex, HStack, SimpleGrid, Switch, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { LoadState, PageHeader, Panel } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import {
  loadCharacters, loadGachaBanners, loadGachaIndex, loadIcons, loadItems,
  type CharacterData, type GachaBanner, type GachaBannerIndex, type GachaIndex, type IconManifest,
} from '@/lib/data';
import type { ItemIndex } from '@/lib/items';
import { characterName } from '@/lib/characters';
import { formatMoment } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { useLang, useT } from '@/lib/i18n';
import { baseRates, emptyTally, pullMany, type BannerTally, type Pull } from '@/lib/gacha';
import { isFuture, useSpoilerFilter } from '@/lib/spoilers';
import type { Grade } from '@/components/gachaViewer/machine';

const GachaViewer = dynamic(() => import('@/components/gachaViewer'), { ssr: false });

const STARS = (n: number) => '★'.repeat(n);
const GRADE_COLOR: Record<number, string> = { 3: 'yellow.300', 2: 'purple.300', 1: 'gray.400' };
const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 3 : 2)}%`;
// Pulls a ★3 took: well under the ~33 a 3% rate averages is lucky, around 50 is ordinary, far past it is not.
const gapColor = (gap: number) => (gap <= 30 ? 'green' : gap <= 70 ? 'yellow' : 'red');

export default function GachaPage() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const [data, setData] = useState<GachaBannerIndex | null>(null);
  const [scene, setScene] = useState<GachaIndex | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [items, setItems] = useState<ItemIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [tallies, setTallies] = useState<Record<number, BannerTally>>({});
  const [results, setResults] = useState<Pull[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [playScene, setPlayScene] = useState(true);
  const [showing, setShowing] = useState<{ grade: Grade; play: number } | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [showOld, setShowOld] = useState(false);
  // Master's Pick: the partner each selector banner rates up
  const [targets, setTargets] = useState<Record<number, string>>({});
  const { hide, facts } = useSpoilerFilter();

  useEffect(() => {
    loadGachaBanners().then(setData).catch((e) => setError(String(e)));
    loadGachaIndex().then(setScene).catch(() => setScene(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadItems().then(setItems).catch(() => setItems(null));
  }, []);

  const now = Date.now();
  const banners = useMemo(() => (data?.banners ?? []).filter((b) => b.kind !== 'startdash' && (!hide || (facts
    && !isFuture(b.open?.start, now) && !(b.pickups ?? []).some((c) => facts.units.has(c))))),
  [data, hide, facts, now]);
  const live = (b: GachaBanner) => !b.open || (Date.parse(b.open.start) <= now && now <= Date.parse(b.open.end));
  const ended = (b: GachaBanner) => !!b.open && now > Date.parse(b.open.end);
  const banner = banners.find((b) => b.id === picked)
    ?? banners.find((b) => b.kind === 'pickup' && live(b)) ?? banners[0] ?? null;
  const tally = (banner && tallies[banner.id]) || emptyTally();

  if (error || !data || (hide && !facts)) {
    return <LoadState loading={!error} error={error} labels={{ loading: t('loading'), error }} />;
  }

  const name = (b: GachaBanner) => gameText(b.name, gameLang) || String(b.id);
  const unit = (code: string) => chars?.characters[code] ?? null;
  const seed = items?.items['goods:2'];
  const target = banner?.kind === 'selector' ? targets[banner.id] ?? null : null;
  const picks = target ? [target] : banner?.pickups ?? [];
  const rates = banner ? baseRates(data, banner.base, target) : [];
  const pickupShare = rates.flatMap((g) => g.units).filter(([c]) => picks.includes(c)).reduce((s, [, v]) => s + v, 0);
  const selectable = banner?.kind === 'selector'
    ? (data.groups[banner.base] ?? []).filter((g) => g.grade >= 3).flatMap((g) => (data.pools[g.pool] ?? []).map(([c]) => c))
    : [];
  const shown = banners.filter((b) => showOld || !ended(b) || b.id === banner?.id);
  const oldCount = banners.filter(ended).length;
  const atLimit = !!banner?.limit && tally.pulls >= banner.limit;

  const summon = (count: number) => {
    if (!banner) return;
    const { pulls, tally: next } = pullMany(data, banner, tally, count, Math.random, target);
    setTallies((all) => ({ ...all, [banner.id]: next }));
    const seen = new Set(owned);
    const newly = new Set<number>();
    pulls.forEach((p, i) => {
      if (!seen.has(p.code)) newly.add(i);
      seen.add(p.code);
    });
    setOwned(seen);
    setFresh(newly);
    setResults(pulls);
    const top = Math.max(...pulls.map((p) => p.grade)) as Grade;
    if (playScene && scene) setShowing((s) => ({ grade: top, play: (s?.play ?? 0) + 1 }));
  };

  const exchange = () => {
    if (!banner?.mileage || !picks.length || tally.mileage < banner.mileage) return;
    const code = picks[0];
    setTallies((all) => ({
      ...all,
      [banner.id]: { ...tally, mileage: tally.mileage - banner.mileage!, got: { ...tally.got, [code]: (tally.got[code] ?? 0) + 1 } },
    }));
    setOwned((s) => new Set(s).add(code));
    setResults([{ code, grade: 3, pickup: true }]);
    setFresh(new Set(owned.has(code) ? [] : [0]));
  };

  const reset = () => {
    if (!banner) return;
    setTallies((all) => ({ ...all, [banner.id]: emptyTally() }));
    setResults(null);
  };

  const resetAll = () => {
    setTallies({});
    setOwned(new Set());
    setFresh(new Set());
    setResults(null);
    setShowing(null);
  };

  const session = Object.entries(tallies).reduce((acc, [id, tl]) => {
    const b = data.banners.find((x) => x.id === Number(id));
    const rated = !!b && (b.kind === 'pickup' || (b.kind === 'selector' && !!targets[b.id]));
    acc.pulls += tl.pulls;
    acc.threes += tl.threes.length;
    if (rated) {
      acc.ratedThrees += tl.threes.length;
      acc.pickups += tl.threes.filter((x) => x.pickup).length;
    }
    return acc;
  }, { pulls: 0, threes: 0, ratedThrees: 0, pickups: 0 });

  const gradeOf = (code: string) => rates.find((r) => r.units.some(([c]) => c === code))?.grade ?? 0;
  const grades = Object.entries(tally.got).reduce((acc, [code, n]) => {
    const g = gradeOf(code);
    acc[g] = (acc[g] ?? 0) + n;
    return acc;
  }, {} as Record<number, number>);

  return (
    <VStack align="stretch" spacing={4}>
      <Head><title>{`MAD Viewer — ${t('gachaTitle')}`}</title></Head>
      <PageHeader title={t('gachaTitle')}
        actions={<Button size="sm" variant="outline" onClick={resetAll}>{t('gachaResetAll')}</Button>} />

      <Wrap spacing={2}>
        {shown.map((b) => (
          <WrapItem key={b.id}>
            <Button size="sm" variant={banner?.id === b.id ? 'solid' : 'outline'}
              colorScheme={banner?.id === b.id ? 'yellow' : 'gray'} whiteSpace="normal" h="auto" minH={8} py={1}
              maxW="100%" textAlign="left"
              leftIcon={b.pickups?.length
                ? <GameIcon manifest={icons} group="char" name={unit(b.pickups[0])?.iconPath} size={5} /> : undefined}
              onClick={() => { setPicked(b.id); setResults(null); setShowing(null); }}>
              {name(b)}
              {live(b) && b.open && (
                <Badge ml={2} colorScheme="pink" variant={banner?.id === b.id ? 'solid' : 'subtle'}>{t('stageLive')}</Badge>
              )}
            </Button>
          </WrapItem>
        ))}
        {oldCount > 0 && (
          <WrapItem>
            <Button size="sm" variant="ghost" onClick={() => setShowOld((v) => !v)}>
              {t('gachaOld')} ({oldCount}) {showOld ? '▴' : '▾'}
            </Button>
          </WrapItem>
        )}
      </Wrap>

      {banner && (
        <Panel>
          <VStack align="stretch" spacing={3}>
            <Flex gap={3} wrap="wrap" align="center">
              <Text fontWeight="bold">{name(banner)}</Text>
              {banner.open && (
                <Text fontSize="xs" color="gray.400">
                  {formatMoment(banner.open.start, lang, true)} – {formatMoment(banner.open.end, lang, true)}
                </Text>
              )}
            </Flex>
            <Wrap spacing={3}>
              {rates.map((g) => (
                <WrapItem key={g.grade}>
                  <Text fontSize="sm" color={GRADE_COLOR[g.grade]}>{STARS(g.grade)} {pct(g.share)}</Text>
                </WrapItem>
              ))}
              {picks.map((c) => (
                <WrapItem key={c}>
                  <Text fontSize="sm" color="pink.300">{characterName(unit(c), lang) || c} {pct(pickupShare / picks.length)}</Text>
                </WrapItem>
              ))}
              <WrapItem>
                <Button size="xs" variant="link" onClick={() => setRatesOpen((v) => !v)}>{t('gachaRates')}</Button>
              </WrapItem>
            </Wrap>
            {selectable.length > 0 && (
              <Box>
                <Text fontSize="sm" color="gray.400" mb={1}>{t('gachaTarget')}</Text>
                <Wrap spacing={1.5}>
                  {selectable.map((c) => (
                    <WrapItem key={c}>
                      <Button size="xs" variant={target === c ? 'solid' : 'outline'} colorScheme={target === c ? 'pink' : 'gray'}
                        leftIcon={<GameIcon manifest={icons} group="char" name={unit(c)?.iconPath} size={4} />}
                        onClick={() => setTargets((all) => ({ ...all, [banner.id]: c }))}>
                        {characterName(unit(c), lang) || c}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            )}
            <Collapse in={ratesOpen} animateOpacity>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                {rates.map((g) => (
                  <Box key={g.grade}>
                    <Text fontSize="sm" color={GRADE_COLOR[g.grade]} mb={1}>{STARS(g.grade)}</Text>
                    {g.units.map(([c, v]) => (
                      <HStack key={c} spacing={2} fontSize="xs">
                        <GameIcon manifest={icons} group="char" name={unit(c)?.iconPath} size={4} />
                        <Text flex="1" noOfLines={1} color={picks.includes(c) ? 'pink.300' : undefined}>
                          {characterName(unit(c), lang) || c}
                        </Text>
                        <Text color="gray.400">{pct(v)}</Text>
                      </HStack>
                    ))}
                  </Box>
                ))}
              </SimpleGrid>
            </Collapse>

            <Flex gap={2} wrap="wrap" align="center">
              {banner.kind !== 'startdash' && (
                <Button size="sm" colorScheme="yellow" isDisabled={atLimit} onClick={() => summon(1)}>
                  {t('gachaPull', { n: 1 })}
                </Button>
              )}
              <Button size="sm" colorScheme="yellow" isDisabled={atLimit} onClick={() => summon(10)}
                rightIcon={seed ? <HStack spacing={0.5}>
                  <GameIcon manifest={icons} group="item" name={seed.icon} size={4} />
                  <Text fontSize="xs">{(banner.price * 10).toLocaleString()}</Text>
                </HStack> : undefined}>
                {atLimit ? t('gachaUsed') : t('gachaPull', { n: 10 })}
              </Button>
              <HStack spacing={2}>
                <Switch size="sm" isChecked={playScene} onChange={(e) => setPlayScene(e.target.checked)} />
                <Text fontSize="sm">{t('gachaScene')}</Text>
              </HStack>
              <Box flex="1" />
              <Button size="sm" variant="ghost" onClick={reset}>{t('gachaReset')}</Button>
            </Flex>

            <Wrap spacing={3} fontSize="sm" color="gray.300">
              <WrapItem>{t('gachaPulls', { n: tally.pulls })}</WrapItem>
              <WrapItem>
                <HStack spacing={0.5}>
                  {seed && <GameIcon manifest={icons} group="item" name={seed.icon} size={4} />}
                  <Text>{tally.spent.toLocaleString()}</Text>
                </HStack>
              </WrapItem>
              {[3, 2, 1].map((g) => (
                <WrapItem key={g}><Text color={GRADE_COLOR[g]}>{STARS(g)} {grades[g] ?? 0}</Text></WrapItem>
              ))}
              {banner.every && (
                <WrapItem>{t('gachaGuarantee', { n: banner.every - tally.sinceSpecial })}</WrapItem>
              )}
              {banner.pity && banner.pityGroup && (
                <WrapItem>{t('gachaPity', { n: banner.pity - tally.sinceThree })}</WrapItem>
              )}
              {banner.mileage && (
                <WrapItem>
                  <HStack spacing={2}>
                    <Text>{t('gachaMileage', { n: tally.mileage, max: banner.mileage })}</Text>
                    {picks.length > 0 && (
                      <Button size="xs" isDisabled={tally.mileage < banner.mileage} onClick={exchange}>
                        {t('gachaExchange')}
                      </Button>
                    )}
                  </HStack>
                </WrapItem>
              )}
            </Wrap>
          </VStack>
        </Panel>
      )}

      {showing && scene && (
        <Box position="relative">
          <GachaViewer index={scene} grade={showing.grade} play={showing.play} controls={false}
            onDone={() => setShowing(null)} />
          <Button size="sm" position="absolute" top={2} right={2} zIndex={2} onClick={() => setShowing(null)}>
            {t('gachaSkip')}
          </Button>
        </Box>
      )}

      {results && !showing && (
        <SimpleGrid columns={{ base: 2, sm: 5 }} spacing={2}>
          {results.map((p, i) => {
            const entry = unit(p.code);
            return (
              <VStack key={i} as={NextLink} href={`/character?code=${p.code}`} spacing={1} p={2}
                borderRadius="md" borderWidth={p.grade >= 3 ? '2px' : '1px'}
                borderColor={p.pickup ? 'pink.400' : p.grade >= 3 ? 'yellow.400' : 'whiteAlpha.200'}
                bg="whiteAlpha.50" position="relative">
                {fresh.has(i) && (
                  <Badge position="absolute" top={1} left={1} colorScheme="green" fontSize="0.6rem">{t('gachaNew')}</Badge>
                )}
                <GameIcon manifest={icons} group="char" name={entry?.iconPath} size={16} />
                <Text fontSize="xs" color={GRADE_COLOR[p.grade]}>{STARS(p.grade)}</Text>
                <Text fontSize="xs" noOfLines={1} textAlign="center">{characterName(entry, lang) || p.code}</Text>
              </VStack>
            );
          })}
        </SimpleGrid>
      )}

      {session.pulls > 0 && (
        <Panel>
          <Text fontSize="sm" fontWeight="bold" mb={2}>{t('gachaSession')}</Text>
          <Wrap spacing={4} fontSize="sm">
            <WrapItem>{t('gachaPulls', { n: session.pulls })}</WrapItem>
            <WrapItem><Text color={GRADE_COLOR[3]}>{STARS(3)} {session.threes}</Text></WrapItem>
            <WrapItem>
              {t('gachaThreeRate')} {pct(session.threes / session.pulls)}
            </WrapItem>
            <WrapItem>
              {t('gachaAvg')} {session.threes ? (session.pulls / session.threes).toFixed(1) : '—'}
            </WrapItem>
            {session.ratedThrees > 0 && (
              <WrapItem>
                <Text color="pink.300">
                  {t('gachaRateUpShare')} {session.pickups}/{session.ratedThrees} ({pct(session.pickups / session.ratedThrees)})
                </Text>
              </WrapItem>
            )}
          </Wrap>
        </Panel>
      )}

      {tally.threes.length > 0 && (
        <Panel>
          <Text fontSize="sm" fontWeight="bold" mb={2}>{t('gachaThreeLog')}</Text>
          <Wrap spacing={2}>
            {tally.threes.map((x, i) => (
              <WrapItem key={i}>
                <HStack spacing={1.5} fontSize="xs" borderWidth="1px" borderRadius="md" px={1.5} py={0.5}
                  borderColor={x.pickup ? 'pink.400' : 'whiteAlpha.200'}>
                  <GameIcon manifest={icons} group="char" name={unit(x.code)?.iconPath} size={6} />
                  <Text color={x.pickup ? 'pink.300' : undefined}>{characterName(unit(x.code), lang) || x.code}</Text>
                  <Badge colorScheme={gapColor(x.gap)} variant="solid">{x.gap}</Badge>
                </HStack>
              </WrapItem>
            ))}
          </Wrap>
        </Panel>
      )}

      {Object.keys(tally.got).length > 0 && (
        <Panel>
          <Text fontSize="sm" fontWeight="bold" mb={2}>{t('gachaGot')}</Text>
          <Wrap spacing={2}>
            {Object.entries(tally.got)
              .sort(([a], [b]) => gradeOf(b) - gradeOf(a))
              .map(([code, n]) => (
                <WrapItem key={code}>
                  <HStack spacing={1} fontSize="xs" borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" px={1.5} py={0.5}>
                    <GameIcon manifest={icons} group="char" name={unit(code)?.iconPath} size={5} />
                    <Text>{characterName(unit(code), lang) || code}</Text>
                    <Text color="gray.400">×{n}</Text>
                  </HStack>
                </WrapItem>
              ))}
          </Wrap>
        </Panel>
      )}
    </VStack>
  );
}
