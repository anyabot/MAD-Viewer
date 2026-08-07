// The game's own item slot: a plate, the art, the grade-coloured band and the
// tier in the corner. Material art repeats across tiers, so the slot is the only
// thing separating them.
import { Box, Text, type BoxProps } from '@chakra-ui/react';
import { GameIcon } from '@/components/gameIcon';
import { resolveIcon, type IconGroup, type IconManifest } from '@/lib/icons';

/** `Item_Data.item_grade` -> the tint the client puts on the slot band. */
export const ITEM_GRADE_COLOR: Record<number, string> = {
  1: '#ECECEC',
  2: '#7ED62B',
  3: '#00B0FF',
  4: '#B530FF',
  5: '#FFDF00',
};

const PLATE = '#A6A9BE';
// The tier reading is the same two-stop gradient at every tier — only the band
// carries the grade colour.
const TIER_GRADIENT = 'linear(to-b, #53A5FF, #39FFF2)';

// The band spans the slot width less a margin and is held at 3:1, which is where
// these two fractions come from. It is drawn under the art rather than over it:
// at list size the art would lose its lower third.
const BAND_INSET = '3.75%';
const BAND_HEIGHT = '30.8%';
// The client's own band. Its shading is in the alpha channel over flat white,
// so a mask filled with the grade colour is what the client draws, and it is
// stretched rather than fitted — the sprite is 256x49 in a 3:1 box.
const BAND_SPRITE = 'Slot_Item_Grade_Bg';

function bandMask(url: string) {
  return {
    maskImage: `url("${url}")`, maskSize: '100% 100%', maskRepeat: 'no-repeat',
    WebkitMaskImage: `url("${url}")`, WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
  };
}

export function ItemIcon({
  manifest, group, name, names, grade, count, size = 7, title, ...rest
}: {
  manifest: IconManifest | null;
  group: IconGroup;
  name?: string | null;
  names?: (string | null | undefined)[];
  /** Nothing below 1 — an ungraded item is drawn on a bare plate, as in game. */
  grade?: number | null;
  /** Drawn where the game draws a stack count, over the band. */
  count?: string | number | null;
  size?: BoxProps['boxSize'];
  title?: string;
} & Omit<BoxProps, 'children'>) {
  const color = grade ? ITEM_GRADE_COLOR[grade] : null;
  const band = resolveIcon(manifest, 'ui', [BAND_SPRITE]);
  return (
    // the text sizes are fractions of the slot, so the slot is the query
    // container — one component covers a 22px preview and a 40px row
    <Box position="relative" boxSize={size} flexShrink={0} overflow="hidden"
      borderRadius="15%" bg={PLATE} borderWidth="1px" borderColor="whiteAlpha.800"
      sx={{ containerType: 'size' }} title={title} {...rest}>
      {color && (
        <Box position="absolute" left={BAND_INSET} right={BAND_INSET} bottom="2.5%"
          h={BAND_HEIGHT} bg={color}
          sx={band ? bandMask(band) : undefined} borderRadius={band ? undefined : '1px'} />
      )}
      <Box position="absolute" inset="4%">
        <GameIcon manifest={manifest} group={group} name={name} names={names}
          size="100%" reserve={false} />
      </Box>
      {grade ? (
        <Text position="absolute" top="1%" left="6%" lineHeight={1} fontWeight="bold"
          fontSize="34cqh" bgGradient={TIER_GRADIENT} bgClip="text" color="transparent">
          {grade}
        </Text>
      ) : null}
      {count ? (
        <Text position="absolute" right="5%" bottom="1%" lineHeight={1} fontWeight="bold"
          fontSize="30cqh" color="white" textShadow="0 1px 2px rgba(0,0,0,0.6)">
          {count}
        </Text>
      ) : null}
    </Box>
  );
}
