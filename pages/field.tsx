import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Seo } from '@/components/seo';
import { useRouter } from 'next/router';
import {
  Box, HStack, Image, ListItem, Select, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr,
  UnorderedList, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { PageHeader, Panel } from '@altterisk/game-hub';
import {
  ALLY_SLOTS, DEFAULT_APPROACH, ENEMY_SLOTS, FIELD, FIELD_GAME_VERSION, RUN_IN_GAP, settle, type Slot, type SlotTable,
} from '@/lib/battleField';
import { loadCharacters, loadIcons, type CharacterData, type IconManifest } from '@/lib/data';
import { useSpoilerFacts } from '@/lib/spoilers';
import { useSpoilerGate } from '@/components/spoilers';
import { useLang, useT } from '@/lib/i18n';

const AoeStage = dynamic(() => import('@/components/aoeStage'), { ssr: false });

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const LINES = [1, 2, 3] as const;
const LINE_COLOR = { 1: '#ff7a5a', 2: '#ffd25a', 3: '#78beff' } as const;
const ENEMY_COLOR = '#e6465a';

type Counts = Record<1 | 2 | 3, number>;
type Placed = { line: 1 | 2 | 3; index: number; x: number; z: number };

function slotsOf(table: SlotTable, counts: Counts): Placed[] {
  return LINES.flatMap((line) => {
    const n = counts[line];
    if (!n) return [];
    return (table[line][n as 1 | 2 | 3 | 4 | 5] as Slot[]).map(([x, z], index) => ({ line, index, x, z }));
  });
}

function lineUp(table: SlotTable, counts: Counts, side: -1 | 1): Placed[] {
  const raw = slotsOf(table, counts);
  if (!raw.length) return raw;
  const lead = side < 0 ? Math.max(...raw.map((u) => u.x)) : Math.min(...raw.map((u) => u.x));
  return raw.map((u) => ({ ...u, x: side * RUN_IN_GAP / 2 + (u.x - lead) }));
}

// Both lines walk in until every unit has the nearest enemy within its line's typical approach.
function placeBoth(ally: Counts, enemy: Counts): { allies: Placed[]; enemies: Placed[] } {
  const a = lineUp(ALLY_SLOTS, ally, -1);
  const e = lineUp(ENEMY_SLOTS, enemy, 1);
  if (!a.length || !e.length) return { allies: a, enemies: e };
  const { units: walked } = settle([
    ...a.map((u) => ({ x: u.x, z: u.z, r: FIELD.hitRadius, approach: DEFAULT_APPROACH.ally[u.line], side: 1 as const })),
    ...e.map((u) => ({ x: u.x, z: u.z, r: FIELD.hitRadius, approach: DEFAULT_APPROACH.enemy[u.line], side: -1 as const })),
  ]);
  return {
    allies: a.map((u, i) => ({ ...u, x: walked[i].x })),
    enemies: e.map((u, i) => ({ ...u, x: walked[a.length + i].x })),
  };
}

function Points({ items }: { items: ReactNode[] }) {
  return (
    <UnorderedList spacing={1} fontSize="sm" color="gray.300" pl={1}>
      {items.map((item, i) => <ListItem key={i}>{item}</ListItem>)}
    </UnorderedList>
  );
}

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <Box borderRadius="md" overflow="hidden" borderWidth="1px" borderColor="whiteAlpha.200">
      <Image src={`${BASE}/guide/${src}`} alt={alt} w="100%" loading="lazy" />
    </Box>
  );
}

function CountPicker({ label, counts, onChange, color }: {
  label: string; counts: Counts; onChange: (c: Counts) => void; color: (line: 1 | 2 | 3) => string;
}) {
  const lang = useLang();
  const names = { 1: lang === 'ko' ? '전열' : 'Front', 2: lang === 'ko' ? '중열' : 'Middle', 3: lang === 'ko' ? '후열' : 'Back' };
  const total = counts[1] + counts[2] + counts[3];
  return (
    <VStack align="stretch" spacing={1}>
      <Text fontSize="xs" color="gray.400">{label}</Text>
      <Wrap spacing={2}>
        {LINES.map((line) => (
          <WrapItem key={line}>
            <HStack spacing={1}>
              <Box w={2} h={2} borderRadius="full" bg={color(line)} />
              <Text fontSize="xs">{names[line]}</Text>
              <Select size="xs" w="3.5rem" value={counts[line]}
                onChange={(e) => onChange({ ...counts, [line]: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4, 5].filter((n) => n <= 5 - (total - counts[line])).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </HStack>
          </WrapItem>
        ))}
      </Wrap>
    </VStack>
  );
}

function TopDown({ allies, enemies, left, right }: { allies: Placed[]; enemies: Placed[]; left: number; right: number }) {
  const x0 = -21;
  const x1 = 21;
  const scale = 22;
  const w = (x1 - x0) * scale;
  const h = 170;
  const px = (x: number) => (x - x0) * scale;
  const pz = (z: number) => h / 2 - z * 22;
  const r = FIELD.hitRadius * scale;
  return (
    <Box overflowX="auto">
      <Box as="svg" viewBox={`0 0 ${w} ${h + 30}`} minW="720px" w="100%" display="block">
        <rect x={0} y={0} width={w} height={h} fill="#2a2e3c" rx={6} />
        <rect x={px(left)} y={pz(FIELD.boundaryDepth / 2)} width={(right - left) * scale}
          height={FIELD.boundaryDepth * 22} fill="none" stroke="#78ffaa" strokeWidth={2} strokeDasharray="6 4" />
        {Array.from({ length: x1 - x0 - 1 }, (_, i) => x0 + 1 + i).map((x) => (
          <g key={x}>
            <line x1={px(x)} x2={px(x)} y1={h} y2={h + (x % 5 === 0 ? 10 : 5)} stroke="#ccc" />
            {x % 5 === 0 && <text x={px(x)} y={h + 24} fill="#ccc" fontSize={12} textAnchor="middle">{x}</text>}
          </g>
        ))}
        {[...allies.map((u) => ({ ...u, c: LINE_COLOR[u.line] })), ...enemies.map((u) => ({ ...u, c: ENEMY_COLOR }))].map((u, i) => (
          <g key={i}>
            <ellipse cx={px(u.x)} cy={pz(u.z)} rx={r} ry={r * 0.9} fill={u.c} fillOpacity={0.35} stroke={u.c} strokeWidth={2} />
            <text x={px(u.x)} y={pz(u.z) - r - 4} fill="#fff" fontSize={11} textAnchor="middle">{u.x.toFixed(1)}</text>
          </g>
        ))}
      </Box>
    </Box>
  );
}

function SlotTableView({ table, side }: { table: SlotTable; side: string }) {
  const lang = useLang();
  const names = { 1: lang === 'ko' ? '전열' : 'Front', 2: lang === 'ko' ? '중열' : 'Middle', 3: lang === 'ko' ? '후열' : 'Back' };
  return (
    <Box overflowX="auto">
      <Text fontSize="xs" color="gray.400" mb={1}>{side}</Text>
      <Table size="sm" minW="34rem">
        <Thead>
          <Tr><Th>{lang === 'ko' ? '열' : 'Line'}</Th>{[1, 2, 3, 4, 5].map((n) => <Th key={n}>{n}</Th>)}</Tr>
        </Thead>
        <Tbody>
          {LINES.map((line) => (
            <Tr key={line}>
              <Td color={LINE_COLOR[line]} fontWeight="bold">{names[line]}</Td>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <Td key={n} fontFamily="mono" fontSize="xs" whiteSpace="nowrap">
                  {table[line][n].map(([x]) => (x > 0 ? `+${x}` : `${x}`)).join(' / ')}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
}

export default function FieldPage() {
  const t = useT();
  const lang = useLang();
  const L = (en: string, ko: string) => (lang === 'ko' ? ko : en);
  const [ally, setAlly] = useState<Counts>({ 1: 2, 2: 1, 3: 2 });
  const [enemy, setEnemy] = useState<Counts>({ 1: 2, 2: 2, 3: 1 });
  const router = useRouter();
  const aoeUnit = typeof router.query.unit === 'string' ? router.query.unit : undefined;
  const aoeSkill = typeof router.query.skill === 'string' ? router.query.skill : undefined;
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);

  useEffect(() => {
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);
  const facts = useSpoilerFacts();
  const gated = useSpoilerGate(facts && router.isReady ? !!aoeUnit && facts.units.has(aoeUnit) : null, '/field');
  useEffect(() => {
    if (chars && aoeUnit) document.getElementById('aoe')?.scrollIntoView();
  }, [chars, aoeUnit]);

  const plan = useMemo(() => {
    const { allies, enemies } = placeBoth(ally, enemy);
    const center = 0;
    return {
      allies, enemies, center,
      left: center - FIELD.boundaryHalf,
      right: center + FIELD.boundaryHalf,
    };
  }, [ally, enemy]);
  const furthest = plan.enemies.length ? Math.max(...plan.enemies.map((u) => u.x)) : null;

  return (
    <VStack align="stretch" spacing={4}>
      <Seo title={t('navField')} description={t('seoDescField')} />
      <PageHeader title={t('navField')}
        subtitle={`${L('Normal stages', '일반 스테이지')} · ${L('game version', '게임 버전')} ${FIELD_GAME_VERSION}`} />

      <Panel title={L('The field', '전장')}>
        <VStack align="stretch" spacing={3}>
          <Shot src="field_overview.webp" alt={L('Start positions on a battle field', '전장의 시작 위치')} />
          <Points items={[
            L('Distances are in field units, along the battle line (x).', '거리는 전장 단위, 전투 라인(x) 기준.'),
            L('Positions reset every wave. 0 is the midpoint between your front unit and the enemy front unit when the wave starts.',
              '웨이브마다 위치가 초기화됨. 0은 웨이브 시작 시 아군 최전방과 적 최전방의 중간.'),
            L(`Each wave both sides walk in at the same speed, and every unit stops once the nearest enemy it can target (to its edge) is within its approach distance. Approach is a per-character stat, not attack range: most attacks reach the whole field. The fronts end up nearly touching, about the smaller front-line approach + ${FIELD.hitRadius} apart.`,
              `웨이브마다 양측이 같은 속도로 다가가며, 각 유닛은 대상으로 삼을 수 있는 가장 가까운 적(가장자리 기준)이 접근 거리 안에 들어오면 멈춤. 접근 거리는 캐릭터별 수치이며 공격 사거리가 아님(대부분 공격은 전장 전체). 양 최전방은 거의 맞닿음: 전열 접근 거리 중 작은 값 + ${FIELD.hitRadius} 정도.`),
            L(`Planner: units use their line's typical approach (yours ${DEFAULT_APPROACH.ally[1]} / ${DEFAULT_APPROACH.ally[2]} / ${DEFAULT_APPROACH.ally[3]}, enemies ${DEFAULT_APPROACH.enemy[1]} / ${DEFAULT_APPROACH.enemy[2]} / ${DEFAULT_APPROACH.enemy[3]}).`,
              `배치 계산: 열별 대표 접근 거리 사용 (아군 ${DEFAULT_APPROACH.ally[1]} / ${DEFAULT_APPROACH.ally[2]} / ${DEFAULT_APPROACH.ally[3]}, 적 ${DEFAULT_APPROACH.enemy[1]} / ${DEFAULT_APPROACH.enemy[2]} / ${DEFAULT_APPROACH.enemy[3]}).`),
            L(`Depth (z) only spreads a line out; ranges ignore it except circle areas.`, '깊이(z)는 열을 펼칠 뿐, 원형 범위 외에는 거리 계산에 쓰이지 않음.'),
            L(`Every unit is ${FIELD.hitRadius * 2} wide (hit radius ${FIELD.hitRadius}) unless noted on its page.`, `모든 유닛의 폭은 ${FIELD.hitRadius * 2} (히트 반경 ${FIELD.hitRadius}), 별도 표기 제외.`),
          ]} />
        </VStack>
      </Panel>

      <Panel title={L('Formation planner', '배치 계산')}>
        <VStack align="stretch" spacing={3}>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            <CountPicker label={L('Your team', '아군')} counts={ally} onChange={setAlly} color={(l) => LINE_COLOR[l]} />
            <CountPicker label={L('Enemies', '적')} counts={enemy} onChange={setEnemy} color={() => ENEMY_COLOR} />
          </SimpleGrid>
          <TopDown allies={plan.allies} enemies={plan.enemies} left={plan.left} right={plan.right} />
          <Points items={[
            L(`Wave boundary ${plan.left.toFixed(2)} … ${plan.right.toFixed(2)} (centre ${plan.center.toFixed(2)}).`,
              `웨이브 경계 ${plan.left.toFixed(2)} … ${plan.right.toFixed(2)} (중심 ${plan.center.toFixed(2)}).`),
            ...(furthest != null ? [L(
              `A move to "+2 behind the furthest enemy" aims at ${(furthest + 2).toFixed(2)}${furthest + 2 > plan.right ? ` and is clamped to ${(plan.right - FIELD.boundaryInset).toFixed(2)}` : ''}.`,
              `"가장 먼 적 뒤 2" 이동 목표 ${(furthest + 2).toFixed(2)}${furthest + 2 > plan.right ? `, ${(plan.right - FIELD.boundaryInset).toFixed(2)}로 제한됨` : ''}.`,
            )] : []),
            L('Inside a line, units take slots in party order: lowest approach first, then lowest ID.',
              '같은 열 안에서는 파티 순서대로 배치: 접근 거리가 짧은 순, 같으면 ID 순.'),
          ]} />
        </VStack>
      </Panel>

      <Box id="aoe" scrollMarginTop="4rem">
        <Panel title={L('AoE checker', '범위 확인')}>
          {chars
            ? <AoeStage chars={chars} icons={icons} unit={gated ? undefined : aoeUnit} skill={aoeSkill} />
            : <Text fontSize="sm" color="gray.500">{t('loading')}</Text>}
        </Panel>
      </Box>

      <Panel title={L('Start slots', '시작 위치')}>
        <VStack align="stretch" spacing={3}>
          <Text fontSize="sm" color="gray.300">
            {L('x offset from the team origin, by line and by how many units share that line.',
              '열과 해당 열의 인원수에 따른 팀 원점 기준 x 오프셋.')}
          </Text>
          <SlotTableView table={ALLY_SLOTS} side={L('Your team (forward = +x)', '아군 (전방 = +x)')} />
          <SlotTableView table={ENEMY_SLOTS} side={L('Enemies (forward = −x)', '적 (전방 = −x)')} />
          <Text fontSize="xs" color="gray.500">
            {L('Five units in one line use the same spread whichever line it is.', '한 열에 5명이면 열과 관계없이 같은 배치.')}
          </Text>
        </VStack>
      </Panel>

      <Panel title={L('Ranges and hitboxes', '사거리와 판정')}>
        <VStack align="stretch" spacing={3}>
          <Shot src="field_hitbox.webp" alt={L('Unit hit radius', '유닛 히트 반경')} />
          <Points items={[
            L('Every range is measured to the target\'s edge: a target counts once |Δx| − its hit radius ≤ the range.',
              '모든 사거리는 대상의 가장자리까지: |Δx| − 대상 히트 반경 ≤ 사거리이면 포함.'),
            L('"In front": only units on the side the caster faces. Range 99 = the whole field ahead.',
              '"전방": 시전자가 바라보는 쪽만. 사거리 99 = 앞쪽 전장 전체.'),
            L('A line hitbox of width W covers W/2 on each side of its centre, which is the skill\'s target (the caster for self-cast), shifted by its forward offset.',
              '폭 W의 직선 판정은 중심 양쪽으로 W/2. 중심은 스킬 대상(자신 대상이면 시전자)에 전방 오프셋을 더한 위치.'),
            L('A circle hitbox measures straight-line distance, depth included.', '원형 판정은 깊이를 포함한 직선 거리.'),
          ]} />
        </VStack>
      </Panel>

      <Panel title={L('Moves and the boundary', '이동과 경계')}>
        <VStack align="stretch" spacing={3}>
          <Shot src="field_bianca.webp" alt={L('Bianca teleport example', '비앙카 이동 예시')} />
          <Points items={[
            L('A dash or teleport lands at the target\'s centre + offset along the caster→target line (+ past it, − short of it), at the target\'s depth.',
              '돌진/순간이동은 대상 중심 + 오프셋(시전자→대상 방향, + 너머, − 앞)에, 대상의 깊이로 도착.'),
            L(`Landing points outside the wave boundary are pulled inside (right edge − ${FIELD.boundaryInset}).`,
              `웨이브 경계 밖이면 안쪽으로 당겨짐 (오른쪽 끝 − ${FIELD.boundaryInset}).`),
            L(`The boundary is fixed when the wave starts: ${FIELD.boundaryHalf * 2} wide, −${FIELD.boundaryHalf} … +${FIELD.boundaryHalf}.`,
              `경계는 웨이브 시작 시 고정: 폭 ${FIELD.boundaryHalf * 2}, −${FIELD.boundaryHalf} … +${FIELD.boundaryHalf}.`),
            L('It only limits knockback, dashes, directional moves and confusion/fear movement; walking ignores it.',
              '넉백, 돌진, 방향 이동, 혼란/공포 이동에만 적용. 걷기는 무시.'),
            L('Example (stage 1004105 wave 1, 2/1/2 vs 2/2/1): the furthest enemy is at +8.15, so Bianca lands at +10.15, behind it and 18.0 from a back-line Kouchou (Halloween) at −7.85.',
              '예시 (스테이지 1004105 1웨이브, 2/1/2 대 2/2/1): 가장 먼 적이 +8.15에 있어 비앙카는 그 뒤 +10.15에 착지, −7.85의 후열 홍접(할로윈)과 18.0 거리.'),
          ]} />
        </VStack>
      </Panel>
    </VStack>
  );
}
