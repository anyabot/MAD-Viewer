import {
  cacheArchive, loadArchive, readBytes, readText, revokeArchiveUrls, urlFor,
  type ArchiveFiles,
} from '@altterisk/game-hub/archive';
import { checkedFetch, sdArchiveUrls, skinFileBases } from '@/lib/cdn';

export { loadArchive, readBytes, readText, urlFor };
export { loadTexture } from '@altterisk/game-hub/spine';
export const revokeSkinUrls = revokeArchiveUrls;

export function loadSkinArchive(skin: string): Promise<ArchiveFiles> {
  return cacheArchive(skin, async () => {
    const bases = await skinFileBases(skin);
    let failure = '';
    for (const base of bases) {
      try {
        const listingResponse = await checkedFetch(`${base}/files.json`);
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
          const response = await checkedFetch(`${base}/${encodeURIComponent(name)}`);
          if (!response.ok) throw new Error(`${name}: ${response.status}`);
          return [name, await response.blob()] as const;
        }));
        return new Map<string, Blob>(blobs);
      } catch (error) {
        failure = String(error);
      }
    }
    throw new Error(`failed to fetch loose skin ${skin}: ${failure || 'no source'}`);
  });
}

// The cache is shared, so names must stay unique across asset families.
export function loadSdArchive(archive: string): Promise<ArchiveFiles> {
  return loadArchive(`sd:${archive}`, () => sdArchiveUrls(archive), { fetch: (url) => checkedFetch(String(url)) });
}
