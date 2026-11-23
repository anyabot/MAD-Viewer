// A tap on the surface advances the phase the machine is parked on.
import { Badge, Box, Button, Flex, HStack, Select, Spinner, Text } from '@altterisk/game-hub/ui';
import { saveBlob } from '@altterisk/game-hub/persist';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  STATE_LABEL, runState,
  type GachaHost, type GachaState, type Grade,
} from '@/components/gachaViewer/machine';
import { MAX_RECORD_DIM, REFERENCE_VIEW_WIDTH, speedOptions } from '@/components/skinViewer/constants';
import { attachmentScales, renderFigure, sourcePixelScale } from '@/components/skinViewer/exportPng';
import { rigCameraTransform } from '@/components/skinViewer/scenes';
import { gachaArchiveUrls } from '@/lib/cdn';
import { useLang, useT } from '@/lib/i18n';
import type { GachaIndex, GachaRig } from '@/lib/data';
import { loadArchive, readBytes, readText, urlFor } from '@/lib/skinArchive';
import { createPixiApp, type PixiAppHandle } from '@altterisk/game-hub/spine';
import {
  ANIM_EXT, STILL_FORMATS, VIDEO_FORMATS, startLiveCapture, stillBlob,
  type LiveCapture, type StillCrop, type StillFormat, type VideoFormat,
} from '@/components/skinViewer/exportAnim';
import {
  canRecordCanvas, startCanvasVideo, type VideoRecording,
} from '@/components/skinViewer/exportVideo';

type Loaded = {
  spine: any;
  camBone: any;
  camSetup: { x: number; y: number; scale: number };
  rig: GachaRig;
};

type RigKey = 'child' | 'adult';

// Spine's own bounds are the bounding-box attachments when a rig has any, which here is only the chest hit box.
function artBounds(spine: any, RegionAttachment: any, MeshAttachment: any) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const v: number[] = [];
  for (const slot of spine.skeleton.drawOrder) {
    const a = slot.getAttachment();
    let n = 0;
    if (a instanceof RegionAttachment) { a.computeWorldVertices(slot, v, 0, 2); n = 8; }
    else if (a instanceof MeshAttachment) { n = a.worldVerticesLength; a.computeWorldVertices(slot, 0, n, v, 0, 2); }
    for (let i = 0; i < n; i += 2) {
      minX = Math.min(minX, v[i]); maxX = Math.max(maxX, v[i]);
      minY = Math.min(minY, v[i + 1]); maxY = Math.max(maxY, v[i + 1]);
    }
  }
  return minX === Infinity ? { x: 0, y: 0, width: 0, height: 0 } : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

type Controller = {
  runScene(): void;
  playClip(rig: RigKey, clip: string, loop: boolean): void;
  viewResolution(): number;
  exportStill(format: StillFormat, crop: StillCrop): Promise<void>;
  app: any;
  fileStem(): string;
};

// `grade`/`play`/`onDone` let a page drive the scene: `play` restarts it at `grade`, `onDone` fires when it ends.
export default function GachaViewer({ index, grade: forced, play = 0, onDone, controls = true }: {
  index: GachaIndex; grade?: Grade; play?: number; onDone?: () => void; controls?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [grade, setGrade] = useState<Grade>(3);
  const [state, setState] = useState<GachaState>('intro');
  const [style, setStyle] = useState<string>('Default');
  const [sfx, setSfx] = useState<string[]>([]);
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<'scene' | 'clip'>('scene');
  const [clipRig, setClipRig] = useState<RigKey>('child');
  const [clip, setClip] = useState(index.rigs.child.animations[0] ?? '');
  const [loop, setLoop] = useState(true);
  const [parked, setParked] = useState(false);

  const gradeRef = useRef<Grade>(grade);
  gradeRef.current = forced ?? grade;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const ctrlRef = useRef<Controller | null>(null);
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('webm');
  const [stillFormat, setStillFormat] = useState<StillFormat>('png');
  const [stillCrop, setStillCrop] = useState<StillCrop>('bounds');
  const liveRef = useRef<LiveCapture | null>(null);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const recordingRef = useRef<VideoRecording | null>(null);

  // Whatever the machine is parked on, waiting for the next tap.
  const tapParkRef = useRef<(() => void) | null>(null);
  const onTap = useCallback(() => {
    const park = tapParkRef.current;
    tapParkRef.current = null;
    setParked(false);
    park?.();
  }, []);

  useEffect(() => {
    let destroyed = false;
    let app: any = null;
    let pixi: PixiAppHandle | null = null;
    const teardown: (() => void)[] = [];
    const surface = hostRef.current;
    setReady(false);
    setError(null);

    (async () => {
      const PIXI = await import('pixi.js');
      const {
        Spine, SkeletonBinary, AtlasAttachmentLoader, TextureAtlas, SpineTexture,
        RegionAttachment, MeshAttachment,
      } = await import('@esotericsoftware/spine-pixi-v8') as any;

      const build = async (rig: GachaRig): Promise<Loaded> => {
        const files = await loadArchive(rig.key, () => gachaArchiveUrls(rig.key));
        const atlas = new TextureAtlas(await readText(files, rig.atlas));
        await Promise.all(atlas.pages.map(async (page: any) => {
          const texture = await PIXI.Assets.load({
            src: urlFor(rig.key, files, page.name),
            loadParser: 'loadTextures',
            data: {
              alphaMode: page.pma
                ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload',
            },
          });
          page.setTexture(SpineTexture.from(texture.source));
        }));
        const binary = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
        binary.scale = rig.dataScale;
        const skeletonData = binary.readSkeletonData(await readBytes(files, rig.skel));
        const spine = new Spine({ skeletonData, autoUpdate: false });
        spine.update(0);
        const camBone = rig.cameraBone ? spine.skeleton.findBone(rig.cameraBone) : null;
        return {
          spine,
          camBone,
          camSetup: camBone
            ? {
              x: camBone.worldX,
              y: camBone.worldY,
              scale: Math.abs(camBone.getWorldScaleX()) || 1,
            }
            : { x: 0, y: 0, scale: 1 },
          rig,
        };
      };

      // Both up front: a grade-3 result swaps mid-scene and the swap must not stall on a download.
      const [child, adult] = await Promise.all([
        build(index.rigs.child), build(index.rigs.adult),
      ]);
      if (destroyed) return;
      const rigs: Record<RigKey, Loaded> = { child, adult };

      pixi = await createPixiApp({
        PIXI, host: surface!, cancelled: () => destroyed,
        init: { background: 0x000000, backgroundAlpha: 1 },
      });
      if (!pixi) return;
      app = pixi.app;

      const root = new PIXI.Container();
      const view = new PIXI.Container();
      root.addChild(view);
      app.stage.addChild(root);

      let current = child;

      // The `cam` bone's setup pose is the neutral framing.
      let centre = { x: 0, y: 0 };
      const fit = () => {
        const { spine, camSetup } = current;
        view.pivot.set(0, 0);
        view.position.set(0, 0);
        view.scale.set(1);
        spine.position.set(0, 0);
        const viewW = REFERENCE_VIEW_WIDTH * current.rig.dataScale * camSetup.scale;
        const viewH = viewW * app.screen.height / Math.max(app.screen.width, 1);
        const frame = {
          x: camSetup.x - viewW / 2,
          y: camSetup.y - viewH / 2,
          width: viewW,
          height: viewH,
        };
        centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
        const s = Math.min(
          app.screen.width / frame.width, app.screen.height / frame.height);
        root.scale.set(s);
        root.position.set(
          app.screen.width / 2 - centre.x * s, app.screen.height / 2 - centre.y * s);
      };

      const followCamera = () => {
        const { camBone, camSetup } = current;
        if (!camBone) return;
        const target = rigCameraTransform(centre, {
          x: camBone.worldX - camSetup.x,
          y: camBone.worldY - camSetup.y,
          scale: (Math.abs(camBone.getWorldScaleX()) || 1) / camSetup.scale,
          rotation: 0,
        });
        view.pivot.set(target.pivotX, target.pivotY);
        view.position.set(target.x, target.y);
        view.scale.set(target.scale);
        view.rotation = target.rotation;
      };

      const stage = (next: Loaded) => {
        if (current.spine.parent) view.removeChild(current.spine);
        current = next;
        view.addChild(next.spine);
        next.spine.position.set(0, 0);
        fit();
      };
      stage(child);

      app.ticker.add(() => {
        if (playingRef.current) current.spine.update(app.ticker.deltaMS / 1000 * speedRef.current);
        followCamera();
      });

      const onResize = () => fit();
      window.addEventListener('resize', onResize);
      teardown.push(() => window.removeEventListener('resize', onResize));

      // A new run or clip bumps the token; anything parked on an older one stops.
      let token = 0;

      const trackEmpty = () => {
        const entry = current.spine.state.getCurrent(0);
        return !entry || (entry.isComplete() && !entry.next && !entry.loop);
      };

      const resetRig = (rig: Loaded) => {
        rig.spine.state.clearTracks();
        rig.spine.skeleton.setToSetupPose();
        rig.spine.update(0);
      };

      const host = (run: number): GachaHost => {
        const live = () => !destroyed && run === token;
        const waitTick = (done: () => boolean) => new Promise<void>((resolve) => {
          const tick = () => {
            if (!live() || done()) {
              app.ticker.remove(tick);
              if (live()) resolve();
            }
          };
          app.ticker.add(tick);
        });
        return {
          style: (name) => { if (live()) setStyle(name); },
          sfx: (key, isLoop) => {
            if (live()) setSfx((keys) => [...keys, isLoop ? `${key} (loop)` : key].slice(-3));
          },
          stopSfx: () => { if (live()) setSfx([]); },
          set: (name, isLoop) => { current.spine.state.setAnimation(0, name, !!isLoop); },
          queue: (name, isLoop, onStart) => {
            const entry = current.spine.state.addAnimation(0, name, !!isLoop, 0);
            if (onStart) entry.listener = { start: () => { if (live()) onStart(); } };
          },
          currentClip: () => current.spine.state.getCurrent(0)?.animation?.name ?? null,
          loopCurrent: () => {
            const entry = current.spine.state.getCurrent(0);
            if (!entry) return;
            current.spine.state.clearNext(entry);
            entry.loop = true;
          },
          swapToAdult: async () => { resetRig(adult); stage(adult); },
          grade: () => gradeRef.current,
          isAdult: () => current === adult,
          waitAnimation: () => waitTick(trackEmpty),
          waitTap: () => new Promise<void>((resolve) => {
            if (!live()) return;
            tapParkRef.current = () => { if (live()) resolve(); };
            setParked(true);
          }),
          delay: (ms) => {
            let left = ms;
            return waitTick(() => {
              if (playingRef.current) left -= app.ticker.deltaMS * speedRef.current;
              return left <= 0;
            });
          },
        };
      };

      const begin = () => {
        token += 1;
        tapParkRef.current = null;
        setParked(false);
        setStyle('Default');
        setSfx([]);
        return token;
      };

      const runScene = async () => {
        const run = begin();
        resetRig(child);
        stage(child);
        const h = host(run);
        let next: GachaState = 'intro';
        while (!destroyed && run === token && next !== 'done') {
          setState(next);
          next = await runState(next, h);
        }
        if (!destroyed && run === token) {
          setState('done');
          onDoneRef.current?.();
        }
      };

      const playClip = (key: RigKey, name: string, isLoop: boolean) => {
        begin();
        const rig = rigs[key];
        resetRig(rig);
        stage(rig);
        if (rig.rig.animations.includes(name)) rig.spine.state.setAnimation(0, name, isLoop);
      };

      const fileStem = () => {
        const name = current.spine.state.getCurrent(0)?.animation?.name;
        return `${current.rig.asset}${name ? `_${name}` : ''}`;
      };

      // Transparent, native resolution, the whole figure regardless of framing.
      const renderFull = () => {
        const bg = app.renderer.background;
        const alpha = bg.alpha;
        bg.alpha = 0;
        const { spine } = current;
        const pixelScale = sourcePixelScale(
          attachmentScales(spine, RegionAttachment, MeshAttachment), []) * (view.scale.x || 1);
        spine.boundsProvider = { calculateBounds: () => artBounds(spine, RegionAttachment, MeshAttachment) };
        try {
          return renderFigure({ PIXI, app, root, pixelScale });
        } finally {
          spine.boundsProvider = undefined;
          bg.alpha = alpha;
        }
      };

      // The framed view at the art's own density, capped by the record limit.
      const viewResolution = () => {
        const pixelScale = sourcePixelScale(
          attachmentScales(current.spine, RegionAttachment, MeshAttachment), []);
        const onScreen = root.scale.x * view.scale.x;
        const native = onScreen > 0 && pixelScale > 0 ? 1 / pixelScale / onScreen : 1;
        const cap = MAX_RECORD_DIM / Math.max(app.screen.width, app.screen.height, 1);
        return Math.max(1, Math.min(native, cap)) || 1;
      };
      const renderView = (resolution: number) => app.renderer.extract.canvas({
        target: app.stage,
        frame: new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height),
        resolution,
        clearColor: app.renderer.background.color,
      }) as HTMLCanvasElement;

      const exportStill = async (format: StillFormat, crop: StillCrop) => {
        if (crop === 'view') {
          saveBlob(await stillBlob(renderView(viewResolution()), format), `${fileStem()}_view.${format}`);
          return;
        }
        const canvas = renderFull();
        if (canvas) saveBlob(await stillBlob(canvas, format), `${fileStem()}.${format}`);
      };

      teardown.push(() => { token += 1; });
      ctrlRef.current = {
        runScene: () => { void runScene(); }, playClip, viewResolution, exportStill, app, fileStem,
      };
      setReady(true);
    })().catch((e) => {
      if (!destroyed) setError(String(e?.message ?? e));
    });

    return () => {
      destroyed = true;
      ctrlRef.current = null;
      liveRef.current?.cancel();
      liveRef.current = null;
      recordingRef.current?.cancel();
      recordingRef.current = null;
      setRecording(false);
      for (const off of teardown) off();
      tapParkRef.current = null;
      pixi?.dispose();
      surface?.replaceChildren();
    };
  }, [index]);

  useEffect(() => {
    if (ready && mode === 'scene') ctrlRef.current?.runScene();
  }, [ready, mode, runId, play]);

  useEffect(() => {
    if (ready && mode === 'clip') ctrlRef.current?.playClip(clipRig, clip, loop);
  }, [ready, mode, clipRig, clip, loop, runId]);

  const runExport = async (job: () => Promise<void>) => {
    if (exporting) return;
    setExporting(true);
    try {
      await job();
      setVideoStatus(null);
    } catch (reason: any) {
      setVideoStatus(String(reason?.message ?? reason));
    } finally {
      setExporting(false);
    }
  };

  const stopLive = () => {
    const capture = liveRef.current;
    if (!capture) return;
    liveRef.current = null;
    setRecording(false);
    const fileName = `${ctrlRef.current?.fileStem() ?? 'gacha'}.${ANIM_EXT[videoFormat as Exclude<VideoFormat, 'webm'>]}`;
    void runExport(async () => {
      const blob = await capture.stop();
      if (blob) saveBlob(blob, fileName);
    });
  };

  const handleRecord = () => {
    if (recordingRef.current) {
      recordingRef.current.stop();
      return;
    }
    if (liveRef.current) {
      stopLive();
      return;
    }
    const ctrl = ctrlRef.current;
    if (ctrl && videoFormat !== 'webm') {
      const capture = startLiveCapture({
        app: ctrl.app, format: videoFormat, resolution: ctrl.viewResolution(),
        onLimit: () => stopLive(),
        progress: (done, total) => setVideoStatus(`${done}/${total}`),
      });
      liveRef.current = capture;
      setVideoStatus(`${capture.width}×${capture.height}`);
      setRecording(true);
      return;
    }
    if (!ctrl || !canRecordCanvas()) {
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    const { app } = ctrl;
    const restore = app.renderer.resolution;
    app.renderer.resolution = Math.max(restore, ctrl.viewResolution());
    let video: VideoRecording | null = null;
    try {
      video = startCanvasVideo({
        canvas: app.canvas,
        fileName: index.rigs[clipRig].asset,
        onStop: () => {
          if (ctrlRef.current?.app === app) app.renderer.resolution = restore;
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

  const clips = index.rigs[clipRig].animations;
  const pickRig = (key: RigKey) => {
    setClipRig(key);
    if (!index.rigs[key].animations.includes(clip)) setClip(index.rigs[key].animations[0] ?? '');
  };

  return (
    <Flex direction="column" gap={3}>
      {controls && <Flex wrap="wrap" align="center" gap={3}>
        <HStack gap={2}>
          <Text fontSize="sm" color="gray.400">{t('rowMode')}</Text>
          <Select size="sm" w="7rem" value={mode} aria-label={t('rowMode')}
            onChange={(e) => setMode(e.target.value as 'scene' | 'clip')}>
            <option value="scene">{t('gachaModeScene')}</option>
            <option value="clip">{t('gachaModeClip')}</option>
          </Select>
        </HStack>
        {mode === 'scene' ? (
          <HStack gap={2}>
            <Text fontSize="sm" color="gray.400">{t('gachaGrade')}</Text>
            <Select size="sm" w="24" value={grade} aria-label={t('gachaGrade')}
              onChange={(e) => setGrade(Number(e.target.value) as Grade)}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </Select>
          </HStack>
        ) : (<>
          <HStack gap={2}>
            <Text fontSize="sm" color="gray.400">{t('gachaRig')}</Text>
            <Select size="sm" w="7rem" value={clipRig} aria-label={t('gachaRig')}
              onChange={(e) => pickRig(e.target.value as RigKey)}>
              <option value="child">{t('gachaRigChild')}</option>
              <option value="adult">{t('gachaRigAdult')}</option>
            </Select>
          </HStack>
          <HStack gap={2} minW={0}>
            <Text fontSize="sm" color="gray.400">{t('gachaClip')}</Text>
            <Select size="sm" w="13rem" maxW="100%" value={clip} aria-label={t('gachaClip')}
              onChange={(e) => setClip(e.target.value)}>
              {clips.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </HStack>
          <Button size="sm" variant={loop ? 'solid' : 'outline'} onClick={() => setLoop((v) => !v)}>
            {t('rowLoopClip')}
          </Button>
        </>)}
        <HStack gap={2}>
          <Text fontSize="sm" color="gray.400">{t('rowSpeed')}</Text>
          <Select size="sm" w="6rem" value={String(speed)} aria-label={t('ariaPlaybackSpeed')}
            onChange={(e) => setSpeed(Number(e.target.value))}>
            {speedOptions(lang).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </HStack>
        <Button size="sm" isDisabled={!ready} onClick={() => setPlaying((v) => !v)}>
          {playing ? t('btnPause') : t('btnPlay')}
        </Button>
        <Button size="sm" isDisabled={!ready} onClick={() => setRunId((n) => n + 1)}>{t('gachaReplay')}</Button>
        {mode === 'scene' && (
          <Button size="sm" isDisabled={!parked} onClick={onTap}>{t('btnAdvance')}</Button>
        )}
        <HStack gap={2}>
          <Select size="sm" w="8.5rem" value={videoFormat} aria-label={t('ariaVideoFormat')}
            isDisabled={recording || exporting}
            onChange={(e) => setVideoFormat(e.target.value as VideoFormat)}>
            {VIDEO_FORMATS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Button size="sm" variant={recording ? 'solid' : 'outline'} colorScheme={recording ? 'red' : undefined}
            isDisabled={!ready || exporting} onClick={handleRecord}>
            {recording ? t('btnStopRecording') : t('btnRecord')}
          </Button>
        </HStack>
        <HStack gap={2}>
          <Select size="sm" w="6rem" value={stillFormat} aria-label={t('ariaStillFormat')}
            onChange={(e) => setStillFormat(e.target.value as StillFormat)}>
            {STILL_FORMATS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select size="sm" w="7rem" value={stillCrop} aria-label={t('ariaStillCrop')}
            onChange={(e) => setStillCrop(e.target.value as StillCrop)}>
            <option value="bounds">{t('optCropBounds')}</option>
            <option value="view">{t('optCropView')}</option>
          </Select>
          <Button size="sm" variant="outline" isDisabled={!ready || recording || exporting}
            onClick={() => { const ctrl = ctrlRef.current; if (ctrl) void runExport(() => ctrl.exportStill(stillFormat, stillCrop)); }}>
            {t('btnSave')}
          </Button>
        </HStack>
        {exporting && <Spinner size="xs" />}
        {videoStatus && <Text fontSize="xs" color="gray.500">{videoStatus}</Text>}
        {mode === 'scene' && <>
          <Badge colorScheme="gray">{STATE_LABEL[state][lang]}</Badge>
          <Text fontSize="sm" color="gray.500">fx {style}</Text>
          {sfx.length > 0 && (
            <Text fontSize="sm" color="gray.600" noOfLines={1}>sfx {sfx.join(' · ')}</Text>
          )}
        </>}
      </Flex>}
      <Box position="relative" bg="black" borderRadius="md" overflow="hidden"
        h={{ base: '60vh', lg: '70vh' }} minH="320px" onPointerDown={onTap}
        style={{ touchAction: 'none', cursor: mode === 'scene' ? 'pointer' : 'default' }}>
        <Box ref={hostRef} position="absolute" inset={0} />
        {!ready && !error && (
          <Flex position="absolute" inset={0} align="center" justify="center">
            <Spinner color="gray.400" />
          </Flex>
        )}
        {error && (
          <Flex position="absolute" inset={0} align="center" justify="center" p={4}>
            <Text color="red.300" fontSize="sm" textAlign="center">{error}</Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}
