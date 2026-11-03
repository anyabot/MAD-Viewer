import NextLink from '@/components/appLink';
import type { RenderLink } from '@altterisk/game-hub';

export const nextLink: RenderLink = ({ href, ...rest }) => <NextLink href={href} {...rest} />;
