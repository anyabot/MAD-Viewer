import { formatRemaining, phaseOf, type Phase } from '@altterisk/game-hub/time';
import type { GameEvent } from '@/lib/data';
import type { GameLang } from '@/lib/gameText';
import { text, type Lang, type Localized } from '@/lib/i18n';

export type EventPhase = Phase;

export function sceneCount(
  t: (key: 'eventsScene' | 'eventsScenes', vars?: Record<string, number>) => string, n: number,
): string {
  return n === 1 ? t('eventsScene') : t('eventsScenes', { n });
}

export const SERVER_ZONE = 'Asia/Seoul';

export const PHASE_LABEL: Record<EventPhase, Localized> = {
  upcoming: { en: 'Upcoming', ko: '예정' },
  running: { en: 'Running', ko: '진행 중' },
  exchange: { en: 'Exchange only', ko: '교환만 가능' },
  ended: { en: 'Ended', ko: '종료' },
};

export function eventPhase(event: GameEvent, now: number): EventPhase {
  return phaseOf(event, now);
}

export function remaining(ms: number, lang: Lang): string {
  return formatRemaining(ms, { d: text(lang, 'unitDay'), h: text(lang, 'unitHour'), m: text(lang, 'unitMinute') });
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
