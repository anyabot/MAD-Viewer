import type { GameEvent } from '@/lib/data';
import type { GameLang } from '@/lib/gameText';
import type { Lang, Localized } from '@/lib/i18n';

export type EventPhase = 'upcoming' | 'running' | 'ended';

export function sceneCount(
  t: (key: 'eventsScene' | 'eventsScenes', vars?: Record<string, number>) => string, n: number,
): string {
  return n === 1 ? t('eventsScene') : t('eventsScenes', { n });
}

export const SERVER_ZONE = 'Asia/Seoul';

export const PHASE_LABEL: Record<EventPhase, Localized> = {
  upcoming: { en: 'Upcoming', ko: '예정' },
  running: { en: 'Running', ko: '진행 중' },
  ended: { en: 'Ended', ko: '종료' },
};

export function eventPhase(event: GameEvent, now: number): EventPhase {
  if (now < Date.parse(event.start)) return 'upcoming';
  return now <= Date.parse(event.end) ? 'running' : 'ended';
}

export function remaining(ms: number, lang: Lang): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const unit = lang === 'ko' ? { d: '일', h: '시간', m: '분' } : { d: 'd', h: 'h', m: 'm' };
  if (d) return `${d}${unit.d} ${h}${unit.h}`;
  if (h) return `${h}${unit.h} ${m}${unit.m}`;
  return `${m}${unit.m}`;
}

export function formatMoment(iso: string, lang: Lang, serverTime: boolean): string {
  return new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: serverTime ? SERVER_ZONE : undefined,
  }).format(new Date(iso));
}

export function zoneLabel(serverTime: boolean): string {
  if (serverTime) return 'KST';
  const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
  return part?.value ?? '';
}

const BANNER_SUFFIX: Partial<Record<GameLang, string>> = {
  en: '_EN', ja: '_JP', 'zh-Hans': '_CNSC', 'zh-Hant': '_CNTC',
};

export function bannerNames(event: GameEvent, lang: GameLang): string[] {
  if (!event.banner) return [];
  const suffix = BANNER_SUFFIX[lang];
  return suffix ? [`${event.banner}${suffix}`, event.banner] : [event.banner];
}
