import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel, Badge, Box, Button,
  Center, Flex, HStack, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { RewardSlot } from '@/components/eventsBoard';
import { GameIcon } from '@/components/gameIcon';
import { PlayerText, SceneLines } from '@/components/storyLines';
import {
  KIND_COLOR, KIND_LABEL, loadBondText,
  type BondChat, type BondIndex, type BondMessage, type BondScene, type BondStoryPart, type BondText,
  type CharacterData, type IconManifest,
} from '@/lib/data';
import { gameText, useGameLang } from '@/lib/gameText';
import { dataText, useLang, useT } from '@/lib/i18n';

export function BondChats({ code, chats, refs, chars, icons, skinKeys }: {
  code: string; chats: BondChat[]; refs: BondIndex['refs']; chars: CharacterData;
  icons: IconManifest | null; skinKeys: Set<string>;
}) {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const [text, setText] = useState<BondText | null>(null);
  const [failed, setFailed] = useState(false);
  const hasText = chats.some((c) => c.lines || c.story);

  useEffect(() => {
    setText(null);
    setFailed(false);
    if (hasText) loadBondText(gameLang, code).then(setText).catch(() => setFailed(true));
  }, [gameLang, code, hasText]);

  return (
    <VStack align="stretch" spacing={3}>
      {failed && <Text color="red.400" fontSize="sm">{t('bondMissing')}</Text>}
      <Accordion allowMultiple defaultIndex={[0]} key={code}>
        {chats.map((chat) => (
          <AccordionItem key={chat.id} borderColor="whiteAlpha.200">
            <AccordionButton px={2} py={3} _hover={{ bg: 'whiteAlpha.50' }}>
              <HStack flex="1" spacing={2} wrap="wrap" textAlign="left" minW={0}>
                <Badge colorScheme="pink" fontSize="0.6rem">{t('bondLevel', { n: chat.level })}</Badge>
                <Text fontWeight="bold" fontSize="sm">{gameText(chat.name, gameLang)}</Text>
                {chat.scene && (
                  <Badge colorScheme={KIND_COLOR[chat.scene.kind]} fontSize="0.6rem">
                    {KIND_LABEL[chat.scene.kind][lang]}
                  </Badge>
                )}
                {!!chat.lines && (
                  <Text fontSize="xs" color="gray.500">{t('bondMessages', { n: chat.lines })}</Text>
                )}
              </HStack>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel px={{ base: 1, md: 4 }} pb={4}>
              <VStack align="stretch" spacing={3}>
                {(chat.rewards?.length || chat.scene) && (
                  <Wrap spacing={2} align="center">
                    {chat.scene && (
                      <WrapItem>
                        <SceneCard code={code} scene={chat.scene} icons={icons} skinKeys={skinKeys} />
                      </WrapItem>
                    )}
                    {(chat.rewards ?? []).map((reward, i) => (
                      <WrapItem key={i}>
                        <RewardSlot reward={reward} refs={refs} icons={icons} gameLang={gameLang} />
                      </WrapItem>
                    ))}
                  </Wrap>
                )}
                {!chat.lines && !chat.story ? (
                  <Text fontSize="sm" color="gray.500">{t('bondNoText')}</Text>
                ) : !text ? (
                  !failed && <Center py={4}><Spinner size="sm" /></Center>
                ) : (
                  <Thread chat={chat} body={text.chats[String(chat.id)]} code={code} chars={chars}
                    icons={icons} skinKeys={skinKeys} />
                )}
              </VStack>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </VStack>
  );
}

function Thread({ chat, body, code, chars, icons, skinKeys }: {
  chat: BondChat; body: BondText['chats'][string] | undefined; code: string; chars: CharacterData;
  icons: IconManifest | null; skinKeys: Set<string>;
}) {
  const t = useT();
  const gameLang = useGameLang();
  const messages = body?.chat ?? [];
  const story = body?.story ?? [];
  if (!messages.length && !story.length) return <Text fontSize="sm" color="gray.500">{t('bondNoText')}</Text>;
  const storyCard = (key: string | number) => (
    <StoryCard key={key} chat={chat} parts={story} code={code} chars={chars} icons={icons}
      skinKeys={skinKeys} />
  );
  const marked = messages.some((m) => m.k === 'story');

  return (
    <VStack align="stretch" spacing={1.5} maxW="34rem" w="100%" mx="auto" p={{ base: 2, md: 3 }}
      borderRadius="xl" bg="blackAlpha.400" borderWidth="1px" borderColor="whiteAlpha.100" lang={gameLang}>
      {messages.map((m, i) => {
        if (m.k === 'story') return story.length ? storyCard(i) : null;
        if (m.k === 'system') {
          return (
            <Center key={i} py={1}>
              <Text fontSize="xs" color="gray.400" bg="whiteAlpha.100" px={3} py={1} borderRadius="full"
                textAlign="center" whiteSpace="pre-wrap"><PlayerText text={m.t} /></Text>
            </Center>
          );
        }
        if (m.k === 'reply') return <Reply key={i} options={m.o} />;
        if (m.p) return <Reply key={i} options={[m.t]} />;
        return <Incoming key={i} message={m} first={senderOf(messages[i - 1]) !== senderOf(m)}
          chars={chars} icons={icons} />;
      })}
      {!marked && story.length > 0 && storyCard('end')}
    </VStack>
  );
}

function senderOf(m: BondMessage | undefined): string | null {
  return m?.k === 'msg' && !m.p ? `${m.c ?? ''}|${m.n ?? ''}|${m.u ?? ''}` : null;
}

function Incoming({ message, first, chars, icons }: {
  message: Extract<BondMessage, { k: 'msg' }>; first: boolean; chars: CharacterData;
  icons: IconManifest | null;
}) {
  const t = useT();
  const entry = message.c && !message.u ? chars.characters[message.c] : undefined;
  return (
    <Flex gap={2} align="start" pt={first ? 1 : 0}>
      <Box boxSize={8} flexShrink={0}>
        {first && (
          <GameIcon manifest={icons} group="char"
            names={entry ? [entry.iconPath, `Icon_${message.c}`] : []}
            size={8} borderRadius="full" />
        )}
      </Box>
      <VStack align="start" spacing={0.5} minW={0} maxW="80%">
        {first && (
          <Text fontSize="xs" fontWeight="bold" color={message.u ? 'gray.400' : 'gray.200'}>
            {message.u ? t('bondUnknown') : message.n}
          </Text>
        )}
        <Box bg="whiteAlpha.200" px={3} py={1.5} borderRadius="2xl" borderTopLeftRadius={first ? 'sm' : '2xl'}
          fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">
          <PlayerText text={message.t} />
        </Box>
      </VStack>
    </Flex>
  );
}

function Reply({ options }: { options: string[] }) {
  const t = useT();
  const several = options.length > 1;
  return (
    <VStack align="end" spacing={1} pt={1}>
      {several && <Text fontSize="2xs" color="gray.500">{t('bondReplies')}</Text>}
      {options.map((option, i) => (
        <Box key={i} maxW="80%" px={3} py={1.5} borderRadius="2xl" borderTopRightRadius="sm" fontSize="sm"
          whiteSpace="pre-wrap" wordBreak="break-word"
          {...(several
            ? { borderWidth: '1px', borderStyle: 'dashed', borderColor: 'yellow.400', color: 'yellow.100' }
            : { bg: 'yellow.400', color: 'gray.900' })}>
          <PlayerText text={option} />
        </Box>
      ))}
    </VStack>
  );
}

function StoryCard({ chat, parts, code, chars, icons, skinKeys }: {
  chat: BondChat; parts: BondStoryPart[]; code: string; chars: CharacterData;
  icons: IconManifest | null; skinKeys: Set<string>;
}) {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const [open, setOpen] = useState(false);
  return (
    <Box my={2} borderWidth="1px" borderColor="pink.400" borderRadius="lg" bg="whiteAlpha.50">
      <Flex align="center" gap={2} px={3} py={2} wrap="wrap">
        <Box minW={0} flex="1">
          <Text fontSize="2xs" color="pink.300" textTransform="uppercase" letterSpacing="wide">
            {dataText(lang, '인연 스토리', 'Bond Story')}
          </Text>
          <Text fontSize="sm" fontWeight="bold">{gameText(chat.name, gameLang)}</Text>
        </Box>
        <Button size="xs" variant="outline" colorScheme="pink" onClick={() => setOpen((v) => !v)}
          aria-expanded={open}>
          {open ? t('bondHide') : t('bondRead')}
        </Button>
      </Flex>
      {open && (
        <VStack align="stretch" spacing={3} px={{ base: 2, md: 3 }} pb={3}>
          {parts.map((part, i) => (part.k === 'text' ? (
            <SceneLines key={i} lines={part.lines} chars={chars} icons={icons} voice={null} lang={gameLang} />
          ) : (
            <Center key={i}>
              {chat.scene?.kind === part.kind ? (
                <SceneCard code={code} scene={chat.scene} icons={icons} skinKeys={skinKeys} />
              ) : (
                <Badge colorScheme={KIND_COLOR[part.kind]}>{KIND_LABEL[part.kind][lang]}</Badge>
              )}
            </Center>
          )))}
        </VStack>
      )}
    </Box>
  );
}

function SceneCard({ code, scene, icons, skinKeys }: {
  code: string; scene: BondScene; icons: IconManifest | null; skinKeys: Set<string>;
}) {
  const t = useT();
  const lang = useLang();
  const gameLang = useGameLang();
  const playable = !!scene.key && skinKeys.has(scene.key);
  return (
    <HStack spacing={2} p={1.5} pr={3} borderRadius="md" bg="whiteAlpha.100" borderWidth="1px"
      borderColor={`${KIND_COLOR[scene.kind]}.400`}
      {...(playable ? {
        as: NextLink,
        href: { pathname: '/character', query: { code, skin: scene.key, tab: 'skins' } },
        _hover: { bg: 'whiteAlpha.200' },
      } : {})}>
      <GameIcon manifest={icons} group="skin" name={scene.thumb} size={12} borderRadius="sm" />
      <Box minW={0}>
        <Badge colorScheme={KIND_COLOR[scene.kind]} fontSize="0.55rem">{KIND_LABEL[scene.kind][lang]}</Badge>
        <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{gameText(scene.name, gameLang)}</Text>
        {playable && <Text fontSize="2xs" color="yellow.300">{t('bondOpenScene')} →</Text>}
      </Box>
    </HStack>
  );
}
