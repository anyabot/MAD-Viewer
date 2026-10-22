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
    date: '2026-10-22',
    title: { en: 'Kouchou (Halloween), Party, readable skills and battle tools', ko: '홍접(할로윈), 파티, 쉬운 스킬 설명과 전투 도구' },
    entries: [
      {
        kind: 'unit',
        code: 'CH0075',
        text: {
          en: 'Kouchou (Halloween) added, with her Affection and Desire scenes, mini rig and voice.',
          ko: '홍접(할로윈) 추가, 어펙션·데자이어 장면과 미니 캐릭터, 보이스 포함',
        },
      },
      {
        kind: 'scene',
        text: {
          en: '1.10.3 data: new standing rigs (including Yomi and the Halloween aberrant spirits), event stages, story and enemies.',
          ko: '1.10.3 데이터: 신규 스탠딩(요미, 할로윈 원령 등), 이벤트 스테이지, 스토리, 적 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Party page: save teams for Conquest, Arena and Nemesis groups, share them as a code and save them as an image.',
          ko: '파티 페이지 추가: 작전·아레나·네메시스 그룹별 팀 저장, 코드로 공유, 이미지 저장',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Skills read in plain language, with a switch between Readable, In-game buffs and Game details.',
          ko: '스킬을 쉬운 설명으로 표시, 쉬운 설명·게임 버프 정보·상세 데이터 전환 가능',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Skill details: when each hit fires, how damage splits across hits, proc chances, where dashes land, and each part of a multi-effect buff with its own value.',
          ko: '스킬 상세: 타격 발동 시점, 타격별 피해 비율, 발동 확률, 돌진 착지 위치, 복합 버프의 효과별 수치 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'DPS comparison: expected damage and healing per second of each unit against a target’s defence, evasion and other stats, including skill conditions.',
          ko: 'DPS 비교 페이지 추가: 대상의 방어·회피 등 스탯에 따른 유닛별 초당 피해·치유 기대값, 스킬 조건 반영',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Battle field guide: field size, start positions, where units stop to attack and hit radius, with an AoE checker linked from every area skill.',
          ko: '전장 가이드 추가: 전장 크기, 시작 위치, 공격 정지 위치와 피격 반경, 범위 스킬에서 바로 여는 범위 확인 도구',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Stages and Nemesis: boss skill rotations with their conditions, room summaries, and enemy size and stationary badges.',
          ko: '스테이지·네메시스: 보스 스킬 순서와 조건, 구역 요약, 적 크기·이동 안 함 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Character pages show line order, approach distance and hit radius.',
          ko: '캐릭터 페이지에 배치 순서, 접근 거리, 피격 반경 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Planner: choose the route (Greedy or Fewest runs), use selection boxes, and trade lower skill materials up.',
          ko: '플래너: 경로 선택(탐욕·최소 주행), 선택 상자 사용, 하위 스킬 재료 상위 교환',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Mini viewer records video; the skin viewer camera can be locked so drags reach the character.',
          ko: '미니 뷰어 영상 녹화 추가, 스킨 뷰어 카메라 고정으로 드래그가 캐릭터에 전달',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Event pages show attendance rewards and draw bonuses.',
          ko: '이벤트 페이지에 출석 보상과 누적 뽑기 보상 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Story-only characters are named in Korean and English, including Hiyori, Dorothea and the Academy Cadets.',
          ko: '스토리 전용 캐릭터 이름을 한국어·영어로 표시 (히요리, 도로테아, 아카데미 생도 등)',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Yomi shows her own portrait; emotes sit in the right place; Claire’s mini cut-in camera fixed.',
          ko: '요미 초상화 수정, 이모트 위치 수정, 클레어 미니 컷인 카메라 수정',
        },
      },
    ],
  },
  {
    date: '2026-10-16',
    title: { en: 'Artists, battle formulas and enemy stats', ko: '일러스트레이터, 전투 공식, 적 스탯' },
    entries: [
      {
        kind: 'feature',
        text: {
          en: 'Stage enemies show their stats at the wave level, with a level slider.',
          ko: '스테이지 적의 웨이브 레벨 기준 스탯 표시, 레벨 조절 가능',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Mini skill cut-ins: the full-screen backdrop (mist, vortex, transitions) now plays; effects follow the bones they are attached to (Isabel’s eye glow now sits on her eyes); glows blend additively; 3D effect meshes draw as meshes.',
          ko: '미니 스킬 컷인: 전체 화면 배경 이펙트(안개, 소용돌이, 전환) 재생, 이펙트가 연결된 본을 따라감(이사벨의 눈 이펙트 위치 수정), 빛 이펙트 가산 혼합, 3D 이펙트 메시 표시',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Mini skill cut-ins now use the game’s own cut-in camera (zoom and pan), so the character and effects are framed as in game; full-screen effects and particle sizes follow the game’s scaling; glow sprites keep the game’s on-screen angle.',
          ko: '미니 스킬 컷인이 게임의 컷인 카메라(확대·이동)를 그대로 사용해 캐릭터와 이펙트가 게임과 같은 구도로 표시, 전체 화면 이펙트와 파티클 크기도 게임 기준으로 적용, 발광 스프라이트가 게임과 같은 화면 각도를 유지',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Affection and Desire scenes hold each voiced line until its voice ends, so lines no longer skip and voices are no longer cut off.',
          ko: '애정·욕망 씬에서 음성이 있는 대사는 음성이 끝날 때까지 유지되어 대사 건너뜀과 음성 끊김 수정',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Affection scenes lip-sync: the mouth opens and closes with the voice, as in game.',
          ko: '애정 씬 립싱크: 게임과 같이 음성에 맞춰 입이 움직임',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Enemies whose attribute a wave overrides now show the overridden attribute.',
          ko: '웨이브에서 속성이 변경되는 적의 속성 표시 수정',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Battle formulas page: how a hit is resolved — evasion, critical, defence, penetration, attribute, damage reduction, level gap, damage over time, healing and status chances.',
          ko: '전투 공식 페이지 추가: 회피, 치명, 방어, 관통, 속성, 피해 감소, 레벨 차이, 지속 피해, 치유, 상태 이상 확률 계산 방식',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Less-used pages moved under Etc. in the top bar.',
          ko: '자주 쓰지 않는 페이지는 상단 메뉴의 기타로 이동',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Artists page: every credited illustrator with their pixiv, X and other links, and the characters they drew. The artist on a character page links to it.',
          ko: '일러스트레이터 페이지 추가: 참여 일러스트레이터별 pixiv·X 등 링크와 담당 캐릭터. 캐릭터 페이지의 일러스트레이터에서 바로 이동',
        },
      },
    ],
  },
  {
    date: '2026-10-14',
    title: { en: 'Nemesis, Arena, rewards and shops', ko: '네메시스, 아레나, 보상과 상점' },
    entries: [
      {
        kind: 'feature',
        text: {
          en: 'Nemesis lists every season, past and upcoming: best-score, final-tier and mission rewards, and the boss effects of each zone. What repeats between seasons shows once, with the differences behind a chevron.',
          ko: '네메시스 전 시즌(지난·예정 포함) 표시: 최고 점수·최종 티어·미션 보상과 구역별 보스 효과. 시즌 간 반복되는 내용은 한 번만, 차이는 펼쳐서 확인',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Arena added under Events & Stages: every season on one page, with its season effects, tiers, and in-season and season-end rewards.',
          ko: '이벤트·스테이지에 아레나 추가: 모든 시즌을 한 페이지에서 시즌 효과, 티어, 시즌 중·시즌 종료 보상과 함께 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Shop page: Normal, Memory, Nemesis, Arena, Exchange, mileage and event shops, with prices, purchase limits and the next reset time.',
          ko: '상점 페이지 추가: 일반·메모리·네메시스·아레나·교환·마일리지·이벤트 상점의 가격, 구매 제한, 다음 초기화 시간',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Rewards page: daily quests, achievements, event missions and the support passes, with every reward.',
          ko: '보상 페이지 추가: 일일 퀘스트, 업적, 이벤트 미션, 지원 패스와 각 보상',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'An event in its last week shows as Exchange only: its stages have closed and only the shop still takes the event currency.',
          ko: '마지막 주의 이벤트는 "교환만 가능"으로 표시: 스테이지는 종료되고 상점에서만 이벤트 재화 사용 가능',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'MochiTalk tab on character pages: bond chats, Bond Stories and their unlock rewards.',
          ko: '캐릭터 페이지에 모찌톡 탭 추가: 인연 대화, 인연 스토리와 해금 보상',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Jukebox: play every BGM track in the game.',
          ko: '주크박스 추가: 게임의 모든 BGM 재생',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Affection scenes play their voice lines.',
          ko: '어펙션 장면에서 보이스 재생',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Max and Min buttons set a character’s levels in one click.',
          ko: '최대·최소 버튼으로 캐릭터 레벨을 한 번에 설정',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Viewer: drag zones are drawn in a different colour from tap zones, and the info box on the canvas can be turned off.',
          ko: '뷰어: 드래그 영역을 터치 영역과 다른 색으로 표시, 캔버스 정보 박스 숨기기 가능',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Breadcrumbs on stage pages; the stage search and the character page tab are kept in the link.',
          ko: '스테이지 페이지에 경로 표시, 스테이지 검색어와 캐릭터 페이지 탭을 링크에 유지',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Story text shows its emphasis and furigana; leftover formatting tags are gone.',
          ko: '스토리 텍스트의 강조·루비 표시, 남아 있던 서식 태그 제거',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'Skins, voice and music fall back to a second source when the first fails to load.',
          ko: '스킨·보이스·음악이 첫 번째 경로에서 불러오지 못하면 두 번째 경로로 재시도',
        },
      },
    ],
  },
  {
    date: '2026-10-09',
    title: { en: 'Home, events, story and items', ko: '홈, 이벤트, 스토리와 아이템' },
    entries: [
      {
        kind: 'feature',
        text: {
          en: 'Home page with what is running now: events, pickup banners and seasonal content, with countdowns. The viewer moved to its own page; old links still work.',
          ko: '진행 중인 이벤트·픽업 배너·시즌 콘텐츠와 남은 시간을 보여주는 홈 추가. 뷰어는 별도 페이지로 이동했으며 기존 링크도 그대로 열립니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'A page for each event: its story, bonus partners with their drop bonus, and the exchange shop or draw steps.',
          ko: '이벤트별 페이지 추가: 스토리, 보너스 파트너와 드롭 보너스, 교환 상점 또는 뽑기 단계',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Story reader: main, event and Nemesis story as text.',
          ko: '스토리 열람: 메인·이벤트·네메시스 스토리를 텍스트로 제공',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Item list and item pages: where each item comes from, what uses it, and your Planner count, editable in place.',
          ko: '아이템 목록과 아이템 페이지 추가: 획득처, 사용처, 플래너 보유 수량을 바로 수정',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Infinity Archive seasons and Game Packs, under Ascent with Basic and Core Archive.',
          ko: '어센트에 무한 아카이브 시즌과 게임 팩 추가, 기본·코어 아카이브와 함께 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Voice lines tab on each character, with playback.',
          ko: '캐릭터별 보이스 탭 추가, 재생 지원',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Each skill shows its use time and delay.',
          ko: '스킬별 사용 시간과 딜레이 표시',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Filter characters by artist; the artist on a character page links to it.',
          ko: '일러스트레이터별 캐릭터 필터 추가, 캐릭터 페이지의 일러스트레이터에서 바로 이동',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Game text in all seven of the game’s languages, chosen separately from the site language.',
          ko: '게임 텍스트를 게임의 7개 언어로 표시, 사이트 언어와 별도로 선택',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Stage and story cards share one art size.',
          ko: '스테이지·스토리 카드 아트 크기 통일',
        },
      },
    ],
  },
  {
    date: '2026-10-08',
    title: { en: 'Isabel, Aura Infusion and 1.9.7', ko: '이자벨, 성력 주입과 1.9.7' },
    entries: [
      {
        kind: 'unit',
        code: 'CH0040',
        text: { en: 'Isabel added.', ko: '이자벨 추가' },
      },
      {
        kind: 'scene',
        code: 'CH0040',
        text: {
          en: 'Isabel’s Affection and Desire scenes and voice added.',
          ko: '이자벨의 어펙션·데자이어 장면과 보이스 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Aura Infusion: every character’s Surface and Deep paths, with their bonuses and costs, in the stat calculator and the Planner.',
          ko: '성력 주입: 캐릭터별 표층·심부 경로의 보너스와 비용을 스탯 계산기와 플래너에 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Parcel Raid supply run added; it drops the Aura Infusion material.',
          ko: '성력 주입 재료를 주는 특별 조달 택배 털이 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Bloody Mary Go Round event stages and new Umbra Dei and Marisquerade seasons added.',
          ko: 'Bloody Mary Go Round 이벤트 스테이지와 새로운 움브라 데이·마리스커레이드 시즌 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Content support updated for game version 1.9.7.',
          ko: '게임 버전 1.9.7 콘텐츠 지원을 업데이트했습니다.',
        },
      },
    ],
  },
  {
    date: '2026-09-22',
    title: { en: 'Rana and 1.8.3', ko: '라나와 1.8.3' },
    entries: [
      {
        kind: 'unit',
        code: 'CH0052',
        text: { en: 'Rana added.', ko: '라나 추가' },
      },
      {
        kind: 'scene',
        code: 'CH0052',
        text: {
          en: 'Rana’s Affection and Desire scenes and voice added.',
          ko: '라나의 어펙션·데자이어 장면과 보이스 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'PLEASE SAVE ME! event stages and new Marisquerade stages added.',
          ko: 'PLEASE SAVE ME! 이벤트 스테이지와 새로운 마리스커레이드 스테이지 추가',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Content support updated for game version 1.8.3.',
          ko: '게임 버전 1.8.3 콘텐츠 지원을 업데이트했습니다.',
        },
      },
    ],
  },
  {
    date: '2026-09-10',
    title: { en: 'Drama scenes and 1.7.3', ko: '드라마 장면과 1.7.3' },
    entries: [
      {
        kind: 'unit',
        code: 'CH0058',
        text: { en: 'Bianca added.', ko: '비앙카 추가' },
      },
      {
        kind: 'scene',
        code: 'CH0058',
        text: {
          en: 'Bianca’s skins, scenes and voice stay locked for 14 days, as the existing policy has it.',
          ko: '비앙카의 스킨·장면·보이스는 기존 정책대로 14일간 잠금',
        },
      },
      {
        kind: 'scene',
        text: {
          en: 'Static Drama scenes can now be opened in the viewer.',
          ko: '정적 드라마 장면을 이제 뷰어에서 열 수 있습니다.',
        },
      },
      {
        kind: 'feature',
        text: {
          en: 'Content support updated for game version 1.7.3.',
          ko: '게임 버전 1.7.3 콘텐츠 지원을 업데이트했습니다.',
        },
      },
      {
        kind: 'fix',
        text: {
          en: 'The updater now reads the current live configuration correctly.',
          ko: '업데이터가 현재 라이브 설정을 올바르게 읽도록 수정했습니다.',
        },
      },
    ],
  },
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
