import NextLink from 'next/link';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useEffect } from 'react';
import {
  ChangelogDialog as HubChangelogDialog, ReleaseList, type Release,
} from '@altterisk/game-hub';
import { isFreshVisitor, markSeen, useShouldShow } from '@/lib/seenStore';
import { KIND_LABEL, KIND_ORDER, RELEASES, latestKey, type ChangeKind } from '@/lib/changelog';
import { pick, useLang, useT, type Lang } from '@/lib/i18n';

function releasesFor(lang: Lang): Release[] {
  return RELEASES.map((r) => ({
    date: r.date,
    title: pick(r.title, lang),
    entries: [...r.entries]
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
      .map((e) => ({ kind: e.kind, text: pick(e.text, lang) })),
  }));
}

export function ChangelogDialog() {
  const t = useT();
  const lang = useLang();
  const key = latestKey();
  const unseen = useShouldShow(key);
  const fresh = isFreshVisitor();

  // a first-ever visitor has nothing to be caught up on, so bank it silently
  useEffect(() => {
    if (fresh && unseen) markSeen(key);
  }, [fresh, unseen, key]);

  return (
    <HubChangelogDialog open={unseen && !fresh} onClose={() => markSeen(key)}
      releases={releasesFor(lang)} kindLabel={(k) => pick(KIND_LABEL[k as ChangeKind], lang)}
      title={t('changeWhatsNew')} closeLabel={t('close')}
      footer={
        <Flex align="center" gap={2} wrap="wrap">
          <Text as={NextLink} href="/changelog" fontSize="xs" color="gray.400" mr="auto"
            _hover={{ color: 'yellow.200' }}
            onClick={() => markSeen(key)}>{t('changeSeeAll')}</Text>
          <Box as="button" px={4} py={1.5} fontSize="sm" borderRadius="md" fontWeight="700"
            bg="yellow.400" color="gray.900" _hover={{ bg: 'yellow.300' }}
            onClick={() => markSeen(key)}>{t('tutDone')}</Box>
        </Flex>
      } />
  );
}

export function ChangelogList() {
  const lang = useLang();
  return <ReleaseList releases={releasesFor(lang)} kindLabel={(k) => pick(KIND_LABEL[k as ChangeKind], lang)} />;
}

export function ChangelogLink() {
  const t = useT();
  return (
    <Text as={NextLink} href="/changelog" fontSize="xs" color="gray.400"
      whiteSpace="nowrap" _hover={{ color: 'yellow.200' }}>
      {t('changeWhatsNew')}
    </Text>
  );
}
