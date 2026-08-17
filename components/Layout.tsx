import { Box, Container, Flex, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { LANGS, useLangStore, useT, type UiKey } from '@/lib/i18n';

const NAV: { href: string; label: UiKey; match: (p: string) => boolean }[] = [
  { href: '/', label: 'navViewer', match: (p: string) => p === '/' },
  {
    href: '/characters',
    label: 'navCharacters',
    match: (p: string) => p.startsWith('/character'),
  },
  { href: '/effects', label: 'navEffects', match: (p: string) => p === '/effects' },
  { href: '/stages', label: 'navStages', match: (p: string) => p.startsWith('/stage') },
  { href: '/farm', label: 'navFarm', match: (p: string) => p === '/farm' },
  { href: '/changelog', label: 'navChangelog', match: (p: string) => p === '/changelog' },
];

function LanguagePicker() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <HStack spacing={0.5} role="group" aria-label={t('language')}
      p={0.5} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg"
      bg="blackAlpha.300">
      {LANGS.map((option) => {
        const active = option.value === lang;
        return (
          <Box key={option.value} as="button" px={2.5} py={1.5} borderRadius="md"
            minW="2.5rem" fontSize="xs"
            aria-pressed={active} onClick={() => setLang(option.value)}
            bg={active ? 'whiteAlpha.200' : 'transparent'}
            color={active ? 'yellow.300' : 'gray.400'}
            fontWeight={active ? 'bold' : 'normal'}
            _hover={{ bg: 'whiteAlpha.100', color: 'gray.100' }}
            transition="background 0.15s, color 0.15s">
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
        bg="rgba(11, 15, 23, 0.82)" backdropFilter="blur(18px) saturate(140%)"
        position="sticky" top={0} zIndex={10} boxShadow="0 1px 0 rgba(255,255,255,0.02)">
        <Container maxW="90rem" px={{ base: 3, md: 6 }} py={2}>
          <Flex align="center" gap={{ base: 2, md: 4 }} wrap="wrap">
            <HStack as={NextLink} href="/" spacing={2.5} flexShrink={0}
              _hover={{ textDecoration: 'none' }}>
              <Box boxSize="11px" bg="yellow.400" borderRadius="3px"
                transform="rotate(45deg)" boxShadow="0 0 18px rgba(246, 196, 69, 0.42)" />
              <Text fontWeight="800" letterSpacing="0.06em" whiteSpace="nowrap">
                MAD <Text as="span" color="gray.400" fontWeight="600">Viewer</Text>
              </Text>
            </HStack>
            <Flex as="nav" aria-label="Primary" gap={1} order={{ base: 3, md: 0 }}
              flex={{ base: '0 0 100%', md: '1' }} overflowX="auto" minW={0}
              mx={{ base: -1, md: 0 }} pb={{ base: 0.5, md: 0 }}>
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Box key={item.href} as={NextLink} href={item.href} px={3} py={2}
                    borderRadius="lg" fontSize="sm" whiteSpace="nowrap"
                    bg={active ? 'whiteAlpha.200' : 'transparent'}
                    color={active ? 'yellow.300' : 'gray.400'}
                    fontWeight={active ? 'bold' : 'normal'}
                    boxShadow={active ? 'inset 0 0 0 1px rgba(246, 196, 69, 0.12)' : 'none'}
                    _hover={{ bg: 'whiteAlpha.100', color: 'gray.100', textDecoration: 'none' }}
                    transition="background 0.15s, color 0.15s">
                    {t(item.label)}
                  </Box>
                );
              })}
            </Flex>
            <Box flex={{ base: '1', md: '0' }} />
            <LanguagePicker />
          </Flex>
        </Container>
      </Box>
      <Box as="main" flex="1">
        <Container maxW="90rem" px={{ base: 3, md: 6 }} py={{ base: 4, md: 6 }}
          pb={{ base: 8, md: 12 }}>
          {children}
        </Container>
      </Box>
    </Flex>
  );
}
