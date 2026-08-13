// UI language. The game's own master data ships Korean for names, types and
// stats, so a label is localised by reading the other column where one exists
// and from a table here where the game has none.
import { create } from 'zustand';

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

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
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
  navStages: { en: 'Stages', ko: '스테이지' },
  navFarm: { en: 'Farm', ko: '파밍' },

  loading: { en: 'loading…', ko: '불러오는 중…' },
  noMatch: { en: 'no match', ko: '결과 없음' },
  search: { en: 'search…', ko: '검색…' },
  clear: { en: 'Clear', ko: '초기화' },
  includeNpcs: { en: 'Include NPCs', ko: 'NPC 포함' },
  includeUnreleased: { en: 'Include unreleased', ko: '미출시 포함' },
  countOf: { en: '{shown} of {total}', ko: '{total}개 중 {shown}개' },

  tabSkins: { en: 'Skins', ko: '스킨' },
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
  ctxDesireView: { en: 'Desire View', ko: '욕망 뷰' },
  ctxDesireStory: { en: 'Desire Story', ko: '욕망 스토리' },
  ctxAffectionView: { en: 'Affection View', ko: '애정 뷰' },
  ctxAffectionStory: { en: 'Affection Story', ko: '애정 스토리' },
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

  stateUnpacking: { en: 'unpacking…', ko: '압축 해제 중…' },
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
  farmSearchUnit: { en: 'add a unit…', ko: '유닛 추가…' },
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
  stageAllModes: { en: 'All modes', ko: '전체 모드' },
  stageGroupCount: { en: '{n} lists', ko: '{n}개 목록' },
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
