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
import { createPixiApp, tightCrop, type PixiAppHandle } from '@altterisk/game-hub/spine';
import { saveBlob } from '@altterisk/game-hub/persist';
import { attachmentScales, sourcePixelScale } from '@/components/skinViewer/exportPng';
import { MAX_EXPORT_DIM } from '@/components/skinViewer/constants';
import {
  ANIM_FPS, canvasBlob, createGif, frameDelays, muxAnimatedWebp, muxApng,
  type AnimFormat, type StillFormat,
} from '@/components/sdViewer/animEncode';

type ExportFormat = StillFormat | AnimFormat;
const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'webp-anim', label: 'WebP (anim)' },
  { value: 'apng', label: 'APNG' },
  { value: 'gif', label: 'GIF' },
];
const GIF_MAX_DIM = 1080;

type Controls = {
  nativeScale: () => number;
  exportStill: (format: StillFormat) => Promise<void>;
  exportAnim: (format: AnimFormat, progress: (done: number, total: number) => void) => Promise<void>;
};

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
  const ctrlRef = useRef<Controls | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exporting, setExporting] = useState(false);
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
        init: { background: 0x111827 },
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

      const { RegionAttachment, MeshAttachment } = spineRuntime;
      const nativeScale = () => {
        const pixelScale = sourcePixelScale(attachmentScales(spine, RegionAttachment, MeshAttachment), []);
        const scale = pixelScale > 0 ? 1 / pixelScale : 1;
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
      };
      const renderRegion = (
        region: { x: number; y: number; width: number; height: number }, scale: number, width: number, height: number,
      ) => {
        const rt = PIXI.RenderTexture.create({ width, height });
        app.renderer.render({
          container: app.stage, target: rt, clear: true, clearColor: [0, 0, 0, 0],
          transform: new PIXI.Matrix(scale, 0, 0, scale, -region.x * scale, -region.y * scale),
        });
        const extracted = app.renderer.extract.canvas({ target: rt }) as HTMLCanvasElement;
        rt.destroy(true);
        if (extracted.width === width && extracted.height === height) return extracted;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(extracted, 0, 0, width, height);
        return canvas;
      };
      const exportStill = async (format: StillFormat) => {
        const bounds = app.stage.getBounds();
        if (!(bounds.width > 0 && bounds.height > 0)) return;
        const scale = Math.min(nativeScale(), MAX_EXPORT_DIM / Math.max(bounds.width, bounds.height));
        const canvas = tightCrop(renderRegion(bounds, scale,
          Math.max(1, Math.ceil(bounds.width * scale)), Math.max(1, Math.ceil(bounds.height * scale))));
        if (!canvas) return;
        const blob = await canvasBlob(canvas, `image/${format}`, 1);
        saveBlob(blob, `${character.archive}_${spine.state.getCurrent(0)?.animation?.name ?? 'frame'}.${format}`);
      };
      const exportAnim = async (format: AnimFormat, progress: (done: number, total: number) => void) => {
        const name = spine.state.getCurrent(0)?.animation?.name ?? animationRef.current;
        if (!name) return;
        const isCutin = name === character.cutin?.animation;
        const loop = isCutin ? false : (character.loop ?? true);
        const fps = ANIM_FPS[format];
        const autoUpdate = spine.autoUpdate;
        const timeScale = spine.state.timeScale;
        spine.autoUpdate = false;
        spine.state.timeScale = 1;
        app.ticker.stop();
        const step = (index: number) => {
          if (index === 0) {
            spine.state.clearTracks();
            spine.skeleton.setToSetupPose();
            spine.state.setAnimation(0, name, loop);
            spine.update(0);
          } else {
            spine.update(1 / fps);
          }
          tick!();
        };
        try {
          const duration = spine.skeleton.data.findAnimation(name)?.duration ?? 0;
          const count = Math.max(1, Math.round(duration * fps));
          let region = { x: 0, y: 0, width: app.screen.width, height: app.screen.height };
          let native = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
          if (!isCutin) {
            let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
            for (let i = 0; i < count; i += 1) {
              step(i);
              if (i === 0) native = nativeScale();
              const b = app.stage.getBounds();
              if (!(b.width > 0 && b.height > 0)) continue;
              minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
              maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
            }
            if (!(maxX > minX && maxY > minY)) return;
            region = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          }
          const cap = (format === 'gif' ? GIF_MAX_DIM : MAX_RECORD_DIM) / Math.max(region.width, region.height);
          const scale = Math.min(native, cap);
          const width = Math.max(1, Math.round(region.width * scale));
          const height = Math.max(1, Math.round(region.height * scale));
          const delays = frameDelays(count, fps);
          const gif = format === 'gif' ? createGif(width, height) : null;
          const frames: Uint8Array[] = [];
          for (let i = 0; i < count; i += 1) {
            if (destroyed) return;
            step(i);
            const canvas = renderRegion(region, scale, width, height);
            if (gif) {
              gif.add(canvas.getContext('2d')!.getImageData(0, 0, width, height).data, delays[i]);
              await new Promise((resolve) => setTimeout(resolve, 0));
            } else {
              const blob = await canvasBlob(canvas, format === 'apng' ? 'image/png' : 'image/webp', format === 'apng' ? 1 : 0.92);
              frames.push(new Uint8Array(await blob.arrayBuffer()));
            }
            progress(i + 1, count);
          }
          const blob = gif ? gif.finish()
            : format === 'apng' ? muxApng(frames, delays) : muxAnimatedWebp(frames, width, height, delays);
          const ext = format === 'gif' ? 'gif' : format === 'apng' ? 'png' : 'webp';
          saveBlob(blob, `${character.archive}_${name}.${ext}`);
        } finally {
          if (!destroyed) {
            step(0);
            spine.state.timeScale = timeScale;
            spine.autoUpdate = autoUpdate;
            app.ticker.start();
          }
        }
      };
      ctrlRef.current = { nativeScale, exportStill, exportAnim };
      setReady(true);
    })().catch((reason) => {
      if (!destroyed) setError(String(reason?.message ?? reason));
    });

    return () => {
      destroyed = true;
      ctrlRef.current = null;
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
    const cap = longEdge > 0 ? MAX_RECORD_DIM / longEdge : 1;
    app.renderer.resolution = Math.max(restore, Math.min(Math.max(2, ctrlRef.current?.nativeScale() ?? 2), cap));
    // WebM drops alpha, so additive glows need an opaque backdrop to survive.
    app.renderer.background.alpha = 1;
    const reset = () => {
      app.renderer.resolution = restore;
      app.renderer.background.alpha = 0;
    };
    let video: VideoRecording | null = null;
    try {
      video = startCanvasVideo({
        canvas: app.canvas,
        fileName: character.archive,
        onStop: () => {
          if (appRef.current) reset();
          if (recordingRef.current !== video) return;
          recordingRef.current = null;
          setRecording(false);
        },
      });
    } catch {
      video = null;
    }
    if (!video) {
      reset();
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    recordingRef.current = video;
    setVideoStatus(`${t(video.audio ? 'videoWithAudio' : 'videoVisualOnly')} ${video.width}×${video.height}`);
    setRecording(true);
  };

  const handleExport = async () => {
    const ctrl = ctrlRef.current;
    if (!ctrl || exporting) return;
    setExporting(true);
    try {
      if (exportFormat === 'png' || exportFormat === 'webp') await ctrl.exportStill(exportFormat);
      else await ctrl.exportAnim(exportFormat, (done, total) => setVideoStatus(`${done}/${total}`));
      setVideoStatus(null);
    } catch (reason: any) {
      setVideoStatus(String(reason?.message ?? reason));
    } finally {
      setExporting(false);
    }
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
          isDisabled={!ready || exporting} onClick={handleRecord}>
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
        <Select size="sm" w="8.5rem" value={exportFormat} aria-label={t('ariaExportFormat')}
          onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
          {EXPORT_FORMATS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Button size="sm" variant="outline" isDisabled={!ready || recording || exporting} onClick={handleExport}>
          {exporting ? <Spinner size="xs" /> : t('btnExport')}
        </Button>
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
