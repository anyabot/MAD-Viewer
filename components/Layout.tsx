import { Box, Container, Flex, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';

// Two routes reach the viewer: the skin gallery (every rig, by asset key) and
// the character list (every character, by the game's own filters). `/character`
// is a leaf of the list, so it lights the same tab.
const NAV = [
  { href: '/', label: 'Skins', match: (p: string) => p === '/' },
  {
    href: '/characters',
    label: 'Characters',
    match: (p: string) => p.startsWith('/character'),
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
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
                    {item.label}
                  </Box>
                );
              })}
            </Flex>
            <Text fontSize="xs" color="gray.500" display={{ base: 'none', md: 'block' }}>
              Spine rig viewer for Make Drama skins
            </Text>
          </Flex>
        </Container>
      </Box>
      <Box as="main" flex="1">
        <Container maxW="container.xl" py={4}>{children}</Container>
      </Box>
    </Flex>
  );
}
