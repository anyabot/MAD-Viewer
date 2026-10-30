import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Flex, HStack, SimpleGrid, Table, Tbody, Td, Text, Tr, VStack, Wrap, WrapItem,
} from '@altterisk/game-hub/ui';
import {
  LevelControl, Panel, RewardGrid, WaveNav, type RewardItem,
} from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { PatternRotation, SkillList, skillByType } from '@/components/skillKit';
import { nextLink } from '@/lib/hubLink';
import { hasIcon } from '@/lib/icons';
import { itemHref } from '@/lib/items';
import { kitSkills, kitStates } from '@/lib/skillProse';
import {
  STAT_LABEL, labelOf, roundStat, statText, typeIcons, typeLabel,
} from '@/lib/characters';
import {
  CHANNEL_LABEL, CHANNEL_ORDER, DROP_ICON_GROUPS, DROP_LABEL, ENCOUNTER_LABEL, EVENT_LABEL,
  MISSION_ICON, TRIGGER_LABEL, dropAmount, dropEntry, dropName, groupSlots, missionCheck,
  subMissionText, subMissionsOf, type EnemyGroup,
} from '@/lib/stages';
import { dataText, pick, useT, type Lang } from '@/lib/i18n';
import type {
  BattlePattern, CharacterData, CharacterEntry, IconManifest, StageData, StageDrop, StageEntry,
  StageSubMission, StageWave, WaveEvent,
} from '@/lib/data';
import { characterHref } from '@/lib/routes';

const DEFAULT_RADIUS = 0.5;
// Approach 99 is within reach of anything on the field, so the unit never walks.
const STATIONARY = 99;

// Ranges are measured to a unit's edge, so a large body changes where everyone stands; only non-default bodies are shown.
export function BodyChips({ entry }: { entry: CharacterEntry | null | undefined }) {
  const t = useT();
  const radius = entry?.hitRadius;
  const big = radius != null && radius !== DEFAULT_RADIUS;
  const still = (entry?.approach ?? 0) >= STATIONARY;
  if (!big && !still) return null;
  return (
    <>
      {big && (
        <WrapItem>
          <Badge fontSize="0.6rem" colorScheme="purple" variant="outline" textTransform="none"
            title={t('enemySizeHint', { n: radius })}>
            {t('enemySize', { n: radius })}
          </Badge>
        </WrapItem>
      )}
      {still && (
        <WrapItem>
          <Badge fontSize="0.6rem" colorScheme="gray" variant="outline" textTransform="none"
            title={t('enemyStationaryHint')}>
            {t('enemyStationary')}
          </Badge>
        </WrapItem>
      )}
    </>
  );
}

// A wave enemy runs its wave row's rotation; the groups are shared between rows.
export function enemyPatterns(data: StageData, baseStat: number | null | undefined):
  { start?: BattlePattern[]; repeat?: BattlePattern[] } | null {
  const ids = baseStat != null ? data.enemyPatterns?.[String(baseStat)] : undefined;
  if (!ids) return null;
  const start = ids.start ? data.patternGroups?.[ids.start] : undefined;
  const repeat = ids.repeat ? data.patternGroups?.[ids.repeat] : undefined;
  return start || repeat ? { start, repeat } : null;
}

// The stage's own content below its header.
export function StageBody({ stage, data, chars, icons, lang }: {
  stage: StageEntry; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const [waveAt, setWaveAt] = useState(0);
  useEffect(() => { setWaveAt(0); }, [stage.id]);
  const missions = subMissionsOf(data, stage);
  const paged = stage.waves.length > 1;
  const waves = paged ? stage.waves.slice(waveAt, waveAt + 1) : stage.waves;
  return (
    <>
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
    </>
  );
}

// Most of a stage's list is guaranteed, so only a chance drop is marked.
export function rewardItem(drop: StageDrop, data: StageData, icons: IconManifest | null, lang: Lang): RewardItem {
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
  const patterns = enemyPatterns(data, group.baseStat);
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
                <Text as={NextLink} href={characterHref(group.code)}
                  fontSize="sm" fontWeight="bold" color="accent.200">
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
            <BodyChips entry={entry} />
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
            <VStack align="stretch" spacing={3} mt={2} pl={2} borderLeftWidth="2px" borderColor="whiteAlpha.200">
              {patterns && (
                <PatternRotation patterns={patterns} data={chars} icons={icons}
                  skillOf={skillByType(kitGroup, chars)}
                  states={kitStates(kitSkills(kitGroup, chars), lang)} />
              )}
              <SkillList group={kitGroup} defaultStar={entry?.defaultStar}
                data={chars} icons={icons} />
            </VStack>
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
