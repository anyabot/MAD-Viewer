import { Seo } from '@/components/seo';
import { Flex, Text, VStack } from '@altterisk/game-hub/ui';
import { ChangelogList } from '@/components/changelog';
import { RELEASES } from '@/lib/changelog';
import { useT } from '@/lib/i18n';

export default function ChangelogPage() {
  const t = useT();
  return (
    <VStack align="stretch" spacing={4}>
      <Seo title={t('navChangelog')} description={t('seoDescChangelog')} />
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
