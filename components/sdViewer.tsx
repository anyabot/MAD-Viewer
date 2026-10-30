import { Box, Button, Flex, Select, Spinner, Text } from '@altterisk/game-hub/ui';
import { useEffect, useRef, useState } from 'react';

import { useLang, useT } from '@/lib/i18n';
import type { SdCharacter } from '@/lib/data';
import {
  loadSdArchive, readBytes, readText, urlFor,
} from '@/lib/skinArchive';
import { guardClearedClippingAttachment } from '@/components/sdViewer/clipping';
import { createCutinEffects } from '@/components/sdViewer/effects';
import { curveAt, frameBounds, shakeOffset } from '@/components/sdViewer/timeline';
import { MAX_RECORD_DIM, speedOptions } from '@/components/skinViewer/constants';
import {
  canRecordCanvas, startCanvasVideo, type VideoRecording,
} from '@/components/skinViewer/exportVideo';
import { createPixiApp, type PixiAppHandle } from '@altterisk/game-hub/spine';

// The battle scene's CharacterCamera lens, in radians.
const CAMERA_FOV = 20 * Math.PI / 180;

export default function SdViewer({ character }: { character: SdCharacter }) {
  const t = useT();
  const lang = useLang();
  const hostRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<any>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const animationRef = useRef(character.defaultAnimation
    ?? character.animations[0] ?? '');
  const [animation, setAnimation] = useState(animationRef.current);
  const [playbackRun, setPlaybackRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const appRef = useRef<any>(null);
  const recordingRef = useRef<VideoRecording | null>(null);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  playingRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    const next = character.defaultAnimation ?? character.animations[0] ?? '';
    animationRef.current = next;
    setAnimation(next);
  }, [character]);

  useEffect(() => {
    let destroyed = false;
    let app: any = null;
    let pixi: PixiAppHandle | null = null;
    let cutinEffects: Awaited<ReturnType<typeof createCutinEffects>> | null = null;
    let tick: (() => void) | null = null;
    let resize: (() => void) | null = null;
    const surface = hostRef.current;
    const cacheKey = `sd:${character.archive}`;
    setReady(false);
    setError(null);
    spineRef.current = null;

    (async () => {
      const [PIXI, spineRuntime, files] = await Promise.all([
        import('pixi.js'),
        import('@esotericsoftware/spine-pixi-v8') as Promise<any>,
        loadSdArchive(character.archive),
      ]);
      const {
        Spine, SkeletonBinary, AtlasAttachmentLoader, TextureAtlas, SpineTexture,
      } = spineRuntime;
      const atlas = new TextureAtlas(await readText(files, character.atlas));
      await Promise.all(atlas.pages.map(async (page: any) => {
        const texture = await PIXI.Assets.load({
          src: urlFor(cacheKey, files, page.name),
          loadParser: 'loadTextures',
          data: {
            alphaMode: page.pma
              ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload',
          },
        });
        page.setTexture(SpineTexture.from(texture.source));
      }));
      const binary = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
      binary.scale = character.dataScale;
      const skeletonData = binary.readSkeletonData(await readBytes(files, character.skel));
      const spine = new Spine({ skeletonData });
      guardClearedClippingAttachment(spine);
      spine.state.timeScale = playingRef.current ? speedRef.current : 0;
      const initial = animationRef.current;
      if (initial) spine.state.setAnimation(0, initial, character.loop ?? true);
      spine.update(0);
      if (destroyed) return;

      pixi = await createPixiApp({
        PIXI, host: surface!, cancelled: () => destroyed,
        init: { background: 0x111827, autoDensity: false },
      });
      if (!pixi) return;
      app = pixi.app;
      appRef.current = app;
      app.stage.addChild(spine);
      spineRef.current = spine;

      cutinEffects = await createCutinEffects({
        PIXI,
        spine,
        files,
        cacheKey,
        effects: character.cutin?.effects ?? [],
        skeletonOrder: character.cutin?.skeletonOrder,
        unitScale: character.cutin?.unitScale,
        meshes: character.cutin?.meshes,
        screen: () => app.screen,
      });

      const frame = (bounds: { x: number; y: number; width: number; height: number }) => {
        spine.scale.set(1);
        spine.position.set(0, 0);
        spine.rotation = 0;
        const transform = frameBounds(app.screen, bounds);
        spine.scale.set(transform.scale);
        spine.position.set(transform.x, transform.y);
      };
      // The cut-in keeps the idle framing: the game does not zoom the unit to its pose.
      let framed = {
        x: character.bounds.x * character.dataScale,
        y: character.bounds.y * character.dataScale,
        width: character.bounds.width * character.dataScale,
        height: character.bounds.height * character.dataScale,
      };
      const fit = () => {
        const current = spine.state.getCurrent(0);
        if (current?.animation?.name !== character.cutin?.animation) {
          spine.update(0);
          const measured = spine.skeleton.getBoundsRect();
          if (measured.width > 0 && measured.height > 0) framed = measured;
        }
        frame(framed);
      };
      fit();
      fitRef.current = fit;
      resize = fit;
      window.addEventListener('resize', fit);
      tick = () => {
        const current = spine.state.getCurrent(0);
        const isCutin = current?.animation?.name === character.cutin?.animation;
        if (isCutin) {
          const offset = character.cutin?.cameraOffset;
          if (offset) {
            // CharacterCamera: perspective, vertical FOV 20, looking at its follow anchor (taken as the root) from the animated offset.
            const unit = character.cutin?.unitScale || 0.35;
            const t = current.trackTime;
            const [x, y, z] = [curveAt(offset.x, t), curveAt(offset.y, t), curveAt(offset.z, t)];
            const scale = app.screen.height * unit / (2 * Math.abs(z) * Math.tan(CAMERA_FOV / 2));
            // A positive camera roll turns the view clockwise, so the scene turns the other way on screen.
            const roll = offset.roll ? -(((curveAt(offset.roll, t) % 360) + 540) % 360 - 180) * Math.PI / 180 : 0;
            const ax = scale * x / unit;
            const ay = -scale * y / unit;
            spine.scale.set(scale);
            spine.rotation = roll;
            spine.position.set(
              app.screen.width / 2 - (ax * Math.cos(roll) - ay * Math.sin(roll)),
              app.screen.height / 2 - (ax * Math.sin(roll) + ay * Math.cos(roll)));
          } else {
            frame(framed);
          }
          const shake = shakeOffset(
            character.cutin?.shakes ?? [], current.trackTime);
          spine.position.x += shake.x;
          spine.position.y += shake.y;
        }
        cutinEffects?.tick(current, isCutin);
      };
      app.ticker.add(tick);
      setReady(true);
    })().catch((reason) => {
      if (!destroyed) setError(String(reason?.message ?? reason));
    });

    return () => {
      destroyed = true;
      recordingRef.current?.cancel();
      recordingRef.current = null;
      setRecording(false);
      appRef.current = null;
      if (resize) window.removeEventListener('resize', resize);
      if (app && tick) app.ticker.remove(tick);
      cutinEffects?.destroy();
      spineRef.current = null;
      fitRef.current = null;
      pixi?.dispose();
      surface?.replaceChildren();
    };
  }, [character]);

  useEffect(() => {
    animationRef.current = animation;
    const spine = spineRef.current;
    if (spine && animation) {
      const isCutin = animation === character.cutin?.animation;
      const entry = spine.state.setAnimation(0, animation, !isCutin);
      spine.update(0);
      fitRef.current?.();
      if (isCutin) {
        const idle = character.defaultAnimation ?? character.animations[0] ?? '';
        entry.listener = {
          complete: () => {
            if (spine.state.getCurrent(0) === entry) setAnimation(idle);
          },
        };
      }
    }
  }, [animation, character, playbackRun]);

  useEffect(() => {
    const spine = spineRef.current;
    if (spine) spine.state.timeScale = playing ? speed : 0;
  }, [playing, speed]);

  const handleRecord = () => {
    if (recordingRef.current) {
      recordingRef.current.stop();
      return;
    }
    const app = appRef.current;
    const host = hostRef.current;
    if (!app || !host || !canRecordCanvas()) {
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    const restore = app.renderer.resolution;
    const longEdge = Math.max(host.clientWidth, host.clientHeight);
    app.renderer.resolution = Math.max(1, Math.min(2, longEdge > 0 ? MAX_RECORD_DIM / longEdge : 1));
    let video: VideoRecording | null = null;
    try {
      video = startCanvasVideo({
        canvas: app.canvas,
        fileName: character.archive,
        onStop: () => {
          if (appRef.current) appRef.current.renderer.resolution = restore;
          if (recordingRef.current !== video) return;
          recordingRef.current = null;
          setRecording(false);
        },
      });
    } catch {
      video = null;
    }
    if (!video) {
      app.renderer.resolution = restore;
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    recordingRef.current = video;
    setVideoStatus(`${t(video.audio ? 'videoWithAudio' : 'videoVisualOnly')} ${video.width}×${video.height}`);
    setRecording(true);
  };

  const ordinaryAnimations = character.animations.filter(
    (name) => name !== character.cutin?.animation);

  return (
    <Flex direction="column" gap={2}>
      <Flex align="center" gap={2} wrap="wrap">
        <Text fontSize="sm" color="gray.500">{t('sdAnimation')}</Text>
        <Select size="sm" maxW="18rem" value={animation}
          onChange={(event) => setAnimation(event.target.value)}>
          {ordinaryAnimations.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
        {character.cutin && (
          <Button size="sm" colorScheme="accent" variant="outline"
            onClick={() => {
              setAnimation(character.cutin!.animation);
              setPlaybackRun((run) => run + 1);
            }}>
            {t('sdPlayCutin')}
          </Button>
        )}
        <Text fontSize="xs" color="gray.600">
          {t('animCount', { n: character.animations.length })}
        </Text>
      </Flex>
      <Flex align="center" gap={2} wrap="wrap">
        <Button size="sm" onClick={() => setPlaying((value) => !value)}
          isDisabled={!ready}>
          {playing ? t('btnPause') : t('btnPlay')}
        </Button>
        <Button size="sm" variant={recording ? 'solid' : 'outline'} colorScheme={recording ? 'red' : undefined}
          isDisabled={!ready} onClick={handleRecord}>
          {recording ? t('btnStopRecording') : t('btnRecordVideo')}
        </Button>
        <Button size="sm" variant="outline" isDisabled={!ready || !animation}
          onClick={() => setPlaybackRun((run) => run + 1)}>
          {t('btnRestart')}
        </Button>
        <Button size="sm" variant="outline" isDisabled={!ready}
          onClick={() => {
            const idle = character.defaultAnimation ?? character.animations[0] ?? '';
            setAnimation(idle);
            setPlaybackRun((run) => run + 1);
          }}>
          {t('btnReset')}
        </Button>
        <Text fontSize="sm" color="gray.500">{t('rowSpeed')}</Text>
        <Select size="sm" w="7rem" value={String(speed)}
          aria-label={t('ariaPlaybackSpeed')}
          onChange={(event) => setSpeed(Number(event.target.value))}>
          {speedOptions(lang).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        {videoStatus && <Text fontSize="xs" color="gray.500">{videoStatus}</Text>}
      </Flex>
      <Box position="relative" h={{ base: '440px', md: 'min(72vh, 720px)' }} minW={0}
        overflow="hidden" borderWidth="1px" borderColor="whiteAlpha.200"
        borderRadius="xl" bg="blackAlpha.300">
        <Box ref={hostRef} position="absolute" inset={0} className="mad-canvas-host" />
        {!ready && !error && (
          <Flex position="absolute" inset={0} align="center" justify="center">
            <Spinner />
          </Flex>
        )}
        {error && (
          <Flex position="absolute" inset={0} align="center" justify="center" p={4}>
            <Text fontSize="sm" color="red.300" textAlign="center">{error}</Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}
