import {
  Box, Button, ButtonGroup, HStack, Wrap, WrapItem,
} from '@altterisk/game-hub/ui';
import {
  createPixiApp, guardClippingSlot, loadSkeletonData, playOnce, type PixiAppHandle,
} from '@altterisk/game-hub/spine';
import { CanvasStage } from '@altterisk/game-hub/viewer';
import { useEffect, useRef, useState } from 'react';

import { eventArchiveUrls } from '@/lib/cdn';
import type { EventArt, EventArtRig } from '@/lib/data';
import { useT, type UiKey } from '@/lib/i18n';
import { loadArchive } from '@/lib/skinArchive';

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
      const spineModule = await import('@esotericsoftware/spine-pixi-v8') as any;
      const archive = `event:${art.key}`;
      const files = await loadArchive(archive, () => eventArchiveUrls(art.key));

      const build = async (rig: EventArtRig): Promise<Player> => {
        const skeletonData = await loadSkeletonData({
          PIXI, spine: spineModule, name: archive, files, atlas: rig.atlas, skeleton: rig.skel, scale: rig.dataScale,
        });
        const spine = new spineModule.Spine({ skeletonData });
        guardClippingSlot(spine);
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
      <CanvasStage hostRef={hostRef} ready={ready} error={error}
        h={{ base: '240px', md: '320px' }} borderRadius="md" bg="whiteAlpha.50" />
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
