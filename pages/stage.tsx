// A query route rather than a `[id]` segment: the stage list is runtime data, so a build-time path list would need regenerating.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Badge, Box, Flex, HStack, SimpleGrid, Table, Tbody, Td, Text, Tr, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import {
  EmptyState, LevelControl, LoadState, MetaChips, PageHeader, RewardGrid, WaveNav,
  type RewardItem,
} from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { StageCrumbs } from '@/components/stageCrumbs';
import { StageMeta } from '@/components/stageMeta';
import { nextLink } from '@/lib/hubLink';
import { ShareButton } from '@/components/shareButton';
import { hasIcon } from '@/lib/icons';
import { itemHref } from '@/lib/items';
import { SkillList } from '@/components/skillKit';
import { Panel } from '@altterisk/game-hub';
import {
  STAT_LABEL, labelOf, roundStat, statText, typeIcons, typeLabel,
} from '@/lib/characters';
import {
  CHANNEL_LABEL, CHANNEL_ORDER, DIFFICULTY_LABEL, DROP_ICON_GROUPS, DROP_LABEL,
  ENCOUNTER_LABEL, EVENT_LABEL,
  MISSION_ICON, TRIGGER_LABEL, dropAmount, dropEntry, dropName, groupByKey,
  groupSlots, missionCheck, modeLabel, stageById, stageName, subMissionText,
  subMissionsOf, zoneOf, type EnemyGroup,
} from '@/lib/stages';
import { dataText, pick, useLang, useT, type Lang } from '@/lib/i18n';
import {
  loadCharacters, loadIcons, loadStages,
  type CharacterData, type IconManifest, type StageData, type StageDrop,
  type StageSubMission, type StageWave, type WaveEvent,
} from '@/lib/data';

export default function StagePage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? Number(router.query.id) : null;

  const [data, setData] = useState<StageData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waveAt, setWaveAt] = useState(0);

  useEffect(() => {
    loadStages().then(setData).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const stage = useMemo(
    () => (data && id != null ? stageById(data, id) : null), [data, id]);

  // The group's own ordering is what "next" means; a stage outside any listed group has no neighbours.
  const siblings = useMemo(() => {
    if (!data || !stage) return { prev: null, next: null };
    const list = groupByKey(data, stage.group)?.stages ?? [];
    const at = list.findIndex((s) => s.id === stage.id);
    return {
      prev: at > 0 ? list[at - 1] : null,
      next: at >= 0 && at < list.length - 1 ? list[at + 1] : null,
    };
  }, [data, stage]);

  useEffect(() => { setWaveAt(0); }, [id]);

  if (error || !data || !router.isReady) {
    return <LoadState loading error={error} labels={{ loading: t('loading'), error }} />;
  }

  if (!stage) {
    return (
      <EmptyState title={id != null ? t('stageNotFound', { id }) : t('stageNoneSelected')}
        action={<Text as={NextLink} href="/stages" color="yellow.300" fontSize="sm">{t('stageBack')}</Text>} />
    );
  }

  const zone = zoneOf(data, stage);
  const missions = subMissionsOf(data, stage);
  const paged = stage.waves.length > 1;
  const waves = paged ? stage.waves.slice(waveAt, waveAt + 1) : stage.waves;

  return (
    <VStack align="stretch" spacing={4}>
      <StageCrumbs data={data} mode={stage.mode} group={data.groups[stage.group]}
        leaf={stageName(data, stage, lang)} lang={lang} />

      <PageHeader level={2}
        art={<GameIcon manifest={icons} group="zone" name={zone?.image}
          boxSize={{ base: '56px', md: '72px' }} borderRadius="md" objectFit="cover"
          reserve={false} />}
        title={stageName(data, stage, lang)} id={stage.id}
        badges={
          <>
            <Badge>{modeLabel(data, stage.mode, lang)}</Badge>
            {zone?.difficulty && (
              <Badge colorScheme={zone.difficulty === 'normal' ? 'gray' : 'red'}>
                {pick(DIFFICULTY_LABEL[zone.difficulty], lang)}
              </Badge>
            )}
          </>
        }
        meta={<MetaChips><StageMeta stage={stage} chars={chars} icons={icons} lang={lang} /></MetaChips>}
        actions={<ShareButton query={{ id: stage.id }} />} />

      {(siblings.prev || siblings.next) && (
        <Flex align="center" gap={3} wrap="wrap" fontSize="sm">
          {siblings.prev && (
            <Text as={NextLink} href={`/stage?id=${siblings.prev.id}`} color="yellow.300"
              noOfLines={1}>
              ← {stageName(data, siblings.prev, lang)}
            </Text>
          )}
          <Box flex="1" />
          {siblings.next && (
            <Text as={NextLink} href={`/stage?id=${siblings.next.id}`} color="yellow.300"
              noOfLines={1}>
              {stageName(data, siblings.next, lang)} →
            </Text>
          )}
        </Flex>
      )}

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} alignItems="start">
        {missions.length > 0 && (
          <Panel title={t('stageMissions')}>
            <VStack align="stretch" spacing={1.5}>
              {missions.map((m) => (
                <Mission key={m.id} mission={m} chars={chars} icons={icons} lang={lang} />
              ))}
            </VStack>
          </Panel>
        )}
        {stage.rewards && (
          <Panel title={t('stageDrops')}>
            <VStack align="stretch" spacing={3}>
              {CHANNEL_ORDER.filter((c) => stage.rewards?.[c]?.length).map((channel) => (
                <Box key={channel}>
                  <Text fontSize="xs" color="gray.500" mb={1}>
                    {pick(CHANNEL_LABEL[channel], lang)}
                  </Text>
                  <RewardGrid renderLink={nextLink}
                    items={(stage.rewards?.[channel] ?? []).map((drop) => rewardItem(drop, data, icons, lang))} />
                </Box>
              ))}
            </VStack>
          </Panel>
        )}
        {(stage.background || stage.bgm) && (
          <Panel title={t('stageField')}>
            <VStack align="stretch" spacing={1}>
              {stage.background && (
                <Text fontFamily="mono" fontSize="xs" color="gray.400">
                  {stage.background}
                </Text>
              )}
              {stage.bgm && (
                <Text fontFamily="mono" fontSize="xs" color="gray.500">
                  {t('stageBgm')} · {stage.bgm}
                </Text>
              )}
            </VStack>
          </Panel>
        )}
      </SimpleGrid>

      {stage.waves.length === 0 ? (
        <Text fontSize="sm" color="gray.500">{t('stageNoWaves')}</Text>
      ) : (
        <>
        {paged && (
          <WaveNav count={stage.waves.length} index={waveAt} onChange={setWaveAt}
            labels={{ prev: t('stageWavePrev'), next: t('stageWaveNext'), wave: (i, n) => t('stageWaveOf', { n: i + 1, total: n }) }} />
        )}
        {waves.map((wave) => (
          <Wave key={wave.sequence} wave={wave} data={data} chars={chars}
            icons={icons} lang={lang} />
        ))}
        </>
      )}
    </VStack>
  );
}

// Most of a stage's list is guaranteed, so only a chance drop is marked.
function rewardItem(drop: StageDrop, data: StageData, icons: IconManifest | null, lang: Lang): RewardItem {
  const entry = dropEntry(data, drop);
  const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry?.icon))
    ?? DROP_ICON_GROUPS[0];
  return {
    icon: <ItemIcon manifest={icons} group={group} names={[entry?.icon]} grade={entry?.grade} size={10} />,
    name: dropName(data, drop, lang),
    amount: dropAmount(drop),
    chance: drop.chance ?? undefined,
    note: DROP_LABEL[drop.drop] ? pick(DROP_LABEL[drop.drop], lang) : undefined,
    href: drop.ref ? itemHref(drop.ref) : undefined,
  };
}

// A party check is drawn with the type's own art; the rest carry the game's mark where one exists.
function Mission({ mission, chars, icons, lang }: {
  mission: StageSubMission; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang;
}) {
  const check = missionCheck(mission);
  const row = check && chars
    ? chars.types[check.table][String(check.value)] ?? null
    : null;
  const text = subMissionText(mission, lang,
    (table, value) => typeLabel(chars?.types[table][String(value)] ?? null, lang));
  return (
    <Flex gap={2} align="start">
      <GameIcon manifest={icons} group="ui"
        names={row ? typeIcons(row) : [MISSION_ICON[mission.type]]}
        size={4} mt={0.5} tint={row?.color} />
      <Text fontSize="sm" color="gray.300">{text}</Text>
    </Flex>
  );
}

function Wave({ wave, data, chars, icons, lang }: {
  wave: StageWave; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const groups = groupSlots(wave.enemies);
  const note = [
    wave.encounter ? pick(ENCOUNTER_LABEL[wave.encounter], lang) : '',
    wave.bgm ?? '',
  ].filter(Boolean).join(' · ');
  return (
    <Panel title={t('stageWave', { n: wave.sequence })} note={note || undefined}>
      <VStack align="stretch" spacing={2}>
        {groups.map((group, i) => (
          <EnemyRow key={i} group={group} data={data} chars={chars} icons={icons}
            lang={lang} isBoss={!!group.code && group.code === wave.bossCode} />
        ))}
        {(wave.events ?? []).length > 0 && (
          <Box mt={1} pt={2} borderTopWidth="1px" borderColor="whiteAlpha.100">
            <Text fontSize="xs" color="gray.500" mb={1}>{t('stageEvents')}</Text>
            <VStack align="stretch" spacing={2}>
              {(wave.events ?? []).map((event, i) => (
                <EventRow key={i} event={event} icons={icons} lang={lang} />
              ))}
            </VStack>
          </Box>
        )}
      </VStack>
    </Panel>
  );
}

// The kit is folded away: a wave fields up to six enemies, each with a full behaviour graph.
function EnemyRow({ group, data, chars, icons, lang, isBoss }: {
  group: EnemyGroup; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang; isBoss: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const enemy = group.code ? data.enemies[group.code] ?? null : null;
  const hasStats = !!chars && group.baseStat != null
    && !!data.enemyStats?.base[String(group.baseStat)];
  const entry = group.code && chars ? chars.characters[group.code] ?? null : null;
  const kitGroup = entry?.skillSetGroup ?? enemy?.skillSetGroup ?? null;
  const hasKit = !!chars && kitGroup != null && !!chars.skillSets[String(kitGroup)];
  const attributeType = group.attribute ?? enemy?.attributeType;
  const element = attributeType != null && chars
    ? chars.types.attribute[String(attributeType)] ?? null
    : null;

  return (
    <Box borderTopWidth="1px" borderColor="whiteAlpha.100" pt={2}>
      <Flex gap={3} align="start" wrap="wrap">
        <GameIcon manifest={icons} group="char"
          names={[enemy?.iconPath, group.code ? `Icon_${group.code}` : null]}
          size={10} borderRadius="md" />
        <Box minW={0} flex="1">
          <Wrap spacing={2} align="center">
            <WrapItem>
              {group.code && entry ? (
                <Text as={NextLink} href={`/character?code=${group.code}`}
                  fontSize="sm" fontWeight="bold" color="yellow.200">
                  {dataText(lang, enemy?.name, enemy?.nameEn) || group.code}
                </Text>
              ) : (
                <Text fontSize="sm" fontWeight="bold">
                  {dataText(lang, enemy?.name, enemy?.nameEn) || group.code
                    || t('stageUnnamedEnemy', { id: group.id ?? 0 })}
                </Text>
              )}
            </WrapItem>
            {group.code && (
              <WrapItem>
                <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">
                  {group.code}
                </Text>
              </WrapItem>
            )}
            {isBoss && (
              <WrapItem><Badge colorScheme="red" fontSize="0.6rem">{t('stageBoss')}</Badge></WrapItem>
            )}
            {group.count > 1 && (
              <WrapItem><Badge fontSize="0.6rem">×{group.count}</Badge></WrapItem>
            )}
            {group.level != null && (
              <WrapItem>
                <Text fontSize="xs" color="gray.400">{t('stageLevel', { n: group.level })}</Text>
              </WrapItem>
            )}
            {element && (
              <WrapItem>
                <HStack spacing={1}>
                  <GameIcon manifest={icons} group="ui" name={element.icon} size={3.5}
                    reserve={false} />
                  <Text fontSize="xs" color={element.color ?? 'gray.400'}>
                    {typeLabel(element, lang)}
                  </Text>
                </HStack>
              </WrapItem>
            )}
            {hasStats && (
              <WrapItem>
                <Box as="button" onClick={() => setStatsOpen(!statsOpen)} px={2} py={0.5}
                  fontSize="0.65rem" borderWidth="1px" borderRadius="md"
                  borderColor="whiteAlpha.300" color="gray.400"
                  _hover={{ color: 'gray.100', borderColor: 'whiteAlpha.500' }}>
                  {statsOpen ? t('stageHideStats') : t('stageOpenStats')}
                </Box>
              </WrapItem>
            )}
            {hasKit && (
              <WrapItem>
                <Box as="button" onClick={() => setOpen(!open)} px={2} py={0.5}
                  fontSize="0.65rem" borderWidth="1px" borderRadius="md"
                  borderColor="whiteAlpha.300" color="gray.400"
                  _hover={{ color: 'gray.100', borderColor: 'whiteAlpha.500' }}>
                  {open ? t('stageHideKit') : t('stageOpenKit')}
                </Box>
              </WrapItem>
            )}
          </Wrap>
          {statsOpen && hasStats && chars && (
            <Box mt={2} pl={2} borderLeftWidth="2px" borderColor="whiteAlpha.200">
              <EnemyStats group={group} data={data} chars={chars} lang={lang} />
            </Box>
          )}
          {open && chars && (
            <Box mt={2} pl={2} borderLeftWidth="2px" borderColor="whiteAlpha.200">
              <SkillList group={kitGroup} defaultStar={entry?.defaultStar}
                data={chars} icons={icons} />
            </Box>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

const levelCap = new WeakMap<StageData, number>();

function highestEnemyLevel(data: StageData): number {
  let cap = levelCap.get(data);
  if (cap == null) {
    cap = Math.max(1, ...data.stages.flatMap((s) => s.waves.flatMap(
      (w) => w.enemies.map((e) => e.level ?? 1))));
    levelCap.set(data, cap);
  }
  return cap;
}

// Enemies use the unit formula at grade 1, with no equipment, affection or infusion.
function EnemyStats({ group, data, chars, lang }: {
  group: EnemyGroup; data: StageData; chars: CharacterData; lang: Lang;
}) {
  const t = useT();
  const [level, setLevel] = useState(group.level ?? 1);
  const base = data.enemyStats?.base[String(group.baseStat)] ?? {};
  const perLevel = group.levelStat != null
    ? data.enemyStats?.level[String(group.levelStat)] ?? {}
    : {};
  const rows = Object.entries(chars.statTypes)
    .filter(([stat]) => base[stat] != null || perLevel[stat] != null)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([stat, type]) => ({
      stat,
      label: dataText(lang, type.name, type.en) || labelOf(STAT_LABEL, stat, lang),
      value: statText(type.display,
        roundStat(type.display, (base[stat] ?? 0) + (perLevel[stat] ?? 0) * (level - 1))),
    }));
  return (
    <VStack align="stretch" spacing={2} maxW="24rem">
      <LevelControl label={t('stageLevel', { n: level })} value={level} min={1}
        max={highestEnemyLevel(data)} onChange={setLevel}
        marks={group.level != null ? [group.level] : undefined} />
      <Box overflowX="auto">
        <Table size="sm" minW="14rem">
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.stat}>
                <Td fontSize="xs" color="gray.400" py={1}>{row.label}</Td>
                <Td isNumeric fontFamily="mono" fontSize="xs" py={1}>{row.value}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    </VStack>
  );
}

function EventRow({ event, icons, lang }: {
  event: WaveEvent; icons: IconManifest | null; lang: Lang;
}) {
  return (
    <Box>
      <Wrap spacing={2} align="baseline">
        {event.trigger && (
          <WrapItem>
            <Text fontSize="0.65rem" color="gray.400">
              {pick(TRIGGER_LABEL[event.trigger], lang) || event.trigger}
            </Text>
          </WrapItem>
        )}
        <WrapItem>
          <Badge fontSize="0.55rem">
            {pick(EVENT_LABEL[event.kind], lang) || event.kind}
          </Badge>
        </WrapItem>
        {event.value && !event.lines && (
          <WrapItem>
            <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">{event.value}</Text>
          </WrapItem>
        )}
      </Wrap>
      {(event.lines ?? []).length > 0 && (
        <VStack align="stretch" spacing={1} mt={1} pl={2}
          borderLeftWidth="2px" borderColor="whiteAlpha.200">
          {(event.lines ?? []).map((line) => (
            <Flex key={line.order} gap={2} align="start">
              <GameIcon manifest={icons} group="cutin" name={line.icon} size={5}
                borderRadius="sm" reserve={false} />
              <Text fontSize="xs" color="gray.300">
                {pick(line.text, lang) || line.text?.ko || ''}
              </Text>
            </Flex>
          ))}
        </VStack>
      )}
    </Box>
  );
}
