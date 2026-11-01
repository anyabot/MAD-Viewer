import NextLink from 'next/link';
import { Text, Wrap, WrapItem } from '@altterisk/game-hub/ui';

export type StaticLink = { href: string; name: string };

export function StaticLinks({ links }: { links: StaticLink[] }) {
  if (!links.length) return null;
  return (
    <Wrap spacing={2} fontSize="sm">
      {links.map((l) => (
        <WrapItem key={l.href}>
          <Text as={NextLink} href={l.href} color="accent.300">{l.name}</Text>
        </WrapItem>
      ))}
    </Wrap>
  );
}
