import { Badge, Box, Flex, HStack, SimpleGrid, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { Panel } from '@/components/skillKit';
import { INFUSION_PATHS, infusionNodes, statText } from '@/lib/characters';
import { dataText, useLang, type Lang } from '@/lib/i18n';
import type {
  CharacterData, CharacterEntry, IconManifest, InfusionBonus, InfusionItem, InfusionPath,
} from '@/lib/data';

export function infusionLabel(data: CharacterData, key: string, lang: Lang): string {
  const label = data.infusion?.labels[key];
  return dataText(lang, label?.ko, label?.en) || key;
}

export function bonusText(data: CharacterData, bonus: InfusionBonus, lang: Lang): string {
  const type = bonus.stat ? data.statTypes[bonus.stat] : undefined;
  const name = dataText(lang, type?.name, type?.en) || bonus.stat || '';
  const amount = bonus.calc === 'MULTIPLICATION'
    ? `${Number((bonus.value * 100).toFixed(2))}%`
    : statText(type?.display ?? 1, bonus.value);
  return `${name} +${amount}`;
}

export function infusionPayer(
  entry: CharacterEntry, data: CharacterData, path: InfusionPath,
): InfusionItem | null {
  return path === 'surface' ? data.infusion?.material ?? null : entry.infusion?.piece ?? null;
}

// `active` counts from step 1 per path; nodes past it are drawn dimmed.
export default function InfusionTree({ entry, data, icons, active }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
  active?: Partial<Record<InfusionPath, number>>;
}) {
  const lang = useLang();
  const info = data.infusion;
  if (!info || !entry.infusion) return null;
  return (
    <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3} alignItems="start">
      {INFUSION_PATHS.map((path) => {
        const nodes = infusionNodes(entry, path);
        if (nodes.length === 0) return null;
        const payer = infusionPayer(entry, data, path);
        const total = nodes.reduce((sum, node) => sum + node.cost, 0);
        return (
          <Panel key={path}
            title={dataText(lang, info.paths[path]?.name, info.paths[path]?.nameEn) || path}
            note={`${infusionLabel(data, 'material', lang)} ${total.toLocaleString()}`}>
            <VStack align="stretch" spacing={2}>
              {nodes.map((node, i) => {
                const on = active == null || i < (active[path] ?? 0);
                return (
                  <Flex key={node.step} gap={3} align="center" wrap="wrap" p={2}
                    borderWidth="1px" borderRadius="md" opacity={on ? 1 : 0.45}
                    borderColor={node.core ? 'yellow.600' : 'whiteAlpha.200'}
                    bg={node.core ? 'rgba(236, 201, 75, 0.06)' : 'whiteAlpha.50'}>
                    <GameIcon manifest={icons} group="infusion" name={node.icon} size={8} />
                    <Box flex="1" minW="160px">
                      <HStack spacing={2} wrap="wrap">
                        <Text fontSize="sm" fontWeight="semibold">
                          {dataText(lang, node.name, node.nameEn)}
                        </Text>
                        {node.core && (
                          <Badge colorScheme="yellow" fontSize="0.6rem">
                            {infusionLabel(data, 'core', lang)}
                          </Badge>
                        )}
                        <Text fontSize="xs" color="gray.500">{node.grade}★</Text>
                      </HStack>
                      <Wrap spacing={1} mt={1}>
                        {node.bonuses.map((bonus, b) => (
                          <WrapItem key={b}>
                            <Badge fontSize="0.6rem" variant="subtle"
                              colorScheme={bonus.special ? 'purple' : 'teal'}
                              title={bonus.special ? infusionLabel(data, 'special', lang) : undefined}>
                              {bonusText(data, bonus, lang)}
                            </Badge>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                    <HStack spacing={1} flexShrink={0}>
                      <GameIcon manifest={icons} group="item" name={payer?.icon} size={5}
                        title={dataText(lang, payer?.name, payer?.nameEn) || undefined} />
                      <Text fontSize="sm" fontFamily="mono">×{node.cost}</Text>
                    </HStack>
                  </Flex>
                );
              })}
            </VStack>
          </Panel>
        );
      })}
    </SimpleGrid>
  );
}
