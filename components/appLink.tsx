import NextLink from 'next/link';
import { forwardRef, type ComponentProps } from 'react';

// Hover and touch still prefetch; only the fetch of every route linked in the viewport goes.
export default forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function AppLink(props, ref) {
  return <NextLink ref={ref} prefetch={false} {...props} />;
});
