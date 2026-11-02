import { createDriveSync } from '@altterisk/game-hub/sync';
import { farmSync } from '@/lib/farmStore';
import { collectionSync } from '@/lib/collectionStore';
import { partySync } from '@/lib/partyStore';

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export const driveSync = clientId
  ? createDriveSync({ clientId, fileName: 'mad.json', entries: [farmSync, collectionSync, partySync] })
  : null;

export function startSync(): void {
  driveSync?.start();
}
