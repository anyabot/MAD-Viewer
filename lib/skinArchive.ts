import { sdArchiveUrls, skinFileBases } from '@/lib/cdn';

// Pinned to a plain ArrayBuffer: `Uint8Array` defaults to `ArrayBufferLike`,
// which includes SharedArrayBuffer and is not a valid `BlobPart`.
type Bytes = Uint8Array<ArrayBuffer>;

let brotliModPromise: Promise<{ decompress: (data: Bytes) => Bytes }> | null = null;
function loadBrotli(): Promise<{ decompress: (data: Bytes) => Bytes }> {
  if (!brotliModPromise) {
    brotliModPromise = import('brotli-dec-wasm').then((m) => m.default) as any;
  }
  return brotliModPromise!;
}

// Minimal USTAR: 512-byte header records (name @0 len100, size as octal ASCII
// @124 len12), content padded to the next block, two zero blocks terminating.
function untar(bytes: Bytes): Map<string, Blob> {
  const files = new Map<string, Blob>();
  const BLOCK = 512;
  let offset = 0;
  const decoder = new TextDecoder('utf-8');
  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break; // terminator block
    const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
    const sizeStr = decoder.decode(header.subarray(124, 124 + 12)).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const dataStart = offset + BLOCK;
    if (name) files.set(name, new Blob([bytes.subarray(dataStart, dataStart + size)]));
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

const archiveCache = new Map<string, Promise<Map<string, Blob>>>();

export function loadSkinArchive(skin: string): Promise<Map<string, Blob>> {
  let pending = archiveCache.get(skin);
  if (!pending) {
    pending = (async () => {
      const bases = await skinFileBases(skin);
      let failure = '';
      for (const base of bases) {
        try {
          const listingResponse = await fetch(`${base}/files.json`);
          if (!listingResponse.ok) {
            failure = `${listingResponse.status}`;
            continue;
          }
          const listing = await listingResponse.json() as { files?: unknown };
          if (!Array.isArray(listing.files)) throw new Error('invalid files.json');
          const names = listing.files.filter(
            (name): name is string => typeof name === 'string' && !name.includes('/') && name !== 'files.json',
          );
          if (!names.includes('spine.json')) throw new Error('missing spine.json');
          const blobs = await Promise.all(names.map(async (name) => {
            const response = await fetch(`${base}/${encodeURIComponent(name)}`);
            if (!response.ok) throw new Error(`${name}: ${response.status}`);
            return [name, await response.blob()] as const;
          }));
          return new Map<string, Blob>(blobs);
        } catch (error) {
          failure = String(error);
        }
      }
      throw new Error(`failed to fetch loose skin ${skin}: ${failure || 'no source'}`);
    })();
    archiveCache.set(skin, pending);
  }
  return pending;
}

export function loadSdArchive(archive: string): Promise<Map<string, Blob>> {
  return loadArchive(`sd:${archive}`, () => sdArchiveUrls(archive));
}

// The cache is shared, so names must stay unique across asset families.
export function loadArchive(
  name: string, urlsFor: () => Promise<string[]> | string[],
): Promise<Map<string, Blob>> {
  const skin = name;
  let p = archiveCache.get(skin);
  if (!p) {
    p = (async () => {
      const [urls, brotli] = await Promise.all([urlsFor(), loadBrotli()]);
      let failure = '';
      for (const url of urls) {
        let res: Response;
        try {
          res = await fetch(url);
        } catch (e) {
          failure = String(e);
          continue;
        }
        if (!res.ok) { failure = `${res.status}`; continue; }
        const compressed = new Uint8Array(await res.arrayBuffer());
        return untar(brotli.decompress(compressed));
      }
      throw new Error(`failed to fetch ${skin}.tar.br: ${failure || 'no source'}`);
    })();
    archiveCache.set(skin, p);
  }
  return p;
}

// Kept per unit so URLs can be revoked together when a skin is dropped.
const urlCache = new Map<string, Map<string, string>>();

export function urlFor(skin: string, files: Map<string, Blob>, filename: string): string {
  let urls = urlCache.get(skin);
  if (!urls) { urls = new Map(); urlCache.set(skin, urls); }
  let url = urls.get(filename);
  if (!url) {
    const blob = files.get(filename);
    if (!blob) throw new Error(`${filename} not found in ${skin} archive`);
    url = URL.createObjectURL(blob);
    urls.set(filename, url);
  }
  return url;
}

export function revokeSkinUrls(skin: string) {
  const urls = urlCache.get(skin);
  if (!urls) return;
  for (const url of Array.from(urls.values())) URL.revokeObjectURL(url);
  urlCache.delete(skin);
}

export async function readText(files: Map<string, Blob>, filename: string): Promise<string> {
  const blob = files.get(filename);
  if (!blob) throw new Error(`${filename} not found in archive`);
  return blob.text();
}

export async function readBytes(files: Map<string, Blob>, filename: string): Promise<Uint8Array> {
  const blob = files.get(filename);
  if (!blob) throw new Error(`${filename} not found in archive`);
  return new Uint8Array(await blob.arrayBuffer());
}

// PIXI picks a parser by file extension, which a `blob:` URL has none of, so
// the default dispatch silently returns no texture.
export async function loadTexture(
  PIXI: any, skin: string, files: Map<string, Blob>, filename: string,
): Promise<any> {
  return PIXI.Assets.load({ src: urlFor(skin, files, filename), loadParser: 'loadTextures' });
}
