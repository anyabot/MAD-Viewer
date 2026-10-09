// A query parameter, not a route segment, because `output: 'export'` prerenders every path and items are runtime data.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Badge, Box, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { AmountField, Stepper } from '@/components/unitPlan';
import {
  loadCharacters, loadEvents, loadGrowth, loadIcons, loadItems, loadStages,
  type CharacterData, type EventIndex, type GrowthData, type IconManifest, type StageData,
} from '@/lib/data';
import { useFarm } from '@/lib/farmStore';
import { gameText, useGameLang, type GameLang } from '@/lib/gameText';
import { pick, useLang, useT, type UiKey } from '@/lib/i18n';
import { hasIcon } from '@/lib/icons';
import {
  CATEGORY_LABEL, boxesContaining, eventSources, giftedTo, itemCategory, itemHref, planNeeds,
  stageSources, type ItemIndex, type ItemReward,
} from '@/lib/items';
import { CHANNEL_LABEL, DROP_ICON_GROUPS, groupLabel, stageName } from '@/lib/stages';

const BOX_MODE_LABEL: Record<string, UiKey> = {
  random: 'itemBoxRandom', select: 'itemBoxSelect', all: 'itemBoxAll',
};

function amountText(amount?: number[]): string {
  if (!amount?.length) return '';
  return amount.length > 1 ? `${amount[0]}~${amount[1]}` : `${amount[0]}`;
}

export default function ItemPage() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const router = useRouter();
  const ref = typeof router.query.ref === 'string' ? router.query.ref : null;
  const [index, setIndex] = useState<ItemIndex | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [stages, setStages] = useState<StageData | null>(null);
  const [events, setEvents] = useState<EventIndex | null>(null);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const held = useFarm((s) => (ref ? s.inventory[ref] ?? 0 : 0));
  const setInventory = useFarm((s) => s.setInventory);
  const units = useFarm((s) => s.units);

  useEffect(() => {
    loadItems().then(setIndex).catch((e) => setError(String(e)));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadStages().then(setStages).catch(() => setStages(null));
    loadEvents().then(setEvents).catch(() => setEvents(null));
    loadGrowth().then(setGrowth).catch(() => setGrowth(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
  }, []);

  const needs = useMemo(
    () => (growth && chars ? planNeeds(growth, chars, units) : null), [growth, chars, units]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!index || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const entry = ref ? index.items[ref] : null;
  if (!ref || !entry) return <Text color="gray.500">{t('noMatch')}</Text>;

  const name = gameText(entry.name, gameLang);
  const owner = entry.code ? chars?.characters[entry.code] : undefined;
  const ownerName = owner ? (gameLang === 'ko' ? owner.name : owner.nameEn || owner.name) : '';
  const fill = (text: string) => text.replace('{0}', ownerName);
  const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry.icon)) ?? 'item';
  const fromStages = stages ? stageSources(stages, ref) : [];
  const fromEvents = events ? eventSources(events, ref) : [];
  const inBoxes = boxesContaining(index, ref);
  const gifts = chars ? giftedTo(chars, ref) : [];
  const need = needs?.total[ref] ?? 0;
  const needBy = Object.entries(needs?.byUnit[ref] ?? {}).sort((a, b) => b[1] - a[1]);
  const charName = (code: string) => {
    const c = chars?.characters[code];
    return (gameLang === 'ko' ? c?.name : c?.nameEn || c?.name) || code;
  };

  return (
    <VStack align="stretch" spacing={6}>
      <Head><title>MAD Viewer — {name}</title></Head>
      <Flex align="center" gap={2} wrap="wrap" fontSize="sm">
        <Text as={NextLink} href="/items" color="yellow.300">{t('navItems')}</Text>
        <Text color="gray.600">/</Text>
        <Text color="gray.400">{name}</Text>
        <Box flex="1" />
      </Flex>

      <Flex gap={5} direction={{ base: 'column', sm: 'row' }}>
        <ItemIcon manifest={icons} group={group} name={entry.icon} grade={entry.grade} size="96px" />
        <VStack align="stretch" spacing={2} minW={0} flex="1">
          <HStack spacing={2} wrap="wrap">
            <Badge>{pick(CATEGORY_LABEL[itemCategory(entry)], lang)}</Badge>
            {entry.code && owner && (
              <Badge as={NextLink} href={`/character?code=${entry.code}`} colorScheme="yellow"
                textTransform="none">{ownerName}</Badge>
            )}
          </HStack>
          <Text fontSize="2xl" fontWeight="bold">{name}</Text>
          {entry.desc && (
            <Text fontSize="sm" color="gray.300" whiteSpace="pre-wrap">{fill(gameText(entry.desc, gameLang))}</Text>
          )}
          {entry.flavor && (
            <Text fontSize="sm" color="gray.500" fontStyle="italic" whiteSpace="pre-wrap">
              {fill(gameText(entry.flavor, gameLang))}
            </Text>
          )}
          {entry.sell && (
            <HStack spacing={1} fontSize="xs" color="gray.500">
              <Text>{t('itemSellsFor')}</Text>
              <GameIcon manifest={icons} group="item" name={index.items[entry.sell.ref]?.icon} size={4} />
              <Text>{entry.sell.price.toLocaleString()}</Text>
            </HStack>
          )}
        </VStack>
        <VStack align="stretch" spacing={2} p={3} borderRadius="md" bg="whiteAlpha.50" minW="14rem">
          <Text fontSize="xs" color="gray.400">{t('itemHeld')}</Text>
          <Stepper value={held} onChange={(v) => setInventory(ref, v)}>
            <AmountField value={held} min={0} max={Number.MAX_SAFE_INTEGER} big
              onChange={(v) => setInventory(ref, v)} />
          </Stepper>
          {need > 0 && (
            <>
              <Text fontSize="xs" color="gray.400" pt={1}>
                {t('itemNeeded', { n: need.toLocaleString(), short: Math.max(0, need - held).toLocaleString() })}
              </Text>
              <VStack align="stretch" spacing={1}>
                {needBy.map(([code, n]) => (
                  <HStack key={code} as={NextLink} href={`/character?code=${code}`} spacing={2} fontSize="xs">
                    <GameIcon manifest={icons} group="char"
                      names={[chars?.characters[code]?.iconPath, `Icon_${code}`]} size={5} borderRadius="full" />
                    <Text flex="1" noOfLines={1}>{charName(code)}</Text>
                    <Text color="gray.400">{n.toLocaleString()}</Text>
                  </HStack>
                ))}
              </VStack>
            </>
          )}
          <Text as={NextLink} href="/farm" fontSize="xs" color="yellow.300">{t('itemOpenPlanner')} ›</Text>
        </VStack>
      </Flex>

      {entry.contents && (
        <Section title={`${t('itemContents')} · ${t(BOX_MODE_LABEL[entry.contents.mode])}${entry.contents.pick ? ` (${t('itemPick', { n: entry.contents.pick })})` : ''}`}>
          <Wrap spacing={2}>
            {(entry.contents.rewards ?? []).map((r, i) => (
              <WrapItem key={i}><RewardTile reward={r} index={index} icons={icons} chars={chars} gameLang={gameLang} /></WrapItem>
            ))}
          </Wrap>
        </Section>
      )}

      {gifts.length > 0 && (
        <Section title={t('itemLikedBy')}>
          <Wrap spacing={2}>
            {gifts.map((code) => (
              <WrapItem key={code}>
                <HStack as={NextLink} href={`/character?code=${code}`} spacing={1.5} pl={1} pr={2} py={1}
                  borderRadius="md" bg="whiteAlpha.100" _hover={{ bg: 'whiteAlpha.200' }}>
                  <GameIcon manifest={icons} group="char"
                    names={[chars?.characters[code]?.iconPath, `Icon_${code}`]} size={6} borderRadius="full" />
                  <Text fontSize="xs">{charName(code)}</Text>
                </HStack>
              </WrapItem>
            ))}
          </Wrap>
        </Section>
      )}

      {(fromStages.length > 0 || fromEvents.length > 0 || inBoxes.length > 0) && (
        <Section title={t('itemObtained')}>
          <VStack align="stretch" spacing={3}>
            {fromEvents.length > 0 && (
              <Wrap spacing={2}>
                {fromEvents.map((row, i) => (
                  <WrapItem key={i}>
                    <HStack as={NextLink} href={`/event?id=${row.event.id}`} spacing={2} px={2} py={1}
                      borderRadius="md" bg="whiteAlpha.100" fontSize="xs" _hover={{ bg: 'whiteAlpha.200' }}>
                      <Text fontWeight="bold">{gameText(row.event.name, gameLang)}</Text>
                      <Text color="gray.400">
                        {row.kind === 'shop'
                          ? t('itemFromShop', { price: (row.price ?? 0).toLocaleString(), limit: row.limit ?? '∞' })
                          : t('itemFromBox', { n: row.count ?? 0 })}
                      </Text>
                    </HStack>
                  </WrapItem>
                ))}
              </Wrap>
            )}
            {inBoxes.length > 0 && (
              <Wrap spacing={2}>
                {inBoxes.map((box) => (
                  <WrapItem key={box}>
                    <HStack as={NextLink} href={itemHref(box)} spacing={2} px={2} py={1} borderRadius="md"
                      bg="whiteAlpha.100" fontSize="xs" _hover={{ bg: 'whiteAlpha.200' }}>
                      <GameIcon manifest={icons} group="item" name={index.items[box].icon} size={5} />
                      <Text>{gameText(index.items[box].name, gameLang)}</Text>
                    </HStack>
                  </WrapItem>
                ))}
              </Wrap>
            )}
            {fromStages.length > 0 && stages && (
              <Box overflowX="auto">
                <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={1.5} minW="16rem">
                  {fromStages.slice(0, 120).map((row, i) => {
                    const group2 = stages.groups[row.stage.group];
                    return (
                      <HStack key={i} as={NextLink} href={`/stage?id=${row.stage.id}`} spacing={2} px={2} py={1}
                        borderRadius="md" bg="whiteAlpha.50" fontSize="xs" _hover={{ bg: 'whiteAlpha.150' }}>
                        <Text flex="1" noOfLines={1}>
                          {group2 ? `${groupLabel(stages, group2, lang)} · ` : ''}{stageName(stages, row.stage, lang)}
                        </Text>
                        <Badge fontSize="0.55rem">{pick(CHANNEL_LABEL[row.channel], lang)}</Badge>
                        <Text color="gray.400">
                          ×{amountText(row.amount)}{row.chance != null ? ` · ${(row.chance * 100).toFixed(1)}%` : ''}
                        </Text>
                      </HStack>
                    );
                  })}
                </SimpleGrid>
              </Box>
            )}
          </VStack>
        </Section>
      )}
    </VStack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontSize="lg" fontWeight="bold" mb={3}>{title}</Text>
      {children}
    </Box>
  );
}

function RewardTile({ reward, index, icons, chars, gameLang }: {
  reward: ItemReward; index: ItemIndex; icons: IconManifest | null;
  chars: CharacterData | null; gameLang: GameLang;
}) {
  if (reward.code) {
    const c = chars?.characters[reward.code];
    return (
      <HStack as={NextLink} href={`/character?code=${reward.code}`} spacing={1.5} pl={1} pr={2} py={1}
        borderRadius="md" bg="whiteAlpha.100">
        <GameIcon manifest={icons} group="char" names={[c?.iconPath, `Icon_${reward.code}`]} size={7} borderRadius="full" />
        <Text fontSize="xs">{(gameLang === 'ko' ? c?.name : c?.nameEn || c?.name) || reward.code}</Text>
      </HStack>
    );
  }
  const entry = reward.ref ? index.items[reward.ref] : null;
  if (!entry || !reward.ref) {
    return <Badge textTransform="none">{reward.type}</Badge>;
  }
  const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry.icon)) ?? 'item';
  return (
    <VStack spacing={0.5} w="64px">
      <ItemIcon manifest={icons} group={group} name={entry.icon} grade={entry.grade} size={12}
        count={amountText(reward.amount)} href={itemHref(reward.ref)} title={gameText(entry.name, gameLang)} />
      <Text fontSize="2xs" textAlign="center" noOfLines={2}>{gameText(entry.name, gameLang)}</Text>
      {reward.chance != null && <Text fontSize="2xs" color="gray.500">{(reward.chance * 100).toFixed(1)}%</Text>}
    </VStack>
  );
}
