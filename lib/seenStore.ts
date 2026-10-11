import { createSeenStore } from '@altterisk/game-hub/persist';

const seen = createSeenStore('mad.seen');

export const restoreSeen = seen.restore;
export const markSeen = seen.markSeen;
export const resetSeen = seen.reset;
// No record at all when the page loaded: nothing to catch this visitor up on.
export const isFreshVisitor = seen.isFresh;
// Only after `restoreSeen` has run, so a first paint never flashes a notice.
export const useShouldShow = seen.useShouldShow;
