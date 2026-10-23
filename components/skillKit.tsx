// Skill kits show structure without implying undecoded battle arithmetic.
import { Panel } from '@altterisk/game-hub';
import { useState } from 'react';
import NextLink from 'next/link';
import { hasArea } from '@/lib/aoe';
import { useSkillTiming } from '@/lib/skillTiming';
import type { SkillTiming } from '@/lib/data';
import { Badge, Box, Flex, HStack, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import {
  BUFF_CATEGORY, DISPEL_LABEL, MOVE_LABEL, OP_LABEL, OP_SCHEME, SETUP_CONDITION_LABEL, SIDE_LABEL,
  SKILL_CATEGORY_LABEL, SORT_LABEL, STAT_LABEL, TARGET_LABEL, TRIGGER_LABEL, castSummary, colorRuns,
  detailSummary, everySecondsText, gateSummary, hitSummary, labelOf, moveSummary, opAmounts, opSeconds, weightText, chanceText,
  scaleSummary, secondsText, skillDescs, variantCondition, skillGrades, skillsAtGrade, statAmount,
  patternConditionText, shadowedPatterns,
} from '@/lib/characters';
import {
  behaviourSentences, deliveries, hitDelivery, kitSkills, kitStates, skillLabel, type Delivery, type StateNamer,
} from '@/lib/skillProse';
import { useSkillView, type SkillView } from '@/lib/skillViewStore';
import { dataText, useLang, useT, type UiKey } from '@/lib/i18n';
import type {
  BattlePattern, BuffEntry, CharacterData, CharacterEntry, IconManifest, SkillBehaviour, SkillEntry,
  SkillOp,
} from '@/lib/data';

// The game's own `<color=#rrggbb>` and `<br>` markup.
export function GameText({ text }: { text: string }) {
  return (
    <>
      {colorRuns(text).map((run, i) => (
        run.break ? <br key={i} /> : <Text as="span" key={i} color={run.color}>{run.text}</Text>
      ))}
    </>
  );
}

// An uncategorised state is an internal marker, so it gets no dispel badge either.
export function StateBadges({ categorize, dispellable }: {
  categorize?: number; dispellable?: boolean;
}) {
  const lang = useLang();
  const cat = BUFF_CATEGORY[categorize ?? 0];
  if (!cat) return null;
  return (
    <HStack spacing={1} display="inline-flex">
      <Badge fontSize="0.55rem" colorScheme={cat.scheme}>{cat.label[lang]}</Badge>
      {dispellable !== undefined && (
        <Badge fontSize="0.55rem" variant="outline" colorScheme={dispellable ? 'yellow' : 'gray'}>
          {DISPEL_LABEL[dispellable ? 'yes' : 'no'][lang]}
        </Badge>
      )}
    </HStack>
  );
}

// Magnitude and duration both scale with the skill level.
export function BuffList({ buffs, icons }: {
  buffs: BuffEntry[]; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  if (!buffs.length) return null;
  return (
    <VStack align="stretch" spacing={1} mt={1.5} pl={2}
      borderLeftWidth="2px" borderColor="whiteAlpha.200">
      {buffs.map((buff, i) => {
        return (
          <Flex key={i} gap={2} align="start">
            <GameIcon manifest={icons} group="buff" name={buff.icon} size={4} mt={0.5} />
            <Box minW={0}>
              <Wrap spacing={1.5} align="baseline">
                <WrapItem>
                  <Text fontSize="xs" fontWeight="bold">
                    <GameText text={dataText(lang, buff.name, buff.nameEn)} />
                  </Text>
                </WrapItem>
                <WrapItem>
                  <StateBadges categorize={buff.categorize} dispellable={buff.dispellable} />
                </WrapItem>
                {buff.seconds > 0 && buff.seconds < 9999 && (
                  <WrapItem>
                    <Text fontSize="0.6rem" color="gray.600">
                      {secondsText(buff.seconds, lang)}
                    </Text>
                  </WrapItem>
                )}
                {buff.maxStack > 1 && buff.maxStack < 99 && (
                  <WrapItem>
                    <Text fontSize="0.6rem" color="gray.600">
                      {t('maxStack', { n: buff.maxStack })}
                    </Text>
                  </WrapItem>
                )}
              </Wrap>
              {buff.desc && (
                <Text fontSize="xs" color="gray.500">
                  <GameText text={dataText(lang, buff.desc, buff.descEn)} />
                </Text>
              )}
            </Box>
          </Flex>
        );
      })}
    </VStack>
  );
}

// Operations expose target side, scaling stat and unnamed effects.
function OpRow({ op, level, period, data, icons, landings = 1 }: {
  op: SkillOp; level: number; period: number; landings?: number;
  data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const scheme = (op.op && OP_SCHEME[op.op])
    ?? BUFF_CATEGORY[op.categorize ?? 0]?.scheme
    ?? 'gray';
  const where = [
    op.team ? labelOf(TARGET_LABEL, op.team, lang) : '',
    op.pick === 'ALL' ? t('allInRange') : (op.count ? `${op.count}` : ''),
    op.sort ? labelOf(SORT_LABEL, op.sort, lang) : '',
    op.applyTo && op.applyTo !== 'HOLDER'
      ? t('onSide', { side: labelOf(SIDE_LABEL, op.applyTo, lang) }) : '',
  ].filter(Boolean).join(' · ');
  const scale = scaleSummary(op, lang);
  const amounts = opAmounts(op, level, period);
  const seconds = opSeconds(op, level, period, lang);
  const weights = op.value ? weightText(op, landings, lang) : null;
  const odds = chanceText(op, lang);
  // a boss can name six states at once; the rest go in the tooltip
  const detail = op.detail ? detailSummary(op.detail, lang) : [];
  const shown = detail.slice(0, 3);
  return (
    <Flex gap={2} align="start" wrap="wrap">
      {op.icon
        ? <GameIcon manifest={icons} group="buff" name={op.icon} size={4} mt={0.5} />
        : <Box w={4} />}
      <Badge fontSize="0.55rem" colorScheme={scheme} mt={0.5}>
        {labelOf(OP_LABEL, op.op, lang)}
      </Badge>
      {op.name && (
        <Text fontSize="xs" fontWeight="bold">
          <GameText text={dataText(lang, op.name, op.nameEn)} />
        </Text>
      )}
      <StateBadges categorize={op.categorize} dispellable={op.dispellable} />
      {amounts.length > 0 && (
        <Text fontSize="xs" color="yellow.200">{amounts.join(' / ')}</Text>
      )}
      {scale && <Text fontSize="0.65rem" color="gray.400">{scale}</Text>}
      {weights && <Text fontSize="0.65rem" color="orange.200">{weights}</Text>}
      {odds && <Text fontSize="0.65rem" color="pink.200">{odds}</Text>}
      {detail.length > 0 && (
        <Text fontSize="0.65rem" color="gray.300" noOfLines={1}
          title={detail.map((v) => colorRuns(v).map((r) => (r.break ? ' ' : r.text)).join('')).join(', ')}>
          {shown.map((v, i) => (
            <Text as="span" key={i}>
              {i > 0 && ', '}
              <GameText text={v} />
            </Text>
          ))}
          {detail.length > shown.length && ` +${detail.length - shown.length}`}
        </Text>
      )}
      {op.gate && (
        <Text fontSize="0.65rem" color="cyan.300">
          <GameText text={gateSummary(op.gate, data, lang)} />
        </Text>
      )}
      {seconds && <Text fontSize="0.65rem" color="gray.500">{seconds}</Text>}
      {op.interval ? (
        <Text fontSize="0.65rem" color="gray.500">
          {everySecondsText(op.interval, lang)}
        </Text>
      ) : null}
      {(op.maxStack ?? 0) > 1 && (op.maxStack ?? 0) < 99 && (
        <Text fontSize="0.6rem" color="gray.600">{t('maxStack', { n: op.maxStack ?? 0 })}</Text>
      )}
      {where && <Text fontSize="0.65rem" color="gray.600">{where}</Text>}
    </Flex>
  );
}

function Behaviour({ behaviour, level, period, data, icons }: {
  behaviour: SkillBehaviour; level: number; period: number;
  data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const { hits, moves, moveTargets, stats, triggers } = behaviour;
  const moveLines = [
    ...(moveTargets ?? []).map((m) => moveSummary(m, lang)),
    ...(moves ?? []).filter((m) => !(moveTargets ?? []).some((x) => x.type === m))
      .map((m) => labelOf(MOVE_LABEL, m, lang)),
  ];
  const on = (cast: string) => (lang === 'ko' ? ` · 대상: ${cast}` : ` · on ${cast}`);

  return (
    <VStack align="stretch" spacing={1.5} mt={2} pt={2}
      borderTopWidth="1px" borderColor="whiteAlpha.100">
      {moveLines.map((line, i) => (
        <Text key={i} fontSize="xs" color="gray.400">{line}</Text>
      ))}

      {(hits ?? []).map((hit, i) => (
        <Box key={i}>
          <Text fontSize="0.65rem" color="gray.500">
            {hit.ops.length > 0 && <DeliveryBadge delivery={hitDelivery(hit)} />}
            {hitSummary(hit, lang)}
            {hit.cast && castSummary(hit.cast, lang) && on(castSummary(hit.cast, lang))}
          </Text>
          <VStack align="stretch" spacing={0.5} mt={0.5}>
            {hit.ops.map((op, j) => (
              <OpRow key={j} op={op} level={level} period={period} data={data} landings={hit.count}
                icons={icons} />
            ))}
          </VStack>
        </Box>
      ))}

      {(stats ?? []).map((stat, i) => (
        <Flex key={i} gap={2} align="baseline" wrap="wrap">
          <Box w={4} />
          <Badge fontSize="0.55rem" colorScheme="green">
            {labelOf(STAT_LABEL, stat.stat, lang)} {statAmount(stat)}
          </Badge>
          {stat.condition && (
            <Text fontSize="0.65rem" color="gray.600">
              {labelOf(SETUP_CONDITION_LABEL, stat.condition, lang)}
            </Text>
          )}
        </Flex>
      ))}

      {(triggers ?? []).map((trigger, i) => (
        <Box key={i}>
          <Wrap spacing={2} align="baseline">
            <WrapItem>
              <Text fontSize="0.65rem" color="gray.400">
                {labelOf(TRIGGER_LABEL, trigger.on, lang)}
              </Text>
            </WrapItem>
            {trigger.check && (
              <WrapItem>
                <Text fontSize="0.6rem" color="gray.600">
                  {labelOf(TARGET_LABEL, trigger.check, lang)}
                </Text>
              </WrapItem>
            )}
            {trigger.cooldown > 0 && (
              <WrapItem>
                <Text fontSize="0.6rem" color="gray.600">
                  {t('cooldown', { n: trigger.cooldown })}
                </Text>
              </WrapItem>
            )}
            {trigger.limit > 0 && (
              <WrapItem>
                <Text fontSize="0.6rem" color="gray.600">
                  {t('perBattle', { n: trigger.limit })}
                </Text>
              </WrapItem>
            )}
          </Wrap>
          <VStack align="stretch" spacing={0.5} mt={0.5}>
            {trigger.ops.map((op, j) => (
              <OpRow key={j} op={op} level={level} period={period} data={data}
                icons={icons} />
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  );
}

function Sentences({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <VStack align="stretch" spacing={0.5} mt={1.5} pl={2} borderLeftWidth="2px" borderColor="whiteAlpha.200">
      {lines.map((line, i) => (
        <Text key={i} fontSize="xs" color="gray.300">{line}</Text>
      ))}
    </VStack>
  );
}

// Skills level independently; passives use star grade and normal attacks have no level.
export function SkillRow({ skill, data, icons, label, owner, states }: {
  skill: SkillEntry & { id: number }; data: CharacterData;
  icons: IconManifest | null; label?: string; owner?: string; states?: StateNamer;
}) {
  const t = useT();
  const lang = useLang();
  const [level, setLevel] = useState(1);
  const view = useSkillView();
  const namer = states ?? kitStates([skill], lang);
  const descs = skillDescs(skill, 'ko').map((ko, i) => dataText(lang, ko, skill.descEn?.[i]));
  const timing = useSkillTiming()?.[String(skill.id)];
  const at = Math.min(level, descs.length) - 1;
  return (
    <Flex gap={3} align="start" borderTopWidth="1px" borderColor="whiteAlpha.100" pt={2}>
      <GameIcon manifest={icons} group="skill" name={skill.icon} size={9} borderRadius="md" />
      <Box minW={0} flex="1">
        <Wrap spacing={2} align="center">
          <WrapItem>
            <Text fontSize="sm" fontWeight="bold">
              {label ?? dataText(lang, skill.name, skill.nameEn)}
            </Text>
          </WrapItem>
          {label && !label.startsWith(dataText(lang, skill.name, skill.nameEn)) && (
            <WrapItem>
              <Text fontSize="0.6rem" color="gray.600">{dataText(lang, skill.name, skill.nameEn)}</Text>
            </WrapItem>
          )}
          <WrapItem>
            <Badge fontSize="0.6rem">{SKILL_CATEGORY_LABEL[skill.categorize]?.[lang]}</Badge>
          </WrapItem>
          {deliveries(skill).map((d) => (
            <WrapItem key={d}><DeliveryBadge delivery={d} /></WrapItem>
          ))}
          {timing?.seconds != null && (
            <WrapItem>
              <Badge fontSize="0.6rem" colorScheme="blue" textTransform="none" title={t('timingUseHint')}>
                {t('timingUse', { s: timing.seconds })}
              </Badge>
            </WrapItem>
          )}
          {timing?.hits?.length ? (
            <WrapItem>
              <Badge fontSize="0.6rem" colorScheme="teal" textTransform="none" title={t('timingHitHint')}>
                {t('timingHit', { s: hitText(timing.hits) })}
              </Badge>
            </WrapItem>
          ) : null}
          {timing?.cooldown != null && (
            <WrapItem>
              <Badge fontSize="0.6rem" colorScheme="purple" textTransform="none">
                {t('timingDelay', { s: timing.cooldown })}
              </Badge>
            </WrapItem>
          )}
          {owner && hasArea(skill.behaviour) && (
            <WrapItem>
              <Badge as={NextLink} href={`/field?unit=${owner}&skill=${skill.id}#aoe`} fontSize="0.6rem"
                colorScheme="red" textTransform="none" title={t('aoeLinkHint')}>
                {t('aoeLink')}
              </Badge>
            </WrapItem>
          )}
          {skill.openStar > 1 && (
            <WrapItem>
              <Badge fontSize="0.6rem" colorScheme="yellow">{skill.openStar}★</Badge>
            </WrapItem>
          )}
          {skill.levelable && (
            <WrapItem maxW="100%">
              <Flex gap={1} wrap="wrap" align="center">
                <Text fontSize="0.65rem" color="gray.600">{t('skillLevel')}</Text>
                {descs.map((_d, i) => (
                  <Box key={i} as="button" onClick={() => setLevel(i + 1)} px={1.5}
                    fontSize="0.65rem" borderWidth="1px" borderRadius="sm"
                    borderColor={i === at ? 'yellow.400' : 'whiteAlpha.200'}
                    color={i === at ? 'yellow.200' : 'gray.500'}>{i + 1}</Box>
                ))}
              </Flex>
            </WrapItem>
          )}
        </Wrap>
        <Text fontSize="sm" color="gray.300" mt={0.5}>
          <GameText text={descs[at] ?? ''} />
        </Text>
        {view.buffs && <BuffList buffs={skill.buffs[at] ?? []} icons={icons} />}
        {view.prose && skill.behaviour && (
          <Sentences lines={behaviourSentences(skill.behaviour, at + 1, skill.levelPeriod, data, lang, namer)} />
        )}
        {skill.variant?.behaviour && (
          <Box mt={2} pl={2} borderLeftWidth="2px" borderColor="yellow.700">
            <Text fontSize="xs" color="yellow.300" title={skill.variant.when.define}>
              <GameText text={variantCondition(skill.variant, lang, namer)} />
              {skill.variant.action && <Text as="span" color="gray.500">{` · ${skill.variant.action}`}</Text>}
            </Text>
            {view.prose && (
              <Sentences lines={behaviourSentences(skill.variant.behaviour, at + 1, skill.levelPeriod, data, lang, namer)} />
            )}
            {view.details && (
              <Behaviour behaviour={skill.variant.behaviour} level={at + 1}
                period={skill.levelPeriod} data={data} icons={icons} />
            )}
          </Box>
        )}
        {view.details && skill.behaviour && (
          <Behaviour behaviour={skill.behaviour} level={at + 1}
            period={skill.levelPeriod} data={data} icons={icons} />
        )}
      </Box>
    </Flex>
  );
}

const DELIVERY: Record<Delivery, { label: UiKey; hint: UiKey; scheme: string }> = {
  projectile: { label: 'deliveryProjectile', hint: 'deliveryProjectileHint', scheme: 'orange' },
  travelling: { label: 'deliveryTravelling', hint: 'deliveryTravellingHint', scheme: 'cyan' },
  instant: { label: 'deliveryInstant', hint: 'deliveryInstantHint', scheme: 'purple' },
};

function DeliveryBadge({ delivery }: { delivery: Delivery }) {
  const t = useT();
  const d = DELIVERY[delivery];
  return (
    <Badge fontSize="0.55rem" variant="outline" colorScheme={d.scheme} textTransform="none"
      title={t(d.hint)} mr={1.5} verticalAlign="baseline">
      {t(d.label)}
    </Badge>
  );
}

const VIEW_LABEL: [keyof SkillView, UiKey][] = [
  ['buffs', 'skillViewBuffs'], ['prose', 'skillViewProse'], ['details', 'skillViewDetails'],
];

// One switch per layer, applied to every skill on the page.
function SkillViewToggles() {
  const t = useT();
  const view = useSkillView();
  return (
    <Wrap spacing={1}>
      {VIEW_LABEL.map(([key, label]) => (
        <WrapItem key={key}>
          <Box as="button" aria-pressed={view[key]} onClick={() => view.toggle(key)} px={2} py={0.5}
            fontSize="xs" borderWidth="1px" borderRadius="full"
            borderColor={view[key] ? 'yellow.400' : 'whiteAlpha.200'}
            color={view[key] ? 'yellow.200' : 'gray.500'}>
            {t(label)}
          </Box>
        </WrapItem>
      ))}
    </Wrap>
  );
}

// The unframed kit lets stage enemies reuse skill sets without a character entry.
export function SkillList({ group, defaultStar, data, icons, owner }: {
  group: number | null | undefined; defaultStar?: number | null;
  data: CharacterData; icons: IconManifest | null; owner?: string;
}) {
  const t = useT();
  const lang = useLang();
  const states = kitStates(kitSkills(group, data), lang);
  const entry = { skillSetGroup: group, defaultStar } as CharacterEntry;
  const grades = skillGrades(entry, data);
  const [grade, setGrade] = useState<number | null>(null);
  const shown = grade ?? grades[0] ?? 0;
  const skills = shown ? skillsAtGrade(entry, data, shown) : [];
  if (!skills.length) return null;
  return (
    <>
      <Flex gap={3} mb={3} wrap="wrap" align="center">
        {grades.length > 1 && (
          <HStack spacing={1}>
            <Text fontSize="xs" color="gray.500">{t('dialStar')}</Text>
            {grades.map((g) => (
              <Box key={g} as="button" onClick={() => setGrade(g)} px={2} py={0.5}
                fontSize="xs" borderWidth="1px" borderRadius="md"
                borderColor={g === shown ? 'yellow.400' : 'whiteAlpha.200'}
                color={g === shown ? 'yellow.200' : 'gray.400'}>{g}★</Box>
            ))}
          </HStack>
        )}
        <SkillViewToggles />
      </Flex>
      <VStack align="stretch" spacing={3}>
        {skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} data={data} icons={icons} owner={owner} states={states}
            label={skillLabel(skill, skills, lang)} />
        ))}
      </VStack>
    </>
  );
}

// Passive grades unlock independently of character rarity.
export function Skills({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  if (!skillGrades(entry, data).length) return null;
  return (
    <Panel title={t('tabSkills')}>
      <SkillList group={entry.skillSetGroup} defaultStar={entry.defaultStar}
        data={data} icons={icons} owner={entry.characterType === 1 ? entry.code : undefined} />
    </Panel>
  );
}

const ROTATION_LABEL: Record<string, UiKey> = { start: 'rotationOpening', repeat: 'rotationLoop' };

type Patterns = { start?: BattlePattern[]; repeat?: BattlePattern[] };
type StepSkill = { id: number; skill: SkillEntry } | null;

export function Rotation({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const lang = useLang();
  if (!entry.battlePatterns) return null;
  return (
    <PatternRotation patterns={entry.battlePatterns} data={data} icons={icons}
      states={kitStates(kitSkills(entry.skillSetGroup, data), lang)}
      skillOf={(id) => (data.skills[String(id)] ? { id, skill: data.skills[String(id)] } : null)} />
  );
}

// A stage enemy's steps are `skill_type`s within its own kit.
export function skillByType(group: number | null | undefined, data: CharacterData): (type: number) => StepSkill {
  const grades = data.skillSets[String(group ?? '')] ?? {};
  const top = grades[String(Math.max(0, ...Object.keys(grades).map(Number)))] ?? [];
  const byType = new Map<number, number>();
  for (const id of top) {
    const skill = data.skills[String(id)];
    if (skill) byType.set(skill.skillType, id);
  }
  return (type) => {
    const id = byType.get(type);
    return id != null ? { id, skill: data.skills[String(id)] } : null;
  };
}

// The first loop whose condition holds is re-picked before every cast; a switch restarts that loop.
export function PatternRotation({ patterns, skillOf, data, icons, title, states }: {
  patterns: Patterns; skillOf: (step: number) => StepSkill;
  data: CharacterData; icons: IconManifest | null; title?: string; states?: StateNamer;
}) {
  const t = useT();
  const lang = useLang();
  const timing = useSkillTiming();
  const all = [...(patterns.start ?? []), ...(patterns.repeat ?? [])];
  // Names are ambiguous only when different skills carry the same name.
  const idsByName = new Map<string, Set<number>>();
  for (const rot of all) {
    for (const step of rot.steps) {
      const hit = skillOf(step);
      if (hit) idsByName.set(hit.skill.name ?? '', (idsByName.get(hit.skill.name ?? '') ?? new Set()).add(hit.id));
    }
  }
  const never = shadowedPatterns(patterns.repeat ?? []);
  const rows = (['start', 'repeat'] as const).flatMap((key) => [...(patterns[key] ?? [])]
    .sort((a, b) => a.order - b.order).map((rot) => ({ key, rot })));
  return (
    <Panel title={title ?? t('panelRotation')}>
      <VStack align="stretch" spacing={2}>
        {rows.map(({ key, rot }, i) => {
          const dead = key === 'repeat' && never.has(rot.order);
          const when = patternConditionText(rot.condition, rot.conditionValue, lang, states);
          return (
            <Box key={`${key}-${i}`} opacity={dead ? 0.45 : 1}>
              <Wrap spacing={2} align="baseline" mb={1}>
                <WrapItem><Badge fontSize="0.6rem">{t(ROTATION_LABEL[key])}</Badge></WrapItem>
                {key === 'start' && (
                  <WrapItem><Text fontSize="xs" color="gray.500">{t('rotationOnce')}</Text></WrapItem>
                )}
                {key === 'repeat' && (
                  <WrapItem>
                    <Text fontSize="xs" color={when ? 'cyan.300' : 'gray.500'}>
                      {when || ((patterns.repeat?.length ?? 0) > 1 ? t('rotationOtherwise') : t('rotationAlways'))}
                    </Text>
                  </WrapItem>
                )}
                {dead && (
                  <WrapItem>
                    <Badge fontSize="0.55rem" colorScheme="red" title={t('rotationNeverHint')}>
                      {t('rotationNever')}
                    </Badge>
                  </WrapItem>
                )}
                {rot.name && (
                  <WrapItem>
                    <Text fontSize="xs" color="gray.500">{dataText(lang, rot.name, rot.nameEn)}</Text>
                  </WrapItem>
                )}
              </Wrap>
              <Box overflowX="auto">
                <HStack spacing={1} minW="max-content">
                  {rot.steps.map((step, n) => {
                    const hit = skillOf(step);
                    const skill = hit?.skill;
                    const ambiguous = (idsByName.get(skill?.name ?? '')?.size ?? 0) > 1;
                    return (
                      <HStack key={n} spacing={1}>
                        {n > 0 && <Text fontSize="xs" color="gray.600">→</Text>}
                        <HStack spacing={1} borderWidth="1px" borderRadius="md" px={1.5} py={0.5}
                          borderColor={hit ? 'whiteAlpha.200' : 'red.700'} borderStyle={hit ? 'solid' : 'dashed'}
                          title={hit ? undefined : t('rotationMissing')}>
                          <GameIcon manifest={icons} group="skill" name={skill?.icon} size={4} reserve={false} />
                          <Text fontSize="xs" whiteSpace="nowrap">
                            {!skill ? t('skillSlot', { n: step })
                              : ambiguous ? t('skillSlotName', { n: skill.skillType })
                                : dataText(lang, skill.name, skill.nameEn)}
                          </Text>
                          {hit && timing?.[String(hit.id)] && <TimingText timing={timing[String(hit.id)]} />}
                        </HStack>
                      </HStack>
                    );
                  })}
                </HStack>
              </Box>
            </Box>
          );
        })}
      </VStack>
    </Panel>
  );
}

// Hits closer than BURST_GAP collapse into one "first–last ×n" range.
const BURST_GAP = 0.2;

function hitText(hits: number[]): string {
  const groups: number[][] = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    if (last && h - last[last.length - 1] <= BURST_GAP) last.push(h);
    else groups.push([h]);
  }
  return groups.map((g) => (g.length > 2 ? `${g[0]}–${g[g.length - 1]} ×${g.length}` : g.join(' / '))).join(' / ');
}

function TimingText({ timing }: { timing: SkillTiming }) {
  const t = useT();
  return (
    <Text fontSize="0.6rem" color="blue.200" whiteSpace="nowrap">
      {timing.seconds != null && t('timingUse', { s: timing.seconds })}
      {timing.cooldown != null && ` · ${t('timingDelay', { s: timing.cooldown })}`}
    </Text>
  );
}
