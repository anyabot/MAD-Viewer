// The manifest decides whether an icon exists; nothing here probes for a 404.
import { Box, type BoxProps } from '@chakra-ui/react';
import { iconUrl, resolveIcon, type IconGroup, type IconManifest } from '@/lib/icons';

export function GameIcon({
  manifest, group, name, names, size = 5, title, reserve = true, tint, ...rest
}: {
  manifest: IconManifest | null;
  group: IconGroup;
  /** `names` takes precedence when both are given */
  name?: string | null;
  /** candidates in preference order */
  names?: (string | null | undefined)[];
  size?: BoxProps['boxSize'];
  title?: string;
  /** Hold the box when nothing resolves, so a row of labels keeps its
   *  alignment. False where an empty square would be noise. */
  reserve?: boolean;
  /** Applied as a mask, which keeps the sprite's alpha. The element marks ship
   *  as flat white silhouettes the game tints. */
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

// Falls back to text stars, so the row never collapses.
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
