// UI language. The game's own master data ships Korean for names, types and
// stats, so a label is localised by reading the other column where one exists
// and from a table here where the game has none.
import { create } from 'zustand';
import { useGameLangStore, useTextTables, type GameLang } from '@/lib/gameLangStore';

export type Lang = 'en' | 'ko';

export type Localized = { en: string; ko: string };

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'ko', label: '한국어' },
];

const STORAGE_KEY = 'mad.lang';

type LangStore = { lang: Lang; setLang: (lang: Lang) => void };

// Starts at the default so the statically exported HTML and the first client
// render agree; `restoreLang` applies the stored choice after mount.
export const useLangStore = create<LangStore>((set) => ({
  lang: 'en',
  setLang: (lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // private mode or a blocked store: the choice just does not persist
    }
    set({ lang });
  },
}));

// Every reader re-renders on a game-text change too, because `dataText` reads that setting.
export function useLang(): Lang {
  useGameLangStore((s) => s.choice);
  useTextTables((s) => s.version);
  return useLangStore((s) => s.lang);
}

function gameLangOf(lang: Lang): GameLang {
  const choice = useGameLangStore.getState().choice;
  return choice === 'auto' ? lang : choice;
}

export function restoreLang(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (saved === 'en' || saved === 'ko') useLangStore.setState({ lang: saved });
}

export function pick(value: Localized | null | undefined, lang: Lang): string {
  return value ? value[lang] : '';
}

// A game label carried in both columns; either side falls back to the other.
export function dataText(
  lang: Lang, ko?: string | null, en?: string | null,
): string {
  const game = gameLangOf(lang);
  if (game === 'ko') return ko || en || '';
  if (game === 'en') return en || ko || '';
  return (ko && useTextTables.getState().tables[game]?.[ko]) || en || ko || '';
}

/** `{name}` placeholders, so a translated sentence can reorder its parts. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    (key in vars ? String(vars[key]) : whole));
}

export const UI = {
  language: { en: 'Language', ko: '언어' },

  navViewer: { en: 'Viewer', ko: '뷰어' },
  navCharacters: { en: 'Characters', ko: '캐릭터' },
  navEffects: { en: 'Effects', ko: '효과' },
  navStages: { en: 'Events & Stages', ko: '이벤트·스테이지' },
  navFarm: { en: 'Planner', ko: '플래너' },
  navChangelog: { en: 'Changelog', ko: '변경사항' },
  navEvents: { en: 'Events', ko: '이벤트' },
  navItems: { en: 'Items', ko: '아이템' },
  homeTagline: { en: 'Skins, story, events and data for MAke Drama: MAD', ko: 'MAke Drama: MAD의 스킨, 스토리, 이벤트, 데이터' },
  homeNow: { en: 'Now running', ko: '진행 중' },
  homePickup: { en: 'Pickup banner', ko: '픽업 모집' },
  homeEvents: { en: 'Events', ko: '이벤트' },
  homeBanners: { en: 'Pickup banners', ko: '픽업 모집' },
  homeSeasonal: { en: 'Seasonal content', ko: '시즌 콘텐츠' },
  homeReveal: { en: 'Upcoming partner · click to reveal', ko: '예정 파트너 · 클릭해서 보기' },
  homeNemesis: { en: 'Nemesis', ko: '네메시스' },
  homeViewer: { en: 'Every skin, live: lobby, affection and desire scenes', ko: '모든 스킨을 로비·어펙션·디자이어로 재생' },
  homeCharacters: { en: 'Profiles, kits, stats and voice lines', ko: '프로필, 스킬, 스탯, 보이스' },
  homeStory: { en: 'Main, event and Nemesis story as text', ko: '메인·이벤트·네메시스 스토리 텍스트' },
  homeStages: { en: 'Events, stages, enemies and drops', ko: '이벤트, 스테이지, 적, 드롭' },
  homeItems: { en: 'Every item: where it drops, what uses it', ko: '모든 아이템의 획득처와 용도' },
  homeFarm: { en: 'Plan growth and the stages to farm', ko: '육성 계획과 파밍 스테이지' },
  homeEffects: { en: 'Find units by what their skills do', ko: '스킬 효과로 캐릭터 찾기' },
  homeChangelog: { en: 'What changed on this site', ko: '사이트 변경 내역' },
  itemsAll: { en: 'All', ko: '전체' },
  itemsPlanner: { en: 'Held or needed', ko: '보유·필요' },
  itemsCategory: { en: 'Category', ko: '분류' },
  itemsHeldN: { en: 'held {n}', ko: '보유 {n}' },
  itemsNeedN: { en: 'need {n}', ko: '필요 {n}' },
  itemsShortN: { en: 'short {n}', ko: '부족 {n}' },
  itemHeld: { en: 'Held (Planner inventory)', ko: '보유 (플래너 인벤토리)' },
  itemNeeded: { en: 'Your plan needs {n} · short {short}', ko: '플랜 필요 {n} · 부족 {short}' },
  itemOpenPlanner: { en: 'Open Planner', ko: '플래너 열기' },
  itemSellsFor: { en: 'Sells for', ko: '판매가' },
  itemContents: { en: 'Contents', ko: '내용물' },
  itemBoxRandom: { en: 'one at random', ko: '무작위 1개' },
  itemBoxSelect: { en: 'pick', ko: '선택' },
  itemBoxAll: { en: 'all of these', ko: '전부 획득' },
  itemPick: { en: '{n}', ko: '{n}개' },
  itemLikedBy: { en: 'Liked gift of', ko: '선호 선물' },
  itemObtained: { en: 'Obtained from', ko: '획득처' },
  itemFromShop: { en: 'shop · {price} each · limit {limit}', ko: '상점 · 개당 {price} · 최대 {limit}' },
  itemFromBox: { en: 'draw · {n} in the boxes', ko: '뽑기 · 박스에 {n}개' },
  navStory: { en: 'Story', ko: '스토리' },

  gameText: { en: 'Game text', ko: '게임 텍스트' },
  gameTextAuto: { en: 'Same as site', ko: '사이트와 같게' },

  eventsCount: { en: '{n} events · {running} running', ko: '이벤트 {n}개 · 진행 중 {running}개' },
  eventsServerTime: { en: 'Server time', ko: '서버 시간' },
  eventsLocalTime: { en: 'Local time', ko: '내 시간' },
  eventsEndsIn: { en: 'Ends in {time}', ko: '{time} 후 종료' },
  eventsStartsIn: { en: 'Starts in {time}', ko: '{time} 후 시작' },
  eventsStagesClose: { en: 'Stages close in {time}', ko: '스테이지 {time} 후 종료' },
  eventsReadStory: { en: 'Read story', ko: '스토리 읽기' },
  eventsShop: { en: 'Exchange shop', ko: '교환 상점' },
  eventsBox: { en: 'Box draw', ko: '박스 뽑기' },
  eventsBoxMax: { en: 'up to {n} draws', ko: '최대 {n}회' },
  rewardProfileIcon: { en: 'Profile icon', ko: '프로필 아이콘' },
  rewardLobbyBackground: { en: 'Lobby background', ko: '로비 배경' },
  rewardProfileTitle: { en: 'Profile title', ko: '프로필 칭호' },
  rewardProfileBorder: { en: 'Icon border', ko: '아이콘 테두리' },
  eventsStages: { en: 'Event stages', ko: '이벤트 스테이지' },
  eventsBonusUnits: { en: 'Bonus units', ko: '보너스 대상' },
  eventsBonusNote: { en: 'Event currency drop bonus per unit in the team, up to +{max}% total', ko: '편성한 대상 1명당 이벤트 재화 획득 보너스, 합계 최대 +{max}%' },
  eventsPerDraw: { en: 'Per draw', ko: '1회당' },
  eventsStep: { en: 'Step {n}', ko: '{n}단계' },
  eventsStepRepeat: { en: 'Step {n}+ (repeats)', ko: '{n}단계 이후 (반복)' },
  eventsStepDraws: { en: '{n} draws to empty', ko: '비우기까지 {n}회' },
  eventsCollect: { en: 'Collect {n} {grade}', ko: '{grade} {n}개 수집' },
  eventsLimit: { en: 'Limit {n}', ko: '최대 {n}회' },
  eventsUnlimited: { en: 'No limit', ko: '제한 없음' },
  gradeLegend: { en: 'Legend', ko: '레전드' },
  gradeRare: { en: 'Rare', ko: '레어' },
  gradeNormal: { en: 'Normal', ko: '노멀' },
  eventsSide: { en: 'Side events', ko: '사이드 이벤트' },
  eventsLuckyDraw: { en: 'Lucky draw', ko: '럭키 드로우' },
  eventsAccountDays: { en: '{n} days from your first entry', ko: '첫 입장부터 {n}일' },
  eventsScenes: { en: '{n} scenes', ko: '{n}개 장면' },
  eventsScene: { en: '1 scene', ko: '1개 장면' },
  eventsPickup: { en: 'Pickup', ko: '픽업' },
  eventsCast: { en: 'In the story', ko: '스토리 등장' },

  storyMain: { en: 'Main story', ko: '메인 스토리' },
  storyEvent: { en: 'Event stories', ko: '이벤트 스토리' },
  storyNemesis: { en: 'Nemesis', ko: '네메시스' },
  storySide: { en: 'Side', ko: '사이드' },
  storyBattle: { en: 'Battle', ko: '전투' },
  storyVoiced: { en: '{n} voiced', ko: '음성 {n}' },
  storyNoText: { en: 'No dialogue in this scene.', ko: '이 장면에는 대사가 없습니다.' },
  storyMissing: { en: 'This chapter has no text in that language.', ko: '이 언어의 텍스트가 없습니다.' },
  storyPlayVoice: { en: 'Play voice', ko: '음성 재생' },

  hubSwitchGame: { en: 'Switch game', ko: '게임 전환' },
  hubAllGames: { en: 'All games', ko: '모든 게임' },
  hubHere: { en: 'here', ko: '현재' },
  hubSource: { en: 'Source', ko: '소스' },
  hubPortfolio: { en: 'Portfolio', ko: '포트폴리오' },

  loading: { en: 'loading…', ko: '불러오는 중…' },
  noMatch: { en: 'no match', ko: '결과 없음' },
  search: { en: 'search…', ko: '검색…' },
  clear: { en: 'Clear', ko: '초기화' },
  includeNpcs: { en: 'Include NPCs', ko: 'NPC 포함' },
  includeUnreleased: { en: 'Include unreleased', ko: '미출시 포함' },
  countOf: { en: '{shown} of {total}', ko: '{total}개 중 {shown}개' },

  tabSkins: { en: 'Skins', ko: '스킨' },
  tabVoice: { en: 'Voice', ko: '보이스' },
  voiceMissing: { en: 'Voice lines failed to load.', ko: '보이스를 불러오지 못했습니다.' },
  tabSd: { en: 'Mini', ko: 'SD' },
  sdAnimation: { en: 'Animation', ko: '애니메이션' },
  sdPlayCutin: { en: 'Skill cut-in', ko: '스킬 컷인' },
  tabGacha: { en: 'Gacha', ko: '가챠' },
  filterAll: { en: 'All', ko: '전체' },
  storeDiff: { en: 'Store diff', ko: '스토어 차이' },
  storeDiffTitle: { en: 'store art differs', ko: '스토어별 아트가 다름' },
  badgeDiff: { en: 'DIFF', ko: '차이' },
  badgeBackground: { en: 'background', ko: '배경' },
  animCount: { en: '{n} anims', ko: '애니메이션 {n}개' },
  faceCount: { en: '{n} faces', ko: '표정 {n}개' },
  toCharacter: { en: 'character →', ko: '캐릭터 →' },
  selectSkin: { en: 'select a skin', ko: '스킨을 선택하세요' },
  hasSkins: { en: 'Has skins', ko: '스킨 보유' },
  rarity: { en: 'Rarity', ko: '등급' },
  collectionAll: { en: 'All units', ko: '전체 유닛' },
  collectionCollected: { en: 'Collected', ko: '보유 중' },
  collectionFavorites: { en: 'Favorites', ko: '즐겨찾기' },
  collectionNotCollected: { en: 'Not collected', ko: '미보유' },
  collectionNotFavorite: { en: 'Not favorite', ko: '즐겨찾기 아님' },
  collectionMarkAll: { en: 'Mark all collected', ko: '전체 보유로 표시' },
  collectionMarkAllConfirm: {
    en: 'Mark {n} shown units collected?',
    ko: '표시된 유닛 {n}개를 보유로 표시할까요?',
  },
  collectionTitle: { en: 'Collection', ko: '컬렉션' },
  collectionMarkCollected: { en: 'Mark collected', ko: '보유로 표시' },
  collectionAddFavorite: { en: 'Add favorite', ko: '즐겨찾기 추가' },
  collectionFavorite: { en: 'Favorite', ko: '즐겨찾기' },
  collectionOpenFarm: { en: 'Open in Farm →', ko: '파밍에서 열기 →' },
  collectionAddFarm: { en: 'Add to farm', ko: '파밍에 추가' },
  collectionInFarm: { en: 'On farm list', ko: '파밍 목록에 있음' },
  collectionCurrent: { en: 'Current info', ko: '현재 정보' },
  collectionFarmSync: {
    en: 'Current levels are shared with the Farm page.',
    ko: '현재 레벨은 파밍 페이지와 공유됩니다.',
  },

  backToCharacters: { en: '← characters', ko: '← 캐릭터' },
  noCharacterData: { en: 'no character data for {code}', ko: '{code} 캐릭터 정보 없음' },
  noCharacterSelected: { en: 'no character selected', ko: '선택된 캐릭터 없음' },
  tabProfile: { en: 'Profile', ko: '프로필' },
  tabSkills: { en: 'Skills', ko: '스킬' },
  tabStats: { en: 'Stats', ko: '스탯' },
  lockedUntil: { en: 'Locked until {date}.', ko: '{date}까지 잠김.' },

  rowBirthday: { en: 'Birthday', ko: '생일' },
  rowArtist: { en: 'Artist', ko: '일러스트' },
  rowCv: { en: 'CV', ko: '성우' },
  rowHobby: { en: 'Hobby', ko: '취미' },
  rowSpecialty: { en: 'Specialty', ko: '특기' },
  rowLikes: { en: 'Likes', ko: '좋아하는 것' },
  statusMessage: { en: 'Status message', ko: '상태 메시지' },
  birthdayMessage: { en: 'Birthday message', ko: '생일 메시지' },

  panelEquipmentSlots: { en: 'Equipment slots', ko: '장비 슬롯' },
  panelLikedGifts: { en: 'Liked gifts', ko: '선호 선물' },
  panelDateVenues: { en: 'Date venues', ko: '데이트 장소' },
  panelUnit: { en: 'Unit', ko: '유닛' },
  panelEquipment: { en: 'Equipment', ko: '장비' },
  panelRotation: { en: 'Skill rotation', ko: '스킬 순환' },

  dialLevel: { en: 'Level', ko: '레벨' },
  dialAffection: { en: 'Affection', ko: '호감도' },
  dialStar: { en: 'Star', ko: '성급' },
  dialMax: { en: 'max {n}', ko: '최대 {n}' },
  gearEmpty: { en: 'Empty', ko: '없음' },
  gearTier: { en: 'Tier {n}', ko: '{n}단계' },
  statsNote: { en: '{star}★ · Lv {level} · ♥ {love}', ko: '{star}★ · 레벨 {level} · ♥ {love}' },
  headStat: { en: 'Stat', ko: '스탯' },
  headBase: { en: 'Base', ko: '기본' },
  headGear: { en: 'Gear', ko: '장비' },
  headAffection: { en: 'Affection', ko: '호감도' },
  headTotal: { en: 'Total', ko: '합계' },

  skillSlot: { en: 'slot {n}', ko: '슬롯 {n}' },
  skillLevel: { en: 'Lv', ko: 'Lv' },
  maxStack: { en: '×{n} max', ko: '최대 {n}중첩' },
  cooldown: { en: '{n}s cd', ko: '재사용 {n}초' },
  perBattle: { en: '×{n} per battle', ko: '전투당 {n}회' },
  allInRange: { en: 'all in range', ko: '범위 내 전체' },
  onSide: { en: 'on the {side}', ko: '{side} 기준' },
  rotationOpening: { en: 'Opening', ko: '시작' },
  rotationLoop: { en: 'Loop', ko: '반복' },

  moreFilters: { en: 'More filters', ko: '필터 더보기' },

  viewerPlayback: { en: 'Playback', ko: '재생' },
  viewerAnimation: { en: 'Animation', ko: '애니메이션' },
  viewerCamera: { en: 'Camera', ko: '카메라' },
  viewerDisplay: { en: 'Display', ko: '표시' },
  viewerAudio: { en: 'Audio', ko: '오디오' },
  viewerStore: { en: 'Store', ko: '스토어' },

  rowMode: { en: 'Mode', ko: '모드' },
  rowSpeed: { en: 'Speed', ko: '속도' },
  rowLoopClip: { en: 'Loop clip', ko: '클립 반복' },
  rowBody: { en: 'Body', ko: '몸' },
  rowVariation: { en: 'Variation', ko: '변형' },
  rowStage: { en: 'Stage', ko: '구간' },
  rowSequence: { en: 'Sequence', ko: '시퀀스' },
  rowStep: { en: 'Step', ko: '단계' },
  rowReaction: { en: 'Reaction', ko: '리액션' },
  rowFace: { en: 'Face', ko: '표정' },
  rowOverlay: { en: 'Overlay', ko: '오버레이' },
  rowAspect: { en: 'Aspect', ko: '화면 비율' },
  rowTheatre: { en: 'Theatre', ko: '전체 화면' },
  rowTouchZones: { en: 'Touch zones', ko: '터치 영역' },
  rowDrag: { en: 'Drag', ko: '드래그' },
  rowLayers: { en: 'Layers', ko: '레이어' },
  rowBackground: { en: 'Background', ko: '배경' },
  rowVoice: { en: 'Voice', ko: '음성' },
  rowSceneAudio: { en: 'Scene audio', ko: '씬 오디오' },

  btnPlay: { en: 'Play', ko: '재생' },
  btnPause: { en: 'Pause', ko: '일시정지' },
  btnRestart: { en: 'Restart', ko: '다시 시작' },
  btnReset: { en: 'Reset', ko: '초기화' },
  btnSavePng: { en: 'Save PNG', ko: 'PNG 저장' },
  btnShare: { en: 'Share link', ko: '링크 공유' },
  shareCopied: { en: 'Link copied', ko: '링크 복사됨' },
  shareCopyFailed: { en: 'Copy the link from the address bar', ko: '주소 표시줄에서 링크를 복사하세요' },
  btnRecordVideo: { en: 'Record video', ko: '동영상 녹화' },
  btnStopRecording: { en: 'Stop recording', ko: '녹화 중지' },
  videoVisualOnly: { en: 'Video export records the canvas without audio.', ko: '동영상 내보내기는 오디오 없이 화면만 녹화합니다.' },
  videoWithAudio: { en: 'Recording canvas and audio.', ko: '화면과 오디오를 녹화합니다.' },
  videoUnsupported: { en: 'Video recording is not supported by this browser.', ko: '이 브라우저는 동영상 녹화를 지원하지 않습니다.' },
  btnExitTheatre: { en: 'Exit theatre', ko: '전체 화면 종료' },
  toggleOn: { en: 'ON', ko: '켜짐' },
  toggleOff: { en: 'OFF', ko: '꺼짐' },

  ctxFreePlay: { en: 'Free play', ko: '자유 재생' },
  ctxFreePlayHint: { en: 'choose animations manually', ko: '애니메이션 직접 선택' },
  ctxLobby: { en: 'Lobby', ko: '로비' },
  ctxLobbyHint: { en: 'touch and boredom flow', ko: '터치와 대기 반응' },
  ctxDesireView: { en: 'Desire View', ko: '데자이어 뷰' },
  ctxDesireStory: { en: 'Desire Story', ko: '데자이어 스토리' },
  ctxAffectionView: { en: 'Affection View', ko: '어펙션 뷰' },
  ctxAffectionStory: { en: 'Affection Story', ko: '어펙션 스토리' },
  ctxStory: { en: 'Story', ko: '스토리' },
  ctxViewHint: { en: 'interactive display script', ko: '상호작용 연출 스크립트' },
  ctxStoryHint: { en: 'authored story timeline', ko: '제작된 스토리 타임라인' },
  ctxViewTimelineHint: { en: 'authored view timeline', ko: '제작된 뷰 타임라인' },
  ctxSequenceHint: { en: 'sequential animation groups', ko: '순차 애니메이션 그룹' },

  ariaPlaybackContext: { en: 'Playback context', ko: '재생 모드' },
  ariaPlaybackSpeed: { en: 'Playback speed', ko: '재생 속도' },
  ariaBodyAnimation: { en: 'Body animation', ko: '몸 애니메이션' },
  ariaHomeVariation: { en: 'Home variation', ko: '홈 변형' },
  ariaScriptLabel: { en: 'Script label', ko: '스크립트 구간' },
  ariaStorySequence: { en: 'Story sequence', ko: '스토리 시퀀스' },
  ariaStoryBeat: {
    en: 'Story beat — clicking the figure advances',
    ko: '스토리 단계 — 캐릭터를 클릭하면 진행',
  },
  ariaReactionClip: { en: 'Play a reaction clip', ko: '리액션 클립 재생' },
  ariaFaceExpression: { en: 'Face expression', ko: '표정' },
  ariaOverlayClip: { en: 'Prop / effect overlay', ko: '소품 / 이펙트 오버레이' },
  ariaCameraMode: { en: 'Camera mode', ko: '카메라 모드' },
  ariaCanvasAspect: { en: 'Canvas aspect ratio', ko: '화면 비율' },
  ariaDragMode: { en: 'Drag mode', ko: '드래그 모드' },
  ariaStoreBuild: { en: 'Store build', ko: '스토어 빌드' },

  camFree: { en: 'Free move', ko: '자유 이동' },
  camFreeHint: { en: 'Pan and zoom by hand', ko: '직접 이동하고 확대' },
  camGame: { en: 'Follow game', ko: '게임 진행' },
  camGameHint: {
    en: 'Play the script entry and follow the scripted camera',
    ko: '스크립트 진입을 재생하고 연출 카메라를 따라감',
  },
  dragPan: { en: 'Pan', ko: '이동' },
  dragPanHint: { en: 'Drag moves the canvas', ko: '드래그로 화면 이동' },
  dragJiggle: { en: 'Jiggle', ko: '흔들기' },
  dragJiggleHint: {
    en: 'Drag drives the jigglers; a tap always jiggles',
    ko: '드래그로 흔들기, 탭은 항상 흔들림',
  },
  aspectFill: { en: 'Fill panel', ko: '패널 채우기' },

  stateUnpacking: { en: 'loading files…', ko: '파일 불러오는 중…' },
  stateFetching: { en: 'fetching…', ko: '받는 중…' },
  hintClickAdvance: { en: 'click to advance', ko: '클릭하여 진행' },
  hintStoryStep: {
    en: '{group} {step}/{total} — click to advance',
    ko: '{group} {step}/{total} — 클릭하여 진행',
  },
  hintReacting: { en: 'reacting: {clip}', ko: '리액션: {clip}' },
  hintClickFigure: { en: 'click the figure', ko: '캐릭터를 클릭하세요' },
  hintDragJiggles: { en: ' (drag jiggles)', ko: ' (드래그로 흔들기)' },
  hintJigglerCount: { en: ' ({n} jigglers)', ko: ' (흔들림 {n}개)' },
  hintNoTouchRegions: { en: 'no touch regions', ko: '터치 영역 없음' },
  sceneStart: { en: 'start', ko: '시작' },

  optAnimationDefault: { en: '(animation default)', ko: '(애니메이션 기본값)' },
  optNone: { en: '(none)', ko: '(없음)' },
  optVariation: { en: 'variation {n}', ko: '변형 {n}' },
  optPlayOneOf: { en: 'play one of {n}', ko: '{n}개 중 재생' },
  optConditional: { en: 'conditional — no plain region', ko: '조건부 — 일반 영역 없음' },
  optAuthoredSpeed: { en: 'authored speed', ko: '원본 속도' },
  manualTouch: { en: '(manual)', ko: '(수동)' },

  layers: { en: 'Layers', ko: '레이어' },
  layersHidden: { en: '{n} hidden', ko: '{n}개 숨김' },
  layersReset: { en: 'reset', ko: '초기화' },
  layersShowAll: { en: 'Show all layers', ko: '모든 레이어 표시' },
  layersClose: { en: 'Close layer panel', ko: '레이어 패널 닫기' },
  layersFilter: { en: 'filter slots…', ko: '슬롯 검색…' },
  layersShowGroup: { en: 'show all', ko: '모두 표시' },
  layersHideGroup: { en: 'hide all', ko: '모두 숨김' },
  layersShowGroupAria: { en: 'Show all {group} layers', ko: '{group} 레이어 모두 표시' },
  layersHideGroupAria: { en: 'Hide all {group} layers', ko: '{group} 레이어 모두 숨김' },
  layersShowSlot: { en: 'Show {slot}', ko: '{slot} 표시' },
  layersHideSlot: { en: 'Hide {slot}', ko: '{slot} 숨김' },
  layersNoMatch: { en: 'no slot matches', ko: '일치하는 슬롯 없음' },
  layersCount: { en: '{n} renderable slots', ko: '렌더 가능한 슬롯 {n}개' },

  storeOnestore: { en: 'ONE store — uncensored', ko: '원스토어 — 무수정' },
  storeGoogle: { en: 'Google Play — censored', ko: '구글 플레이 — 수정판' },

  gachaGrade: { en: 'Grade', ko: '등급' },
  gachaReplay: { en: 'Replay', ko: '다시 재생' },

  stageMode: { en: 'Mode', ko: '모드' },
  stageZone: { en: 'Zone', ko: '존' },
  stageWave: { en: 'Wave {n}', ko: '웨이브 {n}' },
  stageWaves: { en: '{n} waves', ko: '웨이브 {n}개' },
  stageEnemies: { en: '{n} enemies', ko: '적 {n}명' },
  stageRecommend: { en: 'Recommended Lv {level}', ko: '권장 레벨 {level}' },
  stageStamina: { en: '{n} stamina', ko: '스태미나 {n}' },
  stageWeakTo: { en: 'Weak to', ko: '약점' },
  stageLevelRange: { en: 'Enemy Lv {from}–{to}', ko: '적 레벨 {from}–{to}' },
  stageLevel: { en: 'Lv {n}', ko: '레벨 {n}' },
  stageBoss: { en: 'Boss', ko: '보스' },
  stageField: { en: 'Field', ko: '필드' },
  stageBgm: { en: 'BGM', ko: 'BGM' },
  stageMissions: { en: 'Mission', ko: '임무' },
  stageEvents: { en: 'Scripted beats', ko: '연출' },
  stageRoster: { en: 'Enemies', ko: '등장 적' },
  stageNoWaves: { en: 'no wave data in this pack', ko: '이 팩에 웨이브 데이터 없음' },
  stageNoKit: { en: 'no skill data', ko: '스킬 데이터 없음' },
  stageBack: { en: '← All stages', ko: '← 스테이지 목록' },
  stageNotFound: { en: 'no stage {id}', ko: '스테이지 {id} 없음' },
  stageNoneSelected: { en: 'no stage selected', ko: '선택된 스테이지 없음' },
  stageCount: { en: '{n} stages', ko: '스테이지 {n}개' },
  stageOpenKit: { en: 'Show kit', ko: '스킬 보기' },
  farmTabUnits: { en: 'Units', ko: '유닛' },
  farmTabItems: { en: 'Items', ko: '아이템' },
  farmTabClears: { en: 'Clears', ko: '클리어' },
  farmTabPlan: { en: 'Plan', ko: '계획' },
  farmAddUnit: { en: 'Add a unit', ko: '유닛 추가' },
  farmRemove: { en: 'Remove', ko: '제거' },
  farmHide: { en: 'Hide', ko: '숨기기' },
  farmShow: { en: 'Show', ko: '표시' },
  farmComplete: { en: 'Complete', ko: '완료' },
  farmCompleteHint: {
    en: 'Deduct the cost and make the target current',
    ko: '재료를 차감하고 목표를 현재 상태로',
  },
  farmCompleteShort: { en: 'Materials short', ko: '재료 부족' },
  farmCompletePart: { en: 'Complete this goal', ko: '이 목표 완료' },
  farmCompletePartHint: {
    en: 'Deduct this row alone and make it current',
    ko: '이 항목만 차감하고 현재 상태로',
  },
  farmPriority: { en: 'Priority', ko: '우선' },
  farmPriorityHint: {
    en: 'Finish this unit first; the rest gets what is left',
    ko: '이 유닛을 먼저 완성하고 나머지는 남은 재료로',
  },
  farmRest: { en: 'Everything else', ko: '나머지' },
  farmRunList: { en: 'Run list', ko: '주행 목록' },
  farmCurrent: { en: 'Current', ko: '현재' },
  farmTarget: { en: 'Target', ko: '목표' },
  farmNoUnits: { en: 'no units tracked', ko: '추적 중인 유닛 없음' },
  farmSweepOnly: { en: 'Sweep only', ko: '소탕만' },
  farmSweepHint: { en: '3★ stages only', ko: '3★ 스테이지만' },
  farmHardStages: { en: 'Hard stages', ko: '하드 스테이지' },
  farmHardHint: { en: '3 runs a day', ko: '하루 3회' },
  farmStars: { en: 'Stars', ko: '별' },
  farmUncleared: { en: 'Not cleared', ko: '미클리어' },
  farmSetAll: { en: 'Set all', ko: '일괄 설정' },
  farmNeed: { en: 'Need', ko: '필요' },
  farmMaterialsSummary: { en: 'Needed materials', ko: '필요 재료' },
  farmHave: { en: 'Have', ko: '보유' },
  farmShort: { en: 'Short', ko: '부족' },
  farmDone: { en: 'nothing left to farm', ko: '더 파밍할 것이 없음' },
  farmNoPlan: { en: 'set a target above', ko: '위에서 목표를 설정하세요' },
  farmBestRoute: { en: 'Best route', ko: '최적 경로' },
  farmRuns: { en: '{n} runs', ko: '{n}회' },
  farmPerRun: { en: '{n}/run', ko: '회당 {n}' },
  farmStamina: { en: '{n} stamina', ko: '스태미나 {n}' },
  farmTotalRuns: { en: 'Estimated runs', ko: '예상 횟수' },
  farmLocked: { en: '{n} locked', ko: '{n}개 잠김' },
  farmBlocked: { en: 'no route yet', ko: '경로 없음' },
  farmBlockedNote: {
    en: 'Clear a stage that drops these, or turn sweep only off.',
    ko: '해당 재료가 나오는 스테이지를 클리어하거나 소탕만 옵션을 끄세요.',
  },
  farmNoItemRow: { en: 'not in this pack', ko: '이 팩에 없음' },
  farmShowAllSources: { en: 'All sources', ko: '전체 경로' },
  farmSkills: { en: 'Skills', ko: '스킬' },
  farmSearchUnit: { en: 'Add a unit to plan…', ko: '계획할 유닛 추가…' },
  farmOnlyCollected: { en: 'Collected only', ko: '보유만' },
  farmAddCollected: { en: 'Add collected', ko: '보유 유닛 추가' },
  farmOnlyFavorites: { en: 'Favorites only', ko: '즐겨찾기만' },
  farmAddFavorites: { en: 'Add favorites', ko: '즐겨찾기 추가' },
  farmExport: { en: 'Export', ko: '내보내기' },
  farmImport: { en: 'Import', ko: '가져오기' },
  farmImportFailed: { en: 'not a plan file', ko: '계획 파일이 아님' },
  farmImportConfirm: {
    en: 'Replace the saved plan with this file?',
    ko: '저장된 계획을 이 파일로 대체할까요?',
  },
  farmDrops: { en: 'Drops', ko: '드롭' },
  farmOwned: { en: 'Owned', ko: '보유량' },
  farmItemsHint: { en: '{n} materials', ko: '재료 {n}개' },
  farmClearsHint: { en: '{n} of {total} recorded', ko: '{total}개 중 {n}개 기록됨' },
  stageHideKit: { en: 'Hide kit', ko: '스킬 접기' },
  stageUnnamedEnemy: { en: 'unnamed #{id}', ko: '이름 없음 #{id}' },
  stageDrops: { en: 'Drops', ko: '보상' },
  stageLive: { en: 'LIVE', ko: '진행 중' },
  archiveTitle: { en: 'Infinity Archive', ko: '인피니티 아카이브' },
  archiveOverview: { en: 'Season overview · Game Packs ›', ko: '시즌 개요 · 게임 팩 ›' },
  archiveSeason: { en: 'Season {n}', ko: '시즌 {n}' },
  archiveStartCount: { en: 'Start a run with {n} partners', ko: '파트너 {n}명으로 런 시작' },
  archiveMinStar: { en: 'Star {n} floor', ko: '성급 최소 {n}' },
  archiveMinLevel: { en: 'Level {n} floor', ko: '레벨 최소 {n}' },
  archiveMinNormal: { en: 'Skill Lv {n} floor', ko: '일반 스킬 최소 {n}' },
  archiveMinBurst: { en: 'Burst Lv {n} floor', ko: '버스트 스킬 최소 {n}' },
  archiveMinTier: { en: 'Gear T{n} floor', ko: '장비 최소 {n}티어' },
  archiveSupport: { en: 'Support partners', ko: '지원 파트너' },
  archiveScores: { en: 'Score rewards', ko: '점수 보상' },
  archivePath: { en: 'Run path', ko: '런 경로' },
  archiveDifficulty: { en: 'Difficulty {n}', ko: '난이도 {n}' },
  archivePick: { en: 'Pick a Game Pack', ko: '게임 팩 선택' },
  archivePool: { en: 'Pool {n}', ko: '풀 {n}' },
  archiveBattle: { en: 'Battle', ko: '전투' },
  archivePacks: { en: 'Game Packs', ko: '게임 팩' },
  stageChapters: { en: '{n} chapters', ko: '{n}개 챕터' },
  stageEventCount: { en: '{n} events', ko: '이벤트 {n}개' },
  stageSeasons: { en: '{n} seasons', ko: '{n}개 시즌' },
  stageNodes: { en: '{n} battle nodes', ko: '전투 노드 {n}개' },
  timingUse: { en: 'Use {s}s', ko: '사용 {s}초' },
  timingUseHint: { en: 'Length of the battle animation; the next action starts after it', ko: '전투 애니메이션 길이 — 끝나야 다음 행동' },
  timingDelay: { en: 'Delay {s}s', ko: '딜레이 {s}초' },
  stageEnded: { en: 'Ended', ko: '종료' },
  stageUpcoming: { en: 'Upcoming', ko: '예정' },
  stageAllModes: { en: 'All modes', ko: '전체 모드' },
  stageGroupCount: { en: '{n} lists', ko: '{n}개 목록' },

  rankUnowned: { en: 'Not owned', ko: '미보유' },
  rankStar: { en: 'Star', ko: '성급' },

  planTitle: { en: 'Planner', ko: '플래너' },
  planInventory: { en: 'Inventory', ko: '인벤토리' },
  planInventoryHint: { en: '{n} of {total} counted', ko: '{total}개 중 {n}개 입력됨' },
  planTargets: { en: 'Current and target', ko: '현재 / 목표' },
  planStarPanel: { en: 'Memories', ko: '메모리' },
  planNothingOwed: { en: 'nothing owed', ko: '필요 없음' },
  planOwned: { en: 'Owned', ko: '보유' },
  planShort: { en: 'Short', ko: '부족' },
  planHeld: { en: 'Held', ko: '보유' },
  planTotalNeeds: { en: 'Total needed / held', ko: '총 필요 / 보유' },
  planShowMaterials: { en: 'Materials', ko: '재료' },
  planShortCount: { en: '{n} short', ko: '{n}종 부족' },
  planAllCovered: { en: 'all covered', ko: '모두 충족' },
  planOpenPlan: { en: 'Open the plan', ko: '계획 열기' },
  tutStep: { en: 'Step {n} of {total}', ko: '{total}단계 중 {n}단계' },
  changeWhatsNew: { en: 'What’s new', ko: '새로운 소식' },
  changeSeeAll: { en: 'See the full changelog →', ko: '전체 변경사항 보기 →' },
  changeReleases: { en: '{n} releases', ko: '{n}개 업데이트' },
  tutBack: { en: 'Back', ko: '이전' },
  tutSkip: { en: 'Skip', ko: '건너뛰기' },
  tutNext: { en: 'Next', ko: '다음' },
  tutDone: { en: 'Got it', ko: '확인' },
  tutReplay: { en: 'Replay the tour', ko: '가이드 다시 보기' },
  tutAddTitle: { en: 'Add the units you care about', ko: '관심 있는 유닛 추가' },
  tutAddBody: {
    en: 'Type a name into the big box at the top of the Units tab. Collected and favourite units can be added in bulk with the chips beside it.',
    ko: '유닛 탭 상단의 큰 검색창에 이름을 입력하세요. 옆 칩으로 보유/즐겨찾기 유닛을 한 번에 추가할 수 있습니다.',
  },
  tutPlanTitle: { en: 'Click a unit to plan it', ko: '유닛을 눌러 계획하기' },
  tutPlanBody: {
    en: 'Each row opens a plan: level, star, every skill and every equipment slot, with a current and a target column. The cost updates as you type, and nothing is saved until you press Save.',
    ko: '각 행을 열면 레벨·성급·스킬·장비를 현재/목표로 설정할 수 있습니다. 비용은 즉시 갱신되며, 저장을 눌러야 반영됩니다.',
  },
  tutStockTitle: { en: 'Tell it what you already hold', ko: '보유 중인 재료 입력' },
  tutStockBody: {
    en: 'Inventory in the header counts every material, both experience balances and every unit memory. What you hold comes off the plan.',
    ko: '상단의 인벤토리에서 모든 재료·경험치·메모리를 입력하세요. 보유량은 계획에서 차감됩니다.',
  },
  tutRunTitle: { en: 'Record clears, then follow the run list', ko: '클리어 기록 후 파밍 목록 사용' },
  tutRunBody: {
    en: 'The Clears tab is one accordion per zone — mark what you have cleared, and the Plan tab turns the shortfall into the cheapest set of stage runs.',
    ko: '클리어 탭은 존별 아코디언입니다. 클리어한 스테이지를 기록하면, 플랜 탭이 부족분을 가장 저렴한 파밍 경로로 계산합니다.',
  },
  planAddHint: {
    en: 'Search the box above to add one, then click a unit to plan it.',
    ko: '위 검색창에서 유닛을 추가한 뒤, 유닛을 눌러 계획하세요.',
  },
  planSave: { en: 'Save', ko: '저장' },
  planCancel: { en: 'Cancel', ko: '취소' },
  planUnsaved: { en: 'unsaved', ko: '저장 안 됨' },
  planDiscardConfirm: {
    en: 'Discard the unsaved changes to this plan?',
    ko: '저장하지 않은 변경 사항을 버릴까요?',
  },
  planSaveFirst: { en: 'save the plan first', ko: '먼저 저장하세요' },
  planSortName: { en: 'Name', ko: '이름' },
  planSortMemories: { en: 'Memories short', ko: '메모리 부족' },
  planSortMaterials: { en: 'Materials short', ko: '재료 부족' },
  planSortStar: { en: 'Star', ko: '성급' },
  rankBought: { en: 'Bought', ko: '구매' },
  rankBoughtHint: {
    en: 'Lifetime memory-shop purchases — the price never resets',
    ko: '메모리 상점 누적 구매 수 — 가격은 초기화되지 않습니다',
  },
  rankToTarget: { en: 'To target', ko: '목표까지' },
  rankBuy: { en: 'Exchange', ko: '교환' },
  rankDays: { en: 'Days', ko: '일수' },
  rankNoRoute: { en: 'no route', ko: '경로 없음' },
  rankNotSold: { en: 'not sold', ko: '판매 없음' },
  rankSortBy: { en: 'Rank by', ko: '정렬' },
  rankPerRun: { en: '{n} a clear', ko: '클리어당 {n}개' },
  rankPerDay: { en: '{n} a day', ko: '하루 {n}개' },
} satisfies Record<string, Localized>;

export type UiKey = keyof typeof UI;

export function text(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string {
  const value = UI[key][lang];
  return vars ? fill(value, vars) : value;
}

export function useT(): (key: UiKey, vars?: Record<string, string | number>) => string {
  const lang = useLang();
  return (key, vars) => text(lang, key, vars);
}
