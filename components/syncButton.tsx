import { useRef } from 'react';
import {
  Box, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Popover, PopoverBody, PopoverContent, PopoverTrigger, Text, VStack,
} from '@altterisk/game-hub/ui';
import type { DriveSync } from '@altterisk/game-hub/sync';
import { useT } from '@/lib/i18n';
import { driveSync } from '@/lib/sync';

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function SyncButton() {
  return driveSync ? <SyncControl sync={driveSync} /> : null;
}

export function SyncConflict() {
  return driveSync ? <ConflictModal sync={driveSync} /> : null;
}

function SyncControl({ sync }: { sync: DriveSync }) {
  const t = useT();
  const state = sync.use();
  const on = state.status !== 'off' && state.status !== 'connecting';
  const warn = state.status === 'expired' || state.status === 'error';
  const statusText = state.status === 'syncing' ? t('syncSyncing')
    : state.status === 'expired' ? t('syncExpired')
      : state.status === 'error' ? t('syncError')
        : state.lastSync ? t('syncSynced', { time: time(state.lastSync) }) : null;
  return (
    <>
      <Popover trigger="click" isLazy placement="bottom-end">
        <PopoverTrigger>
          <Box as="button" px={2.5} py={1.5} borderRadius="lg" fontSize="xs" borderWidth="1px"
            borderColor={warn ? 'orange.400' : on ? 'accent.400' : 'whiteAlpha.200'} bg="blackAlpha.300"
            color={warn ? 'orange.200' : on ? 'accent.300' : 'gray.400'} title={t('syncHint')}>
            {t('syncLabel')}
          </Box>
        </PopoverTrigger>
        <PopoverContent bg="gray.800" borderColor="whiteAlpha.300" w="16rem" maxW="calc(100vw - 2rem)">
          <PopoverBody p={3}>
            {!on ? (
              <VStack align="stretch" spacing={2}>
                <Text fontSize="xs" color="gray.400">{t('syncHint')}</Text>
                <Button size="sm" isLoading={state.status === 'connecting'} onClick={() => void sync.connect()}>
                  {t('syncSignIn')}
                </Button>
                {state.error && <Text fontSize="xs" color="orange.300">{state.error}</Text>}
              </VStack>
            ) : (
              <VStack align="stretch" spacing={2}>
                {state.email && <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{state.email}</Text>}
                {statusText && <Text fontSize="xs" color={warn ? 'orange.300' : 'gray.400'}>{statusText}</Text>}
                {state.status === 'expired' ? (
                  <Button size="sm" onClick={() => void sync.connect()}>{t('syncReconnect')}</Button>
                ) : (
                  <Button size="sm" isLoading={state.status === 'syncing'} onClick={() => void sync.syncNow()}>
                    {t('syncNow')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => sync.disconnect()}>{t('syncSignOut')}</Button>
              </VStack>
            )}
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </>
  );
}

function ConflictModal({ sync }: { sync: DriveSync }) {
  const t = useT();
  const state = sync.use();
  const keepRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Modal isOpen={state.status === 'conflict'} initialFocusRef={keepRef} closeOnOverlayClick={false}
        onClose={() => undefined} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>{t('syncConflictTitle')}</ModalHeader>
          <ModalBody>{t('syncConflictBody')}</ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            <Button ref={keepRef} size="sm" onClick={() => void sync.resolve('local')}>{t('syncKeepLocal')}</Button>
            <Button size="sm" colorScheme="accent" onClick={() => void sync.resolve('remote')}>
              {t('syncKeepRemote')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
