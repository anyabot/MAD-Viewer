import { Box, HStack } from '@altterisk/game-hub/ui';
import { NavMenu, SiteShell, homeLink, routerLinks } from '@altterisk/game-hub';
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

const nextHome = homeLink(NextLink);
const nextLinks = routerLinks(NextLink);

function EtcMenu({ pathname }: { pathname: string }) {
  const t = useT();
  return (
    <NavMenu label={t('navEtc')} showActiveLabel renderLink={nextLinks}
      items={NAV_ETC.map((item) => ({ href: item.href, label: t(item.label), active: item.match(pathname) }))} />
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
            color={active ? 'accent.300' : 'gray.400'}
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
    <SiteShell
      game="mad"
      homeHref={`${basePath}/`}
      barLabels={{ switchGame: t('hubSwitchGame'), allGames: t('hubAllGames'), here: t('hubHere') }}
      renderHomeLink={nextHome}
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
      footer={{
        labels: {
          source: t('hubSource'), portfolio: t('hubPortfolio'), allGames: t('hubAllGames'),
          rights: (owner, title) => t('hubRights', { owner, title }),
          unowned: t('hubUnowned'), license: t('hubLicense'),
        },
      }}
      resetKey={pathname}
      errorLabels={{ title: t('hubErrorTitle'), hint: t('hubErrorHint'), retry: t('hubErrorRetry') }}
      skipLabel={t('hubSkip')}
      contentWidth="90rem"
      contained>
      {children}
    </SiteShell>
  );
}
