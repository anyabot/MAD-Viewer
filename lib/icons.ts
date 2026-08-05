// The game's own icon art, published under `public/icons/<group>/<name>.webp`
// by the local icon pipeline.
//
// `icons.json` is the manifest of what was actually extracted, so a caller can
// ask whether an icon exists instead of rendering a broken image. Not every
// name the master data references is extractable — `Role_Icon_Data.icon` names
// a sprite no atlas bundle carries — which is why the type tables carry a
// candidate list and resolution happens here.
import { loadIcons, type CharacterEntry, type IconManifest, type SkinListEntry } from '@/lib/data';
import { skinIconNames } from '@/lib/characters';

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

/**
 * The display icon for one rig: its own thumbnail when the game ships one,
 * otherwise the character portrait.
 *
 * A playable character's standing rig has no thumbnail of its own — the
 * portrait *is* its art — while every story-only character is the other way
 * round, with a rig thumbnail and no portrait at all. So neither source alone
 * covers the roster and the order matters.
 */
export function skinIcon(
  manifest: IconManifest | null, skin: SkinListEntry, entry: CharacterEntry | null,
): string | null {
  const names = skinIconNames(skin, entry);
  return resolveIcon(manifest, 'skin', names.skin)
    ?? resolveIcon(manifest, 'char', names.char);
}

/**
 * The icon that stands for a character: its standing rig's, else any rig's,
 * else the plain portrait. A character with no rig at all still resolves,
 * which is what keeps the character list whole.
 */
export function characterIcon(
  manifest: IconManifest | null, entry: CharacterEntry | null, skins: SkinListEntry[],
): string | null {
  const rig = skins.find((s) => s.kind === 'standing') ?? skins[0] ?? null;
  return (rig ? skinIcon(manifest, rig, entry) : null)
    ?? resolveIcon(manifest, 'char',
      [entry?.iconPath, entry ? `Icon_${entry.code}` : null]);
}

export { loadIcons };
export type { IconManifest };
