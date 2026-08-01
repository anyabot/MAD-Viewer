import { Box, Container, Flex, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

// Single-page shell. The gallery is the whole app, so the header carries the
// title only — there is nothing to navigate between.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Flex direction="column" minH="100vh">
      <Box as="header" borderBottom="1px solid" borderColor="whiteAlpha.200"
        bg="gray.800" position="sticky" top={0} zIndex={10}>
        <Container maxW="container.xl" py={2}>
          <Flex align="center" wrap="wrap" gap={3}>
            <Text fontWeight="bold" letterSpacing="wide">MAD Viewer</Text>
            <Text fontSize="xs" color="gray.500">Spine rig viewer for Make Drama skins</Text>
          </Flex>
        </Container>
      </Box>
      <Box as="main" flex="1">
        <Container maxW="container.xl" py={4}>{children}</Container>
      </Box>
    </Flex>
  );
}
