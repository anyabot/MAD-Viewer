import { useEffect, useRef, useState } from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';
import { useT } from '@/lib/i18n';

const SHARE_PATH = 'M18 16a3 3 0 0 0-2.4 1.2L8.9 13.8a3.2 3.2 0 0 0 0-3.6l6.7-3.4A3 3 0 1 0 15 4.2L8.3 7.6a3 3 0 1 0 0 8.8l6.7 3.4A3 3 0 1 0 18 16z';

type ShareQuery = Record<string, string | number | null | undefined>;

export function ShareButton({ query }: { query: ShareQuery }) {
  const t = useT();
  const [status, setStatus] = useState('');
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const url = new URL(window.location.href);
    url.search = '';
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    let message = t('shareCopied');
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      message = t('shareCopyFailed');
    }
    setStatus(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(''), 2500);
  };

  return (
    <HStack spacing={2} minW={0}>
      <Box as="button" type="button" onClick={copy} title={t('btnShare')}
        display="inline-flex" alignItems="center" gap={1.5} flexShrink={0}
        px={2.5} py={1} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md"
        fontSize="xs" color="gray.400" whiteSpace="nowrap"
        _hover={{ bg: 'whiteAlpha.100', color: 'gray.100', borderColor: 'whiteAlpha.400' }}
        transition="background 0.15s, color 0.15s">
        <Box as="svg" viewBox="0 0 24 24" width="13px" height="13px" fill="currentColor"
          aria-hidden="true">
          <path d={SHARE_PATH} />
        </Box>
        <Text as="span">{t('btnShare')}</Text>
      </Box>
      {status && <Text fontSize="xs" color="green.300" noOfLines={1}>{status}</Text>}
    </HStack>
  );
}
