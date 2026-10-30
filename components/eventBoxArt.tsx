import {
  Box, Button, ButtonGroup, Center, HStack, Spinner, Text, Wrap, WrapItem,
} from '@altterisk/game-hub/ui';
import { useEffect, useRef, useState } from 'react';

import { eventArchiveUrls } from '@/lib/cdn';
import type { EventArt, EventArtRig } from '@/lib/data';
import { useT, type UiKey } from '@/lib/i18n';
import { loadArchive, readBytes, readText, urlFor } from '@/lib/skinArchive';
import { createPixiApp, type PixiAppHandle } from '@altterisk/game-hub/spine';

type Player = { rig: EventArtRig; spine: any };
type Grade = 1 | 2 | 3;

const GRADES: { grade: Grade; label: UiKey }[] = [
  { grade: 1, label: 'gradeNormal' }, { grade: 2, label: 'gradeRare' }, { grade: 3, label: 'gradeLegend' },
];

function playable(rig: EventArtRig): string[] {
  const listed = [...(rig.actions ?? []), ...(rig.reactions ?? [])];
  const others = rig.animations.filter((a) => a !== rig.start && !listed.includes(a));
  return [...listed, ...others];
}

function playOnce(spine: any, track: number, name: string): Promise<void> {
  return new Promise((resolve) => {
    const entry = spine.state.setAnimation(track, name, false);
    entry.listener = { complete: () => resolve(), interrupt: () => resolve() };
  });
}

const wait = (seconds: number) => new Promise((r) => { setTimeout(r, seconds * 1000); });

export default function EventBoxArt({ art, maxDraws }: { art: EventArt; maxDraws?: number }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const playersRef = useRef<Player[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [grade, setGrade] = useState<Grade>(3);

  useEffect(() => {
    let destroyed = false;
    let app: any = null;
    let pixi: PixiAppHandle | null = null;
    const surface = hostRef.current;
    setReady(false);
    setError(null);

    (async () => {
      const PIXI = await import('pixi.js');
      const {
        Spine, SkeletonBinary, AtlasAttachmentLoader, TextureAtlas, SpineTexture,
      } = await import('@esotericsoftware/spine-pixi-v8') as any;
      const archive = `event:${art.key}`;
      const files = await loadArchive(archive, () => eventArchiveUrls(art.key));

      const build = async (rig: EventArtRig): Promise<Player> => {
        const atlas = new TextureAtlas(await readText(files, rig.atlas));
        await Promise.all(atlas.pages.map(async (page: any) => {
          const texture = await PIXI.Assets.load({
            src: urlFor(archive, files, page.name),
            loadParser: 'loadTextures',
            data: { alphaMode: page.pma ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload' },
          });
          page.setTexture(SpineTexture.from(texture.source));
        }));
        const binary = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
        binary.scale = rig.dataScale;
        const spine = new Spine({ skeletonData: binary.readSkeletonData(await readBytes(files, rig.skel)) });
        const transform = spine.transformAttachments.bind(spine);
        // the runtime keeps the last frame's clipping slot, which crashes once an animation hides that clip
        spine.transformAttachments = () => { spine.currentClippingSlot = undefined; transform(); };
        spine.state.setAnimation(0, rig.start, true);
        spine.update(0);
        return { rig, spine };
      };

      const players = await Promise.all(art.rigs.map(build));
      if (destroyed) return;
      pixi = await createPixiApp({ PIXI, host: surface!, cancelled: () => destroyed, init: { autoDensity: false } });
      if (!pixi) return;
      app = pixi.app;

      const bounds = players.map(({ spine }) => spine.getBounds());
      players.forEach(({ spine }) => app.stage.addChild(spine));
      const layout = () => {
        const w = surface!.clientWidth;
        const h = surface!.clientHeight;
        const cell = w / players.length;
        const scale = Math.min(...bounds.map((b) => Math.min((cell * 0.9) / b.width, (h * 0.9) / b.height)));
        players.forEach(({ spine }, i) => {
          const b = bounds[i];
          spine.scale.set(scale);
          spine.x = cell * i + cell / 2 - (b.x + b.width / 2) * scale;
          spine.y = h / 2 - (b.y + b.height / 2) * scale;
        });
      };
      layout();
      app.renderer.on('resize', layout);
      playersRef.current = players;
      setReady(true);
    })().catch((e) => { if (!destroyed) setError(String(e)); });

    return () => {
      destroyed = true;
      playersRef.current = [];
      if (pixi) for (const child of [...pixi.app.stage.children]) child.destroy({ children: true });
      pixi?.dispose();
    };
  }, [art]);

  const character = () => playersRef.current.find((p) => p.rig.role === 'character');
  const box = () => playersRef.current.find((p) => p.rig.role === 'box');

  const play = (rig: EventArtRig, name: string) => {
    const player = playersRef.current.find((p) => p.rig === rig);
    if (!player || busy !== null) return;
    const { state } = player.spine;
    state.setAnimation(0, name, false);
    state.addAnimation(0, rig.start, true, 0);
    setPlaying(name);
  };

  const run = async (count: number) => {
    const draw = art.draw;
    const char = character();
    if (!draw || !char || busy !== null) return;
    setBusy(count);
    setPlaying(null);
    const { spine, rig } = char;
    try {
      if (draw.style === 'bead') {
        const actions = rig.actions ?? [];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const bead = `${action.replace(draw.beadFrom, draw.beadTo)}_${grade}`;
        await Promise.all([playOnce(spine, 0, action), playOnce(spine, 1, bead)]);
        const reaction = rig.reactions?.[grade - 1];
        if (reaction) await playOnce(spine, 0, reaction);
        spine.state.setEmptyAnimation(1, 0);
        spine.state.setAnimation(0, rig.idle?.[0] ?? rig.start, true);
      } else {
        const idle = rig.idle ?? [rig.start];
        spine.state.setAnimation(0, idle[draw.drawIdle] ?? rig.start, true);
        const action = (rig.actions ?? [])[count >= 2 ? 1 : 0];
        if (action) {
          await playOnce(spine, 0, action);
          spine.state.setAnimation(0, idle[draw.drawIdle] ?? rig.start, true);
        }
        const chest = box();
        if (chest) {
          chest.spine.state.setAnimation(0, draw.boxRest, true);
          await playOnce(chest.spine, 0, draw.boxOpen);
          await wait(draw.boxDelay ?? 0);
          chest.spine.state.setAnimation(0, draw.boxRest, true);
        }
        spine.state.setAnimation(0, idle[draw.restIdle] ?? rig.start, true);
      }
    } finally {
      setBusy(null);
    }
  };

  const draw = art.draw;
  return (
    <Box>
      <Box position="relative" h={{ base: '240px', md: '320px' }} borderRadius="md" bg="whiteAlpha.50" overflow="hidden">
        <Box ref={hostRef} position="absolute" inset={0} />
        {!ready && (
          <Center position="absolute" inset={0}>
            {error ? <Text fontSize="xs" color="red.400">{error}</Text> : <Spinner />}
          </Center>
        )}
      </Box>
      {ready && draw && (
        <HStack spacing={2} mt={2} wrap="wrap">
          {draw.style === 'bead' && (
            <ButtonGroup size="sm" isAttached variant="outline">
              {GRADES.map((g) => (
                <Button key={g.grade} isActive={grade === g.grade} onClick={() => setGrade(g.grade)}>
                  {t(g.label)}
                </Button>
              ))}
            </ButtonGroup>
          )}
          <Button size="sm" colorScheme="accent" isLoading={busy === 1} isDisabled={busy !== null} onClick={() => run(1)}>{t('eventsDraw')}</Button>
          {draw.style === 'box' && maxDraws && maxDraws > 1 && (
            <Button size="sm" colorScheme="accent" variant="outline" isLoading={busy === maxDraws} isDisabled={busy !== null} onClick={() => run(maxDraws)}>
              {t('eventsDrawTimes', { n: maxDraws })}
            </Button>
          )}
        </HStack>
      )}
      {ready && art.rigs.map((rig) => (
        <Wrap key={rig.asset} spacing={1} mt={2}>
          {playable(rig).map((name) => (
            <WrapItem key={name}>
              <Button size="xs" variant={playing === name ? 'solid' : 'outline'} isDisabled={busy !== null}
                onClick={() => play(rig, name)}>
                {name}
              </Button>
            </WrapItem>
          ))}
        </Wrap>
      ))}
    </Box>
  );
}
