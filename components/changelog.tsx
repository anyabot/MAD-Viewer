import NextLink from 'next/link';
import {
  Badge, Box, Flex, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, Text, VStack,
} from '@chakra-ui/react';
import { useEffect } from 'react';
import { useSeen, useShouldShow } from '@/lib/seenStore';
import {
  KIND_LABEL, KIND_ORDER, LATEST, RELEASES, latestKey,
  type ChangeKind, type Release,
} from '@/lib/changelog';
import { pick, useLang, useT } from '@/lib/i18n';

const KIND_COLOR: Record<ChangeKind, string> = {
  unit: 'yellow',
  scene: 'purple',
  feature: 'blue',
  fix: 'gray',
};

export function ReleaseBlock({ release, heading }: { release: Release; heading?: boolean }) {
  const lang = useLang();
  const shown = KIND_ORDER.filter((kind) => release.entries.some((e) => e.kind === kind));
  return (
    <Box>
      <Flex align="baseline" gap={2} wrap="wrap" mb={2}>
        <Text as={heading ? 'h2' : 'div'} fontSize={heading ? 'lg' : 'md'} fontWeight="800">
          {pick(release.title, lang)}
        </Text>
        <Text fontSize="xs" color="gray.500" fontFamily="mono">{release.date}</Text>
      </Flex>
      <VStack align="stretch" spacing={2}>
        {shown.map((kind) => (
          <Box key={kind}>
            {release.entries.filter((e) => e.kind === kind).map((entry, i) => (
              <Flex key={`${kind}-${i}`} gap={2.5} align="baseline" py={0.5}>
                <Badge flexShrink={0} minW="4.5rem" textAlign="center" fontSize="0.55rem"
                  colorScheme={KIND_COLOR[kind]}>{pick(KIND_LABEL[kind], lang)}</Badge>
                <Text fontSize="sm" color="gray.300">{pick(entry.text, lang)}</Text>
              </Flex>
            ))}
          </Box>
        ))}
      </VStack>
    </Box>
  );
}

/** Opens once per release: the key is the release date, so a new one shows again. */
export function ChangelogDialog() {
  const t = useT();
  const key = latestKey();
  const unseen = useShouldShow(key);
  const fresh = useSeen((s) => s.fresh);
  const ready = useSeen((s) => s.ready);
  const markSeen = useSeen((s) => s.markSeen);

  // a first-ever visitor has nothing to be caught up on, so bank it silently
  useEffect(() => {
    if (ready && fresh && unseen) markSeen(key);
  }, [ready, fresh, unseen, markSeen, key]);

  const show = unseen && !fresh;
  return (
    <Modal isOpen={show} onClose={() => markSeen(key)} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" borderWidth="1px" borderColor="whiteAlpha.200"
        mx={{ base: 3, md: 6 }}>
        <ModalHeader pb={1}>
          <Text fontSize="0.6rem" color="yellow.400" textTransform="uppercase"
            letterSpacing="0.14em" fontWeight="800">{t('changeWhatsNew')}</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={4}>
          <ReleaseBlock release={LATEST} />
        </ModalBody>
        <ModalFooter gap={2} borderTopWidth="1px" borderColor="whiteAlpha.100">
          <Text as={NextLink} href="/changelog" fontSize="xs" color="gray.400" mr="auto"
            _hover={{ color: 'yellow.200' }}
            onClick={() => markSeen(key)}>{t('changeSeeAll')}</Text>
          <Box as="button" px={4} py={1.5} fontSize="sm" borderRadius="md" fontWeight="700"
            bg="yellow.400" color="gray.900" _hover={{ bg: 'yellow.300' }}
            onClick={() => markSeen(key)}>{t('tutDone')}</Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function ChangelogList() {
  return (
    <VStack align="stretch" spacing={6}>
      {RELEASES.map((release) => (
        <Box key={release.date} borderWidth="1px" borderColor="whiteAlpha.200"
          borderRadius="xl" p={{ base: 3, md: 5 }}
          bg="linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))">
          <ReleaseBlock release={release} heading />
        </Box>
      ))}
    </VStack>
  );
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
