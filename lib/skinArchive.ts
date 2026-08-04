// Fetches a packed skin archive (<skin>.tar.br: a tar of the exported skin
// folder, brotli-compressed as one solid stream),
// decompresses it client-side, and untars it into a Map<filename, Blob> the
// viewer builds blob: URLs from. Brotli has no reliable native browser decoder
// (DecompressionStream does not support it), so a small WASM decoder is used.
//
// Where the archive lives is `lib/cdn.ts`'s problem: normally a jsDelivr bucket
// repository, and the site's own `public/skins/` when no manifest is published.

import { skinArchiveUrls } from '@/lib/cdn';

// The decompressed view is pinned to a plain ArrayBuffer: `Uint8Array` defaults
// to `ArrayBufferLike`, which includes SharedArrayBuffer and is therefore not a
// valid `BlobPart` for the untar step.
type Bytes = Uint8Array<ArrayBuffer>;

let brotliModPromise: Promise<{ decompress: (data: Bytes) => Bytes }> | null = null;
function loadBrotli(): Promise<{ decompress: (data: Bytes) => Bytes }> {
  if (!brotliModPromise) {
    brotliModPromise = import('brotli-dec-wasm').then((m) => m.default) as any;
  }
  return brotliModPromise!;
}

// Minimal USTAR reader: fixed 512-byte header records (name @0 len100, size as
// octal ASCII @124 len12), content padded to the next 512-byte boundary, two
// all-zero blocks terminate the archive. Both producer and consumer are ours,
// so this covers every archive the pipeline emits.
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

// Fetch + decompress + untar a skin archive (cached per archive name).
export function loadSkinArchive(skin: string): Promise<Map<string, Blob>> {
  let p = archiveCache.get(skin);
  if (!p) {
    p = (async () => {
      const [urls, brotli] = await Promise.all([skinArchiveUrls(skin), loadBrotli()]);
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

// Blob URLs created per archive, revoked together when a skin is dropped.
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

// Read a text/JSON file straight from the blob map (spine.json, .atlas).
export async function readText(files: Map<string, Blob>, filename: string): Promise<string> {
  const blob = files.get(filename);
  if (!blob) throw new Error(`${filename} not found in archive`);
  return blob.text();
}

// Read a binary file (the Spine `.skel`, which MAD ships instead of JSON).
export async function readBytes(files: Map<string, Blob>, filename: string): Promise<Uint8Array> {
  const blob = files.get(filename);
  if (!blob) throw new Error(`${filename} not found in archive`);
  return new Uint8Array(await blob.arrayBuffer());
}

// PIXI's texture loader picks a parser by file extension (PIXI.Assets.load),
// but blob: URLs have none, so the default dispatch finds no matching parser
// and silently returns no texture. Force the image-texture parser explicitly.
export async function loadTexture(
  PIXI: any, skin: string, files: Map<string, Blob>, filename: string,
): Promise<any> {
  return PIXI.Assets.load({ src: urlFor(skin, files, filename), loadParser: 'loadTextures' });
}
