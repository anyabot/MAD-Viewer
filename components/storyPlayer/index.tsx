import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Center, Flex, Spinner, Text, VStack, Wrap, WrapItem } from '@altterisk/game-hub/ui';
import { createPixiApp, type PixiAppHandle } from '@altterisk/game-hub/spine';
import { LineText } from '@/components/storyLines';
import { loadSceneAudio, loadStoryScript, loadStoryScriptIndex } from '@/lib/data';
import { stopBgm, stopSfx } from '@/lib/sceneAudio';
import { useGameLang } from '@/lib/gameText';
import { useT } from '@/lib/i18n';
import { StoryRuntime, type PrinterId } from './runtime';
import { SCENE_H, SCENE_W, StoryStage } from './stage';

type Printed = { author: string; text: string; printer: PrinterId };
const REVEAL_MS = 22;

export default function StoryPlayer({ script }: { script: string }) {
  const t = useT();
  const lang = useGameLang();
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<(() => void) | null>(null);
  const runtimeRef = useRef<StoryRuntime | null>(null);
  const revealRef = useRef<{ full: number; shown: number }>({ full: 0, shown: 0 });
  const [line, setLine] = useState<Printed | null>(null);
  const [shown, setShown] = useState(0);
  const [choices, setChoices] = useState<{ options: string[]; pick: (i: number) => void } | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [missing, setMissing] = useState<[string, number][]>([]);
  const [state, setState] = useState<'loading' | 'playing' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    let destroyed = false;
    let pixi: PixiAppHandle | null = null;
    let stage: StoryStage | null = null;
    let runtime: StoryRuntime | null = null;
    const host = hostRef.current!;
    setState('loading');
    setLine(null);
    setChoices(null);
    setPlace(null);
    setMissing([]);

    (async () => {
      const PIXI = await import('pixi.js');
      const SPINE = await import('@esotericsoftware/spine-pixi-v8') as any;
      const [index, data, audio] = await Promise.all([
        loadStoryScriptIndex(), loadStoryScript(script), loadSceneAudio().catch(() => null),
      ]);
      if (destroyed) return;
      pixi = await createPixiApp({ PIXI, host, cancelled: () => destroyed, init: { background: 0x000000 } });
      if (!pixi) return;
      const app = pixi.app;
      stage = new StoryStage(PIXI, SPINE, app, index, (message) => console.warn('[story]', message));
      const layout = () => stage?.resize(app.screen.width, app.screen.height);
      layout();
      app.renderer.on('resize', layout);
      runtime = new StoryRuntime(data, stage, index, lang, {
        print: ({ author, text, append, printer }) => {
          setLine((prev) => {
            const body = append && prev ? `${prev.text}${text}` : text;
            revealRef.current = { full: body.length, shown: append && prev ? prev.text.length : 0 };
            setShown(revealRef.current.shown);
            return { author: author || (append && prev ? prev.author : ''), text: body, printer };
          });
        },
        hidePrinter: () => setLine(null),
        waitInput: () => new Promise((resolve) => { inputRef.current = resolve; }),
        choose: (options) => new Promise((resolve) => {
          setChoices({ options, pick: (i) => { setChoices(null); resolve(i); } });
        }),
        place: (text) => setPlace(text),
        report: (unsupported) => setMissing([...unsupported.entries()].sort((a, b) => b[1] - a[1])),
        sound: () => soundRef.current,
      }, audio);
      runtimeRef.current = runtime;
      setState('playing');
      await runtime.run();
      if (!destroyed) setState('done');
    })().catch((e) => { if (!destroyed) { setError(String(e)); setState('error'); } });

    return () => {
      destroyed = true;
      runtime?.stop();
      inputRef.current?.();
      stage?.dispose();
      pixi?.dispose();
    };
  }, [script, lang, run]);

  useEffect(() => {
    if (!line) return undefined;
    const timer = setInterval(() => {
      const reveal = revealRef.current;
      if (reveal.shown >= reveal.full) { clearInterval(timer); return; }
      reveal.shown += 1;
      setShown(reveal.shown);
    }, REVEAL_MS);
    return () => clearInterval(timer);
  }, [line]);

  const advance = useCallback(() => {
    if (choices) return;
    const reveal = revealRef.current;
    if (line && reveal.shown < reveal.full) {
      reveal.shown = reveal.full;
      setShown(reveal.full);
      return;
    }
    const resolve = inputRef.current;
    inputRef.current = null;
    resolve?.();
  }, [choices, line]);

  const printed = line ? line.text.slice(0, shown) : '';
  const centered = line?.printer === 'ExCenterSubtitle' || line?.printer === 'ExFullScreen';

  return (
    <VStack align="stretch" spacing={2}>
      <Box position="relative" w="100%" bg="black" borderRadius="md" overflow="hidden"
        style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}` }} onClick={advance} cursor="pointer" userSelect="none">
        <Box ref={hostRef} position="absolute" inset={0} />
        {place && (
          <Box position="absolute" top="6%" left="4%" px={3} py={1} bg="blackAlpha.700" borderRadius="md">
            <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.100">{place}</Text>
          </Box>
        )}
        {line && (centered ? (
          <Center position="absolute" inset={0} px="10%"
            bg={line.printer === 'ExFullScreen' ? 'blackAlpha.700' : undefined} pointerEvents="none">
            <Text fontSize={{ base: 'sm', md: 'xl' }} color="white" textAlign="center" whiteSpace="pre-wrap"
              style={{ textShadow: '0 0 6px #000' }}>
              <LineText text={printed} />
            </Text>
          </Center>
        ) : (
          <Box position="absolute" left="5%" right="5%" bottom="4%" minH="24%" px={{ base: 3, md: 6 }}
            py={{ base: 2, md: 4 }} bg="blackAlpha.700" borderWidth="1px" borderColor="whiteAlpha.300"
            borderRadius="lg" pointerEvents="none">
            {line.author && (
              <Text fontWeight="bold" fontSize={{ base: 'xs', md: 'md' }} color="accent.200" mb={1}>
                {line.author}
              </Text>
            )}
            <Text fontSize={{ base: 'xs', md: 'lg' }} color="white" whiteSpace="pre-wrap">
              <LineText text={printed} />
            </Text>
          </Box>
        ))}
        {choices && (
          <Center position="absolute" inset={0} bg="blackAlpha.500">
            <VStack spacing={2} w={{ base: '80%', md: '50%' }}>
              {choices.options.map((option, i) => (
                <Button key={i} w="100%" size="sm" whiteSpace="normal" h="auto" py={2}
                  onClick={(e) => { e.stopPropagation(); choices.pick(i); }}>
                  {option}
                </Button>
              ))}
            </VStack>
          </Center>
        )}
        {state === 'loading' && <Center position="absolute" inset={0}><Spinner /></Center>}
        {state === 'done' && (
          <Center position="absolute" inset={0} bg="blackAlpha.600">
            <Text color="gray.200">{t('storyEnd')}</Text>
          </Center>
        )}
      </Box>
      <Flex gap={2} wrap="wrap" align="center">
        <Button size="xs" variant="outline" onClick={() => setRun((n) => n + 1)}>{t('storyReplay')}</Button>
        <Button size="xs" variant={sound ? 'solid' : 'outline'}
          onClick={() => {
            soundRef.current = !sound;
            if (sound) { stopBgm(0.3); stopSfx(null); } else runtimeRef.current?.resumeMusic();
            setSound(!sound);
          }}>
          {t(sound ? 'storySoundOn' : 'storySoundOff')}
        </Button>
        {error && <Text fontSize="xs" color="red.400">{error}</Text>}
      </Flex>
      {missing.length > 0 && (
        <Box fontSize="0.65rem" color="gray.500">
          <Text mb={1}>{t('storyNotPlayed')}</Text>
          <Wrap spacing={1}>
            {missing.map(([name, count]) => (
              <WrapItem key={name}>
                <Text fontFamily="mono">{name} ×{count}</Text>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      )}
    </VStack>
  );
}
