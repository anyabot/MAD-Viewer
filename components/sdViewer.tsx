import { Box, Button, Flex, Select, Spinner, Text } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

import { useLang, useT } from '@/lib/i18n';
import type { SdCharacter } from '@/lib/data';
import {
  loadSdArchive, readBytes, readText, urlFor,
} from '@/lib/skinArchive';
import { guardClearedClippingAttachment } from '@/components/sdViewer/clipping';
import { createCutinEffects } from '@/components/sdViewer/effects';
import { frameBounds, shakeOffset } from '@/components/sdViewer/timeline';
import { speedOptions } from '@/components/skinViewer/constants';


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

      app = new PIXI.Application();
      await app.init({
        antialias: true,
        background: 0x111827,
        backgroundAlpha: 0,
        resizeTo: surface!,
      });
      if (destroyed) { app.destroy(true); return; }
      surface!.replaceChildren(app.canvas);
      app.stage.addChild(spine);
      spineRef.current = spine;

      cutinEffects = await createCutinEffects({
        PIXI,
        spine,
        files,
        cacheKey,
        effects: character.cutin?.effects ?? [],
      });

      const frame = (bounds: { x: number; y: number; width: number; height: number }) => {
        spine.scale.set(1);
        spine.position.set(0, 0);
        const transform = frameBounds(app.screen, bounds);
        spine.scale.set(transform.scale);
        spine.position.set(transform.x, transform.y);
      };
      const fit = () => {
        spine.update(0);
        const measured = spine.skeleton.getBoundsRect();
        const fallback = {
          x: character.bounds.x * character.dataScale,
          y: character.bounds.y * character.dataScale,
          width: character.bounds.width * character.dataScale,
          height: character.bounds.height * character.dataScale,
        };
        frame(measured.width > 0 && measured.height > 0 ? measured : fallback);
      };
      fit();
      fitRef.current = fit;
      resize = fit;
      window.addEventListener('resize', fit);
      tick = () => {
        const current = spine.state.getCurrent(0);
        const isCutin = current?.animation?.name === character.cutin?.animation;
        if (isCutin) {
          const bounds = spine.skeleton.getBoundsRect();
          if (bounds.width > 0 && bounds.height > 0) frame(bounds);
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
      if (resize) window.removeEventListener('resize', resize);
      if (app && tick) app.ticker.remove(tick);
      cutinEffects?.destroy();
      spineRef.current = null;
      fitRef.current = null;
      if (app) { try { app.destroy(true); } catch { /* already destroyed */ } }
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
          <Button size="sm" colorScheme="yellow" variant="outline"
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
      </Flex>
      <Box position="relative" h={{ base: '440px', md: 'min(72vh, 720px)' }} minW={0}
        overflow="hidden" borderWidth="1px" borderColor="whiteAlpha.200"
        borderRadius="xl" bg="blackAlpha.300">
        <Box ref={hostRef} position="absolute" inset={0}
          sx={{ '& canvas': { display: 'block' } }} />
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
