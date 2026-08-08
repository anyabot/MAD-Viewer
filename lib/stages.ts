// Node suites load this module directly: no runtime import through `@/`.
import type {
  DropEntry, StageData, StageDrop, StageEntry, StageGroup, StageSubMission, StageZone,
  WaveSlot,
} from '@/lib/data';
import type { Lang, Localized } from '@/lib/i18n';

function say(value: Localized | null | undefined, lang: Lang): string {
  return value ? value[lang] : '';
}

export const DIFFICULTY_ORDER = ['normal', 'hard', 'very_hard', 'challenge'];

export const DIFFICULTY_LABEL: Record<string, Localized> = {
  normal: { en: 'Normal', ko: '노말' },
  hard: { en: 'Hard', ko: '하드' },
  very_hard: { en: 'Very hard', ko: '베리 하드' },
  challenge: { en: 'Challenge', ko: '챌린지' },
};

// `WAVE_ENCOUNTER_TYPE`: whether the enemies stand waiting or run in.
export const ENCOUNTER_LABEL: Record<string, Localized> = {
  place: { en: 'Waiting', ko: '배치' },
  run: { en: 'Charges in', ko: '돌진' },
};

export const EVENT_LABEL: Record<string, Localized> = {
  dialogue: { en: 'Dialogue', ko: '대사' },
  bgm: { en: 'BGM change', ko: 'BGM 변경' },
  map_time: { en: 'Map time', ko: '맵 시간' },
  force_outcome: { en: 'Forced outcome', ko: '결과 확정' },
  battle_dialogue: { en: 'Battle dialogue', ko: '전투 대사' },
  pause: { en: 'Pause', ko: '일시정지' },
  tutorial: { en: 'Tutorial', ko: '튜토리얼' },
  input_off: { en: 'Input locked', ko: '입력 잠금' },
  input_on: { en: 'Input unlocked', ko: '입력 해제' },
  burst_on: { en: 'Burst enabled', ko: '버스트 허용' },
  burst_off: { en: 'Burst disabled', ko: '버스트 차단' },
  burst_charge: { en: 'Burst charged', ko: '버스트 충전' },
};

export const TRIGGER_LABEL: Record<string, Localized> = {
  enemy_encounter: { en: 'On encounter', ko: '조우 시' },
  battle_start: { en: 'On battle start', ko: '전투 시작 시' },
  before_wave_move: { en: 'Before the next wave', ko: '다음 웨이브 전' },
  boss_hp_rate: { en: 'At a boss HP threshold', ko: '보스 체력 비율' },
  boss_hp_bar: { en: 'At a boss HP bar', ko: '보스 체력바' },
  chain: { en: 'Chained', ko: '연쇄' },
  skill_trigger: { en: 'On a skill trigger', ko: '스킬 트리거' },
};

export const CHANNEL_LABEL: Record<string, Localized> = {
  first: { en: 'First clear', ko: '최초 클리어' },
  star: { en: 'Missions', ko: '임무' },
  repeat: { en: 'Every clear', ko: '반복 보상' },
};

// `DROP_TYPE`: `always` and a full `drop_per` both mean guaranteed, so only the surprising ones are named.
export const DROP_LABEL: Record<string, Localized> = {
  weight: { en: 'weighted', ko: '가중치' },
  boss_hp: { en: 'by boss HP', ko: '보스 체력' },
  prob: { en: 'chance', ko: '확률' },
};

export const CHANNEL_ORDER = ['first', 'star', 'repeat'] as const;

/** `[n]` or `[min, max]`; a trailing zero is padding, not a range. */
export function dropAmount(drop: StageDrop): string {
  const [a, b] = drop.amount;
  if (a == null) return '';
  return b ? `${a}–${b}` : `${a}`;
}

/** Null when the drop is certain, so a caller can leave the row unadorned. */
export function dropChance(drop: StageDrop): string | null {
  if (drop.chance == null) return null;
  const pct = drop.chance * 100;
  return `${pct >= 10 ? Math.round(pct) : Number(pct.toFixed(2))}%`;
}

// Resolve in this order, and keep the page and the suite reading the same list.
export const DROP_ICON_GROUPS = ['item', 'equip', 'skill', 'ui'] as const;

export function dropEntry(data: StageData, drop: StageDrop): DropEntry | null {
  return drop.ref ? data.drops[drop.ref] ?? null : null;
}

export function dropName(data: StageData, drop: StageDrop): string {
  return dropEntry(data, drop)?.name || `${drop.type} ${drop.id}`;
}

export function zoneOf(data: StageData, stage: StageEntry): StageZone | null {
  return stage.zoneId != null ? data.zones[String(stage.zoneId)] ?? null : null;
}

// `{0}` is the zone's ordering and `{1}` the stage's; a one-argument template takes the stage ordering alone.
export function stageName(data: StageData, stage: StageEntry, lang: Lang): string {
  const template = say(stage.nameTemplate, lang) || stage.nameTemplate?.ko || '';
  const order = stage.order ?? 0;
  if (!template) return stage.devName || `#${stage.id}`;
  // A Nemesis stage reuses its zone's name and carries no placeholder, so the ordering is appended.
  if (!/\{\d\}/.test(template)) return order ? `${template} ${order}` : template;
  const args = /\{1\}/.test(template)
    ? [zoneOf(data, stage)?.order ?? 0, order]
    : [order];
  return template.replace(/\{(\d)\}/g, (whole, i: string) => {
    const value = args[Number(i)];
    return value == null ? whole : String(value);
  });
}

export function subMissionsOf(
  data: StageData, stage: StageEntry,
): StageSubMission[] {
  return stage.subMissionGroup ? data.subMissions[stage.subMissionGroup] ?? [] : [];
}

/** The mark a sub-mission carries when it is not a party check. */
export const MISSION_ICON: Record<number, string> = {
  1: 'Complete_Check',
  11: 'Icon_Clock',
};

// A party check's `values[0]` names a row of `checkTable`; the rest are counts.
export function missionCheck(
  mission: StageSubMission,
): { table: NonNullable<StageSubMission['checkTable']>; value: number } | null {
  const table = mission.checkTable;
  const value = mission.values[0];
  return table && value != null ? { table, value } : null;
}

// Arguments are written into the text as `[0]`, `[1]`; without `resolve` a slot falls back to the raw value.
export function subMissionText(
  mission: StageSubMission, lang: Lang,
  resolve?: (table: NonNullable<StageSubMission['checkTable']>, value: number) => string,
): string {
  const raw = say(mission.text, lang) || mission.text?.ko || '';
  const check = missionCheck(mission);
  return raw.replace(/\[(\d)\]/g, (whole, i: string) => {
    const at = Number(i);
    const value = mission.values[at];
    if (value == null) return whole;
    if (at === 0 && check && resolve) return resolve(check.table, check.value) || String(value);
    return String(value);
  });
}

/** Consecutive identical slots collapse to one row with a count. */
export type EnemyGroup = { code?: string; id?: number; level?: number | null; count: number };

export function groupSlots(slots: WaveSlot[]): EnemyGroup[] {
  const out: EnemyGroup[] = [];
  for (const slot of slots) {
    const last = out[out.length - 1];
    if (last && last.code === slot.code && last.id === slot.id && last.level === slot.level) {
      last.count += 1;
    } else {
      out.push({ code: slot.code, id: slot.id, level: slot.level, count: 1 });
    }
  }
  return out;
}

/** Every enemy code a stage fields, in first-appearance order. */
export function enemyCodes(stage: StageEntry): string[] {
  const seen = new Set<string>();
  for (const wave of stage.waves) {
    for (const slot of wave.enemies) if (slot.code) seen.add(slot.code);
  }
  return [...seen];
}

export function levelRange(stage: StageEntry): [number, number] | null {
  const levels = stage.waves.flatMap(
    (w) => w.enemies.flatMap((s) => (s.level != null ? [s.level] : [])));
  return levels.length ? [Math.min(...levels), Math.max(...levels)] : null;
}

export type StageGrouping = { group: StageGroup; stages: StageEntry[] };

// Not always a zone plate: a Nemesis season uses a boss portrait and a daily zone its `tile` cover.
export const GROUP_ICON_GROUPS = ['zone', 'tile', 'char'] as const;

// A story chapter has no name of its own, so it falls back to the mode plus its chapter number.
export function groupLabel(data: StageData, group: StageGroup, lang: Lang): string {
  const own = say(group.name, lang) || group.name?.ko;
  if (own) return own;
  if (group.chapter != null) {
    return lang === 'ko' ? `${group.chapter}장` : `Chapter ${group.chapter}`;
  }
  if (group.order != null) return `${modeLabel(data, group.mode, lang)} ${group.order}`;
  return group.devName || modeLabel(data, group.mode, lang);
}

/** `[from, to]` as plain dates, for the modes the game schedules. */
export function groupWindow(group: StageGroup): string | null {
  if (!group.from && !group.to) return null;
  return [group.from, group.to].filter(Boolean).join(' – ');
}

/** True while `today` falls inside the group's run window. */
export function groupIsLive(group: StageGroup, today = new Date()): boolean {
  if (!group.from || !group.to) return false;
  const day = today.toISOString().slice(0, 10);
  return group.from <= day && day <= group.to;
}

/** Stages of one mode, grouped the way the game lists them. */
export function stageGroups(data: StageData, mode: string): StageGrouping[] {
  const byKey = new Map<string, StageEntry[]>();
  for (const stage of data.stages) {
    if (stage.mode !== mode) continue;
    byKey.set(stage.group, [...(byKey.get(stage.group) ?? []), stage]);
  }
  // A story chapter holds both difficulties on one ordering, so the difficulty has to lead.
  const rank = (stage: StageEntry) =>
    DIFFICULTY_ORDER.indexOf(zoneOf(data, stage)?.difficulty ?? '');
  const out: StageGrouping[] = [];
  for (const [key, stages] of byKey) {
    const group = data.groups[key];
    if (!group) continue;
    out.push({
      group,
      // Zone before ordering, or a group spanning several zones interleaves them.
      stages: [...stages].sort((a, b) =>
        rank(a) - rank(b) || (a.zoneId ?? 0) - (b.zoneId ?? 0)
        || (a.order ?? 0) - (b.order ?? 0) || a.id - b.id),
    });
  }
  // Newest season or event first; everything else in the game's own order.
  const scheduled = out.every((g) => g.group.from);
  return out.sort((a, b) => (scheduled ? -1 : 1)
    * ((a.group.order ?? 0) - (b.group.order ?? 0)));
}

export type ModeSummary = {
  key: string;
  label: Localized;
  groups: number;
  stages: number;
  /** The live group's art where a mode has one, else its first group's. */
  image?: string;
  /** The activity screen's own tile for this mode, in the `tile` group. */
  tile?: string;
  /** Stands in for a mode with no tile of its own — the newest group's logo. */
  banner?: string;
  live: StageGroup | null;
};

/** One tile per battle mode, for the hub. */
export function modeSummaries(data: StageData): ModeSummary[] {
  return data.modes.map((mode) => {
    const groups = stageGroups(data, mode.key);
    const live = groups.map((g) => g.group).find((g) => groupIsLive(g)) ?? null;
    return {
      key: mode.key,
      label: mode.label,
      groups: groups.length,
      stages: groups.reduce((n, g) => n + g.stages.length, 0),
      image: (live ?? groups[0]?.group)?.image,
      tile: mode.tile,
      // Event has no activity-screen tile, so the newest event's own logo stands in.
      banner: groups.map((g) => g.group.banner).find(Boolean),
      live,
    };
  }).filter((m) => m.stages > 0);
}

export function groupByKey(data: StageData, key: string): StageGrouping | null {
  const group = data.groups[key];
  if (!group) return null;
  return stageGroups(data, group.mode).find((g) => g.group.key === key) ?? null;
}

/** Distinct drops a stage pays, across every channel, in channel order. */
export function stageDrops(stage: StageEntry): StageDrop[] {
  const seen = new Set<string>();
  const out: StageDrop[] = [];
  for (const channel of CHANNEL_ORDER) {
    for (const drop of stage.rewards?.[channel] ?? []) {
      const key = drop.ref ?? `${drop.type}:${drop.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(drop);
    }
  }
  return out;
}

export function stageById(data: StageData, id: number): StageEntry | null {
  return data.stages.find((s) => s.id === id) ?? null;
}

export function modeLabel(data: StageData, mode: string, lang: Lang): string {
  const found = data.modes.find((m) => m.key === mode);
  return found ? say(found.label, lang) : mode;
}
