import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as S from './schemas';
import { read } from './source';

const LIVE = process.env.CONTRACT_CDN === '1';
const PARALLEL = 8;

async function head(url: string, attempts = 4): Promise<number> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status < 500 || i === attempts) return res.status;
    } catch (e) {
      if (i === attempts) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
}

async function unreachable(urls: string[]): Promise<string[]> {
  const bad: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const status = await head(url);
      if (status !== 200) bad.push(`${status} ${url}`);
    }
  }));
  return bad;
}

describe.skipIf(!LIVE)('cdn buckets serve every unit at the manifest ref', () => {
  const manifest = read('cdn.json', S.cdn);
  const sceneClips = read('scene_audio.json', S.sceneAudio).clips;
  const voiceClips = read('voice.json', z.looseObject({ clips: z.record(z.string(), z.string()) })).clips;
  const firstClip = (clips: Record<string, string>) => {
    const out = new Map<string, string>();
    for (const [clip, folder] of Object.entries(clips)) if (!out.has(folder)) out.set(folder, clip);
    return out;
  };
  const sceneFirst = firstClip(sceneClips);
  const voiceFirst = firstClip(voiceClips);
  const file: Record<keyof typeof manifest.families, (unit: string) => string | undefined> = {
    skins: (unit) => `${unit}/files.json`,
    sd: (unit) => `${unit}.tar.br`,
    audio: (unit) => (sceneFirst.has(unit) ? `${unit}/${sceneFirst.get(unit)}.ogg` : undefined),
    voice: (unit) => (voiceFirst.has(unit) ? `${unit}/${voiceFirst.get(unit)}.ogg` : undefined),
  };

  for (const name of ['skins', 'voice', 'audio', 'sd'] as const) {
    it(name, async () => {
      const family = manifest.families[name];
      const urls = Object.entries(family.units).flatMap(([unit, id]) => {
        const bucket = family.buckets[id];
        const path = file[name](unit);
        return path ? [`https://raw.githubusercontent.com/${manifest.owner}/${bucket.repo}/${bucket.ref}/${family.dir}/${path}`] : [];
      });
      expect(urls.length).toBeGreaterThan(0);
      expect(await unreachable(urls)).toEqual([]);
    });
  }
});
