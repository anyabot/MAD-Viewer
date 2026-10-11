import NextLink from 'next/link';
import type { RenderLink } from '@altterisk/game-hub';

export const nextLink: RenderLink = ({ href, ...rest }) => <NextLink href={href} {...rest} />;
