import { VisuallyHidden } from '@altterisk/game-hub/ui';

// For pages whose visible top is a toolbar, not a title.
export function PageTitle({ children }: { children: string }) {
  return <VisuallyHidden as="h1">{children}</VisuallyHidden>;
}
