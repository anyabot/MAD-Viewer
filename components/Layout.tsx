import {
  Box, Container, Flex, HStack, Menu, MenuButton, MenuItem, MenuList, Portal,
} from '@chakra-ui/react';
import { HubBar, HubFooter } from '@altterisk/game-hub';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { GameTextPicker } from '@/components/gameTextPicker';
import { SpoilerToggle } from '@/components/spoilers';
import { LANGS, useLangStore, useT, type UiKey } from '@/lib/i18n';

type NavItem = { href: string; label: UiKey; match: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: '/viewer', label: 'navViewer', match: (p: string) => p === '/viewer' },
  {
    href: '/characters',
    label: 'navCharacters',
    match: (p: string) => p.startsWith('/character'),
  },
  { href: '/story', label: 'navStory', match: (p: string) => p === '/story' },
  { href: '/stages', label: 'navStages', match: (p: string) => p.startsWith('/stage') || p === '/events' },
  { href: '/items', label: 'navItems', match: (p: string) => p === '/items' || p === '/item' },
  { href: '/farm', label: 'navFarm', match: (p: string) => p === '/farm' },
  { href: '/party', label: 'navParty', match: (p: string) => p === '/party' },
];

const NAV_ETC: NavItem[] = [
  { href: '/effects', label: 'navEffects', match: (p: string) => p === '/effects' },
  { href: '/formula', label: 'navFormula', match: (p: string) => p === '/formula' },
  { href: '/field', label: 'navField', match: (p: string) => p === '/field' },
  { href: '/dps', label: 'navDps', match: (p: string) => p === '/dps' },
  { href: '/artists', label: 'navArtists', match: (p: string) => p === '/artists' },
  { href: '/jukebox', label: 'navJukebox', match: (p: string) => p === '/jukebox' },
  { href: '/chibis', label: 'navChibis', match: (p: string) => p === '/chibis' },
  { href: '/rewards', label: 'navRewards', match: (p: string) => p === '/rewards' },
  { href: '/shop', label: 'navShop', match: (p: string) => p === '/shop' },
  { href: '/gacha', label: 'navGacha', match: (p: string) => p === '/gacha' },
  { href: '/changelog', label: 'navChangelog', match: (p: string) => p === '/changelog' },
];

function EtcMenu({ pathname }: { pathname: string }) {
  const t = useT();
  const current = NAV_ETC.find((item) => item.match(pathname));
  return (
    <Menu isLazy placement="bottom-start">
      <MenuButton as="button" className="hub-navlink" bg="transparent" border="0"
        cursor="pointer" fontFamily="inherit" style={{ flexShrink: 0 }}
        aria-current={current ? 'page' : undefined}>
        {current ? `${t(current.label)} ▾` : `${t('navEtc')} ▾`}
      </MenuButton>
      <Portal>
        <MenuList zIndex="popover" minW="10rem">
          {NAV_ETC.map((item) => (
            <MenuItem key={item.href} as={NextLink} href={item.href}
              fontWeight={item.match(pathname) ? 'bold' : 'normal'}
              color={item.match(pathname) ? 'yellow.300' : undefined}>
              {t(item.label)}
            </MenuItem>
          ))}
        </MenuList>
      </Portal>
    </Menu>
  );
}

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
        nav={[
          ...NAV.map((item) => (
            <NextLink key={item.href} href={item.href}
              aria-current={item.match(pathname) ? 'page' : undefined}>
              {t(item.label)}
            </NextLink>
          )),
          <EtcMenu key="etc" pathname={pathname} />,
        ]}
        actions={<HStack spacing={2}><SpoilerToggle /><GameTextPicker /><LanguagePicker /></HStack>}
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
