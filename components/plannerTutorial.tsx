import { useEffect, useState } from 'react';
import {
  Box, Flex, HStack, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  ModalOverlay, Text,
} from '@chakra-ui/react';
import { useSeen, useShouldShow } from '@/lib/seenStore';
import { useT, type UiKey } from '@/lib/i18n';

export const PLANNER_TUTORIAL = 'planner';

const STEPS: { title: UiKey; body: UiKey }[] = [
  { title: 'tutAddTitle', body: 'tutAddBody' },
  { title: 'tutPlanTitle', body: 'tutPlanBody' },
  { title: 'tutStockTitle', body: 'tutStockBody' },
  { title: 'tutRunTitle', body: 'tutRunBody' },
];

/** Shown once, the first time the Planner is opened; `mad.tutorial` remembers. */
export function PlannerTutorial() {
  const t = useT();
  const show = useShouldShow(PLANNER_TUTORIAL);
  const markSeen = useSeen((s) => s.markSeen);
  const [step, setStep] = useState(0);
  // a replay reopens the same component, so the last step would still be showing
  useEffect(() => { if (show) setStep(0); }, [show]);

  const close = () => markSeen(PLANNER_TUTORIAL);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <Modal isOpen={show} onClose={close} size="lg" isCentered>
      <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(6px)" />
      <ModalContent bg="gray.900" borderWidth="1px" borderColor="yellow.500"
        mx={{ base: 3, md: 6 }}>
        <ModalHeader pb={1}>
          <Text fontSize="0.6rem" color="yellow.400" textTransform="uppercase"
            letterSpacing="0.14em" fontWeight="800">
            {t('tutStep', { n: step + 1, total: STEPS.length })}
          </Text>
          <Text fontSize="lg">{t(current.title)}</Text>
        </ModalHeader>
        <ModalBody>
          <Text fontSize="sm" color="gray.300">{t(current.body)}</Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <HStack spacing={1.5} mr="auto">
            {STEPS.map((s, i) => (
              <Box key={s.title} as="button" aria-label={t('tutStep', { n: i + 1, total: STEPS.length })}
                boxSize="9px" borderRadius="full" onClick={() => setStep(i)}
                bg={i === step ? 'yellow.400' : 'whiteAlpha.300'}
                _hover={{ bg: i === step ? 'yellow.300' : 'whiteAlpha.500' }} />
            ))}
          </HStack>
          <Box as="button" px={3} py={1.5} fontSize="sm" borderRadius="md"
            borderWidth="1px" borderColor="whiteAlpha.200"
            color={step ? 'gray.300' : 'whiteAlpha.300'}
            cursor={step ? 'pointer' : 'not-allowed'}
            _hover={step ? { color: 'gray.100', borderColor: 'whiteAlpha.400' } : undefined}
            onClick={() => step && setStep(step - 1)}>{t('tutBack')}</Box>
          <Box as="button" px={3} py={1.5} fontSize="sm" borderRadius="md"
            borderWidth="1px" borderColor="whiteAlpha.200" color="gray.400"
            _hover={{ color: 'gray.100', borderColor: 'whiteAlpha.400' }}
            onClick={close}>{t('tutSkip')}</Box>
          <Box as="button" px={4} py={1.5} fontSize="sm" borderRadius="md"
            fontWeight="700" bg="yellow.400" color="gray.900"
            _hover={{ bg: 'yellow.300' }}
            onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? t('tutDone') : t('tutNext')}
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** Puts the one-time tutorial back within reach once it has been dismissed. */
export function TutorialReplay() {
  const t = useT();
  const show = useShouldShow(PLANNER_TUTORIAL);
  const reset = useSeen((s) => s.reset);
  if (show) return null;
  return (
    <Flex as="button" align="center" fontSize="xs" color="gray.500"
      _hover={{ color: 'yellow.200' }}
      onClick={() => reset(PLANNER_TUTORIAL)}>{t('tutReplay')}</Flex>
  );
}
