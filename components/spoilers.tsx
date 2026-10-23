import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader,
  AlertDialogOverlay, Box, Button, useToast,
} from '@chakra-ui/react';
import { useT } from '@/lib/i18n';
import { useSpoilers } from '@/lib/spoilers';

export function SpoilerToggle() {
  const t = useT();
  const { show, setShow } = useSpoilers();
  const [asking, setAsking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Box as="button" px={2.5} py={1.5} borderRadius="lg" fontSize="xs" borderWidth="1px"
        borderColor={show ? 'red.400' : 'whiteAlpha.200'} bg={show ? 'red.900' : 'blackAlpha.300'}
        color={show ? 'red.200' : 'gray.400'} aria-pressed={show} title={t('spoilersHint')}
        onClick={() => (show ? setShow(false) : setAsking(true))}>
        {show ? t('spoilersOn') : t('spoilersOff')}
      </Box>
      <AlertDialog isOpen={asking} leastDestructiveRef={cancelRef} onClose={() => setAsking(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader>{t('spoilersConfirmTitle')}</AlertDialogHeader>
            <AlertDialogBody>{t('spoilersConfirmBody')}</AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" onClick={() => setAsking(false)}>{t('planCancel')}</Button>
              <Button size="sm" colorScheme="red" onClick={() => { setShow(true); setAsking(false); }}>
                {t('spoilersConfirm')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
}

// Leaves a spoiler page for `back` with a warning while spoilers are hidden; `spoiler` is null while unknown.
export function useSpoilerGate(spoiler: boolean | null, back: string): boolean {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { show, ready } = useSpoilers();
  const blocked = ready && !show && spoiler === true;
  useEffect(() => {
    if (!blocked) return;
    if (!toast.isActive('spoiler-gate')) {
      toast({ id: 'spoiler-gate', status: 'warning', title: t('spoilersBlocked'), duration: 6000, isClosable: true });
    }
    void router.replace(back);
  }, [blocked, back]); // eslint-disable-line react-hooks/exhaustive-deps
  return blocked;
}
