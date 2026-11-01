import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Center, Flex, Spinner, Text, VStack, Wrap, WrapItem } from '@altterisk/game-hub/ui';
import { createPixiApp, type PixiAppHandle } from '@altterisk/game-hub/spine';
import {
  loadSceneAudio, loadSkinList, loadStoryBattles, loadStoryFx, loadStoryScript, loadStoryScriptIndex, type StoryBark, type StoryPart,
} from '@/lib/data';
import type { FxIndex } from './fx';
import { playBgm, stopBgm, stopSfx } from '@/lib/sceneAudio';
import { loadEmoticons } from '@/lib/emoticons';
import { gameText, useGameLang } from '@/lib/gameText';
import { useT } from '@/lib/i18n';
import { GameUi } from './gameUi';
import { StoryRuntime, type PrinterId, type StoryUi } from './runtime';
import { SCENE_H, SCENE_W, StoryStage } from './stage';

type Printed = { author: string; actor: string | null; text: string; printer: PrinterId };
const REVEAL_MS = 22;

export default function StoryPlayer({ parts }: { parts: StoryPart[] }) {
  const partsKey = JSON.stringify(parts);
  const t = useT();
  const lang = useGameLang();
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<(() => void) | null>(null);
  const runtimeRef = useRef<StoryRuntime | null>(null);
  const printerRef = useRef<HTMLDivElement>(null);
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
  const [fxIndex, setFxIndex] = useState<FxIndex | null>(null);
  const [bark, setBark] = useState<StoryBark | null>(null);
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
    setBark(null);

    const sequence = JSON.parse(partsKey) as StoryPart[];
    (async () => {
      const PIXI = await import('pixi.js');
      const SPINE = await import('@esotericsoftware/spine-pixi-v8') as any;
      const [index, audio, emoticons, fx, skins, battles] = await Promise.all([
        loadStoryScriptIndex(), loadSceneAudio().catch(() => null), loadEmoticons().catch(() => null),
        loadStoryFx<FxIndex>().catch(() => null), loadSkinList().catch(() => null),
        sequence.some((p) => 'battle' in p) ? loadStoryBattles().catch(() => null) : Promise.resolve(null),
      ]);
      if (destroyed) return;
      pixi = await createPixiApp({ PIXI, host, cancelled: () => destroyed, init: { background: 0x000000 } });
      if (!pixi) return;
      const app = pixi.app;
      const live = new StoryStage(PIXI, SPINE, app, index, (message) => console.warn('[story]', message));
      stage = live;
      live.emoticons = emoticons;
      live.fx = fx;
      setFxIndex(fx);
      live.skinStores = new Map((skins?.skins ?? []).map((s) => [s.key, s.stores]));
      const layout = () => live.resize(app.screen.width, app.screen.height);
      layout();
      app.renderer.on('resize', layout);
      const reports: Map<string, number>[] = [];
      const ui: StoryUi = {
        print: ({ author, actor, text, append, printer }) => {
          setLine((prev) => {
            const body = append && prev ? `${prev.text}${text}` : text;
            revealRef.current = { full: body.length, shown: append && prev ? prev.text.length : 0 };
            setShown(revealRef.current.shown);
            return { author: author || (append && prev ? prev.author : ''), actor: actor ?? (append && prev ? prev.actor : null), text: body, printer };
          });
        },
        hidePrinter: () => setLine(null),
        waitInput: () => new Promise((resolve) => { inputRef.current = resolve; }),
        choose: (options) => new Promise((resolve) => {
          setChoices({ options, pick: (i) => { setChoices(null); resolve(i); } });
        }),
        place: (text) => setPlace(text),
        report: (unsupported) => {
          if (!reports.includes(unsupported)) reports.push(unsupported);
          const total = new Map<string, number>();
          for (const map of reports) for (const [k, v] of map) total.set(k, (total.get(k) ?? 0) + v);
          setMissing([...total.entries()].sort((x, y) => y[1] - x[1]));
        },
        sound: () => soundRef.current,
        shakePrinter: (x, y) => {
          const node = printerRef.current;
          const unit = host.clientHeight / SCENE_H;
          if (node) node.style.transform = x || y ? `translate(${x * unit}px, ${-y * unit}px)` : '';
        },
      };
      const play = async (name: string, keepMusic: boolean) => {
        const data = await loadStoryScript(name);
        if (destroyed) return;
        runtime = new StoryRuntime(data, live, index, lang, ui, audio);
        runtime.keepMusic = keepMusic;
        runtimeRef.current = runtime;
        await runtime.run();
      };
      // A wait the viewer can cut short with a click.
      const pause = (seconds: number) => new Promise<void>((resolve) => {
        const timer = setTimeout(() => { inputRef.current = null; resolve(); }, seconds * 1000);
        inputRef.current = () => { clearTimeout(timer); resolve(); };
      });
      setState('playing');
      for (const part of sequence) {
        if (destroyed) return;
        if ('script' in part) { await play(part.script, false); continue; }
        // The battle itself is not fought: its music, barks and in-battle scripts play in firing order, then the forced win.
        const battle = battles?.[String(part.battle)];
        if (!battle) continue;
        await live.reviveBackground(0.5);
        if (battle.bgm && soundRef.current) {
          const track = audio?.bgm?.find((x) => x.id === battle.bgm || x.loop === battle.bgm);
          if (track) void playBgm(audio, track.loop, track.intro, 0.5);
        }
        for (const step of battle.steps) {
          if (destroyed) return;
          if (step.wait) await pause(step.wait);
          if (step.barks) {
            for (const bark of step.barks) {
              if (bark.delay) await pause(bark.delay);
              setBark(bark);
              await pause(bark.hold);
              setBark(null);
            }
          }
          if (step.script) await play(step.script, true);
          if (step.end) break;
        }
        stopBgm(1);
      }
      if (!destroyed) setState('done');
    })().catch((e) => { if (!destroyed) { setError(String(e)); setState('error'); } });

    return () => {
      destroyed = true;
      runtime?.stop();
      inputRef.current?.();
      stage?.dispose();
      pixi?.dispose();
    };
  }, [partsKey, lang, run]);

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

  return (
    <VStack align="stretch" spacing={2}>
      <Box position="relative" w="100%" bg="black" borderRadius="md" overflow="hidden"
        style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}` }} onClick={advance} cursor="pointer" userSelect="none">
        <Box ref={hostRef} position="absolute" inset={0} />
        <GameUi line={line && { ...line, text: printed, waiting: shown >= line.text.length }} choices={choices} place={place}
          fx={fxIndex} printerRef={printerRef} bark={bark && { icon: bark.icon, side: bark.side, text: gameText(bark.text ?? undefined, lang) }} />
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
