import { useEffect, useMemo, useState } from 'react';
import { Box, HStack, Select, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { FIELD } from '@/lib/battleField';
import { anchorOf, hasArea, isAreaHit, simulate, soloField, type Anchor } from '@/lib/aoe';
import { castSummary, hitSummary } from '@/lib/characters';
import type { CharacterData, IconManifest, SkillBehaviour } from '@/lib/data';
import { dataText, useLang } from '@/lib/i18n';

const ZONE = '#ff4d5e';

function areaSkills(chars: CharacterData, code: string): string[] {
  const group = chars.skillSets[String(chars.characters[code]?.skillSetGroup ?? '')];
  if (!group) return [];
  const ids = [...new Set(Object.values(group).flat().map(String))];
  return ids.filter((id) => hasArea(chars.skills[id]?.behaviour as SkillBehaviour | undefined));
}

export default function AoeStage({ chars, icons, unit, skill: initialSkill }: {
  chars: CharacterData; icons: IconManifest | null; unit?: string; skill?: string;
}) {
  const lang = useLang();
  const L = (en: string, ko: string) => (lang === 'ko' ? ko : en);
  const roster = useMemo(() => Object.entries(chars.characters)
    .filter(([code, e]) => e.characterType === 1 && e.positionType && !e.unreleased && areaSkills(chars, code).length)
    .map(([code, e]) => ({ code, name: dataText(lang, e.name, e.nameEn) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [chars, lang]);
  const [code, setCode] = useState(unit && chars.characters[unit] ? unit : roster[0]?.code ?? '');
  const skills = useMemo(() => areaSkills(chars, code), [chars, code]);
  const [skill, setSkill] = useState(initialSkill ?? '');
  useEffect(() => {
    if (unit && chars.characters[unit]) setCode(unit);
    if (initialSkill) setSkill(initialSkill);
  }, [unit, initialSkill, chars]);
  useEffect(() => {
    if (!skills.includes(skill)) setSkill(skills[0] ?? '');
  }, [skills, skill]);

  const entry = chars.characters[code];
  const behaviour = chars.skills[skill]?.behaviour as SkillBehaviour | undefined;
  const solo = useMemo(() => (entry
    ? soloField((entry.positionType ?? 1) as 1 | 2 | 3, code, entry.hitRadius ?? FIELD.hitRadius, entry.approach ?? 0)
    : null), [entry, code]);
  const units = useMemo(() => solo?.units ?? [], [solo]);
  const outcome = behaviour && units.length ? simulate(behaviour, units[0], units, null) : null;
  const placed = outcome ? units.map((u) => (u.key === outcome.caster.key ? outcome.caster : u)) : units;
  const areaHits = new Set((behaviour?.hits ?? []).map((h, i) => (isAreaHit(h) ? i : -1)).filter((i) => i >= 0));

  const anchorText: Record<Anchor, string> = {
    unit: L('around the unit', '유닛 기준'),
    enemy: L('around the targeted enemy', '대상 적 기준'),
    ally: L('around the targeted ally', '대상 아군 기준'),
    field: L('whole field', '전장 전체'),
  };

  const x0 = -18;
  const x1 = 18;
  const scale = 24;
  const w = (x1 - x0) * scale;
  const h = 170;
  const px = (x: number) => (x - x0) * scale;
  const pz = (z: number) => h / 2 - z * 22;
  const icon = icons && entry?.iconPath ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icons/char/${entry.iconPath}.webp` : null;

  return (
    <VStack align="stretch" spacing={3}>
      <Wrap spacing={2}>
        <WrapItem>
          <Select size="sm" w="12rem" value={code} onChange={(e) => setCode(e.target.value)}>
            {roster.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </Select>
        </WrapItem>
        <WrapItem>
          <Select size="sm" w="14rem" value={skill} onChange={(e) => setSkill(e.target.value)}>
            {skills.map((id) => (
              <option key={id} value={id}>{dataText(lang, chars.skills[id]?.name, chars.skills[id]?.nameEn)}</option>
            ))}
          </Select>
        </WrapItem>
      </Wrap>

      <Box overflowX="auto">
        <Box as="svg" viewBox={`0 0 ${w} ${h + 30}`} minW="720px" w="100%" display="block">
          <rect x={0} y={0} width={w} height={h} fill="#2a2e3c" rx={6} />
          {outcome?.areas.filter((a) => areaHits.has(a.hit)).map((a, i) => {
            if (a.kind === 'global') return <rect key={i} x={0} y={0} width={w} height={h} rx={6} fill={ZONE} fillOpacity={0.18} />;
            if (a.kind === 'circle') {
              return <ellipse key={i} cx={px(a.x)} cy={pz(a.z)} rx={a.radius * scale} ry={a.radius * 22}
                fill={ZONE} fillOpacity={0.25} stroke={ZONE} strokeWidth={2} />;
            }
            return <rect key={i} x={px(a.x - a.half)} y={4} width={a.half * 2 * scale} height={h - 8}
              fill={ZONE} fillOpacity={0.25} stroke={ZONE} strokeWidth={2} />;
          })}
          {Array.from({ length: x1 - x0 - 1 }, (_, i) => x0 + 1 + i).map((x) => (
            <g key={x}>
              <line x1={px(x)} x2={px(x)} y1={h} y2={h + (x % 5 === 0 ? 10 : 5)} stroke="#ccc" />
              {x % 5 === 0 && <text x={px(x)} y={h + 24} fill="#ccc" fontSize={12} textAnchor="middle">{x}</text>}
            </g>
          ))}
          {solo && units[0] && solo.startX < units[0].x - 0.01 && (
            <g>
              <ellipse cx={px(solo.startX)} cy={pz(0)} rx={units[0].r * scale} ry={units[0].r * scale * 0.9}
                fill="none" stroke="#78beff" strokeOpacity={0.6} strokeDasharray="3 3" />
              <line x1={px(solo.startX)} y1={pz(0)} x2={px(units[0].x)} y2={pz(0)}
                stroke="#78beff" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="3 3" />
            </g>
          )}
          {outcome?.path.map((p, i) => (
            <line key={i} x1={px(p.from[0])} y1={pz(p.from[1])} x2={px(p.to[0])} y2={pz(p.to[1])}
              stroke="#fff" strokeWidth={2} strokeDasharray="4 3" />
          ))}
          {placed.map((u) => {
            const me = u.side === 'ally';
            const r = u.r * scale;
            const target = outcome?.targets.has(u.key) && !me;
            const hit = !me && (outcome?.affected.get(u.key) ?? []).some((h) => areaHits.has(h));
            return (
              <g key={u.key}>
                <ellipse cx={px(u.x)} cy={pz(u.z)} rx={r} ry={r * 0.9}
                  fill={me ? '#78beff' : hit ? ZONE : '#9aa0b4'} fillOpacity={me || hit ? 0.8 : 0.35}
                  stroke={me ? '#fff' : hit ? ZONE : '#9aa0b4'} strokeWidth={2} />
                {target && <circle cx={px(u.x)} cy={pz(u.z)} r={r + 5} fill="none" stroke="#fff" strokeWidth={2} />}
                {me && icon && <image href={icon} x={px(u.x) - 13} y={pz(u.z) - r - 30} width={26} height={26} />}
              </g>
            );
          })}
        </Box>
      </Box>

      {behaviour && (
        <VStack align="stretch" spacing={1} fontSize="xs" color="gray.300">
          {(behaviour.hits ?? []).map((hit, i) => (areaHits.has(i) ? (
            <HStack key={i} spacing={2} align="start">
              <Box w={3} h={3} mt={0.5} borderRadius="sm" bg={ZONE} flexShrink={0} />
              <Text>
                {anchorText[anchorOf(hit)]} · {hitSummary(hit, lang)}
                {anchorOf(hit) === 'enemy' && hit.cast ? ` · ${castSummary(hit.cast, lang)}` : ''}
              </Text>
            </HStack>
          ) : null))}
          <Text color="gray.500">
            {L('Grey: a standard 2/2/1 wave; red: hit. The unit walks from its start slot (dashed) until the nearest enemy is within its approach distance, and casts from there. 0 is the centre between the fronts at wave start; distances count to unit edges.',
              '회색: 일반 2/2/1 웨이브, 빨강: 피격. 유닛은 시작 위치(점선)에서 가장 가까운 적이 접근 거리 안에 들어올 때까지 걸어가 그 자리에서 시전. 0은 웨이브 시작 시 양 최전방의 중심, 거리는 유닛 가장자리 기준.')}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
