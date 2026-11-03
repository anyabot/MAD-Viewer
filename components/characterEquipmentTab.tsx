import NextLink from 'next/link';
import { Badge, Box, HStack, SimpleGrid, Text, VStack, Wrap, WrapItem } from '@altterisk/game-hub/ui';
import { EmptyState, Panel } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import {
  STAT_LABEL, characterName, equipLabel, equipmentGrants, equipmentSlotsOf, labelOf, typeIcons, typeOf, typeTint,
} from '@/lib/characters';
import type { CharacterData, CharacterEntry, IconManifest } from '@/lib/data';
import { useLang, useT } from '@/lib/i18n';
import { characterHref } from '@/lib/routes';

export default function CharacterEquipmentTab({ list, chars, icons }: {
  list: CharacterEntry[]; chars: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const types = Object.entries(chars.equipment).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <VStack align="stretch" spacing={4}>
      <Panel title={t('equipmentByType')}>
        <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={3}>
          {types.map(([id, slot]) => {
            const type = Number(id);
            const users = list.filter((c) => c.equipmentSlots?.includes(type));
            const top = Math.max(0, ...(slot.tiers ?? []).map((row) => row.tier));
            const cap = (slot.tiers ?? []).find((row) => row.tier === top)?.maxLevel ?? 1;
            return (
              <Box key={id} borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" p={2}>
                <HStack spacing={2} mb={1}>
                  <GameIcon manifest={icons} group="equip" name={slot.icon} size={8} />
                  <Text fontSize="sm" fontWeight="bold" flex="1" minW={0}>{equipLabel({ ...slot, type }, lang)}</Text>
                  <Text fontSize="xs" color="gray.500">{users.length}</Text>
                </HStack>
                <Wrap spacing={1} mb={2}>
                  {equipmentGrants(chars, { type, tier: top, level: cap }).map((grant, i) => (
                    <WrapItem key={i}>
                      <Badge fontSize="0.55rem" colorScheme="cyan" variant="subtle">
                        {labelOf(STAT_LABEL, grant.stat, lang)}
                      </Badge>
                    </WrapItem>
                  ))}
                </Wrap>
                <Wrap spacing={1}>
                  {users.map((c) => (
                    <WrapItem key={c.code}>
                      <Box as={NextLink} href={characterHref(c.code)} title={characterName(c, lang)} display="block" lineHeight={0}>
                        <GameIcon manifest={icons} group="char" name={c.iconPath ?? ''} size={8} />
                      </Box>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            );
          })}
        </SimpleGrid>
      </Panel>

      <Panel title={t('equipmentByCharacter')}>
        {list.length === 0 ? <EmptyState title={t('noMatch')} /> : (
          <Box overflowX="auto">
            <VStack align="stretch" spacing={0} minW="34rem">
              {list.map((c) => (
                <HStack key={c.code} spacing={3} py={1} borderBottomWidth="1px" borderColor="whiteAlpha.100">
                  <Box as={NextLink} href={characterHref(c.code)} display="flex" alignItems="center" gap={2}
                    w="11rem" flexShrink={0} _hover={{ color: 'accent.200' }}>
                    <GameIcon manifest={icons} group="char" name={c.iconPath ?? ''} size={7} />
                    <Text fontSize="xs" noOfLines={1}>{characterName(c, lang)}</Text>
                  </Box>
                  <HStack spacing={1} w="3.5rem" flexShrink={0}>
                    {(['attribute', 'role'] as const).map((table) => {
                      const row = typeOf(c, chars.types, table);
                      return <GameIcon key={table} manifest={icons} group="ui" names={typeIcons(row)} size={5} tint={typeTint(row)} />;
                    })}
                  </HStack>
                  {equipmentSlotsOf(c, chars.equipment).map((slot) => (
                    <HStack key={slot.type} spacing={1} flex="1" minW={0}>
                      <GameIcon manifest={icons} group="equip" name={slot.icon} size={6} />
                      <Text fontSize="xs" color="gray.300" noOfLines={1}>{equipLabel(slot, lang)}</Text>
                    </HStack>
                  ))}
                </HStack>
              ))}
            </VStack>
          </Box>
        )}
      </Panel>
    </VStack>
  );
}
