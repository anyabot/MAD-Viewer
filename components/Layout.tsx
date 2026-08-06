import { Box, Container, Flex, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { LANGS, useLangStore, useT, type UiKey } from '@/lib/i18n';

// `/character` and `/stage` are leaves of their lists, so they light the same
// tab as the list they came from.
const NAV: { href: string; label: UiKey; match: (p: string) => boolean }[] = [
  { href: '/', label: 'navViewer', match: (p: string) => p === '/' },
  {
    href: '/characters',
    label: 'navCharacters',
    match: (p: string) => p.startsWith('/character'),
  },
  { href: '/effects', label: 'navEffects', match: (p: string) => p === '/effects' },
  { href: '/stages', label: 'navStages', match: (p: string) => p.startsWith('/stage') },
];

function LanguagePicker() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <HStack spacing={0.5} role="group" aria-label={t('language')}>
      {LANGS.map((option) => {
        const active = option.value === lang;
        return (
          <Box key={option.value} as="button" px={2} py={1} borderRadius="md" fontSize="xs"
            aria-pressed={active} onClick={() => setLang(option.value)}
            bg={active ? 'whiteAlpha.200' : 'transparent'}
            color={active ? 'yellow.300' : 'gray.500'}
            fontWeight={active ? 'bold' : 'normal'}
            _hover={{ bg: 'whiteAlpha.100', color: 'gray.100' }}>
            {option.label}
          </Box>
        );
      })}
    </HStack>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  const t = useT();
  return (
    <Flex direction="column" minH="100vh">
      <Box as="header" borderBottom="1px solid" borderColor="whiteAlpha.200"
        bg="gray.800" position="sticky" top={0} zIndex={10}>
        <Container maxW="container.xl" py={2}>
          <Flex align="center" wrap="wrap" gap={3}>
            <Text fontWeight="bold" letterSpacing="wide">MAD Viewer</Text>
            <Flex gap={1}>
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Box key={item.href} as={NextLink} href={item.href} px={3} py={1}
                    borderRadius="md" fontSize="sm"
                    bg={active ? 'whiteAlpha.200' : 'transparent'}
                    color={active ? 'yellow.300' : 'gray.400'}
                    fontWeight={active ? 'bold' : 'normal'}
                    _hover={{ bg: 'whiteAlpha.100', color: 'gray.100' }}>
                    {t(item.label)}
                  </Box>
                );
              })}
            </Flex>
            <Box flex="1" />
            <LanguagePicker />
          </Flex>
        </Container>
      </Box>
      <Box as="main" flex="1">
        <Container maxW="container.xl" py={4}>{children}</Container>
      </Box>
    </Flex>
  );
}
