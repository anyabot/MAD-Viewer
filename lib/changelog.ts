// Hand-written, not derived: this is the human account of what changed, in both
// UI languages. Add a release at the top; `date` is its identity and what the
// once-per-update popup remembers.
import type { Localized } from '@/lib/i18n';

export type ChangeKind = 'unit' | 'scene' | 'feature' | 'fix';

export type ChangeEntry = {
  kind: ChangeKind;
  text: Localized;
  /** Character this line is about, so the release gate can withhold it. */
  code?: string;
};

export type Release = {
  /** ISO date, newest first. Also the key the popup marks as seen. */
  date: string;
  title: Localized;
  entries: ChangeEntry[];
};

export const KIND_LABEL: Record<ChangeKind, Localized> = {
  unit: { en: 'New unit', ko: '신규 파트너' },
  scene: { en: 'Scene', ko: '시나리오' },
  feature: { en: 'Feature', ko: '기능' },
  fix: { en: 'Fix', ko: '수정' },
};

export const KIND_ORDER: ChangeKind[] = ['unit', 'scene', 'feature', 'fix'];

export const RELEASES: Release[] = [
  {
    date: '2026-08-27',
    title: { en: 'Estelle, and English', ko: '에스텔, 그리고 영어' },
    entries: [
      {
        kind: 'unit',
        code: 'CH0033',
        text: { en: 'Estelle added.', ko: '에스텔 추가' },
      },
      {
        kind: 'scene',
        code: 'CH0033',
        text: {
          en: 'Estelle’s skins, scenes and voice stay locked for 14 days, as the existing policy has it.',
          ko: '에스텔의 스킨·장면·보이스는 기존 정책대로 14일간 잠금',
        },
      },
      {
        kind: 'scene',
        code: 'CH0043',
        text: {
          en: 'Lafine’s scenes unlocked.',
          ko: '라피네 장면 잠금 해제',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'The game’s own English text everywhere, not just names.',
          ko: '이름 외 게임 자체 영어 텍스트 전체 적용',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Skill levels, equipment slots and lobby subtitles in both languages.',
          ko: '스킬 레벨별 설명·장비 슬롯·로비 자막 양쪽 언어 지원',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Stage search matches English names.',
          ko: '스테이지 검색 영어 이름 지원',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'A complete button on every plan row.',
          ko: '계획 항목별 완료 버튼 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'MADness in a Dream event stages.',
          ko: 'MADness in a Dream 이벤트 스테이지 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Nemesis season 3, Umbra Dei.',
          ko: '네메시스 3시즌 움브라 데이 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Event history art on the stage list.',
          ko: '스테이지 목록 이벤트 기록 아트 추가',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Unclosed colour tags and line breaks showed as raw markup.',
          ko: '닫히지 않은 색상 태그·줄바꿈 태그가 원문 그대로 표시되던 문제를 수정했습니다.',
        },
      },
    ],
  },
  {
    date: '2026-08-17',
    title: { en: 'The Planner', ko: '플래너' },
    entries: [
      {
        kind: 'feature',
        text: {
          en: 'Farm is now the Planner. Level, skills, equipment and star are one plan per unit, and star-up memories are farmed off the hard stages alongside every other material.',
          ko: '파밍이 플래너로 바뀌었습니다. 레벨·스킬·장비·성급을 유닛별 한 계획으로 관리하고, 승급에 필요한 메모리도 하드 스테이지에서 다른 재료와 함께 계산합니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Star-up planning: memories per star, what the memory shop charges as its price climbs, and how many days the hard stages take.',
          ko: '승급 계획 기능: 성급별 필요 메모리, 구매할수록 오르는 메모리 상점 가격, 하드 스테이지 파밍 예상 일수를 보여줍니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Each unit opens a plan popup with a current and target column. Nothing is saved until you press Save.',
          ko: '유닛을 누르면 현재/목표 계획 팝업이 열립니다. 저장을 눌러야 반영됩니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Priority, hide, complete and remove sit on the unit row, so the popup is only needed to edit.',
          ko: '우선순위·숨김·완료·삭제를 유닛 행에서 바로 사용할 수 있습니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Inventory moved into a popup covering every material, both experience balances and every unit memory.',
          ko: '인벤토리가 팝업으로 바뀌었고, 모든 재료·경험치·메모리를 한곳에서 입력합니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'How many of a unit’s memories you hold can be typed straight into her plan, next to what she still needs.',
          ko: '해당 유닛의 보유 메모리 수를 계획 팝업에서 바로 입력할 수 있습니다. 부족한 수량 옆에 표시됩니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'The unit list shows what a plan consumes without opening it: a total needed-over-held panel above the list, and a per-unit breakdown on each row. Both collapse.',
          ko: '유닛 목록에서 계획을 열지 않아도 소비량을 볼 수 있습니다. 목록 위의 총 필요/보유 패널과 유닛별 내역이 각각 접힙니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'The Clears tab is one collapsed accordion per zone, each showing its own recorded count.',
          ko: '클리어 탭이 존별 아코디언으로 바뀌고, 각 존의 기록 수를 표시합니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'A four-step tour opens the first time you use the Planner, and this changelog opens once per update.',
          ko: '플래너를 처음 사용할 때 4단계 가이드가 표시되며, 업데이트마다 이 변경사항이 한 번 표시됩니다.',
        },
      },
      {
        kind: 'fix',
        code: 'CH0043',
        text: {
          en: 'Lafine’s missing art now shows: her memory, cut-in, ultimate icon and scene thumbnails.',
          ko: '표시되지 않던 라피네의 아트를 추가했습니다. 메모리·컷인·궁극기 아이콘·시나리오 썸네일.',
        },
      },
      {
        kind: 'fix',
        code: 'CH0043',
        text: {
          en: 'Lafine’s date venues were missing from her profile.',
          ko: '라피네의 데이트 장소가 프로필에 표시되지 않던 문제를 수정했습니다.',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Cash Crush Rush was missing its logo, currency and ticket art, and the raid stage had no art at all.',
          ko: '캐시 크러시 러시의 로고·재화·티켓 아트와 레이드 스테이지 아트가 누락되어 있던 문제를 수정했습니다.',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Item slots with no grade — every character memory among them — were drawn without their ribbon.',
          ko: '등급이 없는 아이템 슬롯에 리본이 표시되지 않던 문제를 수정했습니다. 캐릭터 메모리가 모두 여기 해당합니다.',
        },
      },
    ],
  },
  {
    date: '2026-08-13',
    title: { en: 'Lafine, sharing and recording', ko: '라피네, 공유와 녹화' },
    entries: [
      {
        kind: 'unit',
        code: 'CH0043',
        text: { en: 'Lafine added.', ko: '라피네 추가' },
      },
      {
        kind: 'scene',
        code: 'CH0043',
        text: {
          en: 'Lafine’s scenes stay locked for 14 days, as the existing policy has it.',
          ko: '라피네의 장면은 기존 정책대로 14일간 잠금',
        },
      },
      {
        kind: 'scene',
        code: 'CH0068',
        text: {
          en: 'Claire (Swimsuit) scenes unlocked.',
          ko: '클레어(수영복) 장면 잠금 해제',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Share links for units and scenes.',
          ko: '유닛 및 장면 공유 링크 기능 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Video recording in the scene viewer.',
          ko: '장면 뷰어 영상 녹화 기능 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Units you own can be marked as collected.',
          ko: '보유한 유닛을 획득 표시할 수 있는 기능 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Collected units feed the farm page, so their materials count towards what you still need.',
          ko: '보유 유닛 정보를 파밍 페이지와 연동하여 필요한 재료 계산에 반영',
        },
      },
    ],
  },
];

export const LATEST = RELEASES[0];

/** What the popup marks as seen, so a new release shows exactly once. */
export const latestKey = (): string => `changelog:${LATEST.date}`;
