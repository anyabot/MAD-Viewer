import { Box, Container, Flex, HStack } from '@chakra-ui/react';
import { HubBar, HubFooter } from '@altterisk/game-hub';
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
  const { pathname, basePath } = useRouter();
  const t = useT();
  return (
    <Flex direction="column" minH="100vh">
      <HubBar
        game="mad"
        homeHref={`${basePath}/`}
        labels={{ switchGame: t('hubSwitchGame'), allGames: t('hubAllGames'), here: t('hubHere') }}
        renderHomeLink={({ className, children: brand }) => (
          <NextLink href="/" className={className}>{brand}</NextLink>
        )}
        nav={NAV.map((item) => (
          <NextLink key={item.href} href={item.href}
            aria-current={item.match(pathname) ? 'page' : undefined}>
            {t(item.label)}
          </NextLink>
        ))}
        actions={<LanguagePicker />}
      />
      <Box as="main" flex="1">
        <Container maxW="90rem" px={{ base: 3, md: 6 }} py={{ base: 4, md: 6 }}
          pb={{ base: 8, md: 12 }}>
          {children}
        </Container>
      </Box>
      <HubFooter game="mad"
        labels={{ source: t('hubSource'), portfolio: t('hubPortfolio'), allGames: t('hubAllGames') }} />
    </Flex>
  );
}
