import type {
  CharacterData, EventIndex, EventReward, GameEvent, GrowthData, StageData, StageEntry,
} from '@/lib/data';
import type { GameLocalized } from '@/lib/gameText';
import type { Localized } from '@/lib/i18n';
import { unitBill, type UnitPlanPair } from '@/lib/farm';
import { CHANNEL_ORDER } from '@/lib/stages';

export type ItemReward = EventReward & { code?: string; chance?: number };

export type ItemEntry = {
  kind: 'item' | 'goods' | 'charge_goods' | 'reset_goods' | 'deco';
  type?: string;
  inventory?: string;
  grade?: number;
  name: GameLocalized;
  desc?: GameLocalized;
  flavor?: GameLocalized;
  icon?: string;
  sell?: { ref: string; price: number };
  contents?: { mode: 'random' | 'select' | 'all'; pick?: number; rewards: ItemReward[] };
  code?: string;
  max?: number;
};

export type ItemIndex = { items: Record<string, ItemEntry> };

export function itemHref(ref: string): string {
  return `/item?ref=${encodeURIComponent(ref)}`;
}

export type ItemCategory =
  'material' | 'gift' | 'memory' | 'box' | 'ticket' | 'currency' | 'equipment' | 'decoration' | 'other';

const CATEGORY_OF: Record<string, ItemCategory> = {
  exp_potion_partner: 'material', exp_potion_combat: 'material', skill_exp: 'material',
  equipment_growth: 'material', sub_option_material: 'material', gear_material: 'material',
  infusion_material: 'material', master_piece: 'material', item_piece: 'material',
  gift: 'gift', memory: 'memory',
  random_box: 'box', select_box: 'box', give_all_box: 'box',
  ticket_select: 'ticket', ticket_random: 'ticket', ticket_all: 'ticket', ticket_pickup: 'ticket',
  ticket_premium: 'ticket', ticket_event_pickup: 'ticket', dungeon_ticket: 'ticket',
  stage_skip: 'ticket', stamina_potion: 'ticket',
  equipment: 'equipment', equipment_piece: 'equipment',
};

export function itemCategory(entry: ItemEntry): ItemCategory {
  if (entry.kind === 'deco') return 'decoration';
  if (entry.kind !== 'item') return 'currency';
  return CATEGORY_OF[entry.type ?? ''] ?? 'other';
}

export const CATEGORY_ORDER: ItemCategory[] = [
  'material', 'memory', 'gift', 'box', 'ticket', 'equipment', 'currency', 'decoration', 'other',
];

export const CATEGORY_LABEL: Record<ItemCategory, Localized> = {
  material: { en: 'Materials', ko: '재료' },
  memory: { en: 'Memories', ko: '메모리' },
  gift: { en: 'Gifts', ko: '선물' },
  box: { en: 'Boxes', ko: '상자' },
  ticket: { en: 'Tickets', ko: '티켓' },
  equipment: { en: 'Equipment', ko: '장비' },
  currency: { en: 'Currencies', ko: '재화' },
  decoration: { en: 'Profile decorations', ko: '프로필 꾸미기' },
  other: { en: 'Other', ko: '기타' },
};

export type StageSourceRow = {
  stage: StageEntry; channel: string; chance?: number; amount: number[];
};

export function stageSources(data: StageData, ref: string): StageSourceRow[] {
  const out: StageSourceRow[] = [];
  for (const stage of data.stages) {
    for (const channel of CHANNEL_ORDER) {
      for (const drop of stage.rewards?.[channel] ?? []) {
        if (drop.ref === ref) out.push({ stage, channel, chance: drop.chance, amount: drop.amount });
      }
    }
  }
  return out;
}

export type EventSourceRow = { event: GameEvent; kind: 'shop' | 'box'; amount?: number[]; price?: number; limit?: number; count?: number };

export function eventSources(index: EventIndex, ref: string): EventSourceRow[] {
  const out: EventSourceRow[] = [];
  for (const event of index.events) {
    for (const ex of event.exchange ?? []) {
      if (ex.kind === 'shop') {
        for (const p of ex.products) {
          const hit = (p.rewards ?? []).find((r) => r.ref === ref);
          if (hit) out.push({ event, kind: 'shop', amount: hit.amount, price: p.price?.amount, limit: p.limit });
        }
      } else {
        const count = ex.rounds.flatMap((r) => r.items)
          .filter((item) => (item.rewards ?? []).some((r) => r.ref === ref))
          .reduce((n, item) => n + item.count, 0);
        if (count) out.push({ event, kind: 'box', count });
      }
    }
  }
  return out;
}

export function boxesContaining(index: ItemIndex, ref: string): string[] {
  return Object.entries(index.items)
    .filter(([, e]) => e.contents?.rewards?.some((r) => r.ref === ref))
    .map(([key]) => key);
}

export function giftedTo(chars: CharacterData, ref: string): string[] {
  const id = Number(ref.split(':')[1]);
  if (!ref.startsWith('item:')) return [];
  return Object.values(chars.characters)
    .filter((c) => c.giftItems?.includes(id))
    .map((c) => c.code);
}

export function planNeeds(
  growth: GrowthData, chars: CharacterData, units: Record<string, UnitPlanPair>,
): { total: Record<string, number>; byUnit: Record<string, Record<string, number>> } {
  const byUnit: Record<string, Record<string, number>> = {};
  for (const [code, pair] of Object.entries(units)) {
    const entry = chars.characters[code];
    if (!entry || !pair.listed || pair.hidden) continue;
    const bill = unitBill(growth, entry, chars, pair);
    for (const [ref, n] of Object.entries(bill.materials)) {
      if (n > 0) (byUnit[ref] ??= {})[code] = n;
    }
  }
  const total: Record<string, number> = {};
  for (const [ref, perUnit] of Object.entries(byUnit)) {
    total[ref] = Object.values(perUnit).reduce((a, b) => a + b, 0);
  }
  return { total, byUnit };
}
