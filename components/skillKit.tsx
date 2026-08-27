// Skill kits show structure without implying undecoded battle arithmetic.
import { useState } from 'react';
import { Badge, Box, Flex, HStack, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import {
  BUFF_CATEGORY, MOVE_LABEL, OP_LABEL, OP_SCHEME, SETUP_CONDITION_LABEL, SIDE_LABEL,
  SKILL_CATEGORY_LABEL, STAT_LABEL, TARGET_LABEL, TRIGGER_LABEL, castSummary, colorRuns,
  detailSummary, everySecondsText, gateSummary, hitSummary, labelOf, opAmounts, opSeconds,
  scaleSummary, secondsText, skillDescs, skillGrades, skillsAtGrade, statAmount,
} from '@/lib/characters';
import { dataText, useLang, useT, type UiKey } from '@/lib/i18n';
import type {
  BuffEntry, CharacterData, CharacterEntry, IconManifest, SkillBehaviour, SkillEntry,
  SkillOp,
} from '@/lib/data';

export function Panel({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="xl"
      bg="linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))"
      boxShadow="0 12px 32px rgba(0,0,0,0.12)" p={{ base: 3, md: 4 }}>
      <Flex align="baseline" gap={2} mb={3} wrap="wrap">
        <Text fontSize="0.65rem" color="gray.400" textTransform="uppercase"
          fontWeight="700" letterSpacing="0.11em">{title}</Text>
        {note && <Text fontSize="xs" color="gray.600">{note}</Text>}
      </Flex>
      {children}
    </Box>
  );
}

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
        const cat = BUFF_CATEGORY[buff.categorize];
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
                {cat && (
                  <WrapItem>
                    <Badge fontSize="0.55rem" colorScheme={cat.scheme}>{cat.label[lang]}</Badge>
                  </WrapItem>
                )}
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
function OpRow({ op, level, period, data, icons }: {
  op: SkillOp; level: number; period: number;
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
    op.applyTo && op.applyTo !== 'HOLDER'
      ? t('onSide', { side: labelOf(SIDE_LABEL, op.applyTo, lang) }) : '',
  ].filter(Boolean).join(' · ');
  const scale = scaleSummary(op, lang);
  const amounts = opAmounts(op, level, period);
  const seconds = opSeconds(op, level, period, lang);
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
      {amounts.length > 0 && (
        <Text fontSize="xs" color="yellow.200">{amounts.join(' / ')}</Text>
      )}
      {scale && <Text fontSize="0.65rem" color="gray.400">{scale}</Text>}
      {detail.length > 0 && (
        <Text fontSize="0.65rem" color="gray.300" noOfLines={1}
          title={detail.join(', ')}>
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
  const { hits, moves, stats, triggers } = behaviour;
  const on = (cast: string) => (lang === 'ko' ? ` · 대상: ${cast}` : ` · on ${cast}`);

  return (
    <VStack align="stretch" spacing={1.5} mt={2} pt={2}
      borderTopWidth="1px" borderColor="whiteAlpha.100">
      {(moves ?? []).length > 0 && (
        <Text fontSize="xs" color="gray.400">
          {(moves ?? []).map((m) => labelOf(MOVE_LABEL, m, lang)).join(', ')}
        </Text>
      )}

      {(hits ?? []).map((hit, i) => (
        <Box key={i}>
          <Text fontSize="0.65rem" color="gray.500">
            {hitSummary(hit, lang)}
            {hit.cast && castSummary(hit.cast, lang) && on(castSummary(hit.cast, lang))}
          </Text>
          <VStack align="stretch" spacing={0.5} mt={0.5}>
            {hit.ops.map((op, j) => (
              <OpRow key={j} op={op} level={level} period={period} data={data}
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

// Skills level independently; passives use star grade and normal attacks have no level.
export function SkillRow({ skill, data, icons, showSlot }: {
  skill: SkillEntry & { id: number }; data: CharacterData;
  icons: IconManifest | null; showSlot?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [level, setLevel] = useState(1);
  const descs = skillDescs(skill, lang);
  const at = Math.min(level, descs.length) - 1;
  return (
    <Flex gap={3} align="start" borderTopWidth="1px" borderColor="whiteAlpha.100" pt={2}>
      <GameIcon manifest={icons} group="skill" name={skill.icon} size={9} borderRadius="md" />
      <Box minW={0} flex="1">
        <Wrap spacing={2} align="center">
          <WrapItem>
            <Text fontSize="sm" fontWeight="bold">
              {dataText(lang, skill.name, skill.nameEn)}
            </Text>
          </WrapItem>
          {showSlot && (
            <WrapItem>
              <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">
                {t('skillSlot', { n: skill.skillType })}
              </Text>
            </WrapItem>
          )}
          <WrapItem>
            <Badge fontSize="0.6rem">{SKILL_CATEGORY_LABEL[skill.categorize]?.[lang]}</Badge>
          </WrapItem>
          {skill.openStar > 1 && (
            <WrapItem>
              <Badge fontSize="0.6rem" colorScheme="yellow">{skill.openStar}★</Badge>
            </WrapItem>
          )}
          {skill.levelable && (
            <WrapItem>
              <HStack spacing={1}>
                <Text fontSize="0.65rem" color="gray.600">{t('skillLevel')}</Text>
                {descs.map((_d, i) => (
                  <Box key={i} as="button" onClick={() => setLevel(i + 1)} px={1.5}
                    fontSize="0.65rem" borderWidth="1px" borderRadius="sm"
                    borderColor={i === at ? 'yellow.400' : 'whiteAlpha.200'}
                    color={i === at ? 'yellow.200' : 'gray.500'}>{i + 1}</Box>
                ))}
              </HStack>
            </WrapItem>
          )}
        </Wrap>
        <Text fontSize="sm" color="gray.300" mt={0.5}>
          <GameText text={descs[at] ?? ''} />
        </Text>
        <BuffList buffs={skill.buffs[at] ?? []} icons={icons} />
        {skill.behaviour && (
          <Behaviour behaviour={skill.behaviour} level={at + 1}
            period={skill.levelPeriod} data={data} icons={icons} />
        )}
      </Box>
    </Flex>
  );
}

// The unframed kit lets stage enemies reuse skill sets without a character entry.
export function SkillList({ group, defaultStar, data, icons }: {
  group: number | null | undefined; defaultStar?: number | null;
  data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const entry = { skillSetGroup: group, defaultStar } as CharacterEntry;
  const grades = skillGrades(entry, data);
  const [grade, setGrade] = useState<number | null>(null);
  const shown = grade ?? grades[0] ?? 0;
  const skills = shown ? skillsAtGrade(entry, data, shown) : [];
  if (!skills.length) return null;
  return (
    <>
      {grades.length > 1 && (
        <HStack spacing={1} mb={3}>
          <Text fontSize="xs" color="gray.500">{t('dialStar')}</Text>
          {grades.map((g) => (
            <Box key={g} as="button" onClick={() => setGrade(g)} px={2} py={0.5}
              fontSize="xs" borderWidth="1px" borderRadius="md"
              borderColor={g === shown ? 'yellow.400' : 'whiteAlpha.200'}
              color={g === shown ? 'yellow.200' : 'gray.400'}>{g}★</Box>
          ))}
        </HStack>
      )}
      <VStack align="stretch" spacing={3}>
        {skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} data={data} icons={icons}
            // The slot number distinguishes enemy skills that share a placeholder name.
            showSlot={skills.filter((s) => s.name === skill.name).length > 1} />
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
        data={data} icons={icons} />
    </Panel>
  );
}

// Rotation lists are alternatives selected by condition with an unconditional fallback.
const ROTATION_LABEL: Record<string, UiKey> = { start: 'rotationOpening', repeat: 'rotationLoop' };

export function Rotation({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const patterns = entry.battlePatterns;
  if (!patterns) return null;
  // Names are ambiguous only when different skills carry the same name.
  const idsByName = new Map<string, Set<number>>();
  for (const rot of [...(patterns.start ?? []), ...(patterns.repeat ?? [])]) {
    for (const id of rot.steps) {
      const name = data.skills[String(id)]?.name ?? '';
      idsByName.set(name, (idsByName.get(name) ?? new Set()).add(id));
    }
  }
  return (
    <Panel title={t('panelRotation')}>
      <VStack align="stretch" spacing={2}>
        {(['start', 'repeat'] as const).flatMap((key) => (patterns[key] ?? []).map((rot, i) => (
          <Box key={`${key}-${i}`}>
            <Wrap spacing={2} align="baseline" mb={1}>
              <WrapItem><Badge fontSize="0.6rem">{t(ROTATION_LABEL[key])}</Badge></WrapItem>
              {rot.name && (
                <WrapItem>
                  <Text fontSize="xs" color="gray.500">
                    {dataText(lang, rot.name, rot.nameEn)}
                  </Text>
                </WrapItem>
              )}
            </Wrap>
            <Box overflowX="auto">
              <HStack spacing={1} minW="max-content">
                {rot.steps.map((id, step) => {
                  const skill = data.skills[String(id)];
                  const ambiguous = (idsByName.get(skill?.name ?? '')?.size ?? 0) > 1;
                  return (
                    <HStack key={step} spacing={1}>
                      {step > 0 && <Text fontSize="xs" color="gray.600">→</Text>}
                      <HStack spacing={1} borderWidth="1px" borderColor="whiteAlpha.200"
                        borderRadius="md" px={1.5} py={0.5}>
                        <GameIcon manifest={icons} group="skill" name={skill?.icon}
                          size={4} reserve={false} />
                        <Text fontSize="xs" whiteSpace="nowrap">
                          {skill ? dataText(lang, skill.name, skill.nameEn) : id}
                        </Text>
                        {ambiguous && skill && (
                          <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">
                            {skill.skillType}
                          </Text>
                        )}
                      </HStack>
                    </HStack>
                  );
                })}
              </HStack>
            </Box>
          </Box>
        )))}
      </VStack>
    </Panel>
  );
}
