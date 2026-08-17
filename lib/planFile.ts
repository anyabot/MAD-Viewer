import { collectionRecord, importCollection } from '@/lib/collectionStore';
import { farmRecord, importFarm } from '@/lib/farmStore';

const FORMAT = 'mad.plan';
const VERSION = 2;

export function planFileName(): string {
  return `mad-plan-${new Date().toISOString().slice(0, 10)}.json`;
}

export function exportPlan(): string {
  return JSON.stringify({
    format: FORMAT, version: VERSION,
    farm: farmRecord(), collection: collectionRecord(),
  }, null, 2);
}

/** Both halves are sanitised by their own store, so a partial file still loads. */
export function importPlan(text: string): boolean {
  let doc: { format?: string; farm?: unknown; collection?: unknown };
  try {
    doc = JSON.parse(text);
  } catch {
    return false;
  }
  if (!doc || typeof doc !== 'object' || doc.format !== FORMAT) return false;
  importFarm(doc.farm);
  importCollection(doc.collection);
  return true;
}
