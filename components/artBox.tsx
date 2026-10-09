// Stage and event art ranges from 0.7:1 covers to 2.5:1 strips; the whole image sits over a blurred fill of itself.
import { Box, type BoxProps } from '@chakra-ui/react';
import { resolveIcon, type IconGroup, type IconManifest } from '@/lib/icons';

// The game's own event-history card is 430x280.
export const ART_RATIO = 430 / 280;

export function ArtBox({ manifest, sources, title, ...rest }: {
  manifest: IconManifest | null;
  sources: [IconGroup, string | null | undefined][];
  title?: string;
} & Omit<BoxProps, 'children'>) {
  const src = sources.map(([group, name]) => resolveIcon(manifest, group, [name])).find(Boolean) ?? null;
  return (
    <Box position="relative" overflow="hidden" borderRadius="md" bg="blackAlpha.400" flexShrink={0}
      sx={{ aspectRatio: String(ART_RATIO) }} title={title} {...rest}>
      {src && (
        <>
          <Box position="absolute" inset="-12px" bgImage={`url("${src}")`} bgSize="cover" bgPosition="center"
            filter="blur(14px) brightness(0.55)" aria-hidden />
          <Box as="img" src={src} alt={title ?? ''} position="absolute" inset={0} w="100%" h="100%"
            objectFit="contain" />
        </>
      )}
    </Box>
  );
}
