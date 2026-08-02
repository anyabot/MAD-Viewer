// Renders the game's own icon art. Icons are decoration everywhere they are
// used, so an unpublished name renders nothing rather than a broken image —
// the manifest decides, no 404 probing.
import { Box, type BoxProps } from '@chakra-ui/react';
import { iconUrl, resolveIcon, type IconGroup, type IconManifest } from '@/lib/icons';

export function GameIcon({
  manifest, group, name, names, size = 5, title, reserve = true, tint, ...rest
}: {
  manifest: IconManifest | null;
  group: IconGroup;
  /** single candidate; `names` takes precedence when both are given */
  name?: string | null;
  /** candidates in preference order (the type tables emit these) */
  names?: (string | null | undefined)[];
  size?: BoxProps['boxSize'];
  title?: string;
  /**
   * Hold the icon's box when nothing resolves, so a row of labels keeps its
   * alignment whether or not the art was published. Set false where the icon
   * is the only thing in its slot and an empty square would be noise.
   */
  reserve?: boolean;
  /**
   * Paint the sprite in this colour. The element marks ship as flat white
   * silhouettes and the game tints each one with the colour its own
   * `Attribute_Icon_Data` row carries, so an untinted element icon is not the
   * icon the game shows. Applied as a mask, which keeps the sprite's alpha.
   */
  tint?: string | null;
} & Omit<BoxProps, 'children'>) {
  const src = resolveIcon(manifest, group, names ?? [name]);
  if (!src) {
    return reserve
      ? <Box boxSize={size} flexShrink={0} aria-hidden {...rest} />
      : null;
  }
  if (tint) {
    const mask = {
      maskImage: `url("${src}")`, maskSize: 'contain',
      maskRepeat: 'no-repeat', maskPosition: 'center',
      WebkitMaskImage: `url("${src}")`, WebkitMaskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
    };
    return (
      <Box boxSize={size} flexShrink={0} bg={tint} title={title} role="img"
        aria-label={title ?? ''} sx={mask} {...rest} />
    );
  }
  return (
    <Box as="img" src={src} alt={title ?? ''} title={title} boxSize={size}
      objectFit="contain" flexShrink={0} {...rest} />
  );
}

// The rarity row. `Slot_Icon_Star` is the game's own star; without it the
// rating still reads as text stars, so the row never collapses.
export function StarRating({ manifest, star, size = 4 }: {
  manifest: IconManifest | null; star: number; size?: BoxProps['boxSize'];
}) {
  if (!star) return null;
  const src = resolveIcon(manifest, 'ui', ['Slot_Icon_Star']);
  if (!src) {
    return <Box as="span" color="yellow.300" letterSpacing="1px">{'★'.repeat(star)}</Box>;
  }
  return (
    <Box display="inline-flex" gap={0.5} title={`${star}★`}>
      {Array.from({ length: star }, (_, i) => (
        <Box key={i} as="img" src={src} alt="" boxSize={size} objectFit="contain" />
      ))}
    </Box>
  );
}

export { iconUrl };
