// The large binary assets live in numbered bucket repositories, described by
// `cdn.json`. Assignment is sticky, so a URL built here stays valid across
// regenerations, and the manifest is optional: without it every lookup falls
// back to the site's own origin.

import { createJsonLoader, jsdelivrBase, trimSlash } from '@altterisk/game-hub/data';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_BASE = trimSlash(
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'bucket'
    ? (process.env.NEXT_PUBLIC_DATA_BASE ?? '')
    : `${PUBLIC_BASE}/data`,
);

// Voice and scene audio try a staged copy beside the local data before the buckets.
const LOCAL_ASSETS = process.env.NEXT_PUBLIC_ASSET_SOURCE === 'local';

/** Explicit override; set it and the manifest is not consulted at all. */
const SKIN_OVERRIDE = trimSlash(process.env.NEXT_PUBLIC_SKIN_ARCHIVE_BASE);
const VOICE_OVERRIDE = trimSlash(process.env.NEXT_PUBLIC_VOICE_BASE);
const AUDIO_OVERRIDE = trimSlash(process.env.NEXT_PUBLIC_SCENE_AUDIO_BASE);
const SD_OVERRIDE = trimSlash(process.env.NEXT_PUBLIC_SD_ARCHIVE_BASE);

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

const json = createJsonLoader({ urls: (name) => [`${DATA_BASE}/${name}`] });
let manifestPromise: Promise<CdnManifest | null> | null = null;

/** Null when the site serves its own assets. */
export function loadCdnManifest(): Promise<CdnManifest | null> {
  if (!manifestPromise) {
    manifestPromise = json.load<CdnManifest>('cdn.json').catch(() => null);
  }
  return manifestPromise;
}

// jsDelivr refuses an uncached file from a repository over 50 MB now and then; GitHub raw always serves it.
function bucketBases(
  manifest: CdnManifest | null, family: 'skins' | 'voice' | 'audio' | 'sd', unit: string,
): string[] {
  const entry = manifest?.families?.[family];
  const bucket = entry?.buckets[entry.units[unit] ?? ''];
  if (!entry || !bucket) return [];
  return [
    jsdelivrBase({
      base: manifest!.base, owner: manifest!.owner, repo: bucket.repo, ref: bucket.ref, dir: entry.dir,
    }),
    `https://raw.githubusercontent.com/${manifest!.owner}/${bucket.repo}/${bucket.ref}/${entry.dir}`,
  ];
}

const MAGIC: [string, number[]][] = [
  ['.png', [0x89, 0x50, 0x4e, 0x47]],
  ['.ogg', [0x4f, 0x67, 0x67, 0x53]],
];
const RATE_LIMITED = Array.from('429: Too Many Requests', (c) => c.charCodeAt(0));

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

function intact(url: string, bytes: Uint8Array): boolean {
  const path = url.split(/[?#]/)[0].toLowerCase();
  const magic = MAGIC.find(([ext]) => path.endsWith(ext));
  return magic ? startsWith(bytes, magic[1]) : !startsWith(bytes, RATE_LIMITED);
}

// jsDelivr can cache GitHub's rate-limit page as a 200 for the file it was fetching.
export async function checkedFetch(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) return res;
  const body = await res.arrayBuffer();
  if (!intact(url, new Uint8Array(body))) return new Response(null, { status: 502 });
  return new Response(body, { status: res.status, headers: res.headers });
}

export async function fetchFirst(urls: string[]): Promise<Response> {
  let failure = 'no source';
  for (const url of urls) {
    try {
      const res = await checkedFetch(url);
      if (res.ok) return res;
      failure = `${res.status}`;
    } catch (error) {
      failure = String(error);
    }
  }
  throw new Error(failure);
}

// The site copy remains the final fallback after the CDN candidate.
export async function skinFileBases(name: string): Promise<string[]> {
  if (SKIN_OVERRIDE) return [`${SKIN_OVERRIDE}/${name}`];
  const local = `${PUBLIC_BASE}/skins/${name}`;
  const remote = bucketBases(await loadCdnManifest(), 'skins', name).map((base) => `${base}/${name}`);
  return LOCAL_ASSETS ? [local, ...remote] : [...remote, local];
}

/** Not gallery skins, so not in the manifest's `skins` family. */
export function gachaArchiveUrls(name: string): string[] {
  return [`${PUBLIC_BASE}/gacha/${name}.tar.br`];
}

export function eventArchiveUrls(name: string): string[] {
  return [`${PUBLIC_BASE}/event/${name}.tar.br`];
}

export async function sdArchiveUrls(name: string): Promise<string[]> {
  const file = `${name}.tar.br`;
  if (SD_OVERRIDE) return [`${SD_OVERRIDE}/${file}`];
  const local = `${PUBLIC_BASE}/sd/${file}`;
  const remote = bucketBases(await loadCdnManifest(), 'sd', name).map((base) => `${base}/${file}`);
  return LOCAL_ASSETS ? [local, ...remote] : [...remote, local];
}

// `folder` is the voice index's path and the unit the bucket assignment works on.
export async function voiceClipUrls(folder: string, voiceId: string): Promise<string[]> {
  if (VOICE_OVERRIDE) return [`${VOICE_OVERRIDE}/${folder}/${voiceId}.ogg`];
  const bases = bucketBases(await loadCdnManifest(), 'voice', folder);
  const all = bases.length ? bases : [`${PUBLIC_BASE}/voice`];
  return (LOCAL_ASSETS ? [`${DATA_BASE}/voice`, ...all] : all).map((base) => `${base}/${folder}/${voiceId}.ogg`);
}

export async function sceneAudioClipUrls(folder: string, clipId: string): Promise<string[]> {
  if (AUDIO_OVERRIDE) return [`${AUDIO_OVERRIDE}/${folder}/${clipId}.ogg`];
  const bases = bucketBases(await loadCdnManifest(), 'audio', folder);
  const all = bases.length ? bases : [`${PUBLIC_BASE}/audio`];
  return (LOCAL_ASSETS ? [`${DATA_BASE}/audio`, ...all] : all).map((base) => `${base}/${folder}/${clipId}.ogg`);
}

// Plays through the sources in order, moving on when the element reports a load error.
export function playFrom(player: HTMLAudioElement, urls: string[], rate = 1): Promise<void> {
  let index = 0;
  player.onerror = () => {
    if (!urls[index + 1] || !urls.includes(player.src)) return;
    index += 1;
    player.src = urls[index];
    player.playbackRate = rate;
    void player.play().catch(() => {});
  };
  player.src = urls[0];
  player.playbackRate = rate;
  return player.play();
}
