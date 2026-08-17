import { Box, HStack, Text, Wrap, WrapItem } from '@chakra-ui/react';
import { ItemIcon } from '@/components/itemIcon';
import { hasIcon } from '@/lib/icons';
import { MATERIAL_ICON_GROUPS, needLabel, needsOf, type Bill } from '@/lib/farm';
import type { GrowthData, IconManifest } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

const materialGroup = (icons: IconManifest | null, name?: string | null) =>
  (MATERIAL_ICON_GROUPS.find((g) => hasIcon(icons, g, name))
    ?? MATERIAL_ICON_GROUPS[0]) as never;

/** Needed over held, per material. The unit row, the totals and the plan popup share it. */
export function MaterialNeeds({ bill, growth, icons, lang, inventory, size = 7, shortOnly }: {
  bill: Bill; growth: GrowthData; icons: IconManifest | null; lang: Lang;
  inventory: Record<string, number>;
  size?: number;
  /** Drop anything already covered, so a long list shows only what is missing. */
  shortOnly?: boolean;
}) {
  const needs = needsOf(growth, bill, inventory)
    .filter((need) => !shortOnly || need.short > 0);
  if (needs.length === 0) return null;
  return (
    <Wrap spacing={2}>
      {needs.map((need) => {
        const label = needLabel(growth, need, lang);
        return (
          <WrapItem key={need.key}>
            <HStack spacing={2} borderWidth="1px" borderColor="whiteAlpha.200"
              borderRadius="md" bg="blackAlpha.200" py={1} pl={1} pr={2}>
              <ItemIcon manifest={icons} group={materialGroup(icons, label.icon)}
                name={label.icon} grade={label.grade} size={size}
                title={label.name ?? undefined} />
              <Box minW={0}>
                <Text fontSize="0.65rem" color="gray.500" noOfLines={1}
                  maxW="9rem">{label.name}</Text>
                <HStack spacing={1} align="baseline" fontFamily="mono">
                  <Text fontSize="sm" fontWeight="bold"
                    color={need.short ? 'yellow.200' : 'green.300'}>
                    {need.required.toLocaleString()}
                  </Text>
                  <Text fontSize="0.6rem" color="gray.600">
                    / {need.have.toLocaleString()}
                  </Text>
                </HStack>
              </Box>
            </HStack>
          </WrapItem>
        );
      })}
    </Wrap>
  );
}
