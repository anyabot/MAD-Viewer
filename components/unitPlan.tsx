import { useEffect, useState } from 'react';
import { CheckIcon } from '@chakra-ui/icons';
import { Badge, Box, HStack, Input, Text } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { useFarm } from '@/lib/farmStore';
import {
  billCovered, billIsEmpty, emptyPlan, formatAmount, gearLevelCap, levellableSkills,
  parseAmount, partBill, planStar, skillCap,
  type GearPlan, type PlanPart, type UnitPlan, type UnitPlanPair,
} from '@/lib/farm';
import { baseStar, starCap } from '@/lib/rank';
import { SKILL_CATEGORY_LABEL, equipLabel, equipmentSlotsOf } from '@/lib/characters';
import { dataText, pick, useLang, useT } from '@/lib/i18n';
import type {
  CharacterData, CharacterEntry, GrowthData, IconManifest,
} from '@/lib/data';

export type PlanSide = 'current' | 'target';

const SIDE_LABEL = { current: 'farmCurrent', target: 'farmTarget' } as const;

// Keeps the text being typed in local state and commits on blur, re-syncing from the store only while unfocused.
export function AmountField({ value, min, max, onChange, width = '4.5rem', big, disabled }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
  width?: string; big?: boolean; disabled?: boolean;
}) {
  const shown = big ? formatAmount(value) : String(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setText(shown); }, [shown, editing]);

  return (
    <Input size="xs" value={text} w={width} textAlign="right" fontFamily="mono"
      borderColor="whiteAlpha.300" inputMode="decimal" isDisabled={disabled}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseAmount(text);
        if (parsed != null) onChange(Math.min(max, Math.max(min, parsed)));
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }} />
  );
}

// The step is one because that is how loot arrives; a stack is typed with the `k`/`m` suffix.
export function Stepper({
  value, min = 0, max = Number.MAX_SAFE_INTEGER, onChange, disabled, children,
}: {
  value: number; min?: number; max?: number; onChange: (v: number) => void;
  disabled?: boolean; children: React.ReactNode;
}) {
  const button = {
    px: 1.5, borderWidth: '1px', borderRadius: 'md', borderColor: 'whiteAlpha.200',
    color: 'gray.400', lineHeight: 1.4, fontSize: 'sm', flexShrink: 0,
    _hover: { borderColor: 'yellow.400', color: 'yellow.200' },
  } as const;
  const spent = { opacity: 0.35, pointerEvents: 'none' } as const;
  return (
    <HStack spacing={1}>
      <Box as="button" aria-label="minus one" tabIndex={-1} {...button}
        {...(disabled || value <= min ? spent : {})}
        onClick={() => onChange(Math.max(min, value - 1))}>−</Box>
      {children}
      <Box as="button" aria-label="plus one" tabIndex={-1} {...button}
        {...(disabled || value >= max ? spent : {})}
        onClick={() => onChange(Math.min(max, value + 1))}>+</Box>
    </HStack>
  );
}

// Tier changes default to that tier's cap for quick target entry.
export function GearField({ growth, slot, gear, onChange }: {
  growth: GrowthData; slot: { type: number; tiers?: { tier: number }[] };
  gear: { tier: number; level: number }; onChange: (g: { tier: number; level: number }) => void;
}) {
  const cap = gearLevelCap(growth, gear.tier);
  const tierCap = (slot.tiers ?? []).reduce((n, row) => Math.max(n, row.tier), 0);
  const empty = gear.tier === 0;
  const setTier = (tier: number) =>
    onChange({ tier, level: gearLevelCap(growth, tier) });
  const setLevel = (level: number) => onChange({ tier: gear.tier, level });
  return (
    <HStack spacing={1} justify="flex-end">
      <Stepper value={gear.tier} min={0} max={tierCap} onChange={setTier}>
        <AmountField value={gear.tier} min={0} max={tierCap} width="2.75rem"
          onChange={setTier} />
      </Stepper>
      <Stepper value={Math.min(gear.level, cap)} min={1} max={cap} disabled={empty}
        onChange={setLevel}>
        <AmountField value={Math.min(gear.level, cap)} min={1} max={cap} width="3.5rem"
          disabled={empty} onChange={setLevel} />
      </Stepper>
    </HStack>
  );
}

/** A caller holding the plan itself, so a dialog can edit a draft before committing. */
export type PlanDraft = {
  pair: UnitPlanPair;
  setPlan: (code: string, side: PlanSide, patch: Partial<UnitPlan>) => void;
  setSkill: (code: string, side: PlanSide, id: number, level: number) => void;
  setGear: (code: string, side: PlanSide, slot: number, gear: GearPlan) => void;
};

/** A per-row check that banks one goal on its own; absent leaves the column out. */
export type PartCheck = {
  /** What coverage is judged against, which is not always the whole inventory. */
  inventory: Record<string, number>;
  disabled?: boolean;
  reason?: string;
  onComplete: (part: PlanPart) => void;
};

function PartCheckCell({ part, entry, data, growth, pair, check }: {
  part: PlanPart; entry: CharacterEntry; data: CharacterData; growth: GrowthData;
  pair: UnitPlanPair; check: PartCheck;
}) {
  const t = useT();
  const bill = partBill(growth, entry, data, pair, part);
  const owing = !billIsEmpty(bill);
  const ready = owing && !check.disabled && billCovered(growth, bill, check.inventory);
  return (
    <Box as="button" aria-label={t('farmCompletePart')} aria-disabled={!ready || undefined}
      px={1} py={0.5} borderRadius="md" lineHeight={1} justifySelf="center"
      title={ready ? t('farmCompletePartHint')
        : !owing ? t('planNothingOwed')
          : check.disabled ? check.reason ?? t('farmCompletePart')
            : t('farmCompleteShort')}
      color={ready ? 'green.300' : 'whiteAlpha.300'}
      cursor={ready ? 'pointer' : 'not-allowed'}
      _hover={ready ? { bg: 'whiteAlpha.200', color: 'green.200' } : undefined}
      onClick={() => ready && check.onComplete(part)}>
      <CheckIcon boxSize={3} />
    </Box>
  );
}

export function PlanGrid({ entry, data, growth, icons, sides, draft, check }: {
  entry: CharacterEntry; data: CharacterData; growth: GrowthData;
  icons: IconManifest | null; sides: PlanSide[];
  /** Absent writes straight to the store, which is what the character page wants. */
  draft?: PlanDraft;
  check?: PartCheck;
}) {
  const t = useT();
  const lang = useLang();
  const stored = useFarm((s) => s.units[entry.code]);
  const storePlan = useFarm((s) => s.setPlan);
  const storeSkill = useFarm((s) => s.setSkill);
  const storeGear = useFarm((s) => s.setGear);
  const pair = draft ? draft.pair : stored;
  const setPlan = draft ? draft.setPlan : storePlan;
  const setSkill = draft ? draft.setSkill : storeSkill;
  const setGear = draft ? draft.setGear : storeGear;

  const planOf = (side: PlanSide) =>
    (side === 'current' ? pair?.current : pair?.target) ?? emptyPlan();
  const checked = pair ?? { current: emptyPlan(), target: emptyPlan() };
  const cell = (part: PlanPart) => (check
    ? <PartCheckCell part={part} entry={entry} data={data} growth={growth}
        pair={checked} check={check} />
    : null);
  const levelCap = data.statCaps.level;
  const floor = baseStar(entry);
  const cap = starCap(growth.star);
  const skills = levellableSkills(entry, data);
  const slots = equipmentSlotsOf(entry, data.equipment);

  return (
    <Box overflowX="auto">
      <Box display="grid" minW={sides.length > 1 ? '520px' : '340px'} alignItems="center"
        gap={1.5} gridTemplateColumns={
          `minmax(0, 1fr)${' auto'.repeat(sides.length + (check ? 1 : 0))}`}>
        <Box />
        {sides.map((side) => (
          <Text key={side} fontSize="0.6rem" color="gray.500" textAlign="right">
            {t(SIDE_LABEL[side])}
          </Text>
        ))}
        {check && <Box />}

        <Text fontSize="sm">{t('dialLevel')}</Text>
        {sides.map((side) => {
          const set = (v: number) => setPlan(entry.code, side, { level: v });
          const level = planOf(side).level;
          return (
            <Stepper key={side} value={level} min={1} max={levelCap} onChange={set}>
              <AmountField value={level} min={1} max={levelCap} onChange={set} />
            </Stepper>
          );
        })}
        {cell({ kind: 'level' })}

        <Text fontSize="sm">{t('rankStar')}</Text>
        {sides.map((side) => {
          const set = (v: number) => setPlan(entry.code, side, { star: v });
          const star = planStar(planOf(side), entry);
          return (
            <Stepper key={side} value={star} min={floor} max={cap} onChange={set}>
              <AmountField value={star} min={floor} max={cap} onChange={set} />
            </Stepper>
          );
        })}
        {cell({ kind: 'star' })}

        {skills.map(({ id, skill }) => {
          const cap = skillCap(growth, skill);
          return (
            <Box key={id} display="contents">
              <HStack spacing={1.5} minW={0}>
                <GameIcon manifest={icons} group="skill" name={skill.icon} size={5} />
                <Text fontSize="sm" noOfLines={1}>
                  {dataText(lang, skill.name, skill.nameEn) || id}
                </Text>
                <Badge fontSize="0.55rem" colorScheme="gray">
                  {pick(SKILL_CATEGORY_LABEL[skill.categorize], lang)}
                </Badge>
              </HStack>
              {sides.map((side) => {
                const set = (v: number) => setSkill(entry.code, side, id, v);
                const level = planOf(side).skills[String(id)] ?? 1;
                return (
                  <Stepper key={side} value={level} min={1} max={cap} onChange={set}>
                    <AmountField value={level} min={1} max={cap} onChange={set} />
                  </Stepper>
                );
              })}
              {cell({ kind: 'skill', id })}
            </Box>
          );
        })}

        {slots.map((slot) => {
          const worn = sides.map((side) =>
            planOf(side).gear[String(slot.type)] ?? { tier: 0, level: 1 });
          return (
            <Box key={slot.type} display="contents">
              <HStack spacing={1.5} minW={0}>
                <GameIcon manifest={icons} group="equip" size={5}
                  name={(slot.tiers ?? []).find((r) => r.tier === worn[worn.length - 1].tier)?.icon
                    ?? slot.icon} />
                <Text fontSize="sm" noOfLines={1}>{equipLabel(slot, lang)}</Text>
              </HStack>
              {sides.map((side, i) => (
                <GearField key={side} growth={growth} slot={slot} gear={worn[i]}
                  onChange={(g) => setGear(entry.code, side, slot.type, g)} />
              ))}
              {cell({ kind: 'gear', slot: slot.type })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
