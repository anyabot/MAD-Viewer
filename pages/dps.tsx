import { useSpoilerUnit } from '@/lib/spoilers';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Seo } from '@/components/seo';
import NextLink from '@/components/appLink';
import {
  Box, Button, Checkbox, HStack, Select, SimpleGrid, Slider, SliderFilledTrack, SliderThumb,
  SliderTrack, Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Wrap, WrapItem,
} from '@altterisk/game-hub/ui';
import { LoadState, PageHeader, Panel } from '@altterisk/game-hub';
import {
  loopPatterns, skillLevelCaps, stackInputs, unitYield, type Build, type Rotation, type Target, type UnitYield,
} from '@/lib/dps';
import {
  loadCharacters, loadIcons, loadSkillTiming, type CharacterData, type IconManifest, type SkillTiming,
} from '@/lib/data';
import { FORMULA_GAME_VERSION } from '@/lib/formula';
import { dataText, useLang, useT } from '@/lib/i18n';
import { characterHref } from '@/lib/routes';

const COLORS = ['#ff7a5a', '#ffd25a', '#78beff', '#78ffaa', '#c58bff', '#ff8ad8'];
const DEFAULT_UNITS = ['CH0058', 'CH0007', 'CH0068', 'CH0021'];
const DEFENSE_MAX = 3000;
const ROTATIONS: { value: Rotation; en: string; ko: string }[] = [
  { value: 'full', en: 'Opening, loop and burst on cooldown', ko: '오프닝, 루프, 쿨마다 버스트' },
  { value: 'noBurst', en: 'Opening then loop, no burst', ko: '오프닝 후 루프, 버스트 없음' },
  { value: 'opening', en: 'Opening only', ko: '오프닝만' },
  { value: 'loop', en: 'Loop only', ko: '루프만' },
  { value: 'burst', en: 'Burst only', ko: '버스트만' },
];
const PRESETS: { en: string; ko: string; target: Partial<Target> }[] = [
  { en: 'No defense', ko: '방어 없음', target: { defense: 0, evasion: 0 } },
  { en: 'Light', ko: '낮음', target: { defense: 300, evasion: 50 } },
  { en: 'Heavy', ko: '높음', target: { defense: 1200, evasion: 150 } },
  { en: 'Evasive', ko: '회피형', target: { defense: 300, evasion: 400 } },
];

function gearTiers(data: CharacterData): { tier: number; maxLevel: number }[] {
  const caps = new Map<number, number>();
  for (const slot of Object.values(data.equipment)) {
    for (const row of slot.tiers ?? []) caps.set(row.tier, Math.max(caps.get(row.tier) ?? 0, row.maxLevel));
  }
  return [...caps].sort((a, b) => a[0] - b[0]).map(([tier, maxLevel]) => ({ tier, maxLevel }));
}

function fmt(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v.toFixed(0);
}

function Dial({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <VStack align="stretch" spacing={0}>
      <HStack justify="space-between">
        <Text fontSize="xs" color="gray.400">{label}</Text>
        <Text fontSize="xs" fontFamily="mono">{value}</Text>
      </HStack>
      <Slider aria-label={label} min={min} max={max} step={step} value={value} onChange={onChange} py={2}
        style={{ '--slider-thumb-size': '12px', '--slider-track-size': '4px' } as CSSProperties}>
        <SliderTrack bg="whiteAlpha.200"><SliderFilledTrack bg="accent.400" /></SliderTrack>
        <SliderThumb boxSize={3} />
      </Slider>
    </VStack>
  );
}

function DefenseCurve({ units, chars, target, build, timing, appear, rotation, lang, patterns, stacks }: {
  units: string[]; chars: CharacterData; target: Target; build: Build;
  timing: Record<string, SkillTiming>; appear: Record<string, number>; rotation: Rotation; lang: 'en' | 'ko'; patterns: Record<string, number>;
  stacks: Record<string, Record<string, number>>;
}) {
  const steps = 16;
  const series = units.map((code) => Array.from({ length: steps + 1 }, (_, i) => {
    const y = unitYield(code, chars, build, { ...target, defense: (DEFENSE_MAX * i) / steps }, timing, patterns[code], rotation, stacks[code], appear);
    return y ? y.dps : 0;
  }));
  const top = Math.max(1, ...series.flat());
  const w = 640;
  const h = 220;
  const px = (i: number) => 40 + (i / steps) * (w - 50);
  const py = (v: number) => h - 24 - (v / top) * (h - 40);
  return (
    <Box overflowX="auto">
      <Box as="svg" viewBox={`0 0 ${w} ${h}`} minW="480px" w="100%" display="block">
        <rect x={0} y={0} width={w} height={h} fill="#2a2e3c" rx={6} />
        {[0, 0.5, 1].map((r) => (
          <g key={r}>
            <line x1={40} x2={w - 10} y1={py(top * r)} y2={py(top * r)} stroke="#444" />
            <text x={34} y={py(top * r) + 4} fill="#aaa" fontSize={11} textAnchor="end">{fmt(top * r)}</text>
          </g>
        ))}
        {[0, 1000, 2000, 3000].map((d) => (
          <text key={d} x={px((d / DEFENSE_MAX) * steps)} y={h - 8} fill="#aaa" fontSize={11} textAnchor="middle">{d}</text>
        ))}
        <line x1={px((target.defense / DEFENSE_MAX) * steps)} x2={px((target.defense / DEFENSE_MAX) * steps)}
          y1={10} y2={h - 24} stroke="#fff" strokeDasharray="3 3" strokeOpacity={0.5} />
        {series.map((pts, k) => (
          <polyline key={units[k]} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={2.5}
            points={pts.map((v, i) => `${px(i)},${py(v)}`).join(' ')} />
        ))}
      </Box>
      <Text fontSize="xs" color="gray.500" mt={1}>
        {lang === 'ko' ? '대상 방어력(가로) 대비 DPS. 점선: 현재 값.' : 'DPS against target defense (x axis). Dashed: current value.'}
      </Text>
    </Box>
  );
}

export default function DpsPage() {
  const t = useT();
  return <><Seo title={t('navDps')} description={t('seoDescDps')} /><DpsContent /></>;
}

function DpsContent() {
  const spoilerUnit = useSpoilerUnit();
  const t = useT();
  const lang = useLang();
  const L = (en: string, ko: string) => (lang === 'ko' ? ko : en);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [timing, setTiming] = useState<Record<string, SkillTiming> | null>(null);
  const [appear, setAppear] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [build, setBuild] = useState<Build>({
    level: 0, star: 0, skillLevel: 0, burstLevel: 0, gearTier: -1, gearLevel: 0, infusion: true, love: true,
  });
  const [target, setTarget] = useState<Target>({
    defense: 300, evasion: 50, critResist: 0, critDamageResist: 0, penetrationResist: 0,
    levelGap: 0, advantage: false, maxLife: 10000, hpRate: 1, marked: false, seconds: 120,
  });
  const [patterns, setPatterns] = useState<Record<string, number>>({});
  const [stacks, setStacks] = useState<Record<string, Record<string, number>>>({});
  const [rotation, setRotation] = useState<Rotation>('full');

  useEffect(() => {
    loadCharacters().then((c) => {
      setChars(c);
      const levels = skillLevelCaps(c);
      setBuild((b) => ({
        ...b, level: b.level || c.statCaps.level, star: b.star || c.statCaps.star,
        skillLevel: b.skillLevel || levels.skill, burstLevel: b.burstLevel || levels.burst,
        ...(b.gearTier < 0 ? { gearTier: gearTiers(c).at(-1)?.tier ?? 0, gearLevel: gearTiers(c).at(-1)?.maxLevel ?? 1 } : {}),
      }));
    }).catch((e) => setError(String(e)));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadSkillTiming().then((d) => { setTiming(Object.assign({}, ...Object.values(d.characters))); setAppear(d.appear ?? {}); })
      .catch((e) => setError(String(e)));
  }, []);

  const roster = useMemo(() => (chars ? Object.entries(chars.characters)
    .filter(([code, e]) => e.characterType === 1 && !e.unreleased && !spoilerUnit(code) && e.battlePatterns?.repeat?.length)
    .map(([code, e]) => ({ code, name: dataText(lang, e.name, e.nameEn) }))
    .sort((a, b) => a.name.localeCompare(b.name)) : []), [chars, lang, spoilerUnit]);

  const rows = useMemo(() => {
    if (!chars || !timing || !build.level) return [];
    return units.map((code) => unitYield(code, chars, build, target, timing, patterns[code], rotation, stacks[code], appear))
      .filter((y): y is UnitYield => !!y);
  }, [chars, timing, appear, units, build, target, patterns, rotation, stacks]);

  if (error || !chars || !timing) {
    return <LoadState loading={!error} error={error} labels={{ loading: t('loading'), error }} />;
  }
  const value = (y: UnitYield) => y.dps;
  const healValue = (y: UnitYield) => y.hps;
  const levels = skillLevelCaps(chars);
  const gearCap = gearTiers(chars).find((row) => row.tier === build.gearTier)?.maxLevel ?? 0;
  const ranked = [...rows].sort((a, b) => value(b) - value(a));
  const best = Math.max(1, ...rows.map(value));
  const bestHeal = Math.max(1, ...rows.map(healValue));
  const color = (code: string) => COLORS[units.indexOf(code) % COLORS.length];
  const statName = (k: string) => dataText(lang, chars.statTypes[k]?.name, chars.statTypes[k]?.en) || k;
  const amount = (k: string, v: number) => (chars.statTypes[k]?.display === 2 ? `${(v * 100).toFixed(0)}%` : v.toFixed(0));
  const breakdown = (y: UnitYield) => [
    `${y.star}★`,
    ...y.triggers.map((g) => `${lang === 'ko' ? g.label : g.labelEn} ${g.perMinute.toFixed(1)}${L('/min', '회/분')}`),
    ...y.sources.map((g) => `${lang === 'ko' ? g.label : g.labelEn} ${fmt(g.dps)} DPS`),
    ...y.passive.map((g) => `${L('Passive', '패시브')} ${statName(g.stat)} +${amount(g.stat, g.amount)}`),
    ...y.buffs.filter((g) => g.amount > 1e-9).map((g) => `${g.label} ${statName(g.stat)} +${amount(g.stat, g.amount)} ${L('avg', '평균')}`),
    ...y.debuffs.filter((g) => g.amount > 1e-9).map((g) => `${g.label} ${L('target', '대상')} ${statName(g.stat)} −${amount(g.stat, g.amount)} ${L('avg', '평균')}`),
    ...y.conditions.filter((c) => c.label).map((c) => `${lang === 'ko' ? c.label : c.labelEn} ${(c.chance * 100).toFixed(0)}% ${L('uptime', '유지')}`),
  ];
  const name = (code: string) => dataText(lang, chars.characters[code]?.name, chars.characters[code]?.nameEn);
  const iconUrl = (code: string) => {
    const icon = chars.characters[code]?.iconPath;
    return icon && icons ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icons/char/${icon}.webp` : null;
  };

  return (
    <VStack align="stretch" spacing={4}>
      <PageHeader title={t('navDps')}
        subtitle={`${L('Expected damage and healing per second on one target', '대상 1명 기준 초당 기대 피해·치유')} · ${L('game version', '게임 버전')} ${FORMULA_GAME_VERSION}`} />

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4}>
        <Panel title={L('Units', '유닛')}>
          <VStack align="stretch" spacing={2}>
            {units.map((code, i) => (
              <VStack key={i} align="stretch" spacing={1}>
              <HStack spacing={2}>
                <Box w={3} h={3} borderRadius="full" bg={COLORS[i % COLORS.length]} flexShrink={0} />
                <Select size="sm" value={code} onChange={(e) => setUnits(units.map((c, j) => (j === i ? e.target.value : c)))}>
                  {roster.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </Select>
                <Button size="xs" variant="ghost" onClick={() => setUnits(units.filter((_, j) => j !== i))}>×</Button>
              </HStack>
              {loopPatterns(chars.characters[code]).length > 1 && (
                <Select size="xs" ml={5} w="auto" value={patterns[code] ?? ''}
                  onChange={(e) => {
                    const rest = Object.fromEntries(Object.entries(patterns).filter(([c]) => c !== code));
                    setPatterns(e.target.value === '' ? rest : { ...rest, [code]: Number(e.target.value) });
                  }}>
                  <option value="">{L('Auto (game rule)', '자동 (게임 규칙)')}</option>
                  {loopPatterns(chars.characters[code]).map((p, k) => (
                    <option key={k} value={k}>{dataText(lang, p.name, p.nameEn) || `${k + 1}`}</option>
                  ))}
                </Select>
              )}
              {stackInputs(code, chars, build).map((s) => (
                <Box key={s.key} ml={5}>
                  <Dial label={`${lang === 'ko' ? s.label : s.labelEn} (${L('times triggered', '발동 횟수')})`}
                    value={stacks[code]?.[s.key] ?? 0} min={0} max={s.max}
                    onChange={(v) => setStacks({ ...stacks, [code]: { ...stacks[code], [s.key]: v } })} />
                </Box>
              ))}
              </VStack>
            ))}
            {units.length < 6 && (
              <Button size="xs" variant="outline" onClick={() => setUnits([...units, roster.find((r) => !units.includes(r.code))?.code ?? roster[0].code])}>
                {L('Add unit', '유닛 추가')}
              </Button>
            )}
          </VStack>
        </Panel>

        <Panel title={L('Build', '육성')}>
          <VStack align="stretch" spacing={2}>
            <Dial label={L('Level', '레벨')} value={build.level} min={1} max={chars.statCaps.level}
              onChange={(v) => setBuild({ ...build, level: v })} />
            <Dial label={L('Skill level', '스킬 레벨')} value={build.skillLevel} min={1} max={levels.skill}
              onChange={(v) => setBuild({ ...build, skillLevel: v })} />
            <Dial label={L('Burst level', '버스트 레벨')} value={build.burstLevel} min={1} max={levels.burst}
              onChange={(v) => setBuild({ ...build, burstLevel: v })} />
            {gearCap > 0 && (
              <Dial label={L('Equipment level', '장비 레벨')} value={Math.min(build.gearLevel, gearCap)} min={1} max={gearCap}
                onChange={(v) => setBuild({ ...build, gearLevel: v })} />
            )}
            <Select size="xs" aria-label={L('Rotation', '사이클')} value={rotation}
              onChange={(e) => setRotation(e.target.value as Rotation)}>
              {ROTATIONS.map((r) => <option key={r.value} value={r.value}>{L(r.en, r.ko)}</option>)}
            </Select>
            <Wrap spacing={3}>
              <WrapItem>
                <Select size="xs" w="7rem" aria-label={L('Equipment tier', '장비 등급')} value={build.gearTier}
                  onChange={(e) => setBuild({ ...build, gearTier: Number(e.target.value) })}>
                  <option value={0}>{t('gearEmpty')}</option>
                  {gearTiers(chars).map((row) => (
                    <option key={row.tier} value={row.tier}>{t('gearTier', { n: row.tier })}</option>
                  ))}
                </Select>
              </WrapItem>
              <WrapItem>
                <Select size="xs" w="7rem" value={build.star} onChange={(e) => setBuild({ ...build, star: Number(e.target.value) })}>
                  {Array.from({ length: chars.statCaps.star }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>{`${n}★`}</option>
                  ))}
                </Select>
              </WrapItem>
              <WrapItem><Checkbox size="sm" isChecked={build.infusion} onChange={(e) => setBuild({ ...build, infusion: e.target.checked })}>{L('Infusion', '인퓨전')}</Checkbox></WrapItem>
              <WrapItem><Checkbox size="sm" isChecked={build.love} onChange={(e) => setBuild({ ...build, love: e.target.checked })}>{L('Max affection', '최대 호감도')}</Checkbox></WrapItem>
            </Wrap>
          </VStack>
        </Panel>

        <Panel title={L('Target', '대상')}>
          <VStack align="stretch" spacing={2}>
            <Wrap spacing={1}>
              {PRESETS.map((p) => (
                <WrapItem key={p.en}>
                  <Button size="xs" variant="outline" onClick={() => setTarget({ ...target, ...p.target })}>{L(p.en, p.ko)}</Button>
                </WrapItem>
              ))}
            </Wrap>
            <Dial label={L('Defense', '방어력')} value={target.defense} min={0} max={DEFENSE_MAX} step={10}
              onChange={(v) => setTarget({ ...target, defense: v })} />
            <Dial label={L('Evasion', '회피')} value={target.evasion} min={0} max={1000} step={5}
              onChange={(v) => setTarget({ ...target, evasion: v })} />
            <Dial label={L('Crit resist', '치명 저항')} value={target.critResist} min={0} max={1000} step={10}
              onChange={(v) => setTarget({ ...target, critResist: v })} />
            <Dial label={L('Level above yours', '레벨 차이')} value={target.levelGap} min={0} max={10}
              onChange={(v) => setTarget({ ...target, levelGap: v })} />
            <Dial label={L('Fight length (s)', '전투 시간 (초)')} value={target.seconds} min={30} max={600} step={10}
              onChange={(v) => setTarget({ ...target, seconds: v })} />
            <Dial label={L('Target HP %', '대상 HP %')} value={Math.round(target.hpRate * 100)} min={1} max={100}
              onChange={(v) => setTarget({ ...target, hpRate: v / 100 })} />
            <Checkbox size="sm" isChecked={target.advantage} onChange={(e) => setTarget({ ...target, advantage: e.target.checked })}>
              {L('Attribute advantage (+30%)', '속성 우위 (+30%)')}
            </Checkbox>
            <Checkbox size="sm" isChecked={target.marked} onChange={(e) => setTarget({ ...target, marked: e.target.checked })}>
              {L('Conditional effects met (target/caster has the required state)', '조건부 효과 충족 (필요 상태 보유)')}
            </Checkbox>
          </VStack>
        </Panel>
      </SimpleGrid>

      <Panel title={L('Ranking', '순위')}>
        <Box overflowX="auto">
          <Table size="sm" minW="40rem">
            <Thead>
              <Tr>
                <Th>{L('Unit', '유닛')}</Th>
                <Th isNumeric>DPS</Th>
                <Th />
                <Th isNumeric>HPS</Th>
                <Th isNumeric>{L('Loop', '루프')}</Th>
                <Th isNumeric>{L('Burst', '버스트')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {ranked.map((y) => [
                <Tr key={y.code}>
                  <Td>
                    <HStack spacing={2}>
                      {iconUrl(y.code) && <Box as="img" src={iconUrl(y.code)!} w={7} h={7} borderRadius="full" alt="" />}
                      <Text as={NextLink} href={characterHref(y.code)} fontSize="sm" color={color(y.code)}>{name(y.code)}</Text>
                      {(y.skipped > 0 || y.missingTiming) && (
                        <Text fontSize="xs" color="gray.500" title={L('Some effects or timings are not counted', '일부 효과 또는 시간 미반영')}>*</Text>
                      )}
                    </HStack>
                  </Td>
                  <Td isNumeric fontFamily="mono">{fmt(value(y))}</Td>
                  <Td w="30%">
                    <Box h={2} borderRadius="full" bg={color(y.code)} w={`${(value(y) / best) * 100}%`} />
                    {healValue(y) > 0 && <Box h={1} mt={1} borderRadius="full" bg="green.300" w={`${(healValue(y) / bestHeal) * 100}%`} />}
                  </Td>
                  <Td isNumeric fontFamily="mono">{healValue(y) ? fmt(healValue(y)) : '—'}</Td>
                  <Td isNumeric fontFamily="mono">{y.loopSeconds ? `${y.loopSeconds.toFixed(1)}s` : '—'}</Td>
                  <Td isNumeric fontFamily="mono">
                    {y.burst ? `${fmt(y.burst.damage)}${y.burstCooldown ? ` / ${y.burstCooldown.toFixed(1)}s` : ''}` : '—'}
                  </Td>
                </Tr>,
                breakdown(y).length ? (
                  <Tr key={`${y.code}-detail`}>
                    <Td colSpan={6} pt={0} fontSize="xs" color="gray.400" borderColor="whiteAlpha.100">
                      {breakdown(y).join(' · ')}
                    </Td>
                  </Tr>
                ) : null,
              ])}
            </Tbody>
          </Table>
        </Box>
      </Panel>

      <Panel title={L('Against defense', '방어력별')}>
        <DefenseCurve units={units} chars={chars} target={target} build={build} timing={timing} appear={appear} rotation={rotation} lang={lang}
          patterns={patterns} stacks={stacks} />
      </Panel>

      <Text fontSize="xs" color="gray.500">
        {L('Averages over the fight, cast by cast on one target (opening only and burst only average over their own cast time): opening, then the loop the game picks before every cast (or the one you choose), burst whenever its cooldown is up (first one after one cooldown), misses and crits as probabilities, damage-over-time included. Passive stats, passive triggers fired by its own skills, hits, crits and expiring states (stacks, follow-up skills, extra damage, burst cooldown cuts), skill variants, summons acting on their own loop, and the unit’s own buffs and debuffs follow the timeline; the line under each unit lists them, with passive and summon damage per second. Passives fired by kills, dispels or deaths take the count you set under the unit. Not modelled: allies’ buffs, party-composition passives, ultimate charge, extra targets hit by area skills; * marks a unit with effects or timings left out.',
          '대상 1명 기준, 전투 시간 동안 시전마다 계산한 평균(오프닝만·버스트만은 해당 시전 시간 기준): 시작 패턴 후 매 시전 전 게임이 고르는 로테이션(또는 선택한 패턴), 쿨마다 버스트(첫 사용은 쿨 1회 후), 빗나감·치명은 확률로 반영, 지속 피해 포함. 패시브 스탯, 자기 스킬·타격·치명·상태 만료로 발동하는 패시브(중첩, 추가 스킬, 추가 피해, 버스트 쿨 감소), 스킬 변형, 자체 루프로 행동하는 소환수, 자기 버프·디버프를 시간순으로 반영하며 각 유닛 아래 줄에 패시브·소환수 초당 피해와 함께 표시. 처치·해제·사망으로 발동하는 패시브는 유닛 아래에서 정한 횟수 적용. 미반영: 아군 버프, 파티 구성 패시브, 버스트 충전, 범위 스킬의 추가 대상. *는 일부 효과·시간 미반영.')}
      </Text>
    </VStack>
  );
}
