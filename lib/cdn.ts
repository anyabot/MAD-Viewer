// The large binary assets live in numbered bucket repositories, described by
// `cdn.json`. Assignment is sticky, so a URL built here stays valid across
// regenerations, and the manifest is optional: without it every lookup falls
// back to the site's own origin.

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = (
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`
).replace(/\/$/, '');

// Only skins have a complete local copy; voice and scene audio remain manifest-backed.
const LOCAL_ASSETS = process.env.NEXT_PUBLIC_ASSET_SOURCE === 'local';

/** Explicit override; set it and the manifest is not consulted at all. */
const SKIN_OVERRIDE = process.env.NEXT_PUBLIC_SKIN_ARCHIVE_BASE?.replace(/\/$/, '');
const VOICE_OVERRIDE = process.env.NEXT_PUBLIC_VOICE_BASE?.replace(/\/$/, '');
const AUDIO_OVERRIDE = process.env.NEXT_PUBLIC_SCENE_AUDIO_BASE?.replace(/\/$/, '');
const SD_OVERRIDE = process.env.NEXT_PUBLIC_SD_ARCHIVE_BASE?.replace(/\/$/, '');

type Bucket = { repo: string; ref: string };

type Family = {
  /** Path segment inside the bucket repository. */
  dir: string;
  buckets: Record<string, Bucket>;
  /** Unit name -> bucket id. A unit is one archive, or one voice folder. */
  units: Record<string, string>;
};

export type CdnManifest = {
  base: string;
  owner: string;
  families: Partial<Record<'skins' | 'voice' | 'audio' | 'sd', Family>>;
};

let manifestPromise: Promise<CdnManifest | null> | null = null;

/** Null when the site serves its own assets. */
export function loadCdnManifest(): Promise<CdnManifest | null> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(`${DATA_BASE}/cdn.json`);
        if (!res.ok) return null;
        return (await res.json()) as CdnManifest;
      } catch {
        return null;
      }
    })();
  }
  return manifestPromise;
}

function bucketBase(
  manifest: CdnManifest | null, family: 'skins' | 'voice' | 'audio' | 'sd', unit: string,
): string | null {
  const entry = manifest?.families?.[family];
  const bucket = entry?.buckets[entry.units[unit] ?? ''];
  if (!entry || !bucket) return null;
  return `${manifest!.base}/${manifest!.owner}/${bucket.repo}@${bucket.ref}/${entry.dir}`;
}

// The site copy remains the final fallback after the CDN candidate.
export async function skinFileBases(name: string): Promise<string[]> {
  if (SKIN_OVERRIDE) return [`${SKIN_OVERRIDE}/${name}`];
  const local = `${PUBLIC_BASE}/skins/${name}`;
  if (LOCAL_ASSETS) {
    const base = bucketBase(await loadCdnManifest(), 'skins', name);
    return base ? [local, `${base}/${name}`] : [local];
  }
  const base = bucketBase(await loadCdnManifest(), 'skins', name);
  return base ? [`${base}/${name}`, local] : [local];
}

/** Not gallery skins, so not in the manifest's `skins` family. */
export function gachaArchiveUrls(name: string): string[] {
  return [`${PUBLIC_BASE}/gacha/${name}.tar.br`];
}

export async function sdArchiveUrls(name: string): Promise<string[]> {
  const file = `${name}.tar.br`;
  if (SD_OVERRIDE) return [`${SD_OVERRIDE}/${file}`];
  const local = `${PUBLIC_BASE}/sd/${file}`;
  if (LOCAL_ASSETS) {
    const base = bucketBase(await loadCdnManifest(), 'sd', name);
    return base ? [local, `${base}/${file}`] : [local];
  }
  const base = bucketBase(await loadCdnManifest(), 'sd', name);
  return base ? [`${base}/${file}`, local] : [local];
}

/** `folder` is the path the voice index records and the unit assignment works
 *  on. Voice is CDN-only, so there is nothing to fall back to. */
export async function voiceClipUrl(folder: string, voiceId: string): Promise<string> {
  if (VOICE_OVERRIDE) return `${VOICE_OVERRIDE}/${folder}/${voiceId}.ogg`;
  const base = bucketBase(await loadCdnManifest(), 'voice', folder);
  return `${base ?? `${PUBLIC_BASE}/voice`}/${folder}/${voiceId}.ogg`;
}

export async function sceneAudioClipUrl(folder: string, clipId: string): Promise<string> {
  if (AUDIO_OVERRIDE) return `${AUDIO_OVERRIDE}/${folder}/${clipId}.ogg`;
  const base = bucketBase(await loadCdnManifest(), 'audio', folder);
  return `${base ?? `${PUBLIC_BASE}/audio`}/${folder}/${clipId}.ogg`;
}
