import { Box } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

import { eventArchiveUrls } from '@/lib/cdn';
import type { ChibiClip, EventArt, EventChibi } from '@/lib/data';
import { loadArchive, urlFor } from '@/lib/skinArchive';

const HEIGHT = { base: 96, md: 128 };

type Runner = {
  chibi: EventChibi;
  x: number;
  right: boolean;
  running: boolean;
  clock: number;
  phase: number;
};

function frame(clip: ChibiClip, time: number): number {
  const length = clip.sprite?.length ?? clip.rotation?.length ?? clip.scaleY?.length ?? 1;
  return Math.min(length - 1, Math.floor((time % clip.duration) * clip.rate));
}

function spriteNames(art: EventArt): string[] {
  return art.chibis.flatMap((c) => [...(c.run.sprites ?? []), ...(c.idle.sprites ?? [])]);
}

export default function EventChibis({ art }: { art: EventArt }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const runnerRefs = useRef<(HTMLImageElement | null)[]>([]);
  const tapRef = useRef<number | null>(null);
  const [urls, setUrls] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let live = true;
    loadArchive(`event:${art.key}`, () => eventArchiveUrls(art.key)).then((files) => {
      if (!live) return;
      setUrls(Object.fromEntries(spriteNames(art).map((name) => [
        name, urlFor(`event:${art.key}`, files, `${name}.png`),
      ])));
    }).catch(() => setUrls(null));
    return () => { live = false; };
  }, [art]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!urls || !field) return undefined;
    const leader = art.chibis.find((c) => c.role === 'leader') ?? art.chibis[0];
    const width = () => field.clientWidth;
    const unit = () => field.clientHeight / leader.size[1];
    const runners: Runner[] = art.chibis.map((chibi) => ({
      chibi,
      x: width() / 2 + chibi.x * unit(),
      right: false,
      running: false,
      clock: 0,
      phase: Math.random() * chibi.idle.duration,
    }));
    const gap = Math.abs(art.chibis[0]?.x - (art.chibis[1]?.x ?? art.chibis[0]?.x)) || 0;
    let goal = runners[0]?.x ?? 0;
    let pause = 1 + Math.random() * 2;
    let last = performance.now();
    let raf = 0;

    const moveTo = (r: Runner, target: number, step: number) => {
      const dx = target - r.x;
      if (Math.abs(dx) <= step) {
        r.x = target;
        return false;
      }
      r.right = dx > 0;
      r.x += Math.sign(dx) * step;
      return true;
    };

    const runStep = (dt: number, w: number, u: number) => {
      const margin = (leader.size[0] / 2) * u;
      if (tapRef.current !== null) {
        goal = Math.max(margin, Math.min(w - margin, tapRef.current));
        tapRef.current = null;
      }
      const [head, ...followers] = runners;
      const wasRunning = head.running;
      head.running = moveTo(head, goal, head.chibi.runSpeed * u * dt);
      if (!head.running) {
        pause -= dt;
        if (pause <= 0) {
          goal = margin + Math.random() * Math.max(0, w - 2 * margin);
          pause = 1.5 + Math.random() * 3;
        }
      }
      for (const r of followers) {
        const target = head.x + (head.right ? -1 : 1) * gap * u;
        const wasFollowing = r.running;
        r.running = moveTo(r, target, r.chibi.runSpeed * u * dt);
        if (!r.running && wasFollowing) r.right = head.right;
        if (r.running !== wasFollowing) r.clock = 0;
      }
      if (head.running !== wasRunning) head.clock = 0;

      runners.forEach((r, i) => {
        const img = runnerRefs.current[i];
        if (!img) return;
        r.clock += dt;
        const clip = r.running ? r.chibi.run : r.chibi.idle;
        const f = frame(clip, r.running ? r.clock : r.clock + r.phase);
        const sprite = clip.sprites?.[clip.sprite?.[f] ?? 0];
        if (sprite && urls[sprite] && img.dataset.sprite !== sprite) {
          img.src = urls[sprite];
          img.dataset.sprite = sprite;
        }
        const flip = r.right !== r.chibi.facesRight ? -1 : 1;
        const rot = clip.rotation?.[f] ?? 0;
        img.style.height = `${r.chibi.size[1] * u}px`;
        img.style.transform = `translateX(${r.x - (r.chibi.size[0] * u) / 2}px) scaleX(${flip})`
          + ` rotate(${-rot * flip}deg) scale(${clip.scaleX?.[f] ?? 1}, ${clip.scaleY?.[f] ?? 1})`;
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      runStep(dt, width(), unit());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [art, urls]);

  if (!urls) return null;
  const sprite = {
    as: 'img' as const,
    alt: '',
    draggable: false,
    position: 'absolute' as const,
    left: 0,
    bottom: 0,
    w: 'auto',
    maxW: 'none',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  };
  return (
    <Box
      ref={fieldRef}
      position="relative"
      h={{ base: `${HEIGHT.base}px`, md: `${HEIGHT.md}px` }}
      overflow="hidden"
      cursor="pointer"
      onPointerDown={(e) => {
        const box = fieldRef.current?.getBoundingClientRect();
        if (box) tapRef.current = e.clientX - box.left;
      }}
    >
      {art.chibis.map((c, i) => (
        <Box
          key={c.name}
          {...sprite}
          ref={(el: HTMLImageElement | null) => { runnerRefs.current[i] = el; }}
          transformOrigin="50% 100%"
          zIndex={c.role === 'leader' ? 2 : 1}
        />
      ))}
    </Box>
  );
}
