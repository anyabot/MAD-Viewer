import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import * as S from './schemas';
import { ICONS, exists, jsonFiles, read } from './source';

const ROOT_FILES = new Set(['index', 'fx', 'battles']);
// the game's own scripts name these, and no build ships them
const NOT_IN_GAME = new Set(['se_force_02', 'se_']);
const CUTSCENE_PREFIX: Record<string, (id: string) => string> = {
  DesireCommand: (id) => `DesireAndAffections/${id}/desire`,
  PleasureCommand: (id) => `Pleasures/${id}`,
  DramaCommand: (id) => `Dramas/${id}`,
};

describe('story', () => {
  const index = read('story/index.json', S.storyIndex);
  const scripts = read('story_scripts/index.json', S.storyScriptIndex);
  const battles = read('story_scripts/battles.json', S.storyBattles);
  const fx = read('story_scripts/fx.json', S.storyFx);
  const audio = read('scene_audio.json', S.sceneAudio);
  const skins = new Set(read('skin_list.json', S.skinList).skins.map((s) => s.key));
  const published = jsonFiles('story_scripts').filter((p) => !ROOT_FILES.has(p));
  const bodies = published.map((p) => read(`story_scripts/${p}.json`, S.storyScript));
  const clips = new Set(Object.keys(audio.clips).map((c) => c.toLowerCase()));

  it('every scene plays scripts and battles that are published', () => {
    const missing: string[] = [];
    for (const chapter of Object.values(index.chapters)) {
      for (const scene of chapter.scenes) {
        for (const part of scene.parts ?? (scene.script ? [{ script: scene.script }] : [])) {
          if ('script' in part) {
            if (!exists(`story_scripts/${part.script}.json`)) missing.push(`${scene.id} ${part.script}.json`);
            if (!scripts.scripts[part.script]) missing.push(`${scene.id} ${part.script} not in story_scripts/index.json`);
          } else if (!battles[String(part.battle)]) missing.push(`${scene.id} battle ${part.battle}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every chapter has its text in every language', () => {
    const missing = Object.keys(index.chapters).flatMap((id) =>
      index.langs.filter((lang) => !exists(`story/${lang}/${id}.json`)).map((lang) => `${lang}/${id}`));
    expect(missing).toEqual([]);
  });

  it('the script index and the script files agree', () => {
    expect(published.filter((p) => !scripts.scripts[p])).toEqual([]);
    expect(Object.keys(scripts.scripts).filter((p) => !published.includes(p))).toEqual([]);
  });

  it('every background a script uses is published', () => {
    const used = new Set(Object.values(scripts.scripts).flat());
    expect([...used].filter((bg) => !scripts.backgrounds[bg] || !exists(`story_scripts/bg/${bg}.webp`))).toEqual([]);
  });

  it('every cutscene a script plays has a rig in fx.json', () => {
    const missing = new Set<string>();
    for (const script of bodies) {
      for (const c of script.commands) {
        const key = CUTSCENE_PREFIX[c.class]?.(c.fields?.IdAndAppearance?.split('.')[0] ?? '');
        if (key && !fx.cutscenes[key]) missing.add(`${key} (${script.path})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('every sound and track a script plays is in scene_audio.json', () => {
    const missing = new Set<string>();
    for (const script of bodies) {
      for (const c of script.commands) {
        const name = c.class === 'PlaySfx' ? c.fields?.SfxPath : c.class === 'PlayBgm' ? c.fields?.BgmPath : undefined;
        if (name && !clips.has(name.toLowerCase()) && !NOT_IN_GAME.has(name.toLowerCase())) missing.add(`${name} (${script.path})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('every actor and cutscene rig is a published skin', () => {
    const rigs = new Set([...Object.values(scripts.actors), ...Object.values(fx.cutscenes)]);
    expect([...rigs].filter((rig) => !skins.has(rig))).toEqual([]);
  });
});

describe('events', () => {
  const { events } = read('events.json', S.events);
  const icons = read('icons.json', S.icons).groups;
  const { characters } = read('characters.json', S.characters);

  it('every minigame song has its art', () => {
    const songs = events.flatMap((e) => (e.songs ?? []).map((s) => s.id));
    expect(songs.filter((id) => !icons.song?.includes(id))).toEqual([]);
  });

  it('every bonus unit is in characters.json', () => {
    const bonus = events.flatMap((e) => (e.bonus ?? []).map((b) => `${e.id} ${b.code}`));
    expect(bonus.filter((b) => !characters[b.split(' ')[1]])).toEqual([]);
  });
});

describe('event map ghosts', () => {
  it('every ghost marks a side story of its own event', () => {
    const art = read('event_art.json', z.looseObject({ events: z.record(z.string(), z.looseObject({
      stickers: z.array(z.looseObject({ name: z.string(), stories: z.array(z.number()).optional() })),
    })) })).events;
    const chapters = Object.values(read('story/index.json', S.storyIndex).chapters);
    const bad: string[] = [];
    for (const [id, entry] of Object.entries(art)) {
      const side = chapters.find((c) => c.kind === 'side' && (c as { event?: number }).event === Number(id));
      for (const s of entry.stickers) {
        for (const story of s.stories ?? []) {
          if (!side?.scenes.some((sc) => sc.id === story)) bad.push(`${id} ${s.name}: story ${story}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('icons', () => {
  it('every listed icon is a file', () => {
    const { groups } = read('icons.json', S.icons);
    const missing = Object.entries(groups).flatMap(([group, names]) =>
      names.filter((n) => !existsSync(path.join(ICONS, group, `${n}.webp`))).map((n) => `${group}/${n}`));
    expect(missing).toEqual([]);
  });
});

describe('cdn manifest', () => {
  const manifest = read('cdn.json', S.cdn);

  it('every skin archive has a bucket unit', () => {
    const { units, buckets } = manifest.families.skins;
    const names = read('skin_list.json', S.skinList).skins.flatMap((s) =>
      s.divergeReasons?.length ? s.stores.map((store) => `${s.key}__${store}`) : [s.key]);
    expect(names.filter((n) => !units[n])).toEqual([]);
    expect(Object.values(units).filter((b) => !buckets[b])).toEqual([]);
  });

  it('every scene audio folder has a bucket unit', () => {
    const { units, buckets } = manifest.families.audio;
    const folders = new Set(Object.values(read('scene_audio.json', S.sceneAudio).clips));
    expect([...folders].filter((f) => !units[f])).toEqual([]);
    expect(Object.values(units).filter((b) => !buckets[b])).toEqual([]);
  });
});
