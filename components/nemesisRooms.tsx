import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Badge, Box, Flex, HStack, Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { nextRouterAdapter } from '@altterisk/game-hub/filters';
import { GameIcon } from '@/components/gameIcon';
import { ShareButton } from '@/components/shareButton';
import { BodyChips, enemyPatterns } from '@/components/stageWave';
import { patternConditionText, roundStat, shadowedPatterns, statText } from '@/lib/characters';
import { GROUP_ICON_GROUPS, levelRange, type StageGrouping } from '@/lib/stages';
import { hasIcon } from '@/lib/icons';
import { dataText, useT, type Lang } from '@/lib/i18n';
import type { CharacterData, IconManifest, StageData, StageEntry } from '@/lib/data';

const artGroup = (icons: IconManifest | null, name?: string | null) =>
  GROUP_ICON_GROUPS.find((g) => hasIcon(icons, g, name)) ?? GROUP_ICON_GROUPS[0];

const SUMMARY_STATS = ['MAX_LIFE', 'PHYSICS_ATTACK', 'PHYSICS_DEFENSE'] as const;

function bossOf(stage: StageEntry) {
  for (const wave of stage.waves) {
    const slot = wave.enemies.find((e) => e.code && e.code === wave.bossCode);
    if (slot) return slot;
  }
  return null;
}

// Enemies use the unit formula at grade 1: base + per-level × (level − 1).
function statAt(data: StageData, chars: CharacterData | null, boss: NonNullable<ReturnType<typeof bossOf>>, stat: string) {
  const base = data.enemyStats?.base[String(boss.baseStat)]?.[stat] ?? 0;
  const per = boss.levelStat != null ? data.enemyStats?.level[String(boss.levelStat)]?.[stat] ?? 0 : 0;
  const display = chars?.statTypes[stat]?.display ?? 1;
  return statText(display, roundStat(display, base + per * ((boss.level ?? 1) - 1)));
}

// A season is three rooms, each the same fight at several levels; each level is summarised and links to its stage.
export function NemesisRooms({ grouping, data, chars, icons, lang }: {
  grouping: StageGrouping; data: StageData; chars: CharacterData | null;
  icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const router = useRouter();
  const params = nextRouterAdapter(router);
  const rooms = new Map<number, StageEntry[]>();
  for (const stage of grouping.stages) {
    if (stage.zoneId == null) continue;
    rooms.set(stage.zoneId, [...(rooms.get(stage.zoneId) ?? []), stage]);
  }
  const zoneIds = [...rooms.keys()].sort((a, b) => a - b);
  if (!zoneIds.length) return null;
  const wantZone = Number(params.get('zone'));
  const zoneId = rooms.has(wantZone) ? wantZone : zoneIds[0];
  const levels = [...(rooms.get(zoneId) ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <VStack align="stretch" spacing={3}>
      <Box overflowX="auto" minW={0} maxW="100%">
        <HStack spacing={2} minW="max-content" role="tablist" aria-label={t('nemesisRooms')}>
          {zoneIds.map((id) => {
            const zone = data.zones[String(id)];
            const active = id === zoneId;
            return (
              <HStack key={id} as="button" role="tab" aria-selected={active} spacing={2} px={3} py={2}
                borderWidth="1px" borderRadius="md" onClick={() => params.set({ zone: String(id) })}
                borderColor={active ? 'yellow.400' : 'whiteAlpha.200'}
                bg={active ? 'whiteAlpha.100' : 'transparent'}
                _hover={{ borderColor: active ? 'yellow.400' : 'whiteAlpha.400' }}>
                <GameIcon manifest={icons} group={artGroup(icons, zone?.image)} name={zone?.image}
                  size={8} reserve={false} />
                <Text fontSize="sm" fontWeight={active ? 'bold' : 'normal'}
                  color={active ? 'yellow.200' : 'gray.300'} whiteSpace="nowrap">
                  {dataText(lang, zone?.name?.ko, zone?.name?.en) || zone?.devName || id}
                </Text>
              </HStack>
            );
          })}
        </HStack>
      </Box>

      <Flex justify="flex-end">
        <ShareButton query={{ group: grouping.group.key, zone: zoneId }} />
      </Flex>

      <Box overflowX="auto" minW={0} maxW="100%">
        <Table size="sm" minW="44rem">
          <Thead>
            <Tr>
              <Th>{t('nemesisLevel')}</Th>
              <Th>{t('stageBoss')}</Th>
              {SUMMARY_STATS.map((stat) => (
                <Th key={stat} isNumeric>
                  {dataText(lang, chars?.statTypes[stat]?.name, chars?.statTypes[stat]?.en) || stat}
                </Th>
              ))}
              <Th>{t('panelRotation')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {levels.map((stage, i) => {
              const boss = bossOf(stage);
              const enemy = boss?.code ? data.enemies[boss.code] : undefined;
              const ids = boss?.baseStat != null ? data.enemyPatterns?.[String(boss.baseStat)] : undefined;
              const prevBoss = i > 0 ? bossOf(levels[i - 1]) : null;
              const prevIds = prevBoss?.baseStat != null ? data.enemyPatterns?.[String(prevBoss.baseStat)] : undefined;
              const changed = i > 0 && (ids?.start !== prevIds?.start || ids?.repeat !== prevIds?.repeat);
              const loops = [...(enemyPatterns(data, boss?.baseStat)?.repeat ?? [])].sort((a, b) => a.order - b.order);
              const never = shadowedPatterns(loops);
              const range = levelRange(stage);
              return (
                <Tr key={stage.id}>
                  <Td>
                    <Text as={NextLink} href={`/stage?id=${stage.id}`} fontWeight="bold" color="yellow.200"
                      whiteSpace="nowrap" _hover={{ color: 'yellow.300' }}>
                      {range ? t('stageLevel', { n: range[1] }) : stage.id} ›
                    </Text>
                  </Td>
                  <Td>
                    <HStack spacing={2}>
                      <GameIcon manifest={icons} group="char" size={7} borderRadius="sm"
                        names={[enemy?.iconPath, boss?.code ? `Icon_${boss.code}` : null]} />
                      <Text fontSize="sm" whiteSpace="nowrap">
                        {dataText(lang, enemy?.name, enemy?.nameEn) || boss?.code}
                      </Text>
                      <Wrap spacing={1}>
                        <BodyChips entry={boss?.code ? chars?.characters[boss.code] : null} />
                      </Wrap>
                    </HStack>
                  </Td>
                  {SUMMARY_STATS.map((stat) => (
                    <Td key={stat} isNumeric fontFamily="mono" fontSize="xs">
                      {boss ? statAt(data, chars, boss, stat) : '—'}
                    </Td>
                  ))}
                  <Td>
                    <Wrap spacing={1} align="center">
                      {changed && (
                        <WrapItem>
                          <Badge fontSize="0.55rem" colorScheme="orange" title={t('nemesisPatternChangedHint')}>
                            {t('nemesisPatternChanged')}
                          </Badge>
                        </WrapItem>
                      )}
                      {loops.map((loop) => {
                        const dead = never.has(loop.order);
                        const when = patternConditionText(loop.condition, loop.conditionValue, lang)
                          || (loops.length > 1 ? t('rotationOtherwise') : t('rotationAlways'));
                        return (
                          <WrapItem key={loop.order}>
                            <Badge fontSize="0.55rem" variant="outline" textTransform="none"
                              colorScheme={dead ? 'red' : 'cyan'} opacity={dead ? 0.6 : 1}
                              textDecoration={dead ? 'line-through' : undefined}
                              title={dead ? t('rotationNeverHint') : undefined}>
                              {when}
                            </Badge>
                          </WrapItem>
                        );
                      })}
                    </Wrap>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </VStack>
  );
}
