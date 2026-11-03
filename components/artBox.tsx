// Stage and event art ranges from 0.7:1 covers to 2.5:1 strips; the whole image sits over a blurred fill of itself.
import type { ComponentProps } from 'react';
import { Box } from '@altterisk/game-hub/ui';

type BoxProps = Omit<ComponentProps<typeof Box>, 'manifest' | 'name'>;
import { resolveIcon, type IconGroup, type IconManifest } from '@/lib/icons';

// The game's own event-history card is 430x280.
export const ART_RATIO = 430 / 280;

export type ArtSources = [IconGroup, string | null | undefined][];

export function artSrc(manifest: IconManifest | null, sources: ArtSources): string | null {
  return sources.map(([group, name]) => resolveIcon(manifest, group, [name])).find(Boolean) ?? null;
}

export function ArtBox({ manifest, sources, title, priority, ...rest }: {
  manifest: IconManifest | null;
  sources: ArtSources;
  title?: string;
  priority?: boolean;
} & Omit<BoxProps, 'children'>) {
  const src = artSrc(manifest, sources);
  const load = priority ? { fetchpriority: 'high' } : { loading: 'lazy' as const };
  return (
    <Box position="relative" overflow="hidden" borderRadius="md" bg="blackAlpha.400" flexShrink={0}
      sx={{ aspectRatio: String(ART_RATIO) }} title={title} {...rest}>
      {src && (
        <>
          <Box as="img" src={src} alt="" position="absolute" top="-12px" left="-12px" w="calc(100% + 24px)"
            h="calc(100% + 24px)" maxW="none" objectFit="cover" filter="blur(14px) brightness(0.55)" aria-hidden
            {...load} />
          <Box as="img" src={src} alt={title ?? ''} position="absolute" inset={0} w="100%" h="100%"
            objectFit="contain" {...load} />
        </>
      )}
    </Box>
  );
}
