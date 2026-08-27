import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Flex, HStack, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { ItemIcon } from '@/components/itemIcon';
import { Panel } from '@/components/skillKit';
import { MaterialNeeds } from '@/components/materialNeeds';
import { AmountField, PlanGrid, Stepper, type PlanDraft } from '@/components/unitPlan';
import { hasIcon } from '@/lib/icons';
import { useFarm } from '@/lib/farmStore';
import { useCollection } from '@/lib/collectionStore';
import {
  MATERIAL_ICON_GROUPS, applyPart, applySide, billCovered, emptyPlan, partBill, planStar,
  spendBill, unitBill,
  type Bill, type PlanPart, type UnitPlanPair,
} from '@/lib/farm';
import { memoryPlan, sellsMemory, starCap, stepCost } from '@/lib/rank';
import { characterName } from '@/lib/characters';
import { stageName } from '@/lib/stages';
import { dataText, useLang, useT, type Lang } from '@/lib/i18n';
import type {
  CharacterData, CharacterEntry, GrowthData, IconManifest, StageData, StageEntry,
} from '@/lib/data';

const materialGroup = (icons: IconManifest | null, name?: string | null) =>
  (MATERIAL_ICON_GROUPS.find((g) => hasIcon(icons, g, name))
    ?? MATERIAL_ICON_GROUPS[0]) as never;

// The exchange is the one route the run list cannot plan: it is a shop, not a stage.
function MemoryPanel({
  entry, growth, stages, hard, icons, lang, pair, held, setHeld, setBought,
}: {
  entry: CharacterEntry; growth: GrowthData; stages: StageData; hard: StageEntry[];
  icons: IconManifest | null; lang: Lang; pair: UnitPlanPair;
  held: number; setHeld: (held: number) => void;
  setBought: (bought: number) => void;
}) {
  const t = useT();
  const star = growth.star;
  if (!star) return null;

  const from = planStar(pair.current, entry);
  const to = Math.min(planStar(pair.target, entry), starCap(star));
  const required = stepCost(star, from, to);
  const bought = pair.bought ?? 0;
  const ref = star.pieces[entry.code] ?? null;
  const plan = memoryPlan(star, entry.code, required, held, bought, hard);
  const material = ref ? growth.materials[ref] : null;
  const currency = star.exchange?.ref ? growth.materials[star.exchange.ref] : null;

  return (
    <Panel title={t('planStarPanel')} note={`${from}★ → ${to}★`}>
      <VStack align="stretch" spacing={3}>
        <Wrap spacing={4} align="center">
          <WrapItem>
            <HStack spacing={2}>
              <ItemIcon manifest={icons} group={materialGroup(icons, material?.icon)}
                name={material?.icon} grade={material?.grade} size={8}
                title={dataText(lang, material?.name, material?.nameEn) || undefined} />
              <Box>
                <Text fontSize="0.6rem" color="gray.500" textTransform="uppercase"
                  letterSpacing="0.08em">{t('rankToTarget')}</Text>
                <Text fontSize="sm" fontFamily="mono" fontWeight="700"
                  color={plan.short ? 'yellow.200' : 'green.300'}>
                  {plan.short.toLocaleString()}
                  {plan.held > 0 && (
                    <Text as="span" color="gray.600" fontSize="0.7rem">
                      {' '}/ {plan.required.toLocaleString()}
                    </Text>
                  )}
                </Text>
              </Box>
            </HStack>
          </WrapItem>
          <WrapItem>
            <HStack spacing={2}>
              <ItemIcon manifest={icons} group={materialGroup(icons, material?.icon)}
                name={material?.icon} grade={material?.grade} size={8}
                title={dataText(lang, material?.name, material?.nameEn) || undefined} />
              <Box>
                <Text fontSize="0.6rem" color="gray.500" textTransform="uppercase"
                  letterSpacing="0.08em">{t('planHeld')}</Text>
                <Stepper value={held} min={0} max={999999} onChange={setHeld}>
                  <AmountField value={held} min={0} max={999999} width="4.5rem" big
                    onChange={setHeld} />
                </Stepper>
              </Box>
            </HStack>
          </WrapItem>
          <WrapItem>
            <HStack spacing={2}>
              <ItemIcon manifest={icons} group={materialGroup(icons, currency?.icon)}
                name={currency?.icon} size={8}
                title={dataText(lang, currency?.name, currency?.nameEn) || undefined} />
              <Box>
                <Text fontSize="0.6rem" color="gray.500" textTransform="uppercase"
                  letterSpacing="0.08em">{t('rankBuy')}</Text>
                <Text fontSize="sm" fontFamily="mono" fontWeight="700">
                  {plan.buy == null
                    ? <Text as="span" color="gray.600" fontSize="xs">{t('rankNotSold')}</Text>
                    : plan.buy.toLocaleString()}
                </Text>
              </Box>
            </HStack>
          </WrapItem>
          <WrapItem>
            <Box>
              <Text fontSize="0.6rem" color="gray.500" textTransform="uppercase"
                letterSpacing="0.08em">{t('rankBought')}</Text>
              <Stepper value={bought} min={0} max={9999} disabled={!sellsMemory(star, entry.code)}
                onChange={setBought}>
                <AmountField value={bought} min={0} max={9999} width="4rem" big
                  disabled={!sellsMemory(star, entry.code)} onChange={setBought} />
              </Stepper>
            </Box>
          </WrapItem>
          <WrapItem>
            <Box>
              <Text fontSize="0.6rem" color="gray.500" textTransform="uppercase"
                letterSpacing="0.08em">{t('rankDays')}</Text>
              <Text fontSize="sm" fontFamily="mono" fontWeight="700">
                {plan.days == null
                  ? <Text as="span" color="gray.600" fontSize="xs">{t('rankNoRoute')}</Text>
                  : plan.days.toLocaleString()}
              </Text>
            </Box>
          </WrapItem>
        </Wrap>

        <Text fontSize="xs" color="gray.600">{t('rankBoughtHint')}</Text>

        {plan.sources.length > 0 && (
          <VStack align="stretch" spacing={1} pt={1} borderTopWidth="1px"
            borderColor="whiteAlpha.100">
            {plan.sources.map(({ stage, perRun }) => (
              <HStack key={stage.id} spacing={2} fontSize="xs">
                <Text as={NextLink} color="gray.300" _hover={{ color: 'yellow.300' }}
                  href={{ pathname: '/stage', query: { id: stage.id } }}>
                  {stageName(stages, stage, lang)}
                </Text>
                <Text color="gray.600">{t('rankPerRun', { n: perRun.toFixed(2) })}</Text>
              </HStack>
            ))}
            <Text fontSize="xs" color="gray.500">
              {t('rankPerDay', { n: plan.perDay.toFixed(2) })}
            </Text>
          </VStack>
        )}
      </VStack>
    </Panel>
  );
}

export function UnitPlanDialog({
  entry, data, growth, stages, hard, icons, leftover, isOpen, onClose,
}: {
  entry: CharacterEntry | null; data: CharacterData; growth: GrowthData;
  stages: StageData; hard: StageEntry[]; icons: IconManifest | null;
  /** What is left once the prioritised units have taken their share. */
  leftover: Record<string, number>;
  isOpen: boolean; onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const stored = useFarm((s) => (entry ? s.units[entry.code] : undefined));
  const inventory = useFarm((s) => s.inventory);
  const setHidden = useFarm((s) => s.setHidden);
  const setPriority = useFarm((s) => s.setPriority);
  const setListed = useFarm((s) => s.setListed);
  const removeUnit = useFarm((s) => s.removeUnit);
  const commitUnit = useFarm((s) => s.commitUnit);
  const completeUnit = useFarm((s) => s.completeUnit);
  const completePart = useFarm((s) => s.completePart);
  const collected = useCollection((s) => (entry ? !!s.collected[entry.code] : false));

  // The dialog edits a copy: nothing reaches the record until Save.
  const [draft, setDraft] = useState<UnitPlanPair | null>(null);
  const [held, setHeld] = useState(0);
  const code = entry?.code ?? null;
  const memoryRef = code ? growth.star?.pieces[code] ?? null : null;
  useEffect(() => {
    setDraft(isOpen && code ? stored ?? { current: emptyPlan(), target: emptyPlan() } : null);
    setHeld(memoryRef ? inventory[memoryRef] ?? 0 : 0);
    // re-snapshot on open and on unit change, never on every store write
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code]);

  if (!entry || !draft) return null;

  const edit = (update: (pair: UnitPlanPair) => UnitPlanPair) =>
    setDraft((held) => (held ? update(held) : held));
  const planDraft: PlanDraft = {
    pair: draft,
    setPlan: (_code, side, patch) =>
      edit((held) => applySide(held, side, (plan) => ({ ...plan, ...patch }))),
    setSkill: (_code, side, id, level) => edit((held) =>
      applySide(held, side, (plan) => ({ ...plan, skills: { ...plan.skills, [id]: level } }))),
    setGear: (_code, side, slot, gear) => edit((held) =>
      applySide(held, side, (plan) => ({ ...plan, gear: { ...plan.gear, [slot]: gear } }))),
  };
  const setBought = (bought: number) =>
    edit((held) => ({ ...held, bought: Math.max(0, Math.floor(bought) || 0) }));

  const base = stored ?? { current: emptyPlan(), target: emptyPlan() };
  const storedHeld = memoryRef ? inventory[memoryRef] ?? 0 : 0;
  const dirty = held !== storedHeld
    || JSON.stringify({ ...base, listed: undefined, hidden: undefined,
      priority: undefined }) !== JSON.stringify({ ...draft, listed: undefined,
      hidden: undefined, priority: undefined });

  const hidden = stored?.hidden ?? false;
  const priority = stored?.priority ?? false;
  const bill: Bill = unitBill(growth, entry, data, draft);
  const previewed = memoryRef ? { ...leftover, [memoryRef]: held } : leftover;
  const spendable = memoryRef ? { ...inventory, [memoryRef]: held } : inventory;
  const owing = !!(bill.unitExp || bill.equipExp || Object.keys(bill.materials).length > 0);
  const covered = billCovered(growth, bill, priority ? spendable : previewed);

  // Banking one row writes the record, so the draft and the held count follow it.
  const bankPart = (part: PlanPart) => {
    const spent = spendBill(growth, partBill(growth, entry, data, draft, part), inventory);
    completePart(entry.code, part, spent);
    setDraft((kept) => (kept ? applyPart(kept, part) : kept));
    if (memoryRef) setHeld(spent[memoryRef] ?? 0);
  };

  const leave = () => {
    if (dirty && !window.confirm(t('planDiscardConfirm'))) return;
    onClose();
  };
  const save = () => {
    commitUnit(entry.code, draft,
      memoryRef && held !== storedHeld ? { [memoryRef]: held } : undefined);
    onClose();
  };

  const action = {
    px: 2, py: 1, fontSize: 'xs', borderWidth: '1px', borderRadius: 'md',
    borderColor: 'whiteAlpha.200',
  } as const;

  return (
    <Modal isOpen={isOpen} onClose={leave} size="4xl" scrollBehavior="inside" isCentered>
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" borderWidth="1px" borderColor="whiteAlpha.200"
        mx={{ base: 2, md: 6 }} my={{ base: 2, md: 8 }}>
        <ModalHeader>
          <Flex align="center" gap={2.5} wrap="wrap" pr={8}>
            <GameIcon manifest={icons} group="char" size={8}
              names={[entry.iconPath, `Icon_${entry.code}`]} />
            <Text as={NextLink} fontSize="lg" _hover={{ color: 'yellow.300' }}
              href={{ pathname: '/character', query: { code: entry.code } }}>
              {characterName(entry, lang)}
            </Text>
            <Badge fontSize="0.55rem" colorScheme={collected ? 'green' : 'gray'}>
              {collected ? t('planOwned') : t('rankUnowned')}
            </Badge>
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack align="stretch" spacing={4}>
            <Panel title={t('planTargets')}>
              <PlanGrid entry={entry} data={data} growth={growth} icons={icons}
                sides={['current', 'target']} draft={planDraft}
                check={{ inventory: priority ? spendable : previewed, disabled: dirty,
                  reason: t('planSaveFirst'), onComplete: bankPart }} />
            </Panel>

            <MemoryPanel entry={entry} growth={growth} stages={stages} hard={hard}
              icons={icons} lang={lang} pair={draft} held={held}
              setHeld={(v) => setHeld(Math.max(0, Math.floor(v) || 0))}
              setBought={setBought} />

            <Panel title={t('farmMaterialsSummary')}>
              {owing ? (
                <MaterialNeeds bill={bill} growth={growth} icons={icons} lang={lang}
                  inventory={priority ? spendable : previewed} />
              ) : (
                <Text fontSize="sm" color="gray.600">{t('planNothingOwed')}</Text>
              )}
            </Panel>

            {/* the flags act on the record, so they are not part of the draft */}
            <Flex gap={2} wrap="wrap">
              <Box as="button" {...action} color={priority ? 'yellow.300' : 'gray.400'}
                title={t('farmPriorityHint')}
                onClick={() => setPriority(entry.code, !priority)}>{t('farmPriority')}</Box>
              <Box as="button" {...action} color={hidden ? 'gray.600' : 'gray.400'}
                onClick={() => setHidden(entry.code, !hidden)}>
                {hidden ? t('farmShow') : t('farmHide')}
              </Box>
              {owing && (
                // completing spends the saved bill, so a pending edit has to land first
                <Box as="button" {...action} disabled={!covered || dirty}
                  color={covered && !dirty ? 'green.300' : 'gray.600'}
                  cursor={covered && !dirty ? 'pointer' : 'not-allowed'}
                  title={dirty ? t('planSaveFirst')
                    : covered ? t('farmCompleteHint') : t('farmCompleteShort')}
                  onClick={() => covered && !dirty
                    && completeUnit(entry.code, spendBill(growth, bill, inventory))}>
                  {t('farmComplete')}
                </Box>
              )}
              <Box flex="1" />
              <Box as="button" {...action} color="gray.500" _hover={{ color: 'red.300' }}
                onClick={() => {
                  if (collected) setListed(entry.code, false);
                  else removeUnit(entry.code);
                  onClose();
                }}>{t('farmRemove')}</Box>
            </Flex>
          </VStack>
        </ModalBody>
        <ModalFooter borderTopWidth="1px" borderColor="whiteAlpha.100" gap={2}>
          {dirty && (
            <Text fontSize="xs" color="yellow.300" mr="auto">{t('planUnsaved')}</Text>
          )}
          <Box as="button" px={3} py={1.5} fontSize="sm" borderRadius="md"
            borderWidth="1px" borderColor="whiteAlpha.200" color="gray.400"
            _hover={{ color: 'gray.100', borderColor: 'whiteAlpha.400' }}
            onClick={leave}>{t('planCancel')}</Box>
          <Box as="button" px={4} py={1.5} fontSize="sm" borderRadius="md" fontWeight="700"
            borderWidth="1px" disabled={!dirty}
            borderColor={dirty ? 'yellow.400' : 'whiteAlpha.200'}
            bg={dirty ? 'yellow.400' : 'transparent'}
            color={dirty ? 'gray.900' : 'gray.600'}
            cursor={dirty ? 'pointer' : 'not-allowed'}
            _hover={dirty ? { bg: 'yellow.300' } : undefined}
            onClick={() => dirty && save()}>{t('planSave')}</Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
