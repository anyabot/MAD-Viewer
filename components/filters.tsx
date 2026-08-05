import { Box, Flex, Text, Wrap, WrapItem } from '@chakra-ui/react';

// The chips wrap rather than scroll, so nothing is hidden on a narrow screen.
export function FilterRow({ label, children }: {
  label: string; children: React.ReactNode;
}) {
  return (
    <Flex align="baseline" gap={2} wrap="wrap">
      <Text fontSize="xs" color="gray.500" minW="60px" textTransform="uppercase"
        letterSpacing="wide">{label}</Text>
      <Wrap spacing={1} flex="1" minW={0}>
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
    <Box as="button" onClick={onClick} px={2} py={1} borderRadius="full" fontSize="xs"
      display="flex" alignItems="center" gap={1} borderWidth="1px"
      borderColor={active ? (color ?? 'yellow.400') : 'whiteAlpha.300'}
      bg={active ? 'whiteAlpha.300' : 'whiteAlpha.100'}
      color={active ? 'white' : 'gray.300'} fontWeight={active ? 'bold' : 'normal'}
      _hover={{ bg: 'whiteAlpha.400' }} transition="background 0.15s">
      {children}
    </Box>
  );
}
