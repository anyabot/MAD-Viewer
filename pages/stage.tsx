// A query route rather than a `[id]` segment, matching `/character`: the stage
// list is fetched at runtime, so a build-time path list would need regenerating.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, HStack, SimpleGrid, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { hasIcon } from '@/lib/icons';
import { Panel, SkillList } from '@/components/skillKit';
import { typeIcons, typeLabel } from '@/lib/characters';
import {
  CHANNEL_LABEL, CHANNEL_ORDER, DIFFICULTY_LABEL, DROP_ICON_GROUPS, DROP_LABEL,
  ENCOUNTER_LABEL, EVENT_LABEL,
  MISSION_ICON, TRIGGER_LABEL, dropAmount, dropChance, dropEntry, dropName, groupSlots,
  levelRange, missionCheck, modeLabel, stageById, stageName, subMissionText, subMissionsOf,
  zoneOf, type EnemyGroup,
} from '@/lib/stages';
import { pick, useLang, useT, type Lang } from '@/lib/i18n';
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

  useEffect(() => {
    loadStages().then(setData).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const stage = useMemo(
    () => (data && id != null ? stageById(data, id) : null), [data, id]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!data || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  if (!stage) {
    return (
      <VStack align="start" spacing={3} py={10}>
        <Text color="gray.400">
          {id != null ? t('stageNotFound', { id }) : t('stageNoneSelected')}
        </Text>
        <Text as={NextLink} href="/stages" color="yellow.300" fontSize="sm">
          {t('stageBack')}
        </Text>
      </VStack>
    );
  }

  const zone = zoneOf(data, stage);
  const missions = subMissionsOf(data, stage);
  const levels = levelRange(stage);
  const weak = stage.weakAttribute != null && chars
    ? chars.types.attribute[String(stage.weakAttribute)] ?? null
    : null;

  return (
    <VStack align="stretch" spacing={4}>
      <Text as={NextLink} href="/stages" color="yellow.300" fontSize="sm">
        {t('stageBack')}
      </Text>

      <Flex gap={3} align="start">
        <GameIcon manifest={icons} group="zone" name={zone?.image}
          boxSize={{ base: '56px', md: '72px' }} borderRadius="md" objectFit="cover"
          reserve={false} />
        <VStack align="stretch" spacing={2} flex="1" minW={0}>
        <Wrap spacing={2} align="baseline">
          <WrapItem>
            <Text fontSize="xl" fontWeight="bold">{stageName(data, stage, lang)}</Text>
          </WrapItem>
          <WrapItem><Badge>{modeLabel(data, stage.mode, lang)}</Badge></WrapItem>
          {zone?.difficulty && (
            <WrapItem>
              <Badge colorScheme={zone.difficulty === 'normal' ? 'gray' : 'red'}>
                {pick(DIFFICULTY_LABEL[zone.difficulty], lang)}
              </Badge>
            </WrapItem>
          )}
          <WrapItem>
            <Text fontFamily="mono" fontSize="xs" color="gray.500">{stage.id}</Text>
          </WrapItem>
        </Wrap>
        <Wrap spacing={3} align="center">
          {stage.recommendLevel && (
            <WrapItem>
              <Text fontSize="sm" color="gray.400">
                {t('stageRecommend', { level: stage.recommendLevel })}
              </Text>
            </WrapItem>
          )}
          {weak && (
            <WrapItem>
              <Flex align="center" gap={1}>
                <Text fontSize="xs" color="gray.600">{t('stageWeakTo')}</Text>
                <GameIcon manifest={icons} group="ui" name={weak.icon} size={4}
                  reserve={false} />
                <Text fontSize="sm" color={weak.color ?? 'gray.300'}>
                  {typeLabel(weak, lang)}
                </Text>
              </Flex>
            </WrapItem>
          )}
          {stage.stamina ? (
            <WrapItem>
              <Text fontSize="sm" color="gray.500">
                {t('stageStamina', { n: stage.stamina })}
              </Text>
            </WrapItem>
          ) : null}
          {levels && (
            <WrapItem>
              <Text fontSize="sm" color="gray.500">
                {levels[0] === levels[1]
                  ? t('stageLevel', { n: levels[0] })
                  : t('stageLevelRange', { from: levels[0], to: levels[1] })}
              </Text>
            </WrapItem>
          )}
        </Wrap>
        </VStack>
      </Flex>

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
                  <Wrap spacing={2}>
                    {(stage.rewards?.[channel] ?? []).map((drop, i) => (
                      <WrapItem key={i}>
                        <Drop drop={drop} data={data} icons={icons} lang={lang} />
                      </WrapItem>
                    ))}
                  </Wrap>
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
        stage.waves.map((wave) => (
          <Wave key={wave.sequence} wave={wave} data={data} chars={chars}
            icons={icons} lang={lang} />
        ))
      )}
    </VStack>
  );
}

// A drop that is not guaranteed says so; one that is stays unadorned, because
// most of a stage's list is guaranteed and a "100%" on every row is noise.
function Drop({ drop, data, icons, lang }: {
  drop: StageDrop; data: StageData; icons: IconManifest | null; lang: Lang;
}) {
  const entry = dropEntry(data, drop);
  const chance = dropChance(drop);
  const note = DROP_LABEL[drop.drop] ? pick(DROP_LABEL[drop.drop], lang) : null;
  const group = DROP_ICON_GROUPS.find((g) => hasIcon(icons, g, entry?.icon))
    ?? DROP_ICON_GROUPS[0];
  return (
    <Flex align="center" gap={2} borderWidth="1px" borderColor="whiteAlpha.200"
      borderRadius="md" px={2} py={1} minW={0}>
      <GameIcon manifest={icons} group={group}
        names={[entry?.icon]} size={7} borderRadius="sm" />
      <Box minW={0}>
        <Text fontSize="xs" noOfLines={1}>{dropName(data, drop)}</Text>
        <HStack spacing={1.5}>
          <Text fontSize="0.65rem" color="yellow.200">×{dropAmount(drop)}</Text>
          {chance && <Text fontSize="0.6rem" color="gray.500">{chance}</Text>}
          {note && <Text fontSize="0.6rem" color="gray.600">{note}</Text>}
        </HStack>
      </Box>
    </Flex>
  );
}

// A party check is drawn with the type's own art, which is what the row names;
// the rest carry the game's own mark, where one exists.
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

// The kit is folded away: a wave fields up to six enemies and each one carries
// a full behaviour graph.
function EnemyRow({ group, data, chars, icons, lang, isBoss }: {
  group: EnemyGroup; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang; isBoss: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const enemy = group.code ? data.enemies[group.code] ?? null : null;
  const entry = group.code && chars ? chars.characters[group.code] ?? null : null;
  const kitGroup = entry?.skillSetGroup ?? enemy?.skillSetGroup ?? null;
  const hasKit = !!chars && kitGroup != null && !!chars.skillSets[String(kitGroup)];
  const element = enemy?.attributeType != null && chars
    ? chars.types.attribute[String(enemy.attributeType)] ?? null
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
                  {enemy?.name || group.code}
                </Text>
              ) : (
                <Text fontSize="sm" fontWeight="bold">
                  {enemy?.name || group.code
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
