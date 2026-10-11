import { downloadText, fileText, parseFile } from '@altterisk/game-hub/persist';
import { collectionRecord, importCollection } from '@/lib/collectionStore';
import { farmRecord, importFarm } from '@/lib/farmStore';

const FORMAT = 'mad.plan';
const VERSION = 2;

function planFileName(): string {
  return `mad-plan-${new Date().toISOString().slice(0, 10)}.json`;
}

function exportPlan(): string {
  return fileText(FORMAT, VERSION, { farm: farmRecord(), collection: collectionRecord() });
}

export function downloadPlan(): void {
  downloadText(exportPlan(), planFileName());
}

// Both halves are sanitised by their own store, so a partial file still loads.
export function importPlan(text: string): boolean {
  let data: Record<string, unknown>;
  try {
    ({ data } = parseFile(text, FORMAT, VERSION));
  } catch {
    return false;
  }
  importFarm(data.farm);
  importCollection(data.collection);
  return true;
}
