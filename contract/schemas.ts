import { z } from 'zod';

const localized = z.record(z.string(), z.string());

export const storyPart = z.union([z.object({ script: z.string() }), z.object({ battle: z.number() })]);

export const storyIndex = z.looseObject({
  langs: z.array(z.string()).min(1),
  chapters: z.record(z.string(), z.looseObject({
    id: z.number(),
    kind: z.enum(['main', 'event', 'nemesis', 'side']),
    name: localized,
    scenes: z.array(z.looseObject({
      id: z.number(),
      name: localized,
      script: z.string().optional(),
      parts: z.array(storyPart).optional(),
    })).min(1),
  })),
});

export const storyScriptIndex = z.looseObject({
  actors: z.record(z.string(), z.string()),
  backgrounds: z.record(z.string(), z.array(z.number())),
  scripts: z.record(z.string(), z.array(z.string())),
});

export const storyScript = z.looseObject({
  path: z.string(),
  commands: z.array(z.looseObject({ class: z.string(), fields: z.record(z.string(), z.string()).optional() })),
});

export const storyFx = z.looseObject({ cutscenes: z.record(z.string(), z.string()) });

export const storyBattles = z.record(z.string(), z.unknown());

export const sceneAudio = z.looseObject({ clips: z.record(z.string(), z.string()) });

export const icons = z.looseObject({ groups: z.record(z.string(), z.array(z.string())) });

export const skinList = z.looseObject({
  skins: z.array(z.looseObject({
    key: z.string(),
    stores: z.array(z.enum(['google', 'onestore'])).min(1),
    divergeReasons: z.array(z.string()).optional(),
  })).min(1),
});

const family = z.looseObject({
  dir: z.string(),
  buckets: z.record(z.string(), z.object({ repo: z.string(), ref: z.string() })),
  units: z.record(z.string(), z.string()),
});

export const cdn = z.looseObject({
  base: z.string(),
  owner: z.string(),
  families: z.looseObject({ skins: family, voice: family, audio: family, sd: family }),
});

export const characters = z.looseObject({ characters: z.record(z.string(), z.looseObject({})) });

export const events = z.looseObject({
  events: z.array(z.looseObject({
    id: z.number(),
    name: localized,
    songs: z.array(z.object({ id: z.string(), name: localized })).optional(),
    bonus: z.array(z.looseObject({ code: z.string(), rate: z.number() })).optional(),
  })).min(1),
});
