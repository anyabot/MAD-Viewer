import { Box, Flex, Text, Wrap, WrapItem } from '@chakra-ui/react';

export function FilterRow({ label, children }: {
  label: string; children: React.ReactNode;
}) {
  return (
    <Flex align="center" gap={{ base: 1.5, sm: 3 }} wrap="wrap"
      py={1.5} borderBottomWidth="1px" borderColor="whiteAlpha.100">
      <Text fontSize="0.65rem" color="gray.500" minW={{ base: '100%', sm: '72px' }}
        textTransform="uppercase" letterSpacing="0.11em" fontWeight="700">{label}</Text>
      <Wrap spacing={1.5} flex="1" minW={0}>
        {Array.isArray(children)
          ? children.map((child, i) => <WrapItem key={i}>{child}</WrapItem>)
          : <WrapItem>{children}</WrapItem>}
      </Wrap>
    </Flex>
  );
}

export function FilterChip({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color?: string; children: React.ReactNode;
}) {
  return (
    <Box as="button" onClick={onClick} px={2.5} py={1.5} minH="32px"
      borderRadius="full" fontSize="xs" display="flex" alignItems="center" gap={1.5}
      borderWidth="1px" borderColor={active ? (color ?? 'yellow.400') : 'whiteAlpha.200'}
      bg={active ? 'whiteAlpha.300' : 'whiteAlpha.50'}
      color={active ? 'white' : 'gray.300'} fontWeight={active ? '700' : '500'}
      boxShadow={active ? `0 0 0 1px ${color ?? 'rgba(246, 196, 69, 0.18)'}` : 'none'}
      _hover={{ bg: active ? 'whiteAlpha.300' : 'whiteAlpha.100', borderColor: active
        ? (color ?? 'yellow.400') : 'whiteAlpha.400' }}
      transition="background 0.15s, border-color 0.15s, color 0.15s">
      {children}
    </Box>
  );
}
