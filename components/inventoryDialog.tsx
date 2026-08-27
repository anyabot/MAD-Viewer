import { useMemo } from 'react';
import {
  Box, Flex, HStack, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader,
  ModalOverlay, SimpleGrid, Text, VStack,
} from '@chakra-ui/react';
import { ItemIcon } from '@/components/itemIcon';
import { Panel } from '@/components/skillKit';
import { AmountField, Stepper } from '@/components/unitPlan';
import { hasIcon } from '@/lib/icons';
import { useFarm } from '@/lib/farmStore';
import { MATERIAL_ICON_GROUPS, MATERIAL_KIND_LABEL } from '@/lib/farm';
import { dataText, pick, useLang, useT } from '@/lib/i18n';
import type { GrowthData, IconManifest } from '@/lib/data';

const materialGroup = (icons: IconManifest | null, name?: string | null) =>
  (MATERIAL_ICON_GROUPS.find((g) => hasIcon(icons, g, name))
    ?? MATERIAL_ICON_GROUPS[0]) as never;

// Everything the planner can need, in one place: bill materials, the two
// experience balances, and the memories a star costs.
export function InventoryDialog({ growth, icons, isOpen, onClose }: {
  growth: GrowthData; icons: IconManifest | null; isOpen: boolean; onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const inventory = useFarm((s) => s.inventory);
  const setInventory = useFarm((s) => s.setInventory);
  const clearInventory = useFarm((s) => s.clearInventory);

  const byKind = useMemo(() => {
    const missing = new Set(growth._noItemRow ?? []);
    // The stored experience balance leads its group.
    const pools = new Set([growth.unit.pool, growth.equipment.pool]);
    const out = new Map<string, { ref: string; name: string; icon: string | null;
      grade: number | null; big: boolean }[]>();
    for (const [ref, material] of Object.entries(growth.materials)) {
      if (missing.has(ref)) continue;
      const kind = material.kind ?? 'goods';
      out.set(kind, [...(out.get(kind) ?? []), {
        ref,
        name: dataText(lang, material.name, material.nameEn) || ref,
        icon: material.icon ?? null,
        grade: material.grade ?? null,
        big: kind === 'goods' || pools.has(ref),
      }]);
    }
    for (const rows of out.values()) {
      rows.sort((a, b) => Number(pools.has(b.ref)) - Number(pools.has(a.ref)));
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [growth, lang]);

  const total = byKind.reduce((n, [, rows]) => n + rows.length, 0);
  const counted = byKind.reduce((n, [, rows]) =>
    n + rows.filter((row) => (inventory[row.ref] ?? 0) > 0).length, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside" isCentered>
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" borderWidth="1px" borderColor="whiteAlpha.200"
        mx={{ base: 2, md: 6 }} my={{ base: 2, md: 8 }}>
        <ModalHeader fontSize="lg">
          <Flex align="center" gap={3} wrap="wrap" pr={8}>
            <Text>{t('planInventory')}</Text>
            <Text fontSize="sm" color="gray.500" fontWeight="normal">
              {t('planInventoryHint', { n: counted, total })}
            </Text>
            <Box flex="1" />
            <Box as="button" fontSize="xs" fontWeight="normal" color="gray.500"
              _hover={{ color: 'red.300' }} onClick={clearInventory}>{t('clear')}</Box>
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack align="stretch" spacing={3}>
            {byKind.map(([kind, rows]) => (
              <Panel key={kind} title={pick(MATERIAL_KIND_LABEL[kind], lang) || kind}
                note={String(rows.length)}>
                <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={2}>
                  {rows.map((row) => {
                    const held = inventory[row.ref] ?? 0;
                    return (
                      <HStack key={row.ref} spacing={2}>
                        <ItemIcon manifest={icons} group={materialGroup(icons, row.icon)}
                          name={row.icon} grade={row.grade} size={10} />
                        <Text fontSize="sm" noOfLines={1} flex="1" minW={0} title={row.name}>
                          {row.name}
                        </Text>
                        <Stepper value={held} onChange={(v) => setInventory(row.ref, v)}>
                          <AmountField value={held} min={0} max={999_999_999}
                            big={row.big} width="5rem"
                            onChange={(v) => setInventory(row.ref, v)} />
                        </Stepper>
                      </HStack>
                    );
                  })}
                </SimpleGrid>
              </Panel>
            ))}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
