import { createPersisted } from '@altterisk/game-hub/persist';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import {
  loadCharacters, loadEvents, type CharacterData, type EventIndex, type RewardIndex, type RewardMissionSet,
  type StageData, type StageGroup,
} from '@/lib/data';

const stored = createPersisted<boolean>({
  key: 'mad.spoilers', version: 1, empty: () => false,
  sanitize: (raw) => raw === true,
});

type SpoilerStore = { show: boolean; ready: boolean; setShow: (show: boolean) => void };

export const useSpoilers = create<SpoilerStore>((set) => ({
  show: false,
  ready: false,
  setShow: (show) => {
    stored.save(show);
    set({ show });
  },
}));

export function restoreSpoilers(): void {
  useSpoilers.setState({ show: stored.load(), ready: true });
}

export type SpoilerFacts = {
  units: Set<string>;
  events: Set<number>;
  chapters: Set<number>;
};

const EVENT_GROUP = /^(?:event|story):(\d+)$/;
const EVENT_ICON = /EV(\d{4})/i;

// Not yet viewable in game: an unreleased unit, or one whose every banner is still ahead.
export function spoilerFacts(chars: CharacterData, events: EventIndex, now = Date.now()): SpoilerFacts {
  const started = new Set<string>();
  const banned = new Set<string>();
  for (const banner of events.banners ?? []) {
    for (const code of banner.codes ?? []) {
      banned.add(code);
      if (Date.parse(banner.start) <= now) started.add(code);
    }
  }
  const units = new Set<string>();
  for (const [code, entry] of Object.entries(chars.characters)) {
    if (entry.unreleased || (banned.has(code) && !started.has(code))) units.add(code);
  }
  const future = (events.events ?? []).filter((e) => Date.parse(e.start) > now);
  return {
    units,
    events: new Set(future.map((e) => e.id)),
    chapters: new Set(future.map((e) => e.chapter).filter((c): c is number => typeof c === 'number')),
  };
}

export function isFuture(start: string | null | undefined, now = Date.now()): boolean {
  return !!start && Date.parse(start) > now;
}

export function groupIsSpoiler(group: StageGroup, facts: SpoilerFacts, now = Date.now()): boolean {
  if (group.from && group.from > new Date(now).toISOString().slice(0, 10)) return true;
  const m = group.key.match(EVENT_GROUP);
  return !!m && facts.events.has(Number(m[1]));
}

export function chapterIsSpoiler(chapter: { id: number; event?: number }, facts: SpoilerFacts): boolean {
  return facts.chapters.has(chapter.id) || (chapter.event != null && facts.events.has(chapter.event));
}

export function itemIsSpoiler(item: { code?: string; icon?: string | null }, facts: SpoilerFacts): boolean {
  if (item.code && facts.units.has(item.code)) return true;
  const m = item.icon?.match(EVENT_ICON);
  return !!m && facts.events.has(Number(m[1]));
}

export function withoutStageSpoilers(data: StageData, facts: SpoilerFacts, now = Date.now()): StageData {
  const groups = Object.fromEntries(Object.entries(data.groups).filter(([, g]) => !groupIsSpoiler(g, facts, now)));
  return { ...data, groups, stages: data.stages.filter((s) => !data.groups[s.group] || s.group in groups) };
}

export function missionIsSpoiler(set: RewardMissionSet, facts: SpoilerFacts, now = Date.now()): boolean {
  return isFuture(set.open?.start, now) || (set.event != null && facts.events.has(set.event))
    || (!!set.pickup && facts.units.has(set.pickup));
}

export function withoutRewardSpoilers(data: RewardIndex, facts: SpoilerFacts, now = Date.now()): RewardIndex {
  const open = <T extends { open?: { start: string } }>(s: T) => !isFuture(s.open?.start, now);
  return {
    ...data,
    arena: { ...data.arena, seasons: data.arena.seasons.filter(open) },
    nemesis: { ...data.nemesis, seasons: data.nemesis.seasons.filter(open) },
    missions: data.missions.filter((m) => !missionIsSpoiler(m, facts, now)),
    passes: data.passes.filter(open),
  };
}

// The facts, or null while the indexes load; with spoilers shown everything passes.
export function useSpoilerFacts(): SpoilerFacts | null {
  const [facts, setFacts] = useState<SpoilerFacts | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadCharacters(), loadEvents()])
      .then(([chars, events]) => { if (live) setFacts(spoilerFacts(chars, events)); })
      .catch(() => { if (live) setFacts({ units: new Set(), events: new Set(), chapters: new Set() }); });
    return () => { live = false; };
  }, []);
  return facts;
}

// Whether lists should hide spoilers right now.
export function useHideSpoilers(): boolean {
  const { show, ready } = useSpoilers();
  return !(ready && show);
}

export function useSpoilerFilter() {
  const hide = useHideSpoilers();
  const facts = useSpoilerFacts();
  return useMemo(() => ({ hide, facts }), [hide, facts]);
}

// Whether lists must leave a unit out: only while spoilers are hidden.
export function useSpoilerUnit(): (code: string) => boolean {
  const { hide, facts } = useSpoilerFilter();
  return useCallback((code: string) => hide && !!facts?.units.has(code), [hide, facts]);
}
