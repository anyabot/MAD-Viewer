// One Pixi surface holding one Spine rig at a time. The rig is framed by its
// own `cam` bone, on the same drawer the skin viewer's desire scenes use.
//
// A tap anywhere on the surface advances the phase the machine is parked on.

import { Badge, Box, Button, Flex, HStack, Select, Spinner, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  STATE_LABEL, runState,
  type GachaHost, type GachaState, type Grade,
} from '@/components/gachaViewer/machine';
import { REFERENCE_VIEW_WIDTH } from '@/components/skinViewer/constants';
import { rigCameraTransform } from '@/components/skinViewer/scenes';
import { gachaArchiveUrls } from '@/lib/cdn';
import { useLang, useT } from '@/lib/i18n';
import type { GachaIndex, GachaRig } from '@/lib/data';
import { loadArchive, readBytes, readText, urlFor } from '@/lib/skinArchive';

type Loaded = {
  spine: any;
  camBone: any;
  camSetup: { x: number; y: number; scale: number };
  rig: GachaRig;
};

export default function GachaViewer({ index }: { index: GachaIndex }) {
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

  const gradeRef = useRef<Grade>(grade);
  gradeRef.current = grade;

  // Whatever the machine is parked on, waiting for the next tap.
  const tapParkRef = useRef<(() => void) | null>(null);
  const onTap = useCallback(() => {
    const park = tapParkRef.current;
    tapParkRef.current = null;
    park?.();
  }, []);

  useEffect(() => {
    let destroyed = false;
    let app: any = null;
    const timers: number[] = [];
    const teardown: (() => void)[] = [];
    const surface = hostRef.current;
    setReady(false);
    setError(null);
    setState('intro');
    setStyle('Default');
    setSfx([]);

    (async () => {
      const PIXI = await import('pixi.js');
      const {
        Spine, SkeletonBinary, AtlasAttachmentLoader, TextureAtlas, SpineTexture,
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
        const spine = new Spine({ skeletonData });
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

      // Both up front: a grade-3 result swaps mid-scene and the swap must not
      // stall on a download.
      const [child, adult] = await Promise.all([
        build(index.rigs.child), build(index.rigs.adult),
      ]);
      if (destroyed) return;

      app = new PIXI.Application();
      await app.init({ background: 0x000000, antialias: true, resizeTo: surface! });
      if (destroyed) { app.destroy(true); return; }
      surface!.replaceChildren(app.canvas);

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

      // The view is the inverse of the bone's pose against its setup pose. On
      // these rigs the bone never translates, so the camera is all zoom.
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

      app.ticker.add(followCamera);

      const onResize = () => fit();
      window.addEventListener('resize', onResize);
      teardown.push(() => window.removeEventListener('resize', onResize));

      const sleep = (ms: number) => new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

      const trackEmpty = () => {
        const entry = current.spine.state.getCurrent(0);
        return !entry || (entry.isComplete() && !entry.next && !entry.loop);
      };

      const host: GachaHost = {
        style: (name) => setStyle(name),
        sfx: (key, loop) => setSfx(
          (keys) => [...keys, loop ? `${key} (loop)` : key].slice(-3)),
        stopSfx: () => setSfx([]),
        set: (clip, loop) => { current.spine.state.setAnimation(0, clip, !!loop); },
        queue: (clip, loop, onStart) => {
          const entry = current.spine.state.addAnimation(0, clip, !!loop, 0);
          if (onStart) entry.listener = { start: () => onStart() };
        },
        currentClip: () => current.spine.state.getCurrent(0)?.animation?.name ?? null,
        loopCurrent: () => {
          const entry = current.spine.state.getCurrent(0);
          if (!entry) return;
          current.spine.state.clearNext(entry);
          entry.loop = true;
        },
        swapToAdult: async () => { stage(adult); },
        grade: () => gradeRef.current,
        isAdult: () => current === adult,

        waitAnimation: () => new Promise<void>((resolve) => {
          const tick = () => {
            if (destroyed || trackEmpty()) {
              app.ticker.remove(tick);
              resolve();
            }
          };
          app.ticker.add(tick);
        }),
        waitTap: () => new Promise<void>((resolve) => { tapParkRef.current = resolve; }),
        delay: sleep,
      };

      setReady(true);

      let next: GachaState = 'intro';
      while (!destroyed && next !== 'done') {
        setState(next);
        next = await runState(next, host);
      }
      if (!destroyed) setState('done');
    })().catch((e) => {
      if (!destroyed) setError(String(e?.message ?? e));
    });

    return () => {
      destroyed = true;
      for (const t of timers) window.clearTimeout(t);
      for (const off of teardown) off();
      tapParkRef.current = null;
      if (app) { try { app.destroy(true); } catch { /* already gone */ } }
      surface?.replaceChildren();
    };
    // A grade change restarts the scene, which is what `runId` bumps.
  }, [index, runId]);

  return (
    <Flex direction="column" gap={3}>
      <Flex wrap="wrap" align="center" gap={3}>
        <HStack gap={2}>
          <Text fontSize="sm" color="gray.400">{t('gachaGrade')}</Text>
          <Select size="sm" w="24" value={grade}
            onChange={(e) => setGrade(Number(e.target.value) as Grade)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </Select>
        </HStack>
        <Button size="sm" onClick={() => setRunId((n) => n + 1)}>{t('gachaReplay')}</Button>
        <Badge colorScheme="gray">{STATE_LABEL[state][lang]}</Badge>
        <Text fontSize="sm" color="gray.500">fx {style}</Text>
        {sfx.length > 0 && (
          <Text fontSize="sm" color="gray.600" noOfLines={1}>sfx {sfx.join(' · ')}</Text>
        )}
      </Flex>
      <Box position="relative" bg="black" borderRadius="md" overflow="hidden"
        h={{ base: '60vh', lg: '70vh' }} minH="320px" onPointerDown={onTap}
        style={{ touchAction: 'none', cursor: 'pointer' }}>
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
