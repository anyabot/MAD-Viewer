// Not every icon name the master data references is extractable, which is why
// the type tables carry a candidate list and the manifest is consulted before
// anything is rendered.
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

// Icons are decoration, so a miss renders as "no icon", never as a broken image.
export function resolveIcon(
  manifest: IconManifest | null, group: IconGroup, names: (string | null | undefined)[],
): string | null {
  const hit = names.find((n) => hasIcon(manifest, group, n));
  return hit ? iconUrl(group, hit) : null;
}

/**
 * A playable character's standing rig has no thumbnail — the portrait is its
 * art — while a story-only character has a thumbnail and no portrait, so the
 * order matters and neither source alone covers the roster.
 */
export function skinIcon(
  manifest: IconManifest | null, skin: SkinListEntry, entry: CharacterEntry | null,
): string | null {
  const names = skinIconNames(skin, entry);
  return resolveIcon(manifest, 'skin', names.skin)
    ?? resolveIcon(manifest, 'char', names.char);
}

/** The standing rig's, else any rig's, else the plain portrait — so a
 *  character with no rig at all still resolves. */
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
