import Head from 'next/head';
import { Flex, Text, VStack } from '@chakra-ui/react';
import { ChangelogList } from '@/components/changelog';
import { RELEASES } from '@/lib/changelog';
import { useT } from '@/lib/i18n';

export default function ChangelogPage() {
  const t = useT();
  return (
    <VStack align="stretch" spacing={4}>
      <Head><title>MAD Viewer — {t('navChangelog')}</title></Head>
      <Flex align="baseline" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('navChangelog')}</Text>
        <Text fontSize="sm" color="gray.500">
          {t('changeReleases', { n: RELEASES.length })}
        </Text>
      </Flex>
      <ChangelogList />
    </VStack>
  );
}
