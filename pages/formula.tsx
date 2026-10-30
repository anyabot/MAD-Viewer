import { useEffect, useState, type ReactNode } from 'react';
import { Seo } from '@/components/seo';
import { Box, HStack, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Wrap, Stack } from '@altterisk/game-hub/ui';
import { LoadState, PageHeader, Panel } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { typeIcons, typeLabel, typeTint } from '@/lib/characters';
import {
  ATTRIBUTE_SUPERIORITY, BATTLE, FORMULA_GAME_VERSION, FORMULA_UPDATED, criticalChance,
  defenseFactor, levelGapFactor, missChance, penetrationFactor,
} from '@/lib/formula';
import { dataText, useLang, useT } from '@/lib/i18n';
import { loadCharacters, loadIcons, type CharacterData, type IconManifest } from '@/lib/data';

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;

function Formula({ children }: { children: ReactNode }) {
  return (
    <Box as="pre" fontFamily="mono" fontSize={{ base: 'xs', md: 'sm' }} whiteSpace="pre"
      overflowX="auto" bg="blackAlpha.400" borderWidth="1px" borderColor="whiteAlpha.200"
      borderRadius="md" px={3} py={2} color="accent.200">
      {children}
    </Box>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <Stack as="ul" spacing={1} fontSize="sm" color="gray.300" ml="1em" pl={1} listStyleType="disc">
      {items.map((item) => <Box as="li" key={item}>{item}</Box>)}
    </Stack>
  );
}

function ValueTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <Box overflowX="auto">
      <Table size="sm" variant="simple" minW="14rem" maxW="24rem">
        <Thead><Tr><Th>{head[0]}</Th><Th isNumeric>{head[1]}</Th></Tr></Thead>
        <Tbody>
          {rows.map(([a, b]) => (
            <Tr key={a}><Td fontFamily="mono">{a}</Td><Td isNumeric fontFamily="mono">{b}</Td></Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
}

export default function FormulaPage() {
  const t = useT();
  const lang = useLang();
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  if (error || !chars) {
    return <LoadState loading error={error} labels={{ loading: t('loading'), error }} />;
  }

  const stat = (key: string) => {
    const row = chars.statTypes[key];
    return row ? dataText(lang, row.name, row.en) : key;
  };
  const L = (en: string, ko: string) => (lang === 'ko' ? ko : en);
  const attribute = (value: number) => {
    const row = chars.types.attribute[String(value)] ?? null;
    return (
      <HStack spacing={1} display="inline-flex">
        <GameIcon manifest={icons} group="ui" names={typeIcons(row)} size={5}
          tint={typeTint(row)} reserve={false} />
        <Text as="span" color={row?.color} fontWeight="bold">{typeLabel(row, lang)}</Text>
      </HStack>
    );
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Seo title={t('navFormula')} description={t('seoDescFormula')} />
      <PageHeader title={t('navFormula')}
        subtitle={`${L('Last updated', '최종 수정')}: ${FORMULA_UPDATED} · ${L('game version', '게임 버전')} ${FORMULA_GAME_VERSION}`} />

      <Panel title={L('Order', '처리 순서')}>
        <Stack as="ol" spacing={1} fontSize="sm" color="gray.300" ml="1em" pl={1} listStyleType="decimal">
          <Box as="li">{L('Physical damage immunity → no damage', '물리 피해 면역 → 피해 없음')}</Box>
          <Box as="li">{L('Hit / miss', '명중 / 빗나감')}</Box>
          <Box as="li">{L('Critical', '치명')}</Box>
          <Box as="li">{L('Damage (rounded down)', '피해 계산 (소수점 버림)')}</Box>
          <Box as="li">{L('Shield, then HP', '보호막, 이후 체력')}</Box>
        </Stack>
      </Panel>

      <Panel title={L('Damage', '피해')}>
        <VStack align="stretch" spacing={3}>
          <Formula>{'damage = ⌊ (I × D × C + I × P) × A × R × L × S ⌋'}</Formula>
          <Box overflowX="auto">
            <Table size="sm" minW="20rem">
              <Tbody>
                {([
                  ['I', L('Raw value', '원본 수치')],
                  ['D', L('Defense', '방어')],
                  ['C', L('Critical (1 if not critical)', '치명 (치명이 아니면 1)')],
                  ['P', L('Penetration', '관통')],
                  ['A', L('Attribute', '속성')],
                  ['R', L('Damage reduction', '피해 감소')],
                  ['L', L('Level gap', '레벨 차이')],
                  ['S', L('Skill damage stat', '스킬 피해 스탯')],
                ] as [string, string][]).map(([k, v]) => (
                  <Tr key={k}><Td fontFamily="mono" color="accent.200" w="3rem">{k}</Td><Td>{v}</Td></Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
          <Points items={[L('I × P ignores defense and critical.', 'I × P는 방어와 치명 미적용.')]} />
        </VStack>
      </Panel>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        <Panel title={L('Raw value (I)', '원본 수치 (I)')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{'I = max(1, stat × coefficient × weight)'}</Formula>
            <Points items={[
              L('Stat: set per effect, from the attacker or the target.', '스탯: 효과마다 지정, 공격자 또는 대상 기준.'),
              L('Coefficient: the skill\'s multiplier.', '계수: 스킬 배율.'),
              L('Weight: per hit, in %.', '가중치: 타격별 %.'),
            ]} />
          </VStack>
        </Panel>

        <Panel title={L('Hit / miss', '명중 / 빗나감')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`x    = ${stat('EVASION')} − ${stat('ACCURACY')}\nmiss = min(${pct(BATTLE.evasionRateMax, 0)}, x / (x + ${BATTLE.evasionConstant}))`}</Formula>
            <Points items={[
              L(`${stat('ACCURACY')} ≥ ${stat('EVASION')}: always hits.`, `${stat('ACCURACY')} ≥ ${stat('EVASION')}: 항상 명중.`),
              L('Damage over time and healing: always hit.', '지속 피해, 치유: 항상 명중.'),
            ]} />
            <ValueTable head={[`${stat('EVASION')} − ${stat('ACCURACY')}`, L('Miss', '빗나감')]}
              rows={[50, 100, 200, 300, 500, 700].map((g) => [String(g), pct(missChance(g))])} />
          </VStack>
        </Panel>

        <Panel title={L('Critical (C)', '치명 (C)')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`chance = (${stat('PHYSICS_CRITICAL_CHANCE')} − ${stat('CRITICAL_CHANCE_RESIST')}) × 0.05%\nC      = clamp(${stat('PHYSICS_CRITICAL_DAMAGE')} − ${stat('CRITICAL_POWER_ADD_RESIST')}, ${BATTLE.criticalDamageMin}, ${BATTLE.criticalDamageMax})`}</Formula>
            <Points items={[
              L('Chance: 0% to 100%.', '확률: 0% ~ 100%.'),
              L('Forced-critical skills use their own chance.', '확정 치명 스킬은 자체 확률 사용.'),
            ]} />
            <ValueTable head={[`${stat('PHYSICS_CRITICAL_CHANCE')} − ${stat('CRITICAL_CHANCE_RESIST')}`, L('Chance', '확률')]}
              rows={[40, 100, 200, 500, 1000, 2000].map((g) => [String(g), pct(criticalChance(g), 2)])} />
          </VStack>
        </Panel>

        <Panel title={L('Defense (D)', '방어 (D)')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`D = ${BATTLE.defenseConstant} / (${BATTLE.defenseConstant} + ${stat('PHYSICS_DEFENSE')})`}</Formula>
            <ValueTable head={[stat('PHYSICS_DEFENSE'), 'D']}
              rows={[100, 300, 600, 900, 1200, 1800].map((d) => [String(d), pct(defenseFactor(d))])} />
          </VStack>
        </Panel>

        <Panel title={L('Penetration (P)', '관통 (P)')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`p = ${stat('PENETRATION')} − ${stat('PENETRATION_DEFEND')}\nP = max(0, ${BATTLE.pierceRateMax} × p / (p + ${BATTLE.pierceConstant}))`}</Formula>
            <Points items={[
              L('Below 30%.', '30% 미만.'),
              L('Forced-penetration skills use their own value.', '확정 관통 스킬은 자체 수치 사용.'),
            ]} />
            <ValueTable head={[`${stat('PENETRATION')} − ${stat('PENETRATION_DEFEND')}`, 'P']}
              rows={[100, 250, 500, 1000, 2000].map((g) => [String(g), pct(penetrationFactor(g))])} />
          </VStack>
        </Panel>

        <Panel title={L('Attribute (A)', '속성 (A)')}>
          <VStack align="stretch" spacing={1.5}>
            {ATTRIBUTE_SUPERIORITY.map(([from, to]) => (
              <Wrap key={from} spacing={2} align="center" fontSize="sm">
                {attribute(from)}
                <Text as="span" color="gray.500">→</Text>
                {attribute(to)}
                <Text as="span" fontFamily="mono" color="accent.200">
                  ×{(1 + BATTLE.attributeBonus).toFixed(1)}
                </Text>
              </Wrap>
            ))}
            <Text fontSize="sm" color="gray.300" pt={1}>{L('Any other pair: ×1.', '그 외: ×1.')}</Text>
          </VStack>
        </Panel>

        <Panel title={L('Damage reduction (R)', '피해 감소 (R)')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{'R = max(0, 1 − Σ(reduction × stacks))'}</Formula>
            <Points items={[
              L('Sum of all active damage reduction effects on the target.', '대상에게 적용 중인 피해 감소 효과의 합.'),
            ]} />
          </VStack>
        </Panel>

        <Panel title={L('Level gap (L)', '레벨 차이 (L)')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`L = 1 − clamp(${BATTLE.levelGapRate} × (target level − attacker level), 0, ${BATTLE.levelGapRateMax})`}</Formula>
            <Points items={[
              L('Unit level. No bonus when the attacker is higher.', '유닛 레벨 기준. 공격자가 높아도 보너스 없음.'),
            ]} />
            <ValueTable head={[L('Target − attacker', '대상 − 공격자'), 'L']}
              rows={[0, 1, 3, 5, 8, 10].map((g) => [`+${g}`, pct(levelGapFactor(g), 0)])} />
          </VStack>
        </Panel>

        <Panel title={L('Skill damage stat (S)', '스킬 피해 스탯 (S)')}>
          <VStack align="stretch" spacing={3}>
            <Box overflowX="auto">
              <Table size="sm" minW="16rem" maxW="24rem">
                <Thead><Tr><Th>{L('Skill', '스킬')}</Th><Th>{L('Stat', '스탯')}</Th></Tr></Thead>
                <Tbody>
                  {([
                    [L('Basic attack', '일반 공격'), 'NORMAL_ATTACK_DAMAGE_RATE'],
                    [L('Skill 1', '스킬 1'), 'SKILL_01_DAMAGE_RATE'],
                    [L('Skill 2', '스킬 2'), 'SKILL_02_DAMAGE_RATE'],
                    [L('Burst', '버스트'), 'SPECIAL_SKILL_DAMAGE_RATE'],
                  ] as [string, string][]).map(([k, v]) => (
                    <Tr key={k}><Td>{k}</Td><Td>{stat(v)}</Td></Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
            <Points items={[
              L('Source: Aura Infusion, game mode modifiers.', '출처: 성력 주입, 게임 모드 보정.'),
              L('Other skills: ×1.', '그 외 스킬: ×1.'),
            ]} />
          </VStack>
        </Panel>

        <Panel title={L('Damage over time', '지속 피해')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{'damage = ⌊ I × D × A × R × L ⌋'}</Formula>
            <Points items={[
              L('No miss, no critical, no penetration, no S.', '빗나감, 치명, 관통, S 없음.'),
            ]} />
          </VStack>
        </Panel>

        <Panel title={L('Healing', '치유')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`heal = ⌊ max(1, stat × coefficient × weight × ${stat('HEAL_RECEIVE')}) ⌋`}</Formula>
            <Points items={[
              L(`${stat('HEAL_RECEIVE')}: the target's, base 100%.`, `${stat('HEAL_RECEIVE')}: 대상 기준, 기본 100%.`),
              L('No miss, no critical, no defense, no level gap.', '빗나감, 치명, 방어, 레벨 차이 없음.'),
            ]} />
          </VStack>
        </Panel>

        <Panel title={L('Debuff and CC chance', '해로운 효과·상태 이상 확률')}>
          <VStack align="stretch" spacing={3}>
            <Formula>{`chance = skill chance × (1 − ${stat('RESIST_NORMAL_DEBUFF')})`}</Formula>
            <Points items={[
              L('Applies to debuffs, crowd control and movement control.', '해로운 효과, 상태 이상, 이동 제어에 적용.'),
              L('Other effects: skill chance only.', '그 외 효과: 스킬 확률만 적용.'),
              L(`${stat('ACCURACY')} and ${stat('EVASION')} are not used.`, `${stat('ACCURACY')}, ${stat('EVASION')} 미사용.`),
            ]} />
          </VStack>
        </Panel>
      </SimpleGrid>
    </VStack>
  );
}
