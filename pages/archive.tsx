import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import {
  Badge, Box, Button, ButtonGroup, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { PartnerChip, TimeControls, useNow, useServerTime } from '@/components/eventsBoard';
import { ArtBox } from '@/components/artBox';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import {
  loadArchive, loadCharacters, loadIcons, loadStages,
  type ArchiveIndex, type CharacterData, type IconManifest, type StageData,
} from '@/lib/data';
import { formatMoment, remaining, zoneLabel } from '@/lib/events';
import { gameText, useGameLang } from '@/lib/gameText';
import { useLang, useT } from '@/lib/i18n';
import { hasIcon } from '@/lib/icons';
import { itemHref } from '@/lib/items';
import { DROP_ICON_GROUPS, enemyCodes, levelRange } from '@/lib/stages';

export default function ArchivePage() {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const [data, setData] = useState<ArchiveIndex | null>(null);
  const [stages, setStages] = useState<StageData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState(1);
  const [serverTime, setServerTime] = useServerTime();
  const now = useNow(30_000);

  useEffect(() => {
    loadArchive().then(setData).catch((e) => setError(String(e)));
    loadStages().then(setStages).catch(() => setStages(null));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const season = data?.seasons[0];
  const path = season?.difficulties.find((d) => d.difficulty === difficulty) ?? season?.difficulties[0];
  const poolOrder = useMemo(() => Object.keys(data?.pools ?? {}).sort((a, b) => Number(a) - Number(b)), [data]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data || !season) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const title = gameText(data.title, gameLang) || t('archiveTitle');
  const open = season.open;
  const running = open && now >= Date.parse(open.start) && now <= Date.parse(open.end);

  return (
    <VStack align="stretch" spacing={6}>
      <Head><title>MAD Viewer — {title}</title></Head>
      <Flex align="center" gap={2} wrap="wrap" fontSize="sm">
        <Text as={NextLink} href="/stages?mode=ascent" color="yellow.300">{t('navStages')}</Text>
        <Text color="gray.600">/</Text>
        <Text color="gray.400">{title}</Text>
        <Box flex="1" />
        <TimeControls serverTime={serverTime} onChange={setServerTime} />
      </Flex>

      <Flex direction={{ base: 'column', md: 'row' }} gap={5}>
        <ArtBox manifest={icons} w={{ base: '100%', md: '360px' }}
          sources={[['banner', 'Ascent_Infinity'], ['banner', 'Thumbnail_PastStory_Content_ArchiveAscent']]} />
        <VStack align="stretch" spacing={2} minW={0} flex="1">
          <Wrap spacing={1.5} align="center">
            {running && <WrapItem><Badge colorScheme="pink" variant="solid">{t('stageLive')}</Badge></WrapItem>}
            {running && open && (
              <WrapItem>
                <Text fontSize="xs" color="gray.300">
                  {t('eventsEndsIn', { time: remaining(Date.parse(open.end) - now, lang) })}
                </Text>
              </WrapItem>
            )}
            {open && (
              <WrapItem>
                <Badge colorScheme="blue" textTransform="none" fontWeight="normal">
                  {formatMoment(open.start, lang, serverTime)} – {formatMoment(open.end, lang, serverTime)} {zoneLabel(serverTime)}
                </Badge>
              </WrapItem>
            )}
          </Wrap>
          <Text fontSize="2xl" fontWeight="bold">{title} · {t('archiveSeason', { n: season.id })}</Text>
          <Text fontSize="sm" color="gray.400">{t('archiveStartCount', { n: season.startCount })}</Text>
          <Wrap spacing={2} pt={1}>
            {([
              ['archiveMinStar', season.minimum.star], ['archiveMinLevel', season.minimum.level],
              ['archiveMinNormal', season.minimum.normalSkill], ['archiveMinBurst', season.minimum.burstSkill],
              ['archiveMinTier', season.minimum.equipmentTier],
            ] as const).map(([key, n]) => (
              <WrapItem key={key}><Badge textTransform="none" fontSize="xs">{t(key, { n })}</Badge></WrapItem>
            ))}
          </Wrap>
        </VStack>
      </Flex>

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={3}>{t('archiveSupport')}</Text>
        <Wrap spacing={2}>
          {season.support.map((code) => (
            <WrapItem key={code}><PartnerChip code={code} chars={chars} icons={icons} gameLang={gameLang} /></WrapItem>
          ))}
        </Wrap>
      </Box>

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={3}>{t('archiveScores')}</Text>
        <Wrap spacing={2}>
          {season.scores.map((tier) => (
            <WrapItem key={tier.score}>
              <VStack spacing={1} p={2} borderRadius="md" bg="whiteAlpha.50" minW="80px">
                <Text fontSize="xs" fontFamily="mono">{tier.score.toLocaleString()}</Text>
                <HStack spacing={1}>
                  {tier.rewards.map((r, i) => {
                    const entry = r.ref ? data.refs[r.ref] : null;
                    const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry?.icon)) ?? 'item';
                    return (
                      <ItemIcon key={i} manifest={icons} group={group} name={entry?.icon} grade={entry?.grade}
                        size={10} count={r.amount?.[0]} href={r.ref ? itemHref(r.ref) : undefined}
                        title={entry ? gameText(entry.name, gameLang) : r.type} />
                    );
                  })}
                </HStack>
              </VStack>
            </WrapItem>
          ))}
        </Wrap>
      </Box>

      <Box>
        <HStack spacing={3} mb={3} wrap="wrap">
          <Text fontSize="lg" fontWeight="bold">{t('archivePath')}</Text>
          <ButtonGroup size="xs" isAttached variant="outline">
            {season.difficulties.map((d) => (
              <Button key={d.difficulty} isActive={d.difficulty === (path?.difficulty ?? 1)}
                onClick={() => setDifficulty(d.difficulty)}>{t('archiveDifficulty', { n: d.difficulty })}</Button>
            ))}
          </ButtonGroup>
        </HStack>
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={2}>
          {path?.nodes.map((node) => {
            if (node.type === 'augment') {
              return (
                <HStack key={node.order} p={2} borderRadius="md" borderWidth="1px" borderColor="purple.400"
                  borderStyle="dashed" spacing={2}>
                  <Text fontSize="xs" color="gray.500" w="1.5rem">{node.order}</Text>
                  <Text fontSize="sm" fontWeight="bold">{t('archivePick')}</Text>
                  {(node.pools ?? []).map((p) => (
                    <Badge key={p} colorScheme="purple" textTransform="none">{t('archivePool', { n: p })}</Badge>
                  ))}
                </HStack>
              );
            }
            const key = node.groups?.[0];
            const list = key && stages ? stages.stages.filter((s) => s.group === key) : [];
            const enemies = [...new Set(list.flatMap((s) => enemyCodes(s)))].slice(0, 6);
            const levels = list.map(levelRange).filter((r): r is [number, number] => !!r);
            return (
              <HStack key={node.order} as={NextLink} href={`/stages?group=${encodeURIComponent(key ?? '')}`}
                p={2} borderRadius="md" borderWidth="1px" borderColor="whiteAlpha.200" spacing={2}
                _hover={{ borderColor: 'yellow.400' }} minW={0}>
                <Text fontSize="xs" color="gray.500" w="1.5rem">{node.order}</Text>
                <Box minW={0} flex="1">
                  <Text fontSize="sm" fontWeight="bold">
                    {t('archiveBattle')} · {t('stageCount', { n: list.length })}
                  </Text>
                  {levels.length > 0 && (
                    <Text fontSize="xs" color="gray.500">
                      {t('stageLevelRange', { from: Math.min(...levels.map((l) => l[0])), to: Math.max(...levels.map((l) => l[1])) })}
                    </Text>
                  )}
                </Box>
                <HStack spacing={-1.5}>
                  {enemies.map((code) => (
                    <GameIcon key={code} manifest={icons} group="char"
                      names={[stages?.enemies[code]?.iconPath, `Icon_${code}`]} size={6} borderRadius="full" />
                  ))}
                </HStack>
              </HStack>
            );
          })}
        </SimpleGrid>
      </Box>

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={3}>{t('archivePacks')}</Text>
        <VStack align="stretch" spacing={4}>
          {poolOrder.map((pool) => (
            <Box key={pool}>
              <Text fontSize="sm" fontWeight="bold" color="gray.400" mb={2}>
                {t('archivePool', { n: pool })} · {data.pools[pool].length}
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={2}>
                {data.pools[pool].map((id) => {
                  const a = data.augments[String(id)];
                  if (!a) return null;
                  return (
                    <Flex key={id} gap={3} p={2} borderRadius="md" bg="whiteAlpha.50" align="start">
                      <Box position="relative" flexShrink={0}>
                        <GameIcon manifest={icons} group="archive" name={a.icon} size={10} />
                        <GameIcon manifest={icons} group="archive" name={a.trigger} size={5}
                          position="absolute" right="-6px" bottom="-6px" reserve={false} />
                      </Box>
                      <Box minW={0}>
                        <HStack spacing={1.5} wrap="wrap">
                          <Text fontSize="sm" fontWeight="bold">{gameText(a.name, gameLang)}</Text>
                          {a.rarity === 'rare' && <Badge colorScheme="yellow" fontSize="0.55rem">{t('gradeRare')}</Badge>}
                          {a.joinCode && (
                            <Badge as={NextLink} href={`/character?code=${a.joinCode}`} textTransform="none" fontSize="0.6rem">
                              {(gameLang === 'ko' ? chars?.characters[a.joinCode]?.name
                                : chars?.characters[a.joinCode]?.nameEn) || a.joinCode}
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="xs" color="gray.300" whiteSpace="pre-wrap">{gameText(a.desc, gameLang)}</Text>
                        {a.tags && (
                          <Text fontSize="2xs" color="gray.500" mt={0.5}>{a.tags.join(' · ')}</Text>
                        )}
                      </Box>
                    </Flex>
                  );
                })}
              </SimpleGrid>
            </Box>
          ))}
        </VStack>
      </Box>
    </VStack>
  );
}
