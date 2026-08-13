import { useState } from 'react';
import NextLink from 'next/link';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { PlanGrid } from '@/components/unitPlan';
import { emptyPlan } from '@/lib/farm';
import { useFarm } from '@/lib/farmStore';
import { useCollection } from '@/lib/collectionStore';
import { useT } from '@/lib/i18n';
import type {
  CharacterData, CharacterEntry, GrowthData, IconManifest,
} from '@/lib/data';

export default function CollectionEditor({ entry, data, growth, icons }: {
  entry: CharacterEntry; data: CharacterData; growth: GrowthData;
  icons: IconManifest | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const collected = useCollection((s) => !!s.collected[entry.code]);
  const favorite = useCollection((s) => !!s.favorites[entry.code]);
  const setCollected = useCollection((s) => s.setCollected);
  const setFavorite = useCollection((s) => s.setFavorite);
  const pair = useFarm((s) => s.units[entry.code]);
  const addUnit = useFarm((s) => s.addUnit);
  const setListed = useFarm((s) => s.setListed);
  const current = pair?.current ?? emptyPlan();
  const listed = !!pair?.listed;

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg"
      bg="whiteAlpha.50" px={3} py={2}>
      <Flex align="center" gap={2} wrap="wrap">
        <Box as="button" fontSize="xs" color="gray.500" w={3} flexShrink={0}
          aria-expanded={open} _hover={{ color: 'yellow.200' }}
          onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</Box>
        <Text fontSize="sm" fontWeight="bold" mr={1}>{t('collectionCurrent')}</Text>
        <Button size="xs" variant={collected ? 'solid' : 'outline'} colorScheme="yellow"
          onClick={() => setCollected(entry.code, !collected)}>
          {collected ? t('collectionCollected') : t('collectionMarkCollected')}
        </Button>
        <Button size="xs" variant={favorite ? 'solid' : 'outline'} colorScheme="pink"
          onClick={() => setFavorite(entry.code, !favorite)}>
          {favorite ? t('collectionFavorite') : t('collectionAddFavorite')}
        </Button>
        {pair && (
          <Text fontSize="xs" fontFamily="mono" color="gray.500">
            {t('dialLevel')} {current.level}
          </Text>
        )}
        <Box flex="1" />
        <Box as="button" fontSize="xs" color={listed ? 'yellow.300' : 'gray.400'}
          _hover={{ color: 'yellow.200' }}
          onClick={() => (listed ? setListed(entry.code, false) : addUnit(entry.code))}>
          {listed ? t('collectionInFarm') : t('collectionAddFarm')}
        </Box>
        {listed && (
          <Text as={NextLink} href="/farm" fontSize="xs" color="yellow.300"
            _hover={{ color: 'yellow.200' }}>
            {t('collectionOpenFarm')}
          </Text>
        )}
      </Flex>

      {open && (
        <Box mt={3}>
          <PlanGrid entry={entry} data={data} growth={growth} icons={icons}
            sides={['current']} />
          <Text mt={2} fontSize="xs" color="gray.500">{t('collectionFarmSync')}</Text>
        </Box>
      )}
    </Box>
  );
}
