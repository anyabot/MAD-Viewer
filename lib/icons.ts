// The game's own icon art, published under `public/icons/<group>/<name>.webp`
// by the local icon pipeline.
//
// `icons.json` is the manifest of what was actually extracted, so a caller can
// ask whether an icon exists instead of rendering a broken image. Not every
// name the master data references is extractable — `Role_Icon_Data.icon` names
// a sprite no atlas bundle carries — which is why the type tables carry a
// candidate list and resolution happens here.
import { loadIcons, type IconManifest } from '@/lib/data';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type IconGroup =
  'ui' | 'char' | 'cutin' | 'skin' | 'item' | 'skill' | 'place' | 'buff' | 'equip';

export function iconUrl(group: IconGroup, name: string): string {
  return `${PUBLIC_BASE}/icons/${group}/${name}.webp`;
}

export function hasIcon(
  manifest: IconManifest | null, group: IconGroup, name: string | null | undefined,
): boolean {
  return !!name && !!manifest?.groups[group]?.includes(name);
}

// The first candidate that was published, or null. Icons are decoration, so a
// miss must render as "no icon" rather than a broken image.
export function resolveIcon(
  manifest: IconManifest | null, group: IconGroup, names: (string | null | undefined)[],
): string | null {
  const hit = names.find((n) => hasIcon(manifest, group, n));
  return hit ? iconUrl(group, hit) : null;
}

export { loadIcons };
export type { IconManifest };
