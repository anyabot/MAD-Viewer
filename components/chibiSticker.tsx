import { Box } from '@chakra-ui/react';

import type { EventSticker } from '@/lib/data';

export default function ChibiSticker({ sticker, src, size }: { sticker: EventSticker; src: string; size: number }) {
  const [w, h] = sticker.size;
  const fit = (size * 0.85) / Math.max(w * sticker.scale[0], h * sticker.scale[1]);
  return (
    <Box as="a" href={src} download={`${sticker.sprite}.png`} title={sticker.sprite} display="block"
      position="relative" w={`${size}px`} h={`${size}px`} overflow="hidden">
      <Box
        as="img"
        src={src}
        alt=""
        position="absolute"
        left={`${size / 2 - w * fit * sticker.pivot[0]}px`}
        bottom={`${size * 0.06}px`}
        w={`${w * fit}px`}
        h={`${h * fit}px`}
        maxW="none"
        transformOrigin={`${sticker.pivot[0] * 100}% ${(1 - sticker.pivot[1]) * 100}%`}
        transform={`rotate(${-sticker.rotation}deg) scale(${sticker.scale[0]}, ${sticker.scale[1]})`}
      />
    </Box>
  );
}
