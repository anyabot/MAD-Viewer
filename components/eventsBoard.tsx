import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Button, ButtonGroup, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { ArtBox } from '@/components/artBox';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import {
  loadCharacters, loadEvents, loadIcons,
  type CharacterData, type EventExchange, type EventIndex, type EventReward, type GameEvent,
  type IconManifest,
} from '@/lib/data';
import {
  PHASE_LABEL, bannerNames, eventPhase, formatMoment, remaining, zoneLabel, type EventPhase,
} from '@/lib/events';
import { gameText, useGameLang, type GameLang } from '@/lib/gameText';
import { pick, useLang, useT, type UiKey } from '@/lib/i18n';
import { hasIcon } from '@/lib/icons';
import { DROP_ICON_GROUPS } from '@/lib/stages';

const PHASE_ORDER: Record<EventPhase, number> = { running: 0, upcoming: 1, ended: 2 };
export const PHASE_COLOR: Record<EventPhase, string> = { running: 'pink', upcoming: 'blue', ended: 'gray' };
const SERVER_TIME_KEY = 'mad.serverTime';

export function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

export function useServerTime(): [boolean, (server: boolean) => void] {
  const [serverTime, setServerTime] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SERVER_TIME_KEY) === 'local') setServerTime(false);
    } catch {
      // the server-time default stands
    }
  }, []);
  const choose = (server: boolean) => {
    setServerTime(server);
    try {
      window.localStorage.setItem(SERVER_TIME_KEY, server ? 'server' : 'local');
    } catch {
      // the choice just does not persist
    }
  };
  return [serverTime, choose];
}

export function TimeControls({ serverTime, onChange }: {
  serverTime: boolean; onChange: (server: boolean) => void;
}) {
  const t = useT();
  return (
    <HStack spacing={3} wrap="wrap">
      <ButtonGroup size="xs" isAttached variant="outline">
        <Button onClick={() => onChange(true)} isActive={serverTime}>{t('eventsServerTime')}</Button>
        <Button onClick={() => onChange(false)} isActive={!serverTime}>{t('eventsLocalTime')}</Button>
      </ButtonGroup>
    </HStack>
  );
}

export function EventTiming({ event, now, serverTime }: {
  event: GameEvent; now: number; serverTime: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const phase = eventPhase(event, now);
  return (
    <Wrap spacing={1.5} align="center">
      <WrapItem>
        <Badge colorScheme={PHASE_COLOR[phase]} variant="solid">{pick(PHASE_LABEL[phase], lang)}</Badge>
      </WrapItem>
      {phase === 'running' && (
        <WrapItem>
          <Text fontSize="xs" color="gray.300">
            {t('eventsEndsIn', { time: remaining(Date.parse(event.end) - now, lang) })}
          </Text>
        </WrapItem>
      )}
      {phase === 'upcoming' && (
        <WrapItem>
          <Text fontSize="xs" color="gray.300">
            {t('eventsStartsIn', { time: remaining(Date.parse(event.start) - now, lang) })}
          </Text>
        </WrapItem>
      )}
      <WrapItem>
        <Badge colorScheme="blue" textTransform="none" fontWeight="normal">
          {formatMoment(event.start, lang, serverTime)} – {formatMoment(event.end, lang, serverTime)}
          {' '}{zoneLabel(serverTime)}
        </Badge>
      </WrapItem>
      {event.kind === 'luckyDraw' && (
        <WrapItem><Badge textTransform="none">{t('eventsLuckyDraw')}</Badge></WrapItem>
      )}
    </Wrap>
  );
}

export function EventArt({ event, icons }: { event: GameEvent; icons: IconManifest | null }) {
  const gameLang = useGameLang();
  return (
    <ArtBox manifest={icons} w="100%" title={gameText(event.name, gameLang)}
      sources={[...bannerNames(event, gameLang).map((n) => ['banner', n] as ['banner', string]),
        ['item', event.goodsIcon]]} />
  );
}

export function EventsBoard() {
  const t = useT();
  const [data, setData] = useState<EventIndex | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(30_000);

  useEffect(() => {
    loadEvents().then(setData).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const events = useMemo(() => {
    if (!data) return [];
    return [...data.events].sort((a, b) => {
      const pa = eventPhase(a, now);
      const pb = eventPhase(b, now);
      if (pa !== pb) return PHASE_ORDER[pa] - PHASE_ORDER[pb];
      if (pa === 'ended') return Date.parse(b.end) - Date.parse(a.end);
      return Date.parse(pa === 'running' ? a.end : a.start) - Date.parse(pb === 'running' ? b.end : b.start);
    });
  }, [data, now]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  const story = events.filter((e) => e.kind === 'main');
  const side = events.filter((e) => e.kind !== 'main');
  const running = story.filter((e) => eventPhase(e, now) === 'running').length;
  const grid = (list: GameEvent[]) => (
    <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
      {list.map((event) => (
        <EventCard key={`${event.kind}:${event.id}`} event={event} now={now}
          serverTime={serverTime} chars={chars} icons={icons} />
      ))}
    </SimpleGrid>
  );
  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="center" gap={3} wrap="wrap">
        <Text fontSize="sm" color="gray.500">{t('eventsCount', { n: story.length, running })}</Text>
        <Box flex="1" />
        <TimeControls serverTime={serverTime} onChange={setServerTime} />
      </Flex>
      {grid(story)}
      {side.length > 0 && (
        <>
          <Text fontSize="lg" fontWeight="bold" pt={2}>{t('eventsSide')}</Text>
          {grid(side)}
        </>
      )}
    </VStack>
  );
}

export function EventCard({ event, now, serverTime, chars, icons }: {
  event: GameEvent; now: number; serverTime: boolean;
  chars: CharacterData | null; icons: IconManifest | null;
}) {
  const t = useT();
  const gameLang = useGameLang();
  const phase = eventPhase(event, now);
  const pickups = event.pickups ?? [];
  const bonus = (event.bonus ?? []).filter((b) => !pickups.includes(b.code));
  return (
    <Flex as={NextLink} href={`/event?id=${event.id}`} direction={{ base: 'column', sm: 'row' }} gap={3}
      p={3} borderRadius="lg" minW={0}
      borderWidth={phase === 'running' ? '2px' : '1px'}
      borderColor={phase === 'running' ? 'pink.400' : 'whiteAlpha.200'}
      bg={phase === 'ended' ? 'blackAlpha.200' : 'whiteAlpha.50'}
      _hover={{ borderColor: 'yellow.400' }}>
      <Box w={{ base: '100%', sm: '184px' }} flexShrink={0}>
        <EventArt event={event} icons={icons} />
      </Box>
      <VStack align="stretch" spacing={1.5} minW={0} flex="1">
        <EventTiming event={event} now={now} serverTime={serverTime} />
        <Text fontWeight="bold" fontSize="lg" noOfLines={2}>{gameText(event.name, gameLang)} ›</Text>
        {event.desc && (
          <Text fontSize="sm" color="gray.400" noOfLines={2}>{gameText(event.desc, gameLang)}</Text>
        )}
        <Wrap spacing={2} align="center" pt={1}>
          {pickups.map((code) => (
            <WrapItem key={code}>
              <PartnerChip code={code} chars={chars} icons={icons} gameLang={gameLang} pickup
                rate={event.bonus?.find((b) => b.code === code)?.rate} link={false} />
            </WrapItem>
          ))}
          {bonus.length > 0 && (
            <WrapItem>
              <HStack spacing={-1.5} title={t('eventsBonusUnits')}>
                {bonus.map((b) => (
                  <GameIcon key={b.code} manifest={icons} group="char"
                    names={[chars?.characters[b.code]?.iconPath, `Icon_${b.code}`]}
                    size={6} borderRadius="full" borderWidth="2px" borderColor="gray.800" />
                ))}
              </HStack>
            </WrapItem>
          )}
        </Wrap>
      </VStack>
    </Flex>
  );
}

export function PartnerChip({ code, chars, icons, gameLang, pickup = false, rate, link = true }: {
  code: string; chars: CharacterData | null; icons: IconManifest | null;
  gameLang: GameLang; pickup?: boolean; rate?: number; link?: boolean;
}) {
  const t = useT();
  const entry = chars?.characters[code];
  const name = (gameLang === 'ko' ? entry?.name : entry?.nameEn || entry?.name) || code;
  return (
    <HStack {...(link ? { as: NextLink, href: `/character?code=${code}` } : {})} spacing={1.5}
      pl={1} pr={2} py={1} borderRadius="md" bg={pickup ? 'whiteAlpha.200' : 'whiteAlpha.100'}
      _hover={link ? { bg: 'whiteAlpha.300' } : undefined}>
      <GameIcon manifest={icons} group="char" names={[entry?.iconPath, `Icon_${code}`]}
        size={pickup ? 7 : 6} borderRadius="full" />
      <Text fontSize="xs" fontWeight={pickup ? 'bold' : 'normal'}>{name}</Text>
      {pickup && <Badge fontSize="0.55rem" colorScheme="yellow">{t('eventsPickup')}</Badge>}
      {rate != null && <Badge fontSize="0.6rem" colorScheme="green">+{rate}%</Badge>}
    </HStack>
  );
}

const REWARD_LABEL: Record<string, UiKey> = {
  profile_icon: 'rewardProfileIcon', lobby_background: 'rewardLobbyBackground',
  profile_title: 'rewardProfileTitle', profile_border: 'rewardProfileBorder',
};
const BOX_GRADE_COLOR: Record<string, string> = { legend: 'yellow', rare: 'purple', normal: 'gray' };
const BOX_GRADE_LABEL: Record<string, UiKey> = {
  legend: 'gradeLegend', rare: 'gradeRare', normal: 'gradeNormal',
};
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function amountText(amount?: number[]): string {
  if (!amount?.length) return '';
  const [a, b] = amount.map((n) => (n >= 10000 ? compact.format(n) : String(n)));
  return b ? `${a}~${b}` : a;
}

function RewardSlot({ reward, refs, icons, gameLang }: {
  reward: EventReward; refs: EventIndex['refs']; icons: IconManifest | null; gameLang: GameLang;
}) {
  const t = useT();
  const entry = reward.ref ? refs[reward.ref] : null;
  const name = entry ? gameText(entry.name, gameLang)
    : (reward.type && REWARD_LABEL[reward.type] ? t(REWARD_LABEL[reward.type]) : reward.type ?? '');
  const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry?.icon)) ?? 'item';
  if (!entry) {
    return (
      <Center boxSize={10} borderRadius="md" bg="whiteAlpha.200" title={name} p={0.5}>
        <Text fontSize="0.5rem" textAlign="center" lineHeight="1.1" noOfLines={3}>{name}</Text>
      </Center>
    );
  }
  return (
    <ItemIcon manifest={icons} group={group} name={entry.icon} grade={entry.grade}
      count={amountText(reward.amount)} size={10} title={name} />
  );
}

function CostTag({ cost, refs, icons, n }: {
  cost: { ref: string; amount: number }; refs: EventIndex['refs']; icons: IconManifest | null; n?: number;
}) {
  return (
    <HStack spacing={0.5}>
      <GameIcon manifest={icons} group="item" name={refs[cost.ref]?.icon} size={4} />
      <Text fontSize="xs">{(cost.amount * (n ?? 1)).toLocaleString()}</Text>
    </HStack>
  );
}

export function ExchangePanel({ exchange, refs, icons, gameLang }: {
  exchange: EventExchange[]; refs: EventIndex['refs']; icons: IconManifest | null;
  gameLang: GameLang;
}) {
  const t = useT();
  return (
    <VStack align="stretch" spacing={6}>
      {exchange.map((ex, i) => (ex.kind === 'shop' ? (
        <Box key={i}>
          <Text fontSize="lg" fontWeight="bold" mb={3}>{t('eventsShop')}</Text>
          <Wrap spacing={2}>
            {ex.products.map((p, j) => (
              <WrapItem key={j}>
                <VStack spacing={1} minW="64px" p={1.5} borderRadius="md" bg="whiteAlpha.50">
                  <HStack spacing={0.5}>
                    {(p.rewards ?? []).map((r, k) => (
                      <RewardSlot key={k} reward={r} refs={refs} icons={icons} gameLang={gameLang} />
                    ))}
                  </HStack>
                  {p.price && <CostTag cost={p.price} refs={refs} icons={icons} />}
                  <Text fontSize="2xs" color="gray.500">
                    {p.limit ? t('eventsLimit', { n: p.limit }) : t('eventsUnlimited')}
                  </Text>
                </VStack>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      ) : (
        <Box key={i}>
          <HStack spacing={3} mb={3} wrap="wrap" align="baseline">
            <Text fontSize="lg" fontWeight="bold">{t('eventsBox')}</Text>
            <HStack spacing={1}>
              <Text fontSize="xs" color="gray.400">{t('eventsPerDraw')}</Text>
              <CostTag cost={ex.cost} refs={refs} icons={icons} />
            </HStack>
            {ex.maxDraws && (
              <Text fontSize="xs" color="gray.500">{t('eventsBoxMax', { n: ex.maxDraws })}</Text>
            )}
          </HStack>
          <VStack align="stretch" spacing={4}>
            {ex.rounds.map((round) => {
              const draws = round.items.reduce((sum, item) => sum + item.count, 0);
              return (
                <Box key={round.round} borderLeftWidth="3px" borderColor="yellow.400" pl={3}>
                  <HStack spacing={3} mb={2} wrap="wrap">
                    <Text fontSize="sm" fontWeight="bold">
                      {round.repeat ? t('eventsStepRepeat', { n: round.round }) : t('eventsStep', { n: round.round })}
                    </Text>
                    <Text fontSize="xs" color="gray.400">{t('eventsStepDraws', { n: draws })}</Text>
                    <CostTag cost={ex.cost} refs={refs} icons={icons} n={draws} />
                  </HStack>
                  <Wrap spacing={1.5}>
                    {round.items.map((item, j) => (
                      <WrapItem key={j}>
                        <VStack spacing={0.5}>
                          <HStack spacing={0.5}>
                            {(item.rewards ?? []).map((r, k) => (
                              <RewardSlot key={k} reward={r} refs={refs} icons={icons} gameLang={gameLang} />
                            ))}
                          </HStack>
                          <Badge fontSize="0.55rem" colorScheme={BOX_GRADE_COLOR[item.grade ?? ''] ?? 'gray'}>
                            ×{item.count}
                          </Badge>
                        </VStack>
                      </WrapItem>
                    ))}
                  </Wrap>
                  {round.collection && (
                    <Wrap spacing={3} mt={2}>
                      {round.collection.map((goal, j) => (
                        <WrapItem key={j}>
                          <HStack spacing={2} px={2} py={1} borderRadius="md" bg="whiteAlpha.100">
                            <Text fontSize="xs">
                              {t('eventsCollect', {
                                n: goal.count,
                                grade: goal.grade && BOX_GRADE_LABEL[goal.grade] ? t(BOX_GRADE_LABEL[goal.grade]) : '',
                              })}
                            </Text>
                            {(goal.rewards ?? []).map((r, k) => (
                              <RewardSlot key={k} reward={r} refs={refs} icons={icons} gameLang={gameLang} />
                            ))}
                          </HStack>
                        </WrapItem>
                      ))}
                    </Wrap>
                  )}
                </Box>
              );
            })}
          </VStack>
        </Box>
      )))}
    </VStack>
  );
}
