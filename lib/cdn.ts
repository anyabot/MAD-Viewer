// Resolves the large binary assets — packed skins, voice, and scene audio —
// to their jsDelivr URLs.
//
// They are too big to ship inside the site, so the pipeline splits them across
// numbered bucket repositories and publishes `cdn.json` describing which bucket
// holds what. Assignment is sticky, so a URL this module builds stays valid
// across regenerations.
//
// The manifest is optional. Without it — local development, or a checkout with
// the archives still under `public/` — every lookup falls back to the site's
// own origin, so the app never hard-depends on the CDN being reachable.

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = (
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`
).replace(/\/$/, '');

/**
 * Serve the assets this checkout already holds instead of the published ones.
 *
 * Only the skin archives qualify: `public/skins/` is a complete local copy, so
 * a freshly packed export is picked up without republishing anything. Voice and
 * scene audio have no in-repo copy, so they keep resolving through the manifest.
 */
const LOCAL_ASSETS = process.env.NEXT_PUBLIC_ASSET_SOURCE === 'local';

/** Explicit override; set it and the manifest is not consulted at all. */
const ARCHIVE_OVERRIDE = process.env.NEXT_PUBLIC_SKIN_ARCHIVE_BASE?.replace(/\/$/, '');
const VOICE_OVERRIDE = process.env.NEXT_PUBLIC_VOICE_BASE?.replace(/\/$/, '');
const AUDIO_OVERRIDE = process.env.NEXT_PUBLIC_SCENE_AUDIO_BASE?.replace(/\/$/, '');

type Bucket = { repo: string; ref: string };

type Family = {
  /** Path segment inside the bucket repository. */
  dir: string;
  buckets: Record<string, Bucket>;
  /** Unit name -> bucket id. A unit is one archive, or one voice folder. */
  units: Record<string, string>;
};

export type CdnManifest = {
  generated: string;
  base: string;
  owner: string;
  families: Partial<Record<'skins' | 'voice' | 'audio', Family>>;
};

let manifestPromise: Promise<CdnManifest | null> | null = null;

/** The manifest, or null when the site serves its own assets. */
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
  manifest: CdnManifest | null, family: 'skins' | 'voice' | 'audio', unit: string,
): string | null {
  const entry = manifest?.families?.[family];
  const bucket = entry?.buckets[entry.units[unit] ?? ''];
  if (!entry || !bucket) return null;
  return `${manifest!.base}/${manifest!.owner}/${bucket.repo}@${bucket.ref}/${entry.dir}`;
}

/**
 * Where to look for one packed skin archive, in order.
 *
 * The site's own copy is kept as the last candidate even when a bucket is
 * named, so an unreachable bucket degrades to a slower load rather than a
 * broken gallery.
 */
export async function skinArchiveUrls(name: string): Promise<string[]> {
  const file = `${name}.tar.br`;
  if (ARCHIVE_OVERRIDE) return [`${ARCHIVE_OVERRIDE}/${file}`];
  const local = `${PUBLIC_BASE}/skins/${file}`;
  // Local mode leads with this checkout's own archive so an export under test
  // is what loads; the bucket stays behind it, for a skin not packed here.
  if (LOCAL_ASSETS) {
    const base = bucketBase(await loadCdnManifest(), 'skins', name);
    return base ? [local, `${base}/${file}`] : [local];
  }
  const base = bucketBase(await loadCdnManifest(), 'skins', name);
  return base ? [`${base}/${file}`, local] : [local];
}

/**
 * URL of one voice clip. `folder` is the `<locale>/<char>/<category>` path the
 * voice index records, and is also the unit assignment works on. There is no
 * local copy to fall back to — voice is CDN-only — so this is a single URL.
 */
export async function voiceClipUrl(folder: string, voiceId: string): Promise<string> {
  if (VOICE_OVERRIDE) return `${VOICE_OVERRIDE}/${folder}/${voiceId}.ogg`;
  const base = bucketBase(await loadCdnManifest(), 'voice', folder);
  return `${base ?? `${PUBLIC_BASE}/voice`}/${folder}/${voiceId}.ogg`;
}

/** URL of one authored scene-audio clip (animation sound or BGM). */
export async function sceneAudioClipUrl(folder: string, clipId: string): Promise<string> {
  if (AUDIO_OVERRIDE) return `${AUDIO_OVERRIDE}/${folder}/${clipId}.ogg`;
  const base = bucketBase(await loadCdnManifest(), 'audio', folder);
  return `${base ?? `${PUBLIC_BASE}/audio`}/${folder}/${clipId}.ogg`;
}
