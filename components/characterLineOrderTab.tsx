import { useEffect } from 'react';
import NextLink from '@/components/appLink';
import { Box, HStack, SimpleGrid, Text, VStack } from '@altterisk/game-hub/ui';
import { EmptyState, Panel } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { characterName, filterRows, typeIcons, typeLabel, typeTint } from '@/lib/characters';
import type { CharacterData, CharacterEntry, IconManifest } from '@/lib/data';
import { useLang, useT } from '@/lib/i18n';
import { characterHref } from '@/lib/routes';

// The game places a party's units by approach, then id, inside each line.
export default function CharacterLineOrderTab({ list, chars, icons, focus }: {
  list: CharacterEntry[]; chars: CharacterData; icons: IconManifest | null; focus?: string;
}) {
  const t = useT();
  const lang = useLang();
  const lines = filterRows(chars.types, 'position').map(([value, row]) => ({
    value: Number(value), row,
    units: list.filter((c) => c.positionType === Number(value) && c.approach != null)
      .sort((a, b) => a.approach! - b.approach! || (a.id ?? 0) - (b.id ?? 0)),
  })).filter((line) => line.units.length);

  useEffect(() => {
    if (focus) document.getElementById(`order-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus]);

  if (!lines.length) return <EmptyState title={t('noMatch')} />;
  return (
    <SimpleGrid columns={{ base: 1, md: lines.length }} spacing={3}>
      {lines.map(({ value, row, units }) => (
        <Panel key={value} title={(
          <HStack spacing={2}>
            <GameIcon manifest={icons} group="ui" names={typeIcons(row)} size={5} tint={typeTint(row)} />
            <Text>{typeLabel(row, lang)}</Text>
            <Text color="gray.500" fontSize="sm">{units.length}</Text>
          </HStack>
        )}>
          <VStack align="stretch" spacing={1}>
            {units.map((c, i) => (
              <HStack key={c.code} id={`order-${c.code}`} as={NextLink} href={characterHref(c.code)} spacing={2}
                px={2} py={1} borderRadius="md" minW={0}
                bg={c.code === focus ? 'whiteAlpha.200' : undefined}
                borderWidth="1px" borderColor={c.code === focus ? 'accent.400' : 'transparent'}
                _hover={{ bg: 'whiteAlpha.100' }}>
                <Text fontFamily="mono" fontSize="sm" color="gray.500" w="1.75rem" textAlign="right" flexShrink={0}>
                  {i + 1}
                </Text>
                <GameIcon manifest={icons} group="char" names={[c.iconPath, `Icon_${c.code}`]} size={7} />
                <Text fontSize="sm" flex="1" minW={0} noOfLines={1}>{characterName(c, lang)}</Text>
                <Box textAlign="right" flexShrink={0}>
                  <Text fontFamily="mono" fontSize="sm" color="gray.300">{c.approach}</Text>
                </Box>
              </HStack>
            ))}
          </VStack>
        </Panel>
      ))}
    </SimpleGrid>
  );
}
