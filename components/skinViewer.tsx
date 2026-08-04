// PixiJS + Spine skin viewer.
//
// Every rig is a binary Spine 4.2 skeleton with a single `default` skin. Face
// expressions are animations on track 1 (`01_*`) over a body animation on track
// 0 (`00_*`); affection rigs namespace their clips with `/` instead
// (`lobby/idle`, `story/story_001`). The two store builds ship different
// skeletons, so switching store loads a different archive.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Center, Flex, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import {
  loadSkinArchive, loadTexture, readBytes, readText, revokeSkinUrls, urlFor,
} from '@/lib/skinArchive';
import {
  BORING_DELAY_MS, actorPhases, archiveName, attachPanZoom, baseSkinKey,
  effectOf, layerGroup, mappedSourcePixelScale, overlayAnimations, regionLiveInPhase,
  spineTrack, storySequences,
  type ActorPhase, type Layout, type PlayMode, type StoreKey, type TouchRegion,
} from '@/components/skinViewer/types';
import { JiggleField } from '@/components/skinViewer/jiggle';
import {
  applyAssignments, armedBoxes, entryExtras, evaluate, fireOnlook, fireTouch, holds,
  sectionIndexByLabel, type RigScript, type Vars,
} from '@/components/skinViewer/interactions';
import {
  cutsceneOffsetAt, isLinearScene, resolveAlternatives, rigCameraTransform,
  sceneVoiceIds, scriptCameraTransform, spineBackgroundEventFade,
  waitAnimationDeadline,
  type CameraAction, type CameraBase, type CameraState, type DesirePresentation,
  type LinearScene, type SceneAction, type SceneFadeState, type SceneTimelineRig,
} from '@/components/skinViewer/scenes';
import {
  loadDesireInteractions, loadSceneAudio, loadSceneTimelines, loadVoice,
} from '@/lib/data';
import {
  interactionsFor, playVoice, prefetchVoice, setVoiceRate, stopVoice,
  type VoiceIndex, type VoiceInteraction,
} from '@/lib/voice';
import { lobbyBodyAnimation, lobbyFaceAnimation } from '@/components/skinViewer/lobby';
import {
  emotePlacement, loadEmoticons, type EmoticonManifest, type EmotePlacement,
} from '@/lib/emoticons';
import { CANVAS_ASPECTS, useViewerStore, type CanvasAspect } from '@/lib/viewerStore';
import {
  playBgm, playSceneSound, setSceneSoundRate, stopBgm, stopSceneSound,
  type SceneAudioIndex,
} from '@/lib/sceneAudio';
import {
  ActionButton, ControlRow, ControlSection, LayerPanel, OverlaySelect, SegmentedControl,
  StoreStrip, ToggleRow, type LayerItem, type SelectOption,
} from '@/components/skinViewer/chrome';

// Animation-name grouping. Affections namespace with "/" (lobby/idle);
// standings use a numeric prefix ("00_idle_normal", "01_anger").
export function animGroup(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0) return name.slice(0, slash);
  const m = /^(\d+)_/.exec(name);
  return m ? m[1] : '';
}

// Overlay colour per resolved touch effect: a dedicated reaction clip, a
// physics-only jiggle target, a region clip, or the generic phase reaction.
const EFFECT_COLOR: Record<string, number> = {
  reaction: 0xff4444,
  region: 0xffaa33,
  physics: 0x44dd88,
  generic: 0x4488ff,
};

const EFFECT_LABEL: Record<string, string> = {
  reaction: 'reaction clip',
  region: 'region clip',
  physics: 'jiggle only — no animation',
  generic: 'generic touch',
  // Home-screen outcomes.
  touch: 'variation touch clip',
  jiggle: 'jiggle only',
  // Scenario-driven outcomes.
  state: 'state change only — no clip',
  inert: 'nothing armed here yet',
};

// Group names that hold face-only animations, played on track 1 over the body.
const FACE_GROUPS = new Set(['01', 'mouth']);

export function isFaceAnim(name: string): boolean {
  return FACE_GROUPS.has(animGroup(name));
}

// Driven playback puts every clip on the track its own name declares
// (`spineTrack`), which is what the client does. These are the Free play lanes,
// where the user picks a body/face/overlay clip by hand, and the fallback face
// lane for a face clip whose name carries no track number (`mouth/*`).
const TRACK_BODY = 0;
const TRACK_FACE = 1;
const TRACK_OVERLAY = 2;

// This composition uses the widest authored CutsceneOffset key even when the
// viewer panel itself is narrower than the game's long-screen presentation.
const WIDE_CUTSCENE_STAGING_SKINS = new Set(['ds_ch0022']);

// World width the game's camera frames at `cam` scale 1, in skeleton units.
// Only the width is fixed; the view height is this width over the display
// aspect ratio.
const REFERENCE_VIEW_WIDTH = 3840;

// Playback rates the speed control offers. 1x is the authored speed; the same
// factor drives the Spine clock, the idle timers and the voice.
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.5, 2, 3, 4].map((rate) => ({
  value: String(rate),
  label: `${rate}x`,
  hint: rate === 1 ? 'authored speed' : undefined,
}));

// How long an emote stays up when its line carries no `[@wait]`. Its slot,
// offset and relative size are authored; the duration is not.
const EMOTE_SECONDS = 1.5;
const EMOTE_FADE_SECONDS = 0.2;

// Particle units -> skeleton units for an emote glyph. Only the ratios between
// emotes are authored (`startSize`); this sets the absolute size, chosen so a
// glyph reads as a bubble over the head rather than across the body.
const EMOTE_UNIT_SCALE = 4;

// Strip the group prefix for display ("01_anger" -> "anger").
export function animLabel(name: string): string {
  return name.replace(/^\d+_/, '').replace(/^[^/]+\//, '');
}

// Largest render-texture dimension a saved PNG may use — the minimum
// GL_MAX_TEXTURE_SIZE guaranteed by the WebGL2 baseline.
const MAX_EXPORT_DIM = 16384;

// Position in the sorted per-attachment source-pixel scales that sets the PNG
// export resolution. See the reduction in the Pixi build effect.
const EXPORT_SCALE_PERCENTILE = 0.1;

type SkinViewerProps = {
  skin: string;
  height?: string | number;
  /** Store builds whose art differs for this skin; <2 entries hides the strip. */
  stores?: StoreKey[];
  /** Initial store build to show. */
  store?: StoreKey;
  onStoreChange?: (store: StoreKey) => void;
  unavailable?: string;
};

type PlaybackContext = 'free_play' | 'lobby' | 'desire_view' | 'desire_story'
  | 'affection_view' | 'affection_story' | 'story';

export default function SkinViewer({
  skin, height = '70vh', stores = [], store: storeProp, onStoreChange, unavailable,
}: SkinViewerProps) {
  const diverged = stores.length > 1;
  const [store, setStore] = useState<StoreKey>(storeProp ?? stores[0] ?? 'onestore');
  useEffect(() => { if (storeProp && storeProp !== store) setStore(storeProp); }, [storeProp]); // eslint-disable-line react-hooks/exhaustive-deps

  const archive = useMemo(() => archiveName(skin, store, diverged), [skin, store, diverged]);

  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<any>(null);
  const rootRef = useRef<any>(null);
  const fitCameraRef = useRef<() => void>(() => {});
  const pixiRef = useRef<any>(null);
  const spineRef = useRef<any>(null);
  const bgSpritesRef = useRef<any[]>([]);
  const syncBackgroundVisibilityRef = useRef<() => void>(() => {});
  const spinePixelScaleRef = useRef<() => number>(() => 1);
  const filesRef = useRef<Map<string, Blob> | null>(null);
  const jiggleRef = useRef<JiggleField | null>(null);
  // Attachments a finished overlay clip left on screen — see the build effect.
  const clearPersistentRef = useRef<() => void>(() => {});

  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'fetching' | 'unpacking' | 'ready' | 'error'>('fetching');
  // Bumped when a Pixi/Spine build finishes. `layout` lands earlier — as soon as
  // the archive parses — and the build is what installs `autoDriveRef`, so
  // anything that has to drive the rig waits for this instead.
  const [rigBuilt, setRigBuilt] = useState(0);
  // Whether the built rig carries a `cam` bone, i.e. its own scene camera.
  const [hasRigCamera, setHasRigCamera] = useState(false);
  // Live panel size, so a chosen canvas aspect can be letterboxed inside it.
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const [resetKey, setResetKey] = useState(0);

  const [bodyAnim, setBodyAnim] = useState('');
  const [faceAnim, setFaceAnim] = useState('');
  const [overlayAnim, setOverlayAnim] = useState('');
  const [overlayAnims, setOverlayAnims] = useState<Set<string>>(() => new Set());
  const {
    loop, playing, speed, showBg, mode, sceneVariant, followGameFlow, sceneLoop,
    showBoxes, voiceOn, bgmOn, showLayers, dragJiggle, canvasAspect, theater,
    set: setViewer,
  } = useViewerStore();
  const setLoop = (value: boolean) => setViewer({ loop: value });
  const setPlaying = (value: boolean) => setViewer({ playing: value });
  const setSpeed = (value: number) => setViewer({ speed: value });
  const setShowBg = (value: boolean) => setViewer({ showBg: value });
  const setMode = (value: PlayMode) => setViewer({ mode: value });
  const autoMode = mode !== 'manual';
  const setSceneVariant = (value: 'view' | 'story') => setViewer({ sceneVariant: value });
  const setFollowGameFlow = (value: boolean) => setViewer({ followGameFlow: value });
  const setSceneLoop = (value: boolean) => setViewer({ sceneLoop: value });
  const [timelineRig, setTimelineRig] = useState<SceneTimelineRig | null>(null);
  const [sceneBeatIdx, setSceneBeatIdx] = useState(0);
  const [sceneRunKey, setSceneRunKey] = useState(0);
  // The scene fade cover is drawn in Pixi, not in the DOM, so its alpha runs on
  // the scene clock: it stops while paused and follows the speed control while
  // it is in flight. This ref is the state behind it — `bg_off` clears the
  // cover only when the colour that is up is the one it owns.
  const fadeRef = useRef<SceneFadeState>({ color: 'black', opacity: 0, duration: 0 });
  const applyFadeRef = useRef<(next: SceneFadeState) => void>(() => {});
  const setFade = (
    next: SceneFadeState | ((current: SceneFadeState) => SceneFadeState),
  ) => {
    const value = typeof next === 'function' ? next(fadeRef.current) : next;
    fadeRef.current = value;
    applyFadeRef.current(value);
  };
  const [phaseIdx, setPhaseIdx] = useState(0);
  const setShowBoxes = (value: boolean) => setViewer({ showBoxes: value });
  const [reaction, setReaction] = useState<string | null>(null);
  const [touchInfo, setTouchInfo] = useState<
    { box: string; effect: string; detail: string } | null>(null);

  // Voice is enabled by default. Lobby touches and scene advancement are user
  // gestures, so they also satisfy browser audio-playback policy.
  const [voiceIndex, setVoiceIndex] = useState<VoiceIndex | null>(null);
  const setVoiceOn = (value: boolean) => setViewer({ voiceOn: value });
  const setBgmOn = (value: boolean) => setViewer({ bgmOn: value });
  const [sceneAudioIndex, setSceneAudioIndex] = useState<SceneAudioIndex | null>(null);
  const [subtitle, setSubtitle] = useState<{ text: string; author?: string } | null>(null);
  // Lobby lines are a rotating set per (character, family), as in game.
  const lobbyLineRef = useRef(0);
  // The published emote glyphs. A lobby line's `[@emo]` shows one over the
  // figure; the manifest keeps an unpublished name from rendering a broken URL.
  const [emoticons, setEmoticons] = useState<EmoticonManifest | null>(null);
  const emoticonsRef = useRef(emoticons); emoticonsRef.current = emoticons;
  const showEmoteRef = useRef<(placement: EmotePlacement, seconds: number) => void>(() => {});
  const hideEmoteRef = useRef<() => void>(() => {});

  const setShowLayers = (value: boolean) => setViewer({ showLayers: value });
  const [layerItems, setLayerItems] = useState<LayerItem[]>([]);
  const [hiddenSlots, setHiddenSlots] = useState<Set<string>>(() => new Set());
  const hiddenSlotsRef = useRef(hiddenSlots); hiddenSlotsRef.current = hiddenSlots;

  const boxOverlayRef = useRef<any>(null);
  const boundsRef = useRef<any>(null);   // Spine SkeletonBounds for hit-testing
  // Everything the rig's own playback times runs on the scene clock installed
  // by the Pixi build: authored seconds that stop while paused and are scaled
  // by the speed control every frame, so a speed change rescales what is
  // already pending. `set` takes authored seconds and returns a handle for
  // `clear`; both are inert until a rig is built.
  const sceneTimerRef = useRef<{
    set: (run: () => void, seconds: number) => number;
    clear: (handle: number | null) => void;
    now: () => number;
  }>({ set: () => 0, clear: () => {}, now: () => 0 });
  const boringTimerRef = useRef<number | null>(null);
  const lobbyFaceTimerRef = useRef<number | null>(null);
  const autoDriveRef = useRef<
    ((trigger: 'idle' | 'boring' | string, holdAfter?: boolean,
      extras?: string[]) => void) | null>(null);
  // Section index a transition clip is on its way to. The scene must not switch
  // phases until that clip has finished playing, or the transition (ds_ch0068's
  // `open_H1`, ds_ch0035's `10_H1`) is cut off the frame it starts.
  const pendingSectionRef = useRef<number | null>(null);
  const pendingTrackRef = useRef(0);
  // Scene-clock reading the pending presentation runs until, not a wall time.
  const pendingPresentationUntilRef = useRef(0);
  const pendingPresentationTimerRef = useRef<number | null>(null);
  // The section's authored `DesireResetCommand`, pending until the section's own
  // presentation finishes. Held outside the scene timer list, which a touch
  // clears.
  const sectionResetTimerRef = useRef<number | null>(null);

  const phases = useMemo<ActorPhase[]>(
    () => actorPhases(layout?.actor, layout?.animations ?? []), [layout]);
  const phase = phases[Math.min(phaseIdx, Math.max(phases.length - 1, 0))]
    ?? { idle: null, boring: null, active: null };
  // NPC and scene-prop standings are not lobby actors: they ship an idle and
  // nothing to react with. Offering Lobby for them exposes a mode where every
  // touch is inert. A rig qualifies when some variation has a touch clip, or
  // when it has jigglers — those are a reaction of their own.
  const hasLobby = phases.some((p) => p.active)
    || (layout?.touch?.jigglers?.length ?? 0) > 0;

  // The desire rig's decoded scenario table. Drives `scene` mode only.
  const [rigScript, setRigScript] = useState<RigScript | null>(null);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [vars, setVars] = useState<Vars>({});
  const interactiveScene = mode === 'scene' && sceneVariant === 'view' ? rigScript : null;
  const section = interactiveScene?.sections[sectionIdx] ?? null;
  const selectedScriptScene = sceneVariant === 'story' ? timelineRig?.story : timelineRig?.view;
  const linearScene = mode === 'scene' && isLinearScene(selectedScriptScene)
    ? selectedScriptScene : null;
  const desirePresentation = mode === 'scene' && sceneVariant === 'view'
    && selectedScriptScene && !isLinearScene(selectedScriptScene)
    ? selectedScriptScene as DesirePresentation : null;

  // Affection/pleasure scenes are sequential: one clip per "next" tap. No
  // script table exists for them — the order is the numbered clip list itself.
  const storySeqs = useMemo(
    () => (layout ? storySequences(layout, isFaceAnim) : []), [layout]);
  const [storySeqIdx, setStorySeqIdx] = useState(0);
  const [storyIdx, setStoryIdx] = useState(0);
  const storySeq = mode === 'scene' && !interactiveScene && !linearScene
    ? storySeqs[Math.min(storySeqIdx, Math.max(storySeqs.length - 1, 0))] ?? null
    : null;
  const storyStep = storySeq ? storyIdx % storySeq.clips.length : 0;

  const playSceneActionsRef = useRef<(
    actions: SceneAction[], actionVars?: Vars, onReset?: () => void,
  ) => number>(() => 0);
  const cancelSceneActionsRef = useRef<() => void>(() => {});
  const resetSceneVisualsRef = useRef<() => void>(() => {});
  const clipDurationRef = useRef<(clip: string | null) => number>(() => 0);
  // Bumped when the scene is entered again without the rig or context changing
  // (the restart control). Nothing else re-runs the script's entry.
  const [sceneEnterKey, setSceneEnterKey] = useState(0);

  // Home-view pointer mode: pan the canvas (default) or drag the jigglers,
  // which is the in-game input the pan gesture otherwise swallows.
  const setDragJiggle = (value: boolean) => setViewer({ dragJiggle: value });

  // Mirrors so the async build effect can apply current UI state to a freshly
  // built skeleton (a reload while paused must stay paused).
  const playingRef = useRef(playing); playingRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const loopRef = useRef(loop); loopRef.current = loop;
  const bodyAnimRef = useRef(bodyAnim); bodyAnimRef.current = bodyAnim;
  const faceAnimRef = useRef(faceAnim); faceAnimRef.current = faceAnim;
  const overlayAnimRef = useRef(overlayAnim); overlayAnimRef.current = overlayAnim;
  const showBgRef = useRef(showBg); showBgRef.current = showBg;
  const modeRef = useRef(mode); modeRef.current = mode;
  const autoModeRef = useRef(autoMode); autoModeRef.current = autoMode;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const showBoxesRef = useRef(showBoxes); showBoxesRef.current = showBoxes;
  const sectionRef = useRef(section); sectionRef.current = section;
  const sectionIdxRef = useRef(sectionIdx); sectionIdxRef.current = sectionIdx;
  const varsRef = useRef(vars); varsRef.current = vars;
  const rigScriptRef = useRef(rigScript); rigScriptRef.current = rigScript;
  const storySeqRef = useRef(storySeq); storySeqRef.current = storySeq;
  const linearSceneRef = useRef(linearScene); linearSceneRef.current = linearScene;
  const followGameFlowRef = useRef(followGameFlow);
  followGameFlowRef.current = followGameFlow;
  const desirePresentationRef = useRef(desirePresentation);
  desirePresentationRef.current = desirePresentation;
  const dragJiggleRef = useRef(dragJiggle); dragJiggleRef.current = dragJiggle;
  const voiceIndexRef = useRef(voiceIndex); voiceIndexRef.current = voiceIndex;
  const voiceOnRef = useRef(voiceOn); voiceOnRef.current = voiceOn;
  const bgmOnRef = useRef(bgmOn); bgmOnRef.current = bgmOn;
  const sceneAudioIndexRef = useRef(sceneAudioIndex); sceneAudioIndexRef.current = sceneAudioIndex;
  const pendingSceneSoundRef = useRef<{ rig: string; animation: string } | null>(null);
  const pendingBgmRef = useRef<{
    clip: string; intro?: string; fade: number;
  } | null>(null);
  const desiredBgmRef = useRef<{
    clip: string; intro?: string; fade: number;
  } | null>(null);
  const requestSceneSoundRef = useRef<(rig: string, animation: string) => void>(() => {});
  requestSceneSoundRef.current = (rig, animation) => {
    if (!bgmOnRef.current) return;
    if (!sceneAudioIndexRef.current) {
      pendingSceneSoundRef.current ??= { rig, animation };
      return;
    }
    pendingSceneSoundRef.current = null;
    void playSceneSound(sceneAudioIndexRef.current, rig, animation);
  };
  const requestBgmRef = useRef<(clip: string, intro: string | undefined, fade: number) => void>(
    () => {});
  requestBgmRef.current = (clip, intro, fade) => {
    desiredBgmRef.current = { clip, intro, fade };
    if (!bgmOnRef.current) return;
    if (!sceneAudioIndexRef.current) {
      pendingBgmRef.current = { clip, intro, fade };
      return;
    }
    pendingBgmRef.current = null;
    void playBgm(sceneAudioIndexRef.current, clip, intro, fade);
  };

  // Show a line and, when voice is on, speak it. A line with no clip still
  // shows: the game does not voice every line, and the subtitle is the content.
  const sayRef = useRef<(line: { text: string; author?: string; voice?: string }) => void>(
    () => {});
  sayRef.current = (line) => {
    if (line.text) setSubtitle({ text: line.text, author: line.author });
    if (line.voice && voiceOnRef.current) {
      void playVoice(voiceIndexRef.current, line.voice);
    }
  };

  // Lobby lines come from the master-data interaction table, not the scenario
  // scripts: a filter of character, rig family and action selects a small set
  // and the game cycles it. `Situation<N>` rows repeat the same four lines per
  // phase, so the phase is part of the selector when the rig declares one.
  const lobbyFamily = layout?.kind === 'affection' ? 'Affection'
    : layout?.kind === 'desire' ? 'Desire' : 'Standing';
  const lobbyCode = layout?.character ?? '';
  const speakLobbyRef = useRef<(
    action: 'Touch' | 'Enter' | 'Onlook', box?: string | null,
  ) => VoiceInteraction | null>(() => null);
  speakLobbyRef.current = (action, box) => {
    const wanted = ['Lobby', action, lobbyFamily];
    if (lobbyFamily !== 'Standing') wanted.push(`Situation${phaseIdx + 1}`);
    let rows = interactionsFor(voiceIndexRef.current, lobbyCode, wanted);
    if (!rows.length && lobbyFamily !== 'Standing') {
      rows = interactionsFor(voiceIndexRef.current, lobbyCode, ['Lobby', action, lobbyFamily]);
    }
    if (action === 'Touch') {
      const breast = !!box && /breast/i.test(box);
      const targeted = rows.filter((row) => row.filter.includes('Breast') === breast);
      if (targeted.length) rows = targeted;
    }
    if (!rows.length) return null;
    const row = rows[lobbyLineRef.current % rows.length];
    lobbyLineRef.current += 1;
    sayRef.current({ text: row.text ?? '', voice: row.voice });
    return row;
  };

  // The lobby interaction row owns its animation staging. In particular,
  // rows without `ani` are intentionally non-moving standing variations and
  // must not fall through to the prefab's generic active clip.
  const stageLobbyRef = useRef<(row: VoiceInteraction | null) => string | null>(() => null);
  stageLobbyRef.current = (row) => {
    if (!row) return null;
    const anims = layout?.animations ?? [];
    const spine = spineRef.current;
    sceneTimerRef.current.clear(lobbyFaceTimerRef.current);
    lobbyFaceTimerRef.current = null;
    if (spine) spine.state.setEmptyAnimation(TRACK_FACE, 0.15);
    // `@wait` is an authored duration, so it is held on the scene clock and
    // follows the speed control the way the animation it accompanies does.
    if (spine && row.face) {
      const face = lobbyFaceAnimation(row, anims);
      if (face) {
        spine.state.setAnimation(TRACK_FACE, face, true).mixDuration = 0.15;
        if (row.wait && row.wait > 0) {
          lobbyFaceTimerRef.current = sceneTimerRef.current.set(() => {
            spineRef.current?.state.setEmptyAnimation(TRACK_FACE, 0.15);
          }, row.wait);
        }
      }
    }
    // The emote is independent of the clip: a line with no `ani` still pops
    // one, which is most of what makes those lines read as a reaction.
    const emote = emotePlacement(emoticonsRef.current, row.emo, layout?.character);
    if (emote) {
      showEmoteRef.current(
        emote, row.wait && row.wait > 0 ? row.wait : EMOTE_SECONDS);
    }
    return lobbyBodyAnimation(row, phase, anims);
  };

  // Whether this character has any extracted clip at all. Voice is jp-only and
  // not every character is recorded, so the control is hidden rather than
  // offering silence.
  const hasVoice = useMemo(() => {
    if (!voiceIndex || !lobbyCode) return false;
    const owner = lobbyCode.toLowerCase();
    return Object.values(voiceIndex.clips).some((f) => f.split('/')[1] === owner);
  }, [voiceIndex, lobbyCode]);

  // The idle clip the state machine returns to: the script section's when a
  // scenario table is driving, otherwise the actor phase's.
  const idleClipRef = useRef<() => string | null>(() => null);
  idleClipRef.current = () => sectionRef.current?.idle ?? phaseRef.current.idle;
  // The track this rig's body clips occupy, read off the current idle clip's
  // own name: `10_idle` is track 10, `lobby/idle` and `00_idle_normal` track 0.
  const bodyTrackRef = useRef<() => number>(() => 0);
  bodyTrackRef.current = () => spineTrack(idleClipRef.current() ?? '');

  // --- archive fetch -------------------------------------------------------
  useEffect(() => {
    if (unavailable) return;
    let cancelled = false;
    setError(null);
    setLayout(null);
    filesRef.current = null;
    setLoadState('fetching');
    (async () => {
      const files = await loadSkinArchive(archive);
      if (cancelled) throw new Error('cancelled');
      setLoadState('unpacking');
      filesRef.current = files;
      if (!files.has('spine.json')) throw new Error('no spine.json in archive');
      return JSON.parse(await readText(files, 'spine.json')) as Layout;
    })()
      .then((l) => {
        if (cancelled) return;
        const anims = l.animations ?? [];
        const bodies = anims.filter((a) => !isFaceAnim(a));
        const faces = anims.filter(isFaceAnim);
        setLayout(l);
        setLoadState('ready');
        setBodyAnim(pickDefault(bodies, l.actor?.idle ?? undefined));
        setFaceAnim('');
        setOverlayAnim('');
        setOverlayAnims(new Set());
        setPhaseIdx(0);
        setReaction(null);
        setTouchInfo(null);
        setSubtitle(null);
        stopVoice();
        lobbyLineRef.current = 0;
        setRigScript(null);
        setTimelineRig(null);
        setSectionIdx(0);
        setVars({});
        setSceneBeatIdx(0);
        setFade({ color: 'black', opacity: 0, duration: 0 });
        setStorySeqIdx(0);
        setStoryIdx(0);
        setLayerItems([]);
        setHiddenSlots(new Set());
        const currentMode = useViewerStore.getState().mode;
        if (currentMode === 'scene' && l.kind === 'standing') {
          useViewerStore.getState().set({ mode: 'manual' });
        }
        pendingSectionRef.current = null;
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoadState('error');
      });
    return () => { cancelled = true; revokeSkinUrls(archive); };
  }, [archive, resetKey, unavailable]);

  // --- scenario interaction table ------------------------------------------
  // Only desire rigs have one. A missing or unreadable file is not an error:
  // the viewer falls back to phase/region playback.
  useEffect(() => {
    if (!layout || layout.kind !== 'desire') return;
    let cancelled = false;
    loadDesireInteractions()
      .then((data) => {
        if (cancelled) return;
        const rig = data.rigs?.[baseSkinKey(layout.skin)];
        if (!rig?.sections?.length) return;
        setRigScript(rig);
        setSectionIdx(0);
        setVars(applyAssignments(rig.sections[0].set, {}));
      })
      .catch(() => { /* fall back to phase playback */ });
    return () => { cancelled = true; };
  }, [layout]);

  // Voice clips and the lobby interaction table. Every family has lobby lines,
  // so this is not restricted by rig kind. A missing file leaves the viewer
  // silent and subtitle-less rather than broken.
  useEffect(() => {
    let cancelled = false;
    loadVoice().then((data) => { if (!cancelled) setVoiceIndex(data); })
      .catch(() => { /* no voice published */ });
    loadSceneAudio().then((data) => { if (!cancelled) setSceneAudioIndex(data); })
      .catch(() => { /* no scene audio published */ });
    loadEmoticons().then((data) => { if (!cancelled) setEmoticons(data); })
      .catch(() => { /* no emote art published */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sceneAudioIndex || !bgmOn) return;
    const sound = pendingSceneSoundRef.current;
    if (sound) requestSceneSoundRef.current(sound.rig, sound.animation);
    const music = pendingBgmRef.current;
    const wanted = music ?? desiredBgmRef.current;
    if (wanted) requestBgmRef.current(wanted.clip, wanted.intro, wanted.fade);
  }, [sceneAudioIndex, bgmOn]);

  useEffect(() => {
    if (!layout || (layout.kind !== 'desire' && layout.kind !== 'affection')) return;
    let cancelled = false;
    loadSceneTimelines()
      .then((data) => {
        if (cancelled) return;
        setTimelineRig(data.rigs?.[baseSkinKey(layout.skin)] ?? null);
      })
      .catch(() => { /* keep the static animation-list fallback */ });
    return () => { cancelled = true; };
  }, [layout]);

  // Download the lines this rig can speak before anything triggers them. A line
  // fires together with its animation, so a clip that only starts downloading at
  // that moment lands well after the reaction it belongs to has finished.
  useEffect(() => {
    if (!voiceOn || !voiceIndex || !layout?.character) return;
    const ids = interactionsFor(voiceIndex, layout.character, ['Lobby', lobbyFamily])
      .map((row) => row.voice)
      .filter((id): id is string => !!id);
    prefetchVoice(voiceIndex, ids);
  }, [voiceOn, voiceIndex, layout, lobbyFamily]);

  useEffect(() => {
    if (!voiceOn || !voiceIndex || !timelineRig) return;
    prefetchVoice(voiceIndex, sceneVoiceIds(timelineRig));
  }, [voiceOn, voiceIndex, timelineRig]);

  // Entering a section applies its variable initialisation and restarts the
  // idle loop, mirroring what the script does when it jumps to a label.
  useEffect(() => {
    const spine = spineRef.current;
    const target = interactiveScene?.sections[sectionIdx];
    sceneTimerRef.current.clear(sectionResetTimerRef.current);
    sectionResetTimerRef.current = null;
    if (!spine || !target) return;
    const next = applyAssignments(target.set, varsRef.current);
    setVars(next);
    varsRef.current = next;
    // Ambience the section shows on entry, gated on the carried-over state
    // (ds_ch0057's toy overlays persist into phase 2 only when h2/h3 are set).
    const extras = entryExtras(target, next);
    const presentation = desirePresentation?.sections[sectionIdx];
    const entryTime = presentation?.entry.length
      ? playSceneActionsRef.current(presentation.entry) : 0;
    // A phase that opens on a one-shot plays it first; `autoDrive` queues the
    // section's idle loop behind it, so the transition is never clipped.
    if (target.enter && target.enter !== target.idle) {
      autoDriveRef.current?.(target.enter, false, extras);
    } else {
      if (target.idle) autoDriveRef.current?.('idle');
      if (extras.length) {
        autoDriveRef.current?.(extras[0], false, extras.slice(1));
      }
    }
    // `DesireResetCommand` sits in the section after its triggers: the section
    // plays its own animation and transition, then the reset body runs and the
    // script goes to the command's destination label. The section's clip is the
    // window the phase is on screen for, so the reset's transition starts after
    // it rather than on the heels of the entry transition.
    const resetActions = presentation?.resetActions ?? [];
    const destination = interactiveScene && target.reset
      ? sectionIndexByLabel(interactiveScene, target.reset) : -1;
    if (!resetActions.length || destination < 0) return;
    const shownFor = Math.max(
      entryTime, clipDurationRef.current(target.enter ?? target.idle));
    sectionResetTimerRef.current = sceneTimerRef.current.set(() => {
      sectionResetTimerRef.current = null;
      const enterDestination = () => {
        pendingSectionRef.current = null;
        pendingPresentationUntilRef.current = 0;
        setSectionIdx(destination);
        setSceneRunKey((key) => key + 1);
      };
      // The authored `Reset:true` is the destination's entry point, so it opens
      // under the transition cover rather than after the fade-out tail.
      const entersOnReset = resetActions.some((a) => a.type === 'reset-animation');
      const duration = playSceneActionsRef.current(
        resetActions, varsRef.current, entersOnReset ? enterDestination : undefined);
      if (!entersOnReset) {
        sectionResetTimerRef.current = sceneTimerRef.current.set(
          enterDestination, Math.max(0, duration));
      }
    }, Math.max(0, entryTime));
  }, [interactiveScene, desirePresentation, sectionIdx, sceneRunKey]);

  // The script's entry: the commands it authors before its first label. It
  // belongs to entering the scene, not to a phase — the rig changing, a reload,
  // choosing this playback context or the restart control run it, and a section
  // change never does. A script with no entry runs nothing.
  //
  // Declared after the section effect so its sequence owns track playback: the
  // section starts its idle, the entry then plays over it and queues the idle
  // back behind the opening clip.
  useEffect(() => {
    const entry = desirePresentation?.entry ?? [];
    const entryClip = interactiveScene?.entry;
    if (!rigBuilt || !followGameFlow) return;
    if (!entry.length) {
      if (entryClip) autoDriveRef.current?.(entryClip);
      return;
    }
    const target = interactiveScene?.sections[sectionIdxRef.current];
    const actions: SceneAction[] = [...entry, { type: 'wait-animation' }];
    if (target?.enter && target.enter !== target.idle) {
      actions.push({
        type: 'animation', clip: target.enter, loop: false, track: null, wait: true,
      });
    }
    if (target?.idle) {
      actions.push({
        type: 'animation', clip: target.idle, loop: true, track: null, wait: false,
      });
    }
    playSceneActionsRef.current(actions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desirePresentation, interactiveScene, rigBuilt, followGameFlow, sceneEnterKey]);

  useEffect(() => {
    if (!linearScene || mode !== 'scene' || !playing) return;
    const beat = linearScene.beats[sceneBeatIdx];
    if (!beat) return;
    const actions = sceneBeatIdx === 0 && followGameFlow
      ? [...linearScene.entry, { type: 'wait-animation' } as SceneAction, ...beat.actions]
      : beat.actions;
    const duration = playSceneActionsRef.current(actions);
    setReaction(beat.label);
    if (!sceneLoop) return () => cancelSceneActionsRef.current();
    const timer = sceneTimerRef.current.set(() => {
      setSceneBeatIdx((i) => (i + 1) % linearScene.beats.length);
    }, Math.max(duration, 0.25));
    return () => {
      sceneTimerRef.current.clear(timer);
      cancelSceneActionsRef.current();
    };
  }, [linearScene, sceneBeatIdx, mode, playing, sceneLoop, followGameFlow, sceneRunKey]);

  // Fallback for rigs without extracted script timelines.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine || !storySeq) return;
    const clip = storySeq.clips[storyStep];
    spine.state.setAnimation(spineTrack(clip), clip, true);
    setReaction(null);
  }, [storySeq, storyStep]);

  // --- build the Pixi app + Spine skeleton ---------------------------------
  useEffect(() => {
    if (!layout || baseSkinKey(layout.skin) !== baseSkinKey(skin)) return;
    let destroyed = false;
    let app: any = null;
    let appReady = false;
    let sceneTimers: number[] = [];
    spineRef.current = null;
    bgSpritesRef.current = [];
    syncBackgroundVisibilityRef.current = () => {};
    jiggleRef.current = null;
    spinePixelScaleRef.current = () => 1;

    (async () => {
      const PIXI = await import('pixi.js');
      pixiRef.current = PIXI;
      const {
        Spine, SkeletonBinary, AtlasAttachmentLoader, TextureAtlas, SpineTexture,
        RegionAttachment, MeshAttachment, SkeletonBounds, AttachmentTimeline,
      } = await import('@esotericsoftware/spine-pixi-v8') as any;

      const files = filesRef.current;
      if (!files || !layout.atlas || !layout.skel) return;

      // Atlas pages carry their PNG filename; load each as a Pixi texture and
      // hand it to the Spine page. `pma` decides whether the source bytes are
      // already premultiplied or must be premultiplied on upload.
      const atlasText = await readText(files, layout.atlas);
      const atlas = new TextureAtlas(atlasText);
      await Promise.all(atlas.pages.map(async (page: any) => {
        const texture = await PIXI.Assets.load({
          src: urlFor(archive, files, page.name),
          loadParser: 'loadTextures',
          data: { alphaMode: page.pma ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload' },
        });
        page.setTexture(SpineTexture.from(texture.source));
      }));
      if (destroyed) return;

      // MAD ships binary skeletons. `scale` is the Unity SkeletonDataAsset
      // scale (0.01) applied at parse time, exactly as the game does.
      const binary = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
      binary.scale = layout.world?.skeleton?.dataScale ?? 1;
      const skeletonData = binary.readSkeletonData(await readBytes(files, layout.skel));
      if (destroyed) return;

      app = new PIXI.Application();
      await app.init({ backgroundAlpha: 0, antialias: true, resizeTo: hostRef.current! });
      appReady = true;
      if (destroyed) { app.destroy(true); return; }
      appRef.current = app;
      hostRef.current!.replaceChildren(app.canvas);

      const W = layout.world ?? {};
      const sk = W.skeleton ?? { x: 0, y: 0, scale: 1, dataScale: 1 };
      // Everything in `root` shares one space: Unity world units. `dataScale`
      // is already baked into the parsed skeleton, and the exporter reports the
      // background in the same units (sprite rect / pixelsToUnits), so no
      // conversion factor is applied here — only the prefab transform scale,
      // and only if it is not identity. `fit()` handles the screen mapping.
      const prefabScale = sk.scale || 1;

      const root = new PIXI.Container();
      root.sortableChildren = true;
      // `view` carries only the rig's own `cam` bone. Keeping it between `root`
      // and `scene` leaves the fit, the manual pan/zoom and the script camera
      // writing `root` as before, and leaves device staging on `scene`.
      const view = new PIXI.Container();
      view.sortableChildren = true;
      const scene = new PIXI.Container();
      scene.sortableChildren = true;
      view.addChild(scene);
      root.addChild(view);
      let cameraBase: CameraBase = { x: 0, y: 0, scale: 1, width: 1, height: 1 };
      const cameraState: CameraState = { offsetX: 0, offsetY: 0, zoom: 0 };
      let cameraTween: {
        from: { x: number; y: number; scale: number };
        to: { x: number; y: number; scale: number };
        started: number;
        duration: number;
      } | null = null;

      const backgroundDefs = W.backgrounds?.length
        ? W.backgrounds
        : W.bg ? [{ ...W.bg, name: W.bg.name ?? W.bg.tex.replace(/\.png$/i, '') }] : [];
      const normalizeBackgroundName = (name: string) => name
        .toLowerCase().replace(/\.png$/i, '').replace(/_(\d+)$/, '$1');
      const backgroundOffTargets = new Set<string>();
      for (const animation of skeletonData.animations ?? []) {
        for (const timeline of animation.timelines ?? []) {
          for (const event of timeline.events ?? []) {
            if (event?.data?.name !== 'bg_off' || !event.stringValue) continue;
            backgroundOffTargets.add(normalizeBackgroundName(event.stringValue));
          }
        }
      }
      const targetedBackgrounds = backgroundOffTargets.size > 0;
      const backgroundEnabled = backgroundDefs.map((def: any, index: number) =>
        targetedBackgrounds
          ? backgroundOffTargets.has(normalizeBackgroundName(def.name))
          : index === 0);
      const backgroundSprites: any[] = [];
      const applyBackgroundVisibility = () => {
        backgroundSprites.forEach((sprite, index) => {
          sprite.visible = showBgRef.current && backgroundEnabled[index];
        });
      };
      for (let index = 0; index < backgroundDefs.length; index++) {
        const def = backgroundDefs[index];
        const bgTex = await loadTexture(PIXI, archive, files, def.tex);
        if (destroyed) { if (appReady) app?.destroy(true); return; }
        const bg = new PIXI.Sprite(bgTex);
        bg.anchor.set(0.5);
        // Pixi's y axis points down; Unity's points up.
        bg.position.set(def.x, -def.y);
        bg.width = def.w;
        bg.height = def.h;
        bg.zIndex = -20 + index;
        scene.addChild(bg);
        backgroundSprites.push(bg);
      }
      bgSpritesRef.current = backgroundSprites;
      syncBackgroundVisibilityRef.current = applyBackgroundVisibility;
      applyBackgroundVisibility();

      const switchBackground = (eventName: string, targetName: string, targetIndex: number) => {
        let index = backgroundDefs.findIndex((def: any) =>
          normalizeBackgroundName(def.name) === normalizeBackgroundName(targetName));
        if (index < 0 && targetIndex > 0) index = targetIndex - 1;
        if (index < 0) return false;
        if (eventName === 'bg_off') {
          backgroundEnabled[index] = false;
          if (index + 1 < backgroundEnabled.length) backgroundEnabled[index + 1] = true;
        } else {
          backgroundEnabled[index] = true;
          if (index + 1 < backgroundEnabled.length) backgroundEnabled[index + 1] = false;
        }
        applyBackgroundVisibility();
        return true;
      };

      const spine = new Spine({ skeletonData });
      spineRef.current = spine;
      spine.position.set(sk.x, -sk.y);
      spine.scale.set(prefabScale);
      spine.zIndex = 0;
      scene.addChild(spine);
      app.stage.addChild(root);
      rootRef.current = root;

      // A drawer background is not drawn at its sprite size on the rig origin:
      // it hangs on a `bg*` skeleton bone and is drawn at that bone's world
      // position and rotation, sized `sprite size * bone scale`. The bone is
      // the only place the room's real size lives, so a rig whose bone is not
      // identity is framed wrongly without it.
      //
      // The pairing is by name, ignoring case: the sprite name ends with the
      // bone name. The longest match wins, so `bg_2` is not claimed by `bg`.
      //
      // A background the rig only swaps in — `*_bg_off` against `*_bg` — names
      // no bone of its own, because the client does not build it a renderer:
      // it cross-fades it onto the renderer already standing on that bone. So
      // an unmatched entry inherits the last matched one. One that follows no
      // match at all keeps its authored size and origin.
      const backgroundBoneName = (def: any): string =>
        String(def.name ?? def.tex ?? '').replace(/\.png$/i, '').toLowerCase();
      let inheritedAnchor: any = null;
      const backgroundAnchors = backgroundDefs.map((def: any) => {
        const wanted = backgroundBoneName(def);
        let best: any = null;
        for (const bone of spine.skeleton.bones) {
          const name = bone.data.name.toLowerCase();
          if (!name.startsWith('bg') || !wanted.endsWith(name)) continue;
          if (!best || name.length > best.data.name.length) best = bone;
        }
        if (best) inheritedAnchor = best;
        return best ?? inheritedAnchor;
      });
      // Read every frame: several rigs key their background bones.
      const applyBackgroundTransforms = () => {
        for (let index = 0; index < backgroundSprites.length; index++) {
          const bone = backgroundAnchors[index];
          const sprite = backgroundSprites[index];
          if (!bone || !sprite) continue;
          const def = backgroundDefs[index];
          // Bone coordinates are skeleton units and `bone.worldY` is already
          // y-down (spine-pixi sets `Skeleton.yDown`), as the emote anchor and
          // the rig camera also rely on.
          const anchor = scene.toLocal(spine.toGlobal({ x: bone.worldX, y: bone.worldY }));
          sprite.position.set(anchor.x, anchor.y);
          // The bone's own scale, not its world scale: the game reads the local
          // pair, the same field the `cam` bone supplies the framing width from.
          sprite.width = def.w * Math.abs(bone.scaleX) * Math.abs(spine.scale.x);
          sprite.height = def.h * Math.abs(bone.scaleY) * Math.abs(spine.scale.y);
          sprite.rotation = bone.getWorldRotationX() * Math.PI / 180;
        }
      };

      // --- the scene clock ----------------------------------------------------
      // Authored seconds. It advances with the rig's own animation clock — zero
      // while paused, scaled by the speed control every frame — so a wait, a
      // fade, a camera move and the idle timeout all keep their authored
      // relationship to the clip they accompany, and changing speed while any
      // of them is in flight rescales what is left of it.
      let sceneNow = 0;
      let sceneTaskSeq = 0;
      let sceneTasks: { id: number; at: number; run: () => void }[] = [];
      const scheduleScene = (run: () => void, seconds: number) => {
        const id = ++sceneTaskSeq;
        sceneTasks.push({ id, at: sceneNow + Math.max(0, seconds), run });
        return id;
      };
      // Cancelling holds for the frame the task was already due on: several
      // actions can come due together, and one of them clearing the sequence
      // (a touch, an authored reset) must still stop the rest.
      const cancelledTasks = new Set<number>();
      const cancelScene = (handle: number | null) => {
        if (handle === null) return;
        cancelledTasks.add(handle);
        const at = sceneTasks.findIndex((task) => task.id === handle);
        if (at >= 0) sceneTasks.splice(at, 1);
      };
      sceneTimerRef.current = {
        set: scheduleScene,
        clear: cancelScene,
        now: () => sceneNow,
      };
      // The cover the script fades in and out. It sits on the stage above the
      // whole scene, so pan, zoom and device staging never move it.
      const fadeCover = new PIXI.Graphics();
      fadeCover.rect(0, 0, 1, 1).fill(0xffffff);
      fadeCover.eventMode = 'none';
      fadeCover.alpha = 0;
      fadeCover.visible = false;
      app.stage.addChild(fadeCover);
      let fadeTween: { from: number; to: number; at: number; duration: number } | null = null;
      let coverW = 0;
      let coverH = 0;
      const sizeFadeCover = () => {
        if (coverW === app.screen.width && coverH === app.screen.height) return;
        coverW = app.screen.width;
        coverH = app.screen.height;
        fadeCover.width = coverW;
        fadeCover.height = coverH;
      };
      applyFadeRef.current = (next) => {
        fadeCover.tint = next.color;
        sizeFadeCover();
        if (next.duration > 0) {
          fadeTween = {
            from: fadeCover.alpha, to: next.opacity, at: sceneNow, duration: next.duration,
          };
        } else {
          fadeTween = null;
          fadeCover.alpha = next.opacity;
        }
        fadeCover.visible = fadeCover.alpha > 0 || next.opacity > 0;
      };
      // A rebuild inherits whatever cover is up, but never re-runs its fade.
      applyFadeRef.current({ ...fadeRef.current, duration: 0 });
      app.ticker.add(() => {
        sceneNow += (app.ticker.deltaMS / 1000)
          * (playingRef.current ? Math.max(speedRef.current, 0.01) : 0);
        if (sceneTasks.length) {
          const due = sceneTasks.filter((task) => task.at <= sceneNow)
            .sort((a, b) => a.at - b.at || a.id - b.id);
          if (due.length) {
            const taken = new Set(due.map((task) => task.id));
            sceneTasks = sceneTasks.filter((task) => !taken.has(task.id));
            for (const task of due) {
              if (!cancelledTasks.has(task.id)) task.run();
            }
          }
        }
        cancelledTasks.clear();
        if (fadeTween) {
          const t = Math.min(1, (sceneNow - fadeTween.at) / fadeTween.duration);
          fadeCover.alpha = fadeTween.from + (fadeTween.to - fadeTween.from) * t;
          if (t >= 1) fadeTween = null;
        }
        fadeCover.visible = fadeCover.alpha > 0;
        if (fadeCover.visible) sizeFadeCover();
      });

      // The scene camera is a bone named `cam`, which the client builds its view
      // matrix from. Every desire and affection rig has one; no standing rig
      // does. The bone is the camera, so the view is the inverse of its pose.
      //
      // Its setup pose is the neutral framing and is not identity on every rig,
      // so the baseline is measured here, while the skeleton is still in setup
      // pose and no animation has been applied.
      const camBone = spine.skeleton.findBone('cam');
      spine.update(0);
      setHasRigCamera(!!camBone);
      const camSetup = camBone
        ? {
          x: camBone.worldX,
          y: camBone.worldY,
          scale: Math.abs(camBone.getWorldScaleX()) || 1,
          rotation: camBone.getWorldRotationX(),
        }
        : null;
      // A script camera offset is authored in the drawer's own units — 100 to a
      // world unit against its 1920-wide render target — so one unit is a
      // fiftieth of the reference view width.
      const scriptOffsetUnit = REFERENCE_VIEW_WIDTH * (sk.dataScale ?? 1)
        * prefabScale * (camSetup?.scale ?? 1) / 19.2;

      const animSet = new Set(layout.animations ?? []);
      clipDurationRef.current = (clip) => (
        clip ? skeletonData.findAnimation(clip)?.duration ?? 0 : 0);

      // Overlay clips are measured from the parsed skeleton, not named.
      const overlaySet = overlayAnimations(skeletonData.animations, isFaceAnim);
      const overlaySetRef = { current: overlaySet };
      setOverlayAnims(overlaySet);

      // Overlay clips enable art that has to stay on screen (ds_ch0042's pen
      // strokes switch on their own doodle attachment and never switch anything
      // off). Spine restores a slot keyed only by a mixing-out animation to its
      // setup attachment at the end of `AnimationState.apply`, so the finished
      // clip's own end state is pinned here and re-asserted after `apply`.
      const overlayEndState = new Map<string, [number, string | null][]>();
      const keyedSlotsByAnimation = new Map<string, Set<number>>();
      for (const anim of skeletonData.animations) {
        const keyedSlots = new Set<number>();
        for (const timeline of anim.timelines) {
          if (typeof timeline.slotIndex === 'number') keyedSlots.add(timeline.slotIndex);
        }
        keyedSlotsByAnimation.set(anim.name, keyedSlots);
        if (!overlaySet.has(anim.name)) continue;
        const end: [number, string | null][] = [];
        for (const t of anim.timelines) {
          if (!(t instanceof AttachmentTimeline)) continue;
          end.push([t.slotIndex, t.attachmentNames[t.attachmentNames.length - 1] ?? null]);
        }
        if (end.length) overlayEndState.set(anim.name, end);
      }
      const pinned = new Map<number, string | null>();
      const pinnedAlpha = new Map<number, number>();
      const completedHeldTracks = new Map<number, string>();
      clearPersistentRef.current = () => {
        pinned.clear();
        pinnedAlpha.clear();
        completedHeldTracks.clear();
      };
      // The fetch effect picks the default body clip before this is known.
      if (bodyAnimRef.current && overlaySet.has(bodyAnimRef.current)) {
        const body = (layout.animations ?? [])
          .find((a) => !isFaceAnim(a) && !overlaySet.has(a));
        if (body) { bodyAnimRef.current = body; setBodyAnim(body); }
      }

      const jiggle = new JiggleField(
        layout.touch?.jigglers ?? [],
        (name: string) => spine.skeleton.findBone(name));
      jiggleRef.current = jiggle;
      let jiggleTapUntil = 0;

      const activeSpineSkin = spine.skeleton.skin ?? skeletonData.defaultSkin;
      const attachmentsBySlot = new Map<number, string[]>();
      for (const entry of activeSpineSkin?.getAttachments() ?? []) {
        if (!(entry.attachment instanceof RegionAttachment)
          && !(entry.attachment instanceof MeshAttachment)) continue;
        const list = attachmentsBySlot.get(entry.slotIndex);
        if (list) list.push(entry.name);
        else attachmentsBySlot.set(entry.slotIndex, [entry.name]);
      }
      const renderableSlots: LayerItem[] = [];
      for (const slot of spine.skeleton.slots) {
        const names = attachmentsBySlot.get(slot.data.index);
        if (!names?.length) continue;
        renderableSlots.push({
          slot: slot.data.name,
          attachment: names.length > 1 ? `${names.length} attachments` : names[0],
          group: layerGroup(slot.data.name),
        });
      }
      renderableSlots.sort((a, b) =>
        a.group.localeCompare(b.group) || a.slot.localeCompare(b.slot));
      setLayerItems(renderableSlots);

      const slotByName = new Map<string, any>(
        spine.skeleton.slots.map((s: any) => [s.data.name, s]));
      // Runs after AnimationState.apply, before updateWorldTransform.
      let lastStep = performance.now();
      spine.beforeUpdateWorldTransforms = () => {
        const now = performance.now();
        const dt = Math.min((now - lastStep) / 1000, 0.1);
        lastStep = now;
        // A held drag poses the bone directly, so it must survive a pause —
        // only the spring simulation is tied to playback.
        if (modeRef.current === 'home') {
          // The spring runs on the rig's own clock, so it settles at the speed
          // the figure moves at. `timeScale` is already `playing ? speed : 0`.
          if (spine.state.timeScale !== 0) jiggle.step(dt * spine.state.timeScale);
          jiggle.apply();
        }
        for (const [slotIndex, name] of pinned) {
          spine.skeleton.slots[slotIndex]?.setAttachment(name === null
            ? null : spine.skeleton.getAttachment(slotIndex, name));
        }
        for (const [slotIndex, alpha] of pinnedAlpha) {
          const slot = spine.skeleton.slots[slotIndex];
          if (slot) slot.color.a = alpha;
        }
        for (const name of hiddenSlotsRef.current) {
          const slot = slotByName.get(name);
          if (slot) slot.color.a = 0;
        }
      };
      // The rendered frame keeps the spring offset; the bone's local pose must
      // not, or the offset compounds on bones no animation keys.
      spine.afterUpdateWorldTransforms = () => jiggle.restore();

      // --- game-accurate drive ------------------------------------------------
      // All four rig families share one state machine: loop the phase's idle
      // clip; a touch or the boredom timer queues a one-shot on track 0 and then
      // returns to idle. `addAnimation` after a non-looping entry is what makes
      // the return automatic. Only standing rigs declare a `boring` clip, so the
      // boredom branch is inert for the scene families.
      const clearBoring = () => {
        cancelScene(boringTimerRef.current);
        boringTimerRef.current = null;
      };
      // An idle timeout is measured on the scene clock, so it stretches at 0.5x,
      // shortens at 4x and does not run at all while paused.
      const armBoring = () => {
        clearBoring();
        if (!autoModeRef.current) return;
        // Scene mode: the section's onlook trigger owns the idle timeout —
        // its body can carry the phase's whole escalation (ds_ch0057 sets
        // `h1=true` from it), so it must actually fire.
        const sec = sectionRef.current;
        if (sec?.onlook) {
          const delay = sec.onlook.delay ?? BORING_DELAY_MS / 1000;
          boringTimerRef.current = scheduleScene(() => runOnlook(), delay);
          return;
        }
        const p = phaseRef.current;
        if (!p.boring || !p.idle) return;
        boringTimerRef.current = scheduleScene(() => {
          // Boredom is "nothing happened for a while", not a metronome. The
          // countdown is armed when a reaction *starts*, so it can come due
          // mid-reaction; re-arm instead of firing unless the rig is idle and
          // playback is running.
          if (!playingRef.current || reacting()) { armBoring(); return; }
          const row = modeRef.current === 'home' ? speakLobbyRef.current('Onlook') : null;
          const authored = stageLobbyRef.current(row);
          if (!row || authored) autoDriveRef.current?.(authored ?? 'boring');
          else armBoring();
        }, BORING_DELAY_MS / 1000);
      };
      // True while a one-shot reaction is still playing on the body or overlay
      // track. Input and the onlook timer both wait for it, as in game.
      const reacting = () => {
        for (const cur of spine.state.tracks ?? []) {
          if (cur && !cur.loop && !cur.isComplete()) return true;
        }
        return false;
      };
      const runOnlook = () => {
        const sec = sectionRef.current;
        if (!playingRef.current || !sec?.onlook
          || pendingSectionRef.current !== null || reacting()) {
          armBoring();
          return;
        }
        const fired = fireOnlook(sec, varsRef.current);
        if (fired) {
          setVars(fired.vars);
          varsRef.current = fired.vars;
        }
        autoDriveRef.current?.(sec.onlook.clip, false, fired?.clips ?? []);
      };
      const preserveHeldEndStates = () => {
        if (!completedHeldTracks.size) return;
        for (const [track, clip] of completedHeldTracks) {
          for (const slotIndex of keyedSlotsByAnimation.get(clip) ?? []) {
            const slot = spine.skeleton.slots[slotIndex];
            if (!slot) continue;
            if (Math.abs(slot.color.a - slot.data.color.a) > 0.001) {
              pinnedAlpha.set(slotIndex, slot.color.a);
            }
            const current = slot.getAttachment()?.name ?? null;
            const setup = slot.data.attachmentName ?? null;
            if (current !== setup) pinned.set(slotIndex, current);
          }
          spine.state.clearTrack(track);
        }
        completedHeldTracks.clear();
      };

      autoDriveRef.current = (trigger, holdAfter, extras) => {
        preserveHeldEndStates();
        const idle = idleClipRef.current();
        if (!idle && !holdAfter) return;
        const bodyTrack = bodyTrackRef.current();
        clearBoring();
        if (trigger === 'idle') {
          if (idle) spine.state.setAnimation(bodyTrack, idle, true);
          setReaction(null);
          armBoring();
          return;
        }
        const clip = trigger === 'boring' ? phaseRef.current.boring : trigger;
        if (!clip || !animSet.has(clip)) { armBoring(); return; }
        const track = spineTrack(clip);
        const entry = spine.state.setAnimation(track, clip, false);
        requestSceneSoundRef.current(baseSkinKey(skin), clip);
        // Layered clips are cut in, not mixed in. A stamp clip switches its art
        // on at t=0 and hides it with an alpha-0 colour key until the reveal
        // (ds_ch0042's early strokes); during a mix the attachment applies
        // immediately but the colour only blends in from the slot's current
        // alpha 1, flashing the finished art before it is drawn.
        entry.mixDuration = track === bodyTrack ? 0.15 : 0;
        // The rest of the reaction: same-track clips queue behind the main
        // one (ds_ch0015's tail_1 after A5), a clip on another track layers
        // immediately (ds_ch0010's twinkle) or queues behind a one-shot already
        // running there so neither is cut before its art is pinned.
        let bodyStarted = track === bodyTrack;
        for (const x of extras ?? []) {
          if (!animSet.has(x)) continue;
          const xt = spineTrack(x);
          let e;
          if (xt === track || (xt === bodyTrack && bodyStarted)) {
            e = spine.state.addAnimation(xt, x, false, 0);
          } else if (xt === bodyTrack) {
            e = spine.state.setAnimation(xt, x, false);
            bodyStarted = true;
          } else {
            const cur = spine.state.getCurrent(xt);
            e = cur && !cur.loop && !cur.isComplete()
              ? spine.state.addAnimation(xt, x, false, 0)
              : spine.state.setAnimation(xt, x, false);
          }
          e.mixDuration = xt === bodyTrack ? 0.15 : 0;
        }
        // A transition clip must NOT queue the current phase's idle behind it:
        // the phase is about to change, and the next section sets its own idle
        // when the clip completes. Queueing here would play the outgoing idle
        // for a frame and fight the incoming one.
        if (bodyStarted && !holdAfter && idle) {
          spine.state.addAnimation(bodyTrack, idle, true, 0);
        }
        // The phase switch waits for the reaction's LAST body clip when there
        // is one (ds_ch0010's drag ends on 10_H1), else the main clip's track.
        if (holdAfter) pendingTrackRef.current = bodyStarted ? bodyTrack : track;
        setReaction(clip);
        armBoring();
      };

      const enterSectionIndex = (next: number) => {
        pendingSectionRef.current = null;
        pendingPresentationUntilRef.current = 0;
        pendingPresentationTimerRef.current = null;
        if (next === sectionIdxRef.current) {
          setSceneRunKey((key) => key + 1);
        } else {
          setSectionIdx(next);
        }
      };

      // Bounding-box attachments are the touch regions. SkeletonBounds is the
      // runtime's own polygon hit test, so it follows the current pose instead
      // of needing exported rectangles. What each region *does* comes from the
      // exporter's resolved table, not from its name.
      const bounds = new SkeletonBounds();
      boundsRef.current = bounds;
      const regionByBox = new Map(
        (layout.touch?.regions ?? []).map((r) => [r.box, r]));
      const hasBoxes = regionByBox.size > 0;
      const attachmentIsVisible = (attachment: any) => {
        const slot = spine.skeleton.slots.find(
          (candidate: any) => candidate.getAttachment() === attachment);
        return !!slot && slot.bone.active
          && slot.color.a * spine.skeleton.color.a > 1e-3;
      };

      // Story rigs take taps as "next" even without any touch boxes.
      const hasStory = storySequences(layout, isFaceAnim).length > 0;
      if (hasBoxes || hasStory || jiggle.size > 0) {
        spine.eventMode = 'static';
        spine.cursor = 'pointer';
        spine.on('pointertap', (e: any) => {
          if (!autoModeRef.current) return;
          // The DOM pointer-down handler below owns Lobby jiggle so it is not
          // lost behind canvas pointer capture. Suppress the matching Pixi tap,
          // which would otherwise kick twice or play the generic touch clip.
          if (modeRef.current === 'home' && performance.now() <= jiggleTapUntil) {
            jiggleTapUntil = 0;
            return;
          }
          // Input is blocked while a reaction sequence plays out (`reacting`),
          // as in game: a touch consumes script state (counters, flags), and an
          // overlay one-shot replaced before its `complete` never pins its end
          // art. Jiggle pokes stay live — the game's jiggler input handler is
          // separate from its click handler.
          const local = spine.toLocal(e.global);
          bounds.update(spine.skeleton, true);
          // `local` is already in the Spine object's y-down space; no extra flip.
          //
          // Desire rigs attach every state's regions at once and the sets overlap
          // heavily, so the hit test is restricted to regions live in the current
          // phase and takes the smallest match. Script mode instead hit-tests
          // every box the section arms, since the scenario decides what is live,
          // not the region's name suffix.
          const sec = sectionRef.current;
          let hit: TouchRegion | null = null;
          let hitBox: string | null = null;
          let bestArea = Infinity;
          // Boxes the script does not bind in this phase. Tracked separately so
          // a touch on one can be reported without ever outranking a bound box.
          let looseRegion: TouchRegion | null = null;
          let looseBox: string | null = null;
          let looseArea = Infinity;
          const boxList = bounds.boundingBoxes ?? [];
          const polyList = bounds.polygons ?? [];
          for (let i = 0; i < polyList.length; i++) {
            const name: string = boxList[i]?.name ?? '';
            if (!name) continue;
            if (!attachmentIsVisible(boxList[i])) continue;
            const region = name ? regionByBox.get(name) : undefined;
            const bound = sec ? sec.triggers.some((t) => t.box === name) : false;
            if (!sec && (!region || !regionLiveInPhase(region, phaseRef.current))) continue;
            if (!polyList[i] || !bounds.containsPointPolygon(polyList[i], local.x, local.y)) continue;
            const area = polygonArea(polyList[i]);
            if (sec && !bound) {
              if (area < looseArea) { looseArea = area; looseRegion = region ?? null; looseBox = name; }
              continue;
            }
            if (area < bestArea) { bestArea = area; hit = region ?? null; hitBox = name; }
          }

          // Scenario-driven. The armed trigger whose condition holds wins; a box
          // with no armed trigger is genuinely inert, which is what stalls the
          // scene in game. The script is the whole authority here: a box it does
          // not bind in this phase must leave playback ALONE rather than fall
          // through to the phase's generic `active` clip.
          if (sec) {
            if (pendingSectionRef.current !== null || reacting()) return;
            if (!hitBox) {
              setTouchInfo(looseBox
                ? {
                  box: looseBox,
                  effect: looseRegion?.effect === 'physics' ? 'physics' : 'inert',
                  detail: looseRegion?.effect === 'physics'
                    ? (looseRegion.bone ?? '')
                    : 'not bound in this phase',
                }
                : { box: '(no region)', effect: 'inert', detail: 'nothing here' });
              armBoring();
              return;
            }
            const actionVars = varsRef.current;
            const fired = fireTouch(sec, hitBox, actionVars,
              rigScriptRef.current?.subroutines);
            if (!fired) {
              setTouchInfo({ box: hitBox, effect: 'inert', detail: 'no armed trigger in this phase' });
              armBoring();
              return;
            }
            setVars(fired.vars);
            varsRef.current = fired.vars;
            const sets = Object.entries(fired.trigger.set)
              .map(([k, v]) => `${k}=${v}`).join(' ');
            const chain = fired.chainClips;
            const mainClip = fired.trigger.clip ?? chain[0] ?? null;
            const extraClips = fired.trigger.clip ? chain : chain.slice(1);
            setTouchInfo({
              box: hitBox,
              effect: mainClip ? 'reaction' : 'state',
              detail: [mainClip ?? '(no clip)',
                fired.trigger.drag ? 'drag' : null,
                fired.trigger.when ? `when ${fired.trigger.when}` : null,
                fired.trigger.gosub ? `gosub ${fired.trigger.gosub}` : null,
                fired.subClip ?? null,
                sets || null,
                fired.goto ? `→ ${fired.goto}${fired.viaGate ? ' (gate)' : ''}` : null,
              ].filter(Boolean).join('  '),
            });
            const triggerIndex = sec.triggers.indexOf(fired.trigger);
            const presentationActions = desirePresentationRef.current
              ?.sections[sectionIdxRef.current]?.triggers[triggerIndex] ?? [];
            const selectedClips = new Set([
              mainClip, ...extraClips,
            ].filter((clip): clip is string => !!clip));
            const triggerActions = presentationActions.filter((action) => (
              action.type !== 'animation'
              || (selectedClips.has(action.clip) && holds(action.when, actionVars))
            ));
            const subroutineActions = fired.subClip && fired.trigger.gosub
              ? (desirePresentationRef.current?.subroutines?.[fired.trigger.gosub] ?? [])
                .filter((action) => action.type !== 'animation' || action.clip === fired.subClip)
              : [];
            const authoredActions = fired.trigger.gosubAfter
              ? [...triggerActions, ...subroutineActions]
              : [...subroutineActions, ...triggerActions];
            const authoredAnimations = authoredActions.filter(
              (action) => action.type === 'animation');
            if (fired.subClip && !subroutineActions.length) {
              autoDriveRef.current?.(fired.subClip);
            }
            const next = fired.goto
              ? sectionIndexByLabel(rigScriptRef.current!, fired.goto)
              : -1;
            const advancing = next >= 0;
            if (mainClip && authoredAnimations.length) {
              const advancesOnReset = advancing && authoredActions.some(
                (action) => action.type === 'reset-animation');
              const presentationTime = playSceneActionsRef.current(
                authoredActions,
                actionVars,
                advancesOnReset ? () => enterSectionIndex(next) : undefined,
              );
              setReaction(mainClip);
              const held = authoredAnimations.some((action) => action.hold);
              if (advancing && !advancesOnReset) {
                pendingSectionRef.current = next;
                pendingPresentationUntilRef.current = sceneNow + presentationTime;
                pendingPresentationTimerRef.current = scheduleScene(() => {
                  pendingPresentationTimerRef.current = null;
                  pendingPresentationUntilRef.current = 0;
                  pendingSectionRef.current = null;
                  enterSectionIndex(next);
                }, Math.max(presentationTime, 0));
              } else if (!held) {
                sceneTimers.push(scheduleScene(() => {
                  setReaction(null);
                  autoDriveRef.current?.('idle');
                }, Math.max(presentationTime, 0)));
              }
            } else if (mainClip) {
              // Hold the pose when a phase change follows, so the transition
              // sequence plays in full; the section switch happens on the
              // `complete` of its last queued clip.
              autoDriveRef.current?.(mainClip, advancing, extraClips);
              if (advancing) pendingSectionRef.current = next;
            } else {
              armBoring();
            }
            const effectsOnly = authoredActions.filter(
              (action) => action.type !== 'animation' && action.type !== 'reset-animation');
            const presentationTime = !authoredAnimations.length && effectsOnly.length
              ? playSceneActionsRef.current(effectsOnly, actionVars)
              : 0;
            pendingPresentationUntilRef.current = presentationTime
              ? sceneNow + presentationTime
              : 0;
            if (!mainClip && advancing) {
              if (presentationTime > 0) {
                pendingPresentationTimerRef.current = scheduleScene(() => {
                  pendingPresentationTimerRef.current = null;
                  pendingPresentationUntilRef.current = 0;
                  enterSectionIndex(next);
                }, presentationTime);
              } else {
                enterSectionIndex(next);
              }
            }
            return;
          }

          if (modeRef.current === 'scene' && linearSceneRef.current) {
            if (reacting()) return;
            setSceneBeatIdx((i) => Math.min(
              i + 1, Math.max(linearSceneRef.current!.beats.length - 1, 0)));
            return;
          }

          // Fallback linear playback for rigs without a script timeline.
          if (modeRef.current === 'scene' && storySeqRef.current) {
            setStoryIdx((i) => i + 1);
            return;
          }

          // The touched home box selects its assigned jiggler and supplies the
          // direction from the live bone toward the touch point.
          if (modeRef.current === 'home') {
            const box = hitBox ?? hit?.box ?? '';
            const jiggleHit = box ? jiggle.pokeToward(box, local.x, local.y) : null;
            if (jiggleHit) {
              setTouchInfo({ box, effect: 'jiggle', detail: jiggleHit.bone });
              armBoring();
              return;
            }
            // Only a real bounding box is an input surface. The boxes cover a
            // fraction of the art, so a tap outside every box does nothing
            // rather than falling through to the phase's active clip.
            if (!box) return;
            if (reacting()) return;
            const regionClip = hit?.effect === 'region' ? hit.clip : null;
            const row = speakLobbyRef.current('Touch', box);
            const authoredClip = stageLobbyRef.current(row);
            const clip = row ? authoredClip : (regionClip ?? phaseRef.current.active);
            if (clip && animSet.has(clip)) {
              setTouchInfo({
                box,
                effect: regionClip || row?.ani ? 'region' : 'touch',
                detail: clip + (row?.emo ? ` + ${row.emo}` : ''),
              });
              autoDriveRef.current?.(clip);
            } else if (row) {
              // An authored line with no `@ani` is a real reaction that keeps
              // the idle running — the face, the emote and the quote carry it.
              setTouchInfo({
                box,
                effect: 'state',
                detail: [row.face && `face ${row.face}`, row.emo]
                  .filter(Boolean).join(' + ') || 'authored non-moving line',
              });
              armBoring();
            } else {
              setTouchInfo({
                box,
                effect: 'inert',
                detail: 'this variation has no touch clip',
              });
              armBoring();
            }
            return;
          }

          const { effect, clip, bone } = effectOf(hit, phaseRef.current);

          // A physics region springs a `gyro_*` bone in game. That is Unity-side
          // custom physics with no Spine equivalent, so the viewer reports the
          // binding instead of playing an unrelated animation.
          if (effect === 'physics') {
            setTouchInfo({ box: hit?.box ?? '', effect, detail: bone ?? '' });
            armBoring(); // a jiggle is still an interaction
            return;
          }
          if (reacting()) return;
          if (clip) {
            setTouchInfo({
              box: hit?.box ?? '(no region)',
              effect,
              detail: clip + (bone ? ` + jiggle ${bone}` : ''),
            });
            autoDriveRef.current?.(clip);
          }
        });
      }

      spine.state.addListener({
        event: (_entry: any, event: any) => {
          const name = event?.data?.name;
          if (name === 'bg_on' || name === 'bg_off') {
            if (switchBackground(name, event.stringValue ?? '', event.intValue ?? 0)) return;
            setFade((current) => spineBackgroundEventFade(current, name));
          }
        },
        // Release the slots a starting overlay clip drives, so the pinned
        // state does not fight its own animation. On `start`, not at queue
        // time: a queued stroke must not un-pin art while its predecessor is
        // still playing.
        start: (entry: any) => {
          if (entry?.trackIndex === bodyTrackRef.current()
            || entry?.trackIndex === TRACK_FACE) return;
          const name = entry?.animation?.name;
          for (const [slotIndex] of overlayEndState.get(name) ?? []) {
            pinned.delete(slotIndex);
          }
        },
        complete: (entry: any) => {
          // Only a one-shot finishing means the rig just returned to idle. A
          // looping idle fires `complete` every cycle (every ~4s), so re-arming
          // on that would reset the boredom timer forever and `boring` would
          // never play.
          if (!autoModeRef.current || entry?.loop) return;
          const track = entry?.trackIndex;
          const done = entry?.animation?.name;
          if (entry?._madHold && typeof track === 'number' && done) {
            completedHeldTracks.set(track, done);
            sceneTimers.push(scheduleScene(() => {
              if (destroyed) return;
              preserveHeldEndStates();
              setReaction(null);
              autoDriveRef.current?.('idle');
            }, 0));
            return;
          }
          // A layered one-shot pins its end art whether or not a phase change
          // is pending — ds_ch0009's glass_on completes DURING the transition
          // to phase 2 and its glass must survive it.
          if (track !== bodyTrackRef.current()) {
            for (const [slotIndex, name] of overlayEndState.get(done) ?? []) {
              if (name) pinned.set(slotIndex, name);
              else pinned.delete(slotIndex);
            }
            setReaction((r) => (r === done ? null : r));
          }
          // A transition sequence has now played in full, so the phase it
          // leads to can take over; with follow-up clips queued, only the LAST
          // entry on the pending track counts. The new section's effect starts
          // its own idle.
          const pending = pendingSectionRef.current;
          if (pending !== null) {
            if (track !== pendingTrackRef.current || entry?.next) return;
            const finish = () => {
              enterSectionIndex(pending);
            };
            const remaining = pendingPresentationUntilRef.current - sceneNow;
            if (remaining > 0) {
              cancelScene(pendingPresentationTimerRef.current);
              pendingPresentationTimerRef.current = scheduleScene(finish, remaining);
            } else {
              finish();
            }
            return;
          }
          // A one-shot ending on a layered track is not a return to idle.
          if (track !== bodyTrackRef.current()) return;
          setReaction(null);
          armBoring();
        },
      });

      if (autoModeRef.current && phaseRef.current.idle) {
        autoDriveRef.current('idle');
      } else if (bodyAnimRef.current && animSet.has(bodyAnimRef.current)) {
        spine.state.setAnimation(TRACK_BODY, bodyAnimRef.current, loopRef.current);
      }
      if (faceAnimRef.current && animSet.has(faceAnimRef.current)) {
        spine.state.setAnimation(TRACK_FACE, faceAnimRef.current, true);
      }
      if (overlayAnimRef.current && animSet.has(overlayAnimRef.current)) {
        spine.state.setAnimation(TRACK_OVERLAY, overlayAnimRef.current, true);
      }
      spine.state.timeScale = playingRef.current ? speedRef.current : 0;

      // Touch-region overlay. Redrawn each frame because the boxes are posed
      // polygons, not static rectangles. Added to `root` so pan/zoom carries it.
      if (hasBoxes) {
        const overlay = new PIXI.Graphics();
        overlay.zIndex = 20;
        overlay.eventMode = 'none';
        overlay.visible = showBoxesRef.current;
        scene.addChild(overlay);
        boxOverlayRef.current = overlay;
        app.ticker.add(() => {
          if (!overlay.visible) return;
          overlay.clear();
          bounds.update(spine.skeleton, true);
          const polys = bounds.polygons ?? [];
          const boxes = bounds.boundingBoxes ?? [];
          for (let i = 0; i < polys.length; i++) {
            const verts = polys[i];
            if (!verts || verts.length < 6) continue;
            // The Spine display object already applies Pixi's y-down flip to the
            // skeleton's world transform, so these vertices are in the Spine
            // object's own local space — flipping y again would mirror the boxes
            // off the figure entirely.
            const pts: number[] = [];
            for (let v = 0; v < verts.length; v += 2) {
              const world = spine.toGlobal({ x: verts[v], y: verts[v + 1] });
              const local = scene.toLocal(world);
              pts.push(local.x, local.y);
            }
            const name: string = boxes[i]?.name ?? '';
            const region = regionByBox.get(name);
            // Regions belonging to another interaction state are drawn faintly
            // so it is visible that the rig has them without implying they are
            // clickable in the current phase. Colour encodes the resolved
            // effect, not a guess from the name.
            //
            // Under a scenario table "live" means the section has a trigger for
            // the box whose condition currently holds — so a box visibly dims
            // once its step is spent, and lights up when a gate opens it.
            const sec = sectionRef.current;
            const live = sec
              ? armedBoxes(sec, varsRef.current).has(name)
              : (!region || regionLiveInPhase(region, phaseRef.current));
            const color = EFFECT_COLOR[region?.effect ?? 'generic'];
            overlay.poly(pts)
              .fill({ color, alpha: live ? 0.14 : 0.03 })
              .stroke({ color, width: 0.06, alpha: live ? 0.9 : 0.25 });
          }
        });
      }

      // Lobby emote bubble. `[@emo]` names a Unity particle prefab, so the
      // published art is that prefab's glyph and this is a still, not the
      // effect. It lives in `scene` next to the actor so pan, zoom and the
      // device staging carry it exactly as they carry the figure.
      //
      // Placement is the game's own: the prefab picks a slot, and the rig
      // authors that slot's bone and offset. Everything is already in skeleton
      // units, so the sprite is positioned in the Spine object's local space
      // and converted, exactly as the touch-region overlay is.
      const emoteSprite = new PIXI.Sprite();
      emoteSprite.anchor.set(0.5, 0.5);
      emoteSprite.visible = false;
      emoteSprite.eventMode = 'none';
      emoteSprite.zIndex = 30;
      scene.addChild(emoteSprite);
      let emoteToken = 0;
      let emoteStartedAt = 0;
      let emoteEndsAt = 0;
      let emotePlace: EmotePlacement | null = null;
      // The rig spells its own bone names (`Face`, `head`, `body_08_head`), so
      // this matches case-insensitively. A rig that has no such bone gets no
      // emote rather than one parked at the origin at its native pixel size.
      const placeEmote = (): boolean => {
        if (!emotePlace) return false;
        const wanted = emotePlace.bone.toLowerCase();
        const bone = spine.skeleton.bones.find(
          (b: any) => b.data.name.toLowerCase() === wanted);
        if (!bone) {
          console.warn('emote bone missing', emotePlace.bone);
          return false;
        }
        // Bone coordinates and the authored offset are both in skeleton units;
        // `spine.scale` maps those to scene units, which is also what
        // `toGlobal` applies, so the size and the anchor stay consistent.
        //
        // `spine-pixi` sets `Skeleton.yDown = true`, so `bone.worldY` is already
        // y-down. The authored offset is y-up (`+5.75` means above the head), so
        // it is the offset that is subtracted, not the bone.
        const anchor = scene.toLocal(spine.toGlobal({
          x: bone.worldX + emotePlace.offset[0],
          y: bone.worldY - emotePlace.offset[1],
        }));
        const height = emotePlace.height * EMOTE_UNIT_SCALE * Math.abs(spine.scale.y);
        emoteSprite.height = height;
        emoteSprite.width = height * emotePlace.aspect;
        emoteSprite.position.set(anchor.x, anchor.y);
        return true;
      };
      showEmoteRef.current = (placement, seconds) => {
        const mine = ++emoteToken;
        // `loadParser` is named explicitly, as everywhere else here: PIXI picks
        // a parser by extension, and the bare-string form produces no texture.
        void PIXI.Assets.load({ src: placement.url, loadParser: 'loadTextures' })
          .then((texture: any) => {
            if (destroyed || mine !== emoteToken) return;
            if (!texture?.source) throw new Error(`no texture for ${placement.url}`);
            emoteSprite.texture = texture;
            emoteSprite.alpha = 0;
            emotePlace = placement;
            // Authored seconds on the scene clock: the glyph holds for as long
            // as the line it belongs to, at whatever speed that line runs.
            emoteStartedAt = sceneNow;
            emoteEndsAt = emoteStartedAt + seconds;
            emoteSprite.visible = placeEmote();
          })
          // A decorative asset must not break the reaction it belongs to, and
          // must not fail silently either.
          .catch((err) => console.warn('emote', placement.url, err));
      };
      app.ticker.add(() => {
        if (!emoteSprite.visible) return;
        if (sceneNow >= emoteEndsAt) {
          emoteSprite.visible = false;
          return;
        }
        emoteSprite.alpha = Math.min(
          1,
          (sceneNow - emoteStartedAt) / EMOTE_FADE_SECONDS,
          (emoteEndsAt - sceneNow) / EMOTE_FADE_SECONDS,
        );
        placeEmote();
      });
      hideEmoteRef.current = () => {
        emoteToken += 1;
        emoteSprite.visible = false;
      };

      // Pivot for the rig camera, in `view`-local units. Measured by `fit()`.
      let rigCameraCentre = { x: 0, y: 0 };
      const resetRigCamera = () => {
        view.pivot.set(0, 0);
        view.position.set(0, 0);
        view.scale.set(1);
        view.rotation = 0;
      };
      // Follows the `cam` bone every frame. Spine runs at a higher ticker
      // priority, so the bone's world transform is already current here.
      const applyRigCamera = () => {
        if (!camBone || !camSetup) return;
        if (!followGameFlowRef.current) {
          resetRigCamera();
          return;
        }
        // Skeleton units to `view` units. `spine.rotation` is always 0 and both
        // scales are uniform, so a *delta* only needs the two scale factors and
        // the staging rotation — the translations cancel. `bone.worldY` is
        // already y-down (spine-pixi sets `Skeleton.yDown`), as the emote
        // anchor above also relies on.
        const factor = spine.scale.x * scene.scale.x;
        const dx = (camBone.worldX - camSetup.x) * factor;
        const dy = (camBone.worldY - camSetup.y) * factor;
        const cos = Math.cos(scene.rotation);
        const sin = Math.sin(scene.rotation);
        const target = rigCameraTransform(rigCameraCentre, {
          x: dx * cos - dy * sin,
          y: dx * sin + dy * cos,
          scale: (Math.abs(camBone.getWorldScaleX()) || 1) / camSetup.scale,
          rotation: (camBone.getWorldRotationX() - camSetup.rotation) * Math.PI / 180,
        });
        view.pivot.set(target.pivotX, target.pivotY);
        view.position.set(target.x, target.y);
        view.scale.set(target.scale);
        view.rotation = target.rotation;
      };
      app.ticker.add(applyRigCamera);
      app.ticker.add(applyBackgroundTransforms);

      const fit = () => {
        const useCutsceneStaging = modeRef.current === 'scene'
          && W.cutsceneOffsets?.[0]?.samples?.length;
        const viewportAspect = Math.max(
          app.screen.width / Math.max(app.screen.height, 1),
          app.screen.height / Math.max(app.screen.width, 1),
        );
        const aspect = WIDE_CUTSCENE_STAGING_SKINS.has(baseSkinKey(skin))
          ? Number.POSITIVE_INFINITY
          : viewportAspect;
        const staging = useCutsceneStaging
          ? cutsceneOffsetAt(W.cutsceneOffsets![0].samples, aspect)
          : null;
        const dataScale = sk.dataScale ?? 1;
        spine.position.set(sk.x, -sk.y);
        spine.scale.set(prefabScale);
        spine.rotation = 0;
        // Fit the actor/background composition in its authored base space.
        // Device staging is applied to the shared scene only after this
        // measurement, so it moves the room, actor, and touch overlay as one.
        scene.position.set(0, 0);
        scene.scale.set(1);
        scene.rotation = 0;
        // The rig camera must not participate in the fit either: measuring
        // during a zoomed-in enter frame would re-frame the whole composition
        // around whatever corner the camera happens to be on.
        resetRigCamera();
        // The room is part of the composition being measured, so it has to be
        // on its bone before the bounds are read.
        applyBackgroundTransforms();
        // Diagnostic geometry and the emote must not participate in the fit:
        // the boxes can exceed the art, and the emote hangs above the figure's
        // head by construction, so either one would re-frame the character.
        const boxOverlay = boxOverlayRef.current;
        const boxesVisible = boxOverlay?.visible ?? false;
        const emoteVisible = emoteSprite.visible;
        if (boxOverlay) boxOverlay.visible = false;
        emoteSprite.visible = false;
        const b = root.getLocalBounds();
        if (boxOverlay) boxOverlay.visible = boxesVisible;
        emoteSprite.visible = emoteVisible;
        if (!b.width || !b.height) return;
        // The game camera frames the reference view width around the bone,
        // scaled by the bone's setup scale and by the device staging scale; the
        // runtime term stays relative to the setup scale. `dataScale` is baked
        // into the parsed skeleton, so only the authored width needs
        // converting. The view height is not authored: it is the width over the
        // aspect of the surface drawn into.
        const gameCamera = !!(camBone && camSetup && followGameFlowRef.current);
        const stagingScale = staging?.scale ?? 1;
        const viewScale = dataScale * prefabScale * (camSetup?.scale ?? 1);
        const viewW = REFERENCE_VIEW_WIDTH * viewScale * stagingScale;
        const viewH = viewW * app.screen.height / Math.max(app.screen.width, 1);
        const frame = gameCamera
          ? {
            width: viewW,
            height: viewH,
            x: spine.position.x + camSetup!.x * prefabScale - viewW / 2,
            y: spine.position.y + camSetup!.y * prefabScale - viewH / 2,
          }
          : { x: b.x, y: b.y, width: b.width, height: b.height };
        // `view` is at identity for this measurement, so the frame's centre is
        // also the pivot the rig camera zooms and rotates about.
        rigCameraCentre = {
          x: frame.x + frame.width / 2,
          y: frame.y + frame.height / 2,
        };
        // The viewport is meant to fill the canvas; only a bounds fit is padded.
        const pad = gameCamera ? 0 : 40;
        const s = Math.min(
          (app.screen.width - pad) / frame.width,
          (app.screen.height - pad) / frame.height);
        cameraBase = {
          x: app.screen.width / 2 - (frame.x + frame.width / 2) * s,
          y: app.screen.height / 2 - (frame.y + frame.height / 2) * s,
          scale: s,
          width: app.screen.width,
          height: app.screen.height,
        };
        scene.position.set(
          (staging?.position.x ?? 0) * dataScale,
          -(staging?.position.y ?? 0) * dataScale,
        );
        // The staging scale is a camera zoom, so under the game camera it is
        // already in the frame width and must not scale the scene as well.
        scene.scale.set(gameCamera ? 1 : stagingScale);
        scene.rotation = -(staging?.rotation ?? 0) * Math.PI / 180;
        const target = followGameFlowRef.current
          ? scriptCameraTransform(cameraBase, cameraState)
          : { x: cameraBase.x, y: cameraBase.y, scale: cameraBase.scale };
        root.scale.set(target.scale);
        root.position.set(target.x, target.y);
      };
      fitCameraRef.current = fit;
      spine.update(0);
      fit();

      const clearSceneTimers = () => {
        for (const timer of sceneTimers) cancelScene(timer);
        sceneTimers = [];
      };
      cancelSceneActionsRef.current = clearSceneTimers;
      const applyCamera = (action: CameraAction) => {
        if (!followGameFlowRef.current) return;
        if (action.offset) {
          if (action.offset[0] !== null && action.offset[0] !== undefined) {
            cameraState.offsetX = action.offset[0] * scriptOffsetUnit;
          }
          if (action.offset[1] !== null && action.offset[1] !== undefined) {
            cameraState.offsetY = action.offset[1] * scriptOffsetUnit;
          }
        }
        if (action.zoom !== undefined) cameraState.zoom = action.zoom;
        const target = scriptCameraTransform(cameraBase, cameraState);
        if (action.duration <= 0) {
          cameraTween = null;
          root.position.set(target.x, target.y);
          root.scale.set(target.scale);
          return;
        }
        cameraTween = {
          from: { x: root.position.x, y: root.position.y, scale: root.scale.x },
          to: target,
          started: sceneNow,
          duration: action.duration,
        };
      };
      app.ticker.add(() => {
        if (!cameraTween) return;
        const t = Math.min(1, (sceneNow - cameraTween.started) / cameraTween.duration);
        const x = cameraTween.from.x + (cameraTween.to.x - cameraTween.from.x) * t;
        const y = cameraTween.from.y + (cameraTween.to.y - cameraTween.from.y) * t;
        const scale = cameraTween.from.scale
          + (cameraTween.to.scale - cameraTween.from.scale) * t;
        root.position.set(x, y);
        root.scale.set(scale);
        if (t >= 1) cameraTween = null;
      });

      resetSceneVisualsRef.current = () => {
        clearSceneTimers();
        cameraState.offsetX = 0;
        cameraState.offsetY = 0;
        cameraState.zoom = 0;
        cameraTween = null;
        backgroundEnabled.forEach((_, index) => {
          backgroundEnabled[index] = targetedBackgrounds
            ? backgroundOffTargets.has(normalizeBackgroundName(backgroundDefs[index].name))
            : index === 0;
        });
        applyBackgroundVisibility();
        setFade({ color: 'black', opacity: 0, duration: 0 });
        fit();
      };

      const authoredTrack = (
        action: { track?: string | number | null; clip?: string; hold?: boolean },
        actionVars: Vars,
      ) => {
        if (action.track !== null && action.track !== undefined) {
          const value = typeof action.track === 'number'
            ? action.track : evaluate(action.track, actionVars);
          if (value !== null && Number.isFinite(value)) {
            return Math.max(0, Math.trunc(value));
          }
        }
        return action.clip ? spineTrack(action.clip) : bodyTrackRef.current();
      };
      playSceneActionsRef.current = (authored, actionVars = {}, onReset) => {
        preserveHeldEndStates();
        clearSceneTimers();
        // One `@PickRandom` group survives per pick, as in game.
        const actions = resolveAlternatives(authored);
        // The whole schedule is in authored seconds and rides the scene clock,
        // which is the clock the rig's animations are on. So a wait, a fade or
        // a line lands with the animation it accompanies at any speed, and a
        // speed change part-way through carries the rest of the sequence with
        // it instead of leaving it on the wall clock.
        let resetNotified = false;
        let elapsed = 0;
        let finishesAt = 0;
        let lastAnimationTrack: number | null = null;
        const scheduledEnds = new Map<number, number>();
        const queuedAt = new Map<number, number>();
        const queuedLoop = new Map<number, boolean>();
        const plannedAt = new Map<number, number>();
        const plannedLoop = new Map<number, boolean>();
        for (const action of actions) {
          if (action.type === 'camera' && !followGameFlowRef.current) continue;
          if (action.type === 'wait') {
            elapsed += action.duration;
            continue;
          }
          if (action.type === 'wait-animation') {
            const current = spine.state.getCurrent(
              lastAnimationTrack ?? bodyTrackRef.current());
            const remaining = current
              ? Math.max(0, (current.animationEnd ?? current.animation?.duration ?? 0)
                - (current.trackTime ?? 0))
              : 0;
            elapsed = waitAnimationDeadline(
              elapsed, lastAnimationTrack, scheduledEnds, remaining,
            );
            finishesAt = Math.max(finishesAt, elapsed);
            continue;
          }
          const at = elapsed;
          if (action.type === 'animation') {
            const duration = skeletonData.findAnimation(action.clip)?.duration ?? 0;
            const track = authoredTrack(action, actionVars);
            lastAnimationTrack = track;
            if (!action.loop) {
              const startsAt = plannedAt.get(track) === at && !plannedLoop.get(track)
                ? Math.max(at, scheduledEnds.get(track) ?? at)
                : at;
              const endsAt = startsAt + duration;
              finishesAt = Math.max(finishesAt, endsAt);
              scheduledEnds.set(track, endsAt);
            } else {
              scheduledEnds.delete(track);
            }
            plannedAt.set(track, at);
            plannedLoop.set(track, action.loop);
          } else if (action.type === 'camera' || action.type === 'fade') {
            finishesAt = Math.max(finishesAt, at + action.duration);
          }
          const timer = scheduleScene(() => {
            if (destroyed) return;
            if (action.type === 'say') {
              sayRef.current(action);
            } else if (action.type === 'camera') {
              applyCamera(action);
            } else if (action.type === 'fade') {
              // A fade to transparent clears whatever cover is up, so it keeps
              // the current colour: repainting the overlay to the authored
              // colour is instant while only the opacity animates, which shows
              // a full-opacity flash of that colour before the fade starts.
              setFade((current) => ({
                color: action.opacity <= 0 ? current.color : action.color,
                opacity: action.opacity,
                duration: action.duration,
              }));
            } else if (action.type === 'bgm') {
              requestBgmRef.current(action.clip, action.intro, action.fade);
            } else if (action.type === 'stop-bgm') {
              pendingBgmRef.current = null;
              desiredBgmRef.current = null;
              stopBgm(action.fade);
            } else if (action.type === 'reset-animation') {
              if (action.track === null || action.track === undefined) {
                // `@desire <actor> Reset:true` resets the actor, not just its
                // tracks: clearing tracks alone leaves every slot colour and
                // attachment where the last clip left it, including a clip that
                // ends mid-fade on a `whiteout` quad.
                spine.state.clearTracks();
                spine.skeleton.setToSetupPose();
                clearPersistentRef.current();
              } else {
                const track = authoredTrack(action, actionVars);
                spine.state.clearTrack(track);
                if (track !== bodyTrackRef.current() && track !== TRACK_FACE) {
                  pinned.clear();
                }
              }
              if (!resetNotified) {
                resetNotified = true;
                onReset?.();
              }
            } else if (action.type === 'animation' && animSet.has(action.clip)) {
              const track = authoredTrack(action, actionVars);
              if (action.reset) spine.state.clearTrack(track);
              const previousAt = queuedAt.get(track);
              const entry = previousAt === at && !queuedLoop.get(track)
                ? spine.state.addAnimation(track, action.clip, action.loop, 0)
                : spine.state.setAnimation(track, action.clip, action.loop);
              entry.mixDuration = track === bodyTrackRef.current() ? 0.15 : 0;
              if (action.hold) entry._madHold = true;
              requestSceneSoundRef.current(baseSkinKey(skin), action.clip);
              queuedAt.set(track, at);
              queuedLoop.set(track, action.loop);
            }
          }, Math.max(0, at));
          sceneTimers.push(timer);
          if ((action.type === 'camera' || action.type === 'fade') && action.wait) {
            elapsed += action.duration;
          } else if (action.type === 'animation' && action.wait) {
            elapsed += skeletonData.findAnimation(action.clip)?.duration ?? 0;
          }
        }
        return Math.max(elapsed, finishesAt);
      };

      // Measure source-atlas pixels in the current pose, so a saved PNG comes
      // out at the art's native resolution rather than the on-screen one.
      const attachmentScales = (sp: any): number[] => {
        if (!sp?.visible) return [];
        const scales: number[] = [];
        for (const slot of sp.skeleton.slots) {
          const attachment = slot.getAttachment();
          const page = attachment?.region?.page;
          if (!attachment || !page?.width || !page?.height) continue;
          let vertices: Float32Array;
          let indices: ArrayLike<number>;
          if (attachment instanceof RegionAttachment) {
            vertices = new Float32Array(8);
            attachment.computeWorldVertices(slot, vertices, 0, 2);
            indices = [0, 1, 2, 0, 2, 3];
          } else if (attachment instanceof MeshAttachment) {
            vertices = new Float32Array(attachment.worldVerticesLength);
            attachment.computeWorldVertices(
              slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
            indices = attachment.triangles;
          } else {
            continue;
          }
          const scale = mappedSourcePixelScale(
            vertices, attachment.uvs, indices, page.width, page.height,
            { a: sp.scale.x, b: 0, c: 0, d: sp.scale.y },
          );
          if (scale > 0 && Number.isFinite(scale)) scales.push(scale);
        }
        return scales;
      };
      // A rig's real art occupies a narrow band of source-pixel scales, but
      // every rig also carries filler regions (`pixel`, `white`, skin-tone gap
      // meshes) stretched far past their own size. A low percentile of the band
      // is near-native for the detailed art and immune to those outliers. The
      // background is a fallback only: it is usually stretched well past its own
      // resolution and would halve the figure's export scale.
      spinePixelScaleRef.current = () => {
        const scales = attachmentScales(spine).sort((a, b) => a - b);
        if (scales.length) {
          return scales[Math.floor((scales.length - 1) * EXPORT_SCALE_PERCENTILE)];
        }
        const bg = bgSpritesRef.current.find((sprite) => sprite.visible);
        const src = bg?.texture?.source;
        if (bg?.visible && src?.width && src?.height) {
          return Math.max(Math.abs(bg.width) / src.width, Math.abs(bg.height) / src.height) || 1;
        }
        return 1;
      };

      app.renderer.on('resize', fit);
      // The canvas listener receives pointer-down before pan/zoom can turn the
      // gesture into a drag. Kick immediately; when drag-jiggle is enabled the
      // same selected spring continues receiving pointer positions.
      attachPanZoom(app.canvas as HTMLCanvasElement, root, (cx, cy) => {
        if (modeRef.current !== 'home') return null;
        const local = spine.toLocal({ x: cx, y: cy });
        bounds.update(spine.skeleton, true);
        const boxList = bounds.boundingBoxes ?? [];
        const polyList = bounds.polygons ?? [];
        let box: string | null = null;
        let bestArea = Infinity;
        for (let i = 0; i < polyList.length; i++) {
          const name: string = boxList[i]?.name ?? '';
          if (!name || !jiggle.hasBox(name)) continue;
          if (!attachmentIsVisible(boxList[i])) continue;
          const region = regionByBox.get(name);
          if (!region || !regionLiveInPhase(region, phaseRef.current)) continue;
          if (!polyList[i] || !bounds.containsPointPolygon(polyList[i], local.x, local.y)) continue;
          const area = polygonArea(polyList[i]);
          if (area < bestArea) { bestArea = area; box = name; }
        }
        if (!box) return null;
        const initial = jiggle.pokeToward(box, local.x, local.y);
        if (!initial) return null;
        jiggleTapUntil = performance.now() + 1000;
        setTouchInfo({ box, effect: 'jiggle', detail: initial.bone });
        if (!dragJiggleRef.current) return null;
        const held = box;
        return {
          move: (mx: number, my: number) => {
            const p = spine.toLocal({ x: mx, y: my });
            const hit = jiggle.pokeToward(held, p.x, p.y);
            if (!hit) return;
            setTouchInfo({
              box: held,
              effect: 'jiggle',
              detail: `drag ${hit.bone}`,
            });
          },
          end: () => undefined,
        };
      }, () => !(camBone && followGameFlowRef.current));

      setRigBuilt((built) => built + 1);
    })().catch((e) => !destroyed && setError(String(e)));

    return () => {
      destroyed = true;
      // The scene clock dies with the app, so every handle on it goes too.
      sceneTimers = [];
      sceneTimerRef.current = { set: () => 0, clear: () => {}, now: () => 0 };
      pendingPresentationTimerRef.current = null;
      pendingPresentationUntilRef.current = 0;
      sectionResetTimerRef.current = null;
      boringTimerRef.current = null;
      lobbyFaceTimerRef.current = null;
      applyFadeRef.current = () => {};
      autoDriveRef.current = null;
      cancelSceneActionsRef.current = () => {};
      clearPersistentRef.current = () => {};
      boundsRef.current = null;
      boxOverlayRef.current = null;
      spineRef.current = null;
      bgSpritesRef.current = [];
      syncBackgroundVisibilityRef.current = () => {};
      jiggleRef.current = null;
      pendingSceneSoundRef.current = null;
      pendingBgmRef.current = null;
      desiredBgmRef.current = null;
      stopSceneSound();
      stopBgm();
      spinePixelScaleRef.current = () => 1;
      appRef.current = null;
      rootRef.current = null;
      fitCameraRef.current = () => {};
      playSceneActionsRef.current = () => 0;
      resetSceneVisualsRef.current = () => {};
      // Guarded on appReady: destroying before init() resolves throws.
      if (app && appReady) app.destroy(true);
    };
  }, [layout, skin, archive]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- live state -> skeleton ---------------------------------------------
  // One clock drives the rig, the voice, the animation sounds and every timed
  // step of a script, so a reaction played at 2x still lines up with the line
  // that belongs to it. The scene clock reads `playing` and `speed` per frame,
  // so a change part-way through a sequence carries the rest of it along.
  useEffect(() => {
    const spine = spineRef.current;
    if (spine) spine.state.timeScale = playing ? speed : 0;
    setVoiceRate(speed);
    setSceneSoundRate(speed);
  }, [playing, speed]);

  // The playback context survives a skin change, so a rig without a lobby has
  // to hand the mode back rather than sit in one its option list no longer
  // offers.
  useEffect(() => {
    if (layout && mode === 'home' && !hasLobby) setMode('manual');
  }, [layout, mode, hasLobby]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual selection drives track 0 directly; in auto mode the state machine
  // owns that track and a manual pick would be overwritten on the next return
  // to idle.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine || autoMode || !bodyAnim) return;
    // Clear the previous clip's pose from bones this one does not key.
    spine.skeleton.setToSetupPose();
    spine.state.setAnimation(TRACK_BODY, bodyAnim, loop);
  }, [bodyAnim, loop, autoMode]);

  // Track 2 layers a prop/effect clip over the body.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine) return;
    if (overlayAnim) {
      const entry = spine.state.setAnimation(TRACK_OVERLAY, overlayAnim, true);
      entry.mixDuration = 0.15;
    } else {
      spine.state.setEmptyAnimation(TRACK_OVERLAY, 0.15);
    }
  }, [overlayAnim]);

  // Entering a driven mode hands track 0 to the state machine; leaving it
  // restores the manual selection.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine) return;
    if (mode !== 'home') jiggleRef.current?.reset();
    sceneTimerRef.current.clear(sectionResetTimerRef.current);
    sectionResetTimerRef.current = null;
    clearPersistentRef.current();
    // Each mode owns a different set of tracks: a desire scene drives track 10
    // while Free play and Lobby drive 0, so an outgoing mode's clips would keep
    // playing over the incoming one.
    spine.state.clearTracks();
    spine.skeleton.setToSetupPose();
    setTouchInfo(null);
    setSubtitle(null);
    stopVoice();
    sceneTimerRef.current.clear(lobbyFaceTimerRef.current);
    lobbyFaceTimerRef.current = null;
    lobbyLineRef.current = 0;
    hideEmoteRef.current();
    if (mode === 'home') {
      autoDriveRef.current?.('idle');
    } else if (mode === 'manual') {
      sceneTimerRef.current.clear(boringTimerRef.current);
      boringTimerRef.current = null;
      setReaction(null);
      if (bodyAnim) spine.state.setAnimation(TRACK_BODY, bodyAnim, loop);
      if (faceAnim) spine.state.setAnimation(TRACK_FACE, faceAnim, true);
      if (overlayAnim) spine.state.setAnimation(TRACK_OVERLAY, overlayAnim, true);
    }
    fitCameraRef.current();
  }, [mode, phaseIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Following the game's camera changes the base framing from the composition
  // bounds to the camera's viewport, so the toggle has to re-fit.
  useEffect(() => {
    if (!rigBuilt) return;
    fitCameraRef.current();
  }, [followGameFlow, rigBuilt]);

  // Pixi's resize plugin only watches the window, so a layout change that
  // resizes the canvas host alone — the aspect picker, theatre mode, the panel
  // reflowing — needs its own observer. `app.resize()` emits `resize`, which
  // the build wires to `fit`.
  useEffect(() => {
    const panel = panelRef.current;
    const host = hostRef.current;
    if (!panel || !host) return;
    const measure = () => setPanelSize({ w: panel.clientWidth, h: panel.clientHeight });
    measure();
    const panelObserver = new ResizeObserver(measure);
    panelObserver.observe(panel);
    const hostObserver = new ResizeObserver(() => appRef.current?.resize());
    hostObserver.observe(host);
    return () => {
      panelObserver.disconnect();
      hostObserver.disconnect();
    };
  }, []);

  // Escape leaves theatre mode; there is no browser chrome to fall back on.
  useEffect(() => {
    if (!theater) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer({ theater: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theater]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lobby's own Enter row — a real interaction, not the first idle frame, and
  // every family has one. Entering Lobby runs it; leaving and coming back runs
  // it again.
  //
  // It keys on `rigBuilt` rather than `layout` because the archive parses before
  // the Pixi/Spine build installs `autoDriveRef`. `rigBuilt` changes exactly
  // once per build, so nothing has to remember whether this rig has already run.
  //
  // Must stay declared after the mode effect above: both fire on the same `mode`
  // change, effects run in declaration order, and that one clears every track,
  // the subtitle and the emote.
  useEffect(() => {
    if (mode !== 'home' || !rigBuilt || !voiceIndex) return;
    const row = speakLobbyRef.current('Enter');
    const clip = stageLobbyRef.current(row);
    if (clip) autoDriveRef.current?.(clip);
  }, [mode, rigBuilt, voiceIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (boxOverlayRef.current) boxOverlayRef.current.visible = showBoxes;
  }, [showBoxes]);

  // Muting stops the line already in the air; the subtitle stays, since it is
  // the transcript of what is on screen rather than part of the audio.
  useEffect(() => { if (!voiceOn) stopVoice(); }, [voiceOn]);
  useEffect(() => {
    if (!bgmOn) {
      pendingSceneSoundRef.current = null;
      pendingBgmRef.current = null;
      stopSceneSound();
      stopBgm();
    }
  }, [bgmOn]);
  useEffect(() => stopVoice, []);

  // Track 1 holds the face expression; clearing it empties the track so the
  // body animation's own face keys take over again.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine) return;
    if (faceAnim) {
      const entry = spine.state.setAnimation(TRACK_FACE, faceAnim, true);
      entry.mixDuration = 0.15;
    } else {
      spine.state.setEmptyAnimation(TRACK_FACE, 0.15);
    }
  }, [faceAnim]);

  useEffect(() => {
    syncBackgroundVisibilityRef.current();
  }, [showBg]);

  // Hiding is enforced per frame in the Spine hook; showing restores the setup
  // alpha once and hands the slot back to the rig's own timelines.
  const setLayerHidden = (slots: string[], hide: boolean) => {
    setHiddenSlots((prev) => {
      const next = new Set(prev);
      for (const s of slots) {
        if (hide) next.add(s);
        else next.delete(s);
      }
      return next;
    });
    if (hide) return;
    const skeleton = spineRef.current?.skeleton;
    if (!skeleton) return;
    for (const name of slots) {
      const slot = skeleton.findSlot(name);
      if (slot) slot.color.a = slot.data.color.a;
    }
  };

  // --- save ----------------------------------------------------------------
  const handleSave = () => {
    const app = appRef.current;
    const root = rootRef.current;
    const PIXI = pixiRef.current;
    if (!app || !root || !PIXI) return;

    // fitScale: screen px per skeleton unit (set by fit()).
    // 1/spinePixelScale: skeleton units per atlas pixel in the current pose.
    const fitScale = root.scale.x;
    const screenBounds = root.getBounds();
    // Capped at the maximum texture dimension WebGL guarantees. Clamping rather
    // than bailing means an oversized rig still saves, one size down.
    const exportScale = Math.min(
      (1 / spinePixelScaleRef.current()) / fitScale,
      MAX_EXPORT_DIM / screenBounds.width,
      MAX_EXPORT_DIM / screenBounds.height,
    );
    const natW = Math.ceil(screenBounds.width * exportScale);
    const natH = Math.ceil(screenBounds.height * exportScale);
    if (!natW || !natH) return;

    const rt = PIXI.RenderTexture.create({ width: natW, height: natH });
    const matrix = new PIXI.Matrix(
      exportScale, 0, 0, exportScale,
      -screenBounds.x * exportScale, -screenBounds.y * exportScale);
    app.renderer.render({ container: app.stage, target: rt, transform: matrix, clear: true });
    // extract.canvas() is synchronous in PixiJS v8.
    const src = app.renderer.extract.canvas({ target: rt }) as HTMLCanvasElement;
    rt.destroy(true);

    // Tight-crop to the non-transparent bounds.
    const w = src.width, h = src.height;
    const px = src.getContext('2d')!.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return;
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d')!.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `${archive}${faceAnim ? `_${animLabel(faceAnim)}` : ''}.png`;
    a.click();
  };

  // Memoised so the `?? []` fallback does not hand the option memos a fresh
  // array identity on every render.
  const anims = useMemo(() => layout?.animations ?? [], [layout]);
  const hasTouchBoxes = (layout?.touch?.regions?.length ?? 0) > 0;
  const jigglerCount = layout?.touch?.jigglers?.length ?? 0;
  const reactionClips = useMemo(
    () => anims.filter((a) => a.startsWith('reaction/')), [anims]);
  const orphanReactions = useMemo(
    () => layout?.touch?.orphanReactions ?? [], [layout]);
  const bodyOptions = useMemo(
    () => groupedOptions(anims.filter((a) => !isFaceAnim(a) && !overlayAnims.has(a))),
    [anims, overlayAnims]);
  const faceOptions = useMemo(() => {
    const faces = anims.filter(isFaceAnim);
    return faces.length
      ? [{ value: '', label: '(animation default)' }, ...groupedOptions(faces)]
      : [];
  }, [anims]);
  const overlayOptions = useMemo(() => {
    const overlays = anims.filter((a) => overlayAnims.has(a));
    return overlays.length
      ? [{ value: '', label: '(none)' }, ...groupedOptions(overlays)]
      : [];
  }, [anims, overlayAnims]);

  const playbackContext: PlaybackContext = mode === 'manual' ? 'free_play'
    : mode === 'home' ? 'lobby'
    : layout?.kind === 'desire' ? `desire_${sceneVariant}`
    : layout?.kind === 'affection' ? `affection_${sceneVariant}`
    : 'story';
  const playbackContextOptions: SelectOption[] = [
    { value: 'free_play', label: 'Free play', hint: 'choose animations manually' },
    ...(hasLobby ? [{ value: 'lobby', label: 'Lobby', hint: 'touch and boredom flow' }] : []),
    ...(layout?.kind === 'desire' && (rigScript || timelineRig?.view)
      ? [{ value: 'desire_view', label: 'Desire View', hint: 'interactive display script' }]
      : []),
    ...(layout?.kind === 'desire' && timelineRig?.story
      ? [{ value: 'desire_story', label: 'Desire Story', hint: 'authored story timeline' }]
      : []),
    ...(layout?.kind === 'affection' && timelineRig?.view
      ? [{ value: 'affection_view', label: 'Affection View', hint: 'authored view timeline' }]
      : []),
    ...(layout?.kind === 'affection' && timelineRig?.story
      ? [{ value: 'affection_story', label: 'Affection Story', hint: 'authored story timeline' }]
      : []),
    ...(layout?.kind === 'pleasure' && storySeqs.length
      ? [{ value: 'story', label: 'Story', hint: 'sequential animation groups' }]
      : []),
  ];
  const resetInteractiveScene = () => {
    if (!rigScript) return;
    setSceneEnterKey((key) => key + 1);
    setSectionIdx(0);
    setSceneRunKey((key) => key + 1);
    const initial = applyAssignments(rigScript.sections[0]?.set ?? {}, {});
    setVars(initial);
    varsRef.current = initial;
  };

  // Rebuilds the rig: the scene opens at its first section and the script's
  // entry runs again.
  const reloadPlayback = () => {
    sceneTimerRef.current.clear(sectionResetTimerRef.current);
    sectionResetTimerRef.current = null;
    resetSceneVisualsRef.current();
    setSceneBeatIdx(0);
    setStoryIdx(0);
    pendingSectionRef.current = null;
    if (playbackContext === 'desire_view') resetInteractiveScene();
    setResetKey((key) => key + 1);
  };

  const selectPlaybackContext = (context: PlaybackContext) => {
    resetSceneVisualsRef.current();
    if (context === 'free_play' || context === 'lobby') {
      pendingSceneSoundRef.current = null;
      pendingBgmRef.current = null;
      desiredBgmRef.current = null;
      stopSceneSound();
      stopBgm();
    }
    setSceneBeatIdx(0);
    setStoryIdx(0);
    pendingSectionRef.current = null;
    if (context === 'free_play') {
      setMode('manual');
    } else if (context === 'lobby') {
      setMode('home');
    } else {
      const variant = context.endsWith('_view') ? 'view' : 'story';
      setSceneVariant(variant);
      if (context === 'desire_view') resetInteractiveScene();
      setMode('scene');
    }
    setSceneRunKey((key) => key + 1);
  };

  // The canvas is letterboxed inside the panel when a ratio is chosen. CSS
  // `aspect-ratio` cannot do this on its own — clamping the second axis with a
  // max distorts the box instead of shrinking the first — so the panel is
  // measured and the host sized in pixels.
  const aspectRatio = CANVAS_ASPECTS.find((a) => a.value === canvasAspect)?.ratio ?? 0;
  const hostBox = aspectRatio && panelSize.w && panelSize.h
    ? (panelSize.w / panelSize.h > aspectRatio
      ? { width: `${Math.round(panelSize.h * aspectRatio)}px`, height: `${panelSize.h}px` }
      : { width: `${panelSize.w}px`, height: `${Math.round(panelSize.w / aspectRatio)}px` })
    : { width: '100%', height: '100%' };

  // One flag owns both the script's entry and its camera cues, so the control is
  // a single two-state choice. Re-selecting the active side must not restart the
  // scene, which is why this takes a value rather than toggling.
  const setGameFlow = (next: boolean) => {
    if (next === followGameFlow) return;
    resetSceneVisualsRef.current();
    setFollowGameFlow(next);
    setSceneBeatIdx(0);
    setStoryIdx(0);
    pendingSectionRef.current = null;
    if (playbackContext === 'desire_view') resetInteractiveScene();
    setSceneRunKey((key) => key + 1);
  };
  // The rig's own `cam` bone is consulted in every mode, so the choice is
  // offered whenever there is a camera or a script to follow.
  const hasCameraControl = hasRigCamera || (mode === 'scene' && !!selectedScriptScene);

  return (
    // Theatre mode lifts the viewer out of the page — fixed to the window, with
    // the sidebar and everything around it out of the way. Escape leaves.
    <Box
      {...(theater
        ? {
          position: 'fixed' as const,
          inset: 0,
          zIndex: 1400,
          bg: 'black',
          p: 2,
          display: 'flex',
          flexDirection: 'column' as const,
        }
        : {})}>
      {error && <Text color="red.400" fontSize="sm" mb={1}>{error}</Text>}
      {/* The canvas carries the rendered rig and text only; every control lives
          in the sidebar beside it, which drops below the canvas on narrow
          screens. */}
      <Flex direction={{ base: 'column', lg: 'row' }} align="stretch" gap={2}
        h={theater ? '100%' : undefined}>
        <Box ref={panelRef} flex="1" minW={0} h={theater ? '100%' : height} bg="gray.900"
          borderRadius="md" overflow="hidden"
          position="relative" border="1px solid" borderColor="whiteAlpha.200">
          {/* Centred so a chosen aspect letterboxes rather than stretches. */}
          <Center position="absolute" inset={0}>
            <Box ref={hostRef} style={hostBox}
              opacity={loadState === 'ready' ? 1 : 0} />
          </Center>
          {loadState !== 'ready' && !error && !unavailable && (
            <Center position="absolute" inset={0} color="gray.500" pointerEvents="none"
              flexDirection="column" gap={2}>
              <Spinner />
              <Text fontSize="sm">{loadState === 'unpacking' ? 'unpacking…' : 'fetching…'}</Text>
            </Center>
          )}

          {/* Auto-mode status: what the state machine is doing, and what the last
              touch actually resolved to (region -> effect -> clip or bone). */}
          {autoMode && loadState === 'ready' && (
            <Box position="absolute" top={2} left={2} bg="blackAlpha.700" borderRadius="md"
              px={2} py={1} pointerEvents="none" maxW="calc(100% - 16px)" zIndex={2}>
              <Text fontSize="xs" color="gray.300" noOfLines={1}>
                {linearScene
                  ? `${sceneVariant} ${sceneBeatIdx + 1}/${linearScene.beats.length}${
                    sceneLoop ? '' : ' — click to advance'}`
                  : storySeq
                  ? `${storySeq.group} ${storyStep + 1}/${storySeq.clips.length} — click to advance`
                  : reaction
                    ? `reacting: ${animLabel(reaction)}`
                    : hasTouchBoxes
                      ? `click the figure${
                        mode === 'home' && jigglerCount
                          ? dragJiggle ? ' (drag jiggles)' : ` (${jigglerCount} jigglers)`
                          : ''}`
                      : 'no touch regions'}
              </Text>
              {touchInfo && (
                <Text fontSize="xs" color="gray.500" noOfLines={1} fontFamily="mono">
                  {touchInfo.box} → {EFFECT_LABEL[touchInfo.effect] ?? touchInfo.effect}
                  {touchInfo.detail ? ` (${touchInfo.detail})` : ''}
                </Text>
              )}
              {/* Live scenario state: the variables the script gates on, and what
                  the current section still needs before it advances. */}
              {section && (
                <Text fontSize="xs" color="pink.300" noOfLines={2} fontFamily="mono">
                  {section.label ?? 'start'}
                  {Object.keys(vars).length
                    ? '  ' + Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(' ')
                    : ''}
                  {section.gate ? `  gate: ${section.gate.when}` : ''}
                </Text>
              )}
            </Box>
          )}

          {subtitle && (
            <Box position="absolute" bottom={2} left={2} right={2} zIndex={2}
              pointerEvents="none" bg="blackAlpha.800" borderRadius="md" px={3} py={2}>
              <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.100"
                whiteSpace="pre-wrap">
                {subtitle.text}
              </Text>
            </Box>
          )}

          {unavailable && (
            <Center position="absolute" inset={0} px={4}>
              <Text fontSize="sm" color="gray.400" textAlign="center">{unavailable}</Text>
            </Center>
          )}

          {/* Theatre mode hides the sidebar, so its own exit lives on the
              canvas. Escape does the same thing. */}
          {theater && (
            <Box position="absolute" top={2} right={2} zIndex={3}>
              <ActionButton icon="close" label="Exit theatre"
                onClick={() => setViewer({ theater: false })} />
            </Box>
          )}
        </Box>

        {!theater && (
        <VStack w={{ base: '100%', lg: '260px', xl: '300px' }} flexShrink={0} align="stretch"
          spacing={3} h={{ base: 'auto', lg: height }} maxH={{ base: '60vh', lg: height }}
          overflowY="auto" bg="gray.900" borderRadius="md" border="1px solid"
          borderColor="whiteAlpha.200" p={2}>

          <ControlSection title="Playback">
            {loadState === 'ready' && (
              <ControlRow label="Mode">
                <OverlaySelect icon="auto" value={playbackContext}
                  options={playbackContextOptions}
                  onChange={(value) => selectPlaybackContext(value as PlaybackContext)}
                  minW="0" label="Playback context" />
              </ControlRow>
            )}
            {loadState === 'ready' && (
              <ControlRow label="Speed">
                <OverlaySelect icon="speed" value={String(speed)} options={SPEED_OPTIONS}
                  onChange={(v) => setSpeed(Number(v))} minW="0" label="Playback speed" />
              </ControlRow>
            )}
            {!autoMode && (
              <ToggleRow label="Loop clip" value={loop} onChange={setLoop} />
            )}
            {linearScene && (
              <ToggleRow label="Autoplay" value={sceneLoop} onChange={setSceneLoop} />
            )}
            <Wrap spacing={1} pt={1}>
              <WrapItem>
                <ActionButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'}
                  onClick={() => setPlaying(!playing)} />
              </WrapItem>
              <WrapItem>
                <ActionButton icon="reload" label="Restart" onClick={reloadPlayback} />
              </WrapItem>
              <WrapItem>
                <ActionButton icon="save" label="Save PNG" onClick={handleSave} />
              </WrapItem>
            </Wrap>
          </ControlSection>

          <ControlSection title="Animation">
            {mode === 'manual' && bodyOptions.length > 1 && (
              <ControlRow label="Body">
                <OverlaySelect icon="body" value={bodyAnim} options={bodyOptions}
                  onChange={setBodyAnim} minW="0" label="Body animation" />
              </ControlRow>
            )}
            {mode === 'home' && phases.length > 1 && (
              <ControlRow label="Variation">
                <OverlaySelect icon="home" value={String(phaseIdx)} minW="0"
                  label="Home variation"
                  options={phases.map((p, i) => ({
                    value: String(i),
                    label: `variation ${i + 1}`,
                    hint: animLabel(p.idle ?? p.active ?? '?'),
                  }))}
                  onChange={(v) => setPhaseIdx(Number(v))} />
              </ControlRow>
            )}
            {interactiveScene && interactiveScene.sections.length > 1 && (
              <ControlRow label="Stage">
                <OverlaySelect icon="body" value={String(sectionIdx)} minW="0"
                  label="Scene stage"
                  options={interactiveScene.sections.map((s, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${s.label ?? 'start'}`,
                    hint: animLabel(s.idle ?? '?'),
                  }))}
                  onChange={(v) => {
                    pendingSectionRef.current = null;
                    setSectionIdx(Number(v));
                  }} />
              </ControlRow>
            )}
            {linearScene && linearScene.beats.length > 1 && (
              <ControlRow label="Beat">
                <OverlaySelect icon="body" value={String(sceneBeatIdx)} minW="0"
                  label={sceneLoop ? 'Script beat — autoplay loops' : 'Script beat — click advances'}
                  options={linearScene.beats.map((beat, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${animLabel(beat.label)}`,
                  }))}
                  onChange={(value) => setSceneBeatIdx(Number(value))} />
              </ControlRow>
            )}
            {storySeq && storySeqs.length > 1 && (
              <ControlRow label="Sequence">
                <OverlaySelect icon="auto" value={String(storySeqIdx)} minW="0"
                  label="Story sequence"
                  options={storySeqs.map((s, i) => ({
                    value: String(i),
                    label: `${s.group} (${s.clips.length})`,
                  }))}
                  onChange={(v) => { setStorySeqIdx(Number(v)); setStoryIdx(0); }} />
              </ControlRow>
            )}
            {storySeq && (
              <ControlRow label="Step">
                <OverlaySelect icon="body" value={String(storyStep)} minW="0"
                  label="Story beat — clicking the figure advances"
                  options={storySeq.clips.map((c, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${animLabel(c)}`,
                  }))}
                  onChange={(v) => setStoryIdx(Number(v))} />
              </ControlRow>
            )}
            {/* Reaction clips no touch region maps to are only reachable here.
                The mapping is not encoded in the rig itself, so they are
                listed rather than silently unplayable. */}
            {interactiveScene && reactionClips.length > 0 && (
              <ControlRow label="Reaction">
                <OverlaySelect icon="touch" value="" minW="0" label="Play a reaction clip"
                  placeholder={`play one of ${reactionClips.length}`}
                  options={reactionClips.map((c) => ({
                    value: c,
                    label: animLabel(c),
                    hint: orphanReactions.includes(c) ? 'conditional — no plain region' : undefined,
                  }))}
                  onChange={(c) => {
                    if (!c) return;
                    setTouchInfo({ box: '(manual)', effect: 'reaction', detail: c });
                    autoDriveRef.current?.(c);
                  }} />
              </ControlRow>
            )}
            {faceOptions.length > 1 && (
              <ControlRow label="Face">
                <OverlaySelect icon="face" value={faceAnim} options={faceOptions}
                  onChange={setFaceAnim} minW="0" label="Face expression" />
              </ControlRow>
            )}
            {overlayOptions.length > 1 && (
              <ControlRow label="Overlay">
                <OverlaySelect icon="overlay" value={overlayAnim} options={overlayOptions}
                  onChange={setOverlayAnim} minW="0" label="Prop / effect overlay" />
              </ControlRow>
            )}
          </ControlSection>

          <ControlSection title="Camera">
            {loadState === 'ready' && hasCameraControl && (
              <ControlRow label="Camera">
                <SegmentedControl<'free' | 'game'> ariaLabel="Camera mode"
                  value={followGameFlow ? 'game' : 'free'}
                  options={[
                    { value: 'free', label: 'Free move', title: 'Pan and zoom by hand' },
                    {
                      value: 'game',
                      label: 'Follow game',
                      title: 'Play the script entry and follow the scripted camera',
                    },
                  ]}
                  onChange={(value) => setGameFlow(value === 'game')} />
              </ControlRow>
            )}
            {loadState === 'ready' && (
              <ControlRow label="Aspect">
                <OverlaySelect icon="aspect" value={canvasAspect} minW="0"
                  label="Canvas aspect ratio"
                  options={CANVAS_ASPECTS.map((a) => ({ value: a.value, label: a.label }))}
                  onChange={(v) => setViewer({ canvasAspect: v as CanvasAspect })} />
              </ControlRow>
            )}
            {loadState === 'ready' && (
              <ToggleRow label="Theatre" value={theater}
                onChange={(value) => setViewer({ theater: value })} />
            )}
          </ControlSection>

          <ControlSection title="Display">
            {((interactiveScene && hasTouchBoxes)
              || (mode === 'home' && (hasTouchBoxes || jigglerCount > 0))) && (
              <ToggleRow label="Touch zones" value={showBoxes} onChange={setShowBoxes} />
            )}
            {mode === 'home' && jigglerCount > 0 && (
              <ControlRow label="Drag">
                <SegmentedControl<'pan' | 'jiggle'> ariaLabel="Drag mode"
                  value={dragJiggle ? 'jiggle' : 'pan'}
                  options={[
                    { value: 'pan', label: 'Pan', icon: 'pan', title: 'Drag moves the canvas' },
                    {
                      value: 'jiggle',
                      label: 'Jiggle',
                      icon: 'jiggle',
                      title: 'Drag drives the jigglers; a tap always jiggles',
                    },
                  ]}
                  onChange={(value) => setDragJiggle(value === 'jiggle')} />
              </ControlRow>
            )}
            {layerItems.length > 0 && (
              <ToggleRow label="Layers" value={showLayers} onChange={setShowLayers} />
            )}
            {layout?.world?.bg && (
              <ToggleRow label="Background" value={showBg} onChange={setShowBg} />
            )}
          </ControlSection>

          {showLayers && layerItems.length > 0 && (
            <LayerPanel items={layerItems} hidden={hiddenSlots} onSet={setLayerHidden}
              onReset={() => setLayerHidden(Array.from(hiddenSlots), false)}
              onClose={() => setShowLayers(false)} />
          )}

          <ControlSection title="Audio">
            {hasVoice && (
              <ToggleRow label="Voice" value={voiceOn} onChange={setVoiceOn} />
            )}
            {(layout?.kind === 'desire' || layout?.kind === 'affection') && (
              <ToggleRow label="Scene audio" value={bgmOn} onChange={setBgmOn} />
            )}
          </ControlSection>

          <ControlSection title="Store">
            {stores.length > 1 && (
              <StoreStrip stores={stores} active={store}
                onSelect={(k) => { setStore(k); onStoreChange?.(k); }} />
            )}
          </ControlSection>
        </VStack>
        )}
      </Flex>
    </Box>
  );
}

// Shoelace area of a flat [x,y,...] polygon, used to pick the smallest (most
// specific) touch region when several overlap.
function polygonArea(verts: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < verts.length; i += 2) {
    const j = (i + 2) % verts.length;
    sum += verts[i] * verts[j + 1] - verts[j] * verts[i + 1];
  }
  return Math.abs(sum) / 2;
}

// Prefer the prefab's declared idle clip, else the first entry.
function pickDefault(names: string[], preferred?: string): string {
  if (preferred && names.includes(preferred)) return preferred;
  return names[0] ?? '';
}

// Dropdown entries filed under their animation group, so a rig with several
// namespaces (`lobby/`, `basic/`, `reaction/`) reads as sections rather than a
// flat list. A rig with one group gets no headings. The list is grouped by a
// stable sort, since `animations` arrives in skeleton order.
function groupedOptions(names: string[]): SelectOption[] {
  const groups = Array.from(new Set(names.map(animGroup)));
  const showGroup = groups.length > 1;
  const order = new Map(groups.map((g, i) => [g, i]));
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (showGroup
      ? (order.get(animGroup(a.n))! - order.get(animGroup(b.n))!) || (a.i - b.i)
      : a.i - b.i))
    .map(({ n }) => ({
      value: n,
      label: animLabel(n),
      group: showGroup && animGroup(n) ? animGroup(n) : undefined,
    }));
}
