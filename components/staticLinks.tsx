import NextLink from 'next/link';
import { VisuallyHidden } from '@altterisk/game-hub/ui';

export type StaticLink = { href: string; name: string };

// Hidden from sight only: the loaded page shows the same links, so crawlers and screen readers keep them.
export function StaticLinks({ links }: { links: StaticLink[] }) {
  if (!links.length) return null;
  return (
    <VisuallyHidden as="nav">
      {links.map((l) => <NextLink key={l.href} href={l.href}>{l.name}</NextLink>)}
    </VisuallyHidden>
  );
}
