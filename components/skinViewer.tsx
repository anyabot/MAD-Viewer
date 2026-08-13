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
import {
  EFFECT_LABEL, MAX_RECORD_DIM, REFERENCE_VIEW_WIDTH, TOUCH_INTERRUPT_DELAY,
  TRACK_BODY, TRACK_FACE, TRACK_OVERLAY, WIDE_CUTSCENE_STAGING_SKINS,
  animLabel, groupedOptions, isFaceAnim, pickDefault, polygonArea, speedOptions,
} from '@/components/skinViewer/constants';
import { text, useLang, useT } from '@/lib/i18n';
import { buildBackgrounds } from '@/components/skinViewer/background';
import { createEmoteBubble } from '@/components/skinViewer/emote';
import { createTouchOverlay } from '@/components/skinViewer/touchOverlay';
import {
  attachmentScales, saveStagePng, sourcePixelScale,
} from '@/components/skinViewer/exportPng';
import {
  canRecordCanvas, startCanvasVideo, type VideoRecording,
} from '@/components/skinViewer/exportVideo';
import { createFadeCover, createSceneClock } from '@/components/skinViewer/sceneClock';
import { JiggleField } from '@/components/skinViewer/jiggle';
import type { Vars } from '@/components/skinViewer/interactions';
import {
  cutsceneOffsetAt, rigCameraTransform,
  sceneBgmIds, sceneVoiceIds, scriptCameraTransform,
  type CameraBase, type CameraState, type SceneFadeState, type SceneTimelineRig,
} from '@/components/skinViewer/scenes';
import {
  createScenePlayer, type ScenePlayer, type SceneState,
} from '@/components/skinViewer/scenePlayer';
import type { Command } from '@/components/skinViewer/interpreter';
import { loadSceneAudio, loadSceneTimelines, loadVoice } from '@/lib/data';
import {
  interactionsFor, playVoice, prefetchVoice, setVoiceRate, stopVoice, voicePlaying,
  type VoiceIndex, type VoiceInteraction,
} from '@/lib/voice';
import { lobbyBodyAnimation, lobbyFaceAnimation } from '@/components/skinViewer/lobby';
import {
  emotePlacement, loadEmoticons, type EmoticonManifest, type EmotePlacement,
} from '@/lib/emoticons';
import { CANVAS_ASPECTS, useViewerStore, type CanvasAspect } from '@/lib/viewerStore';
import {
  buildViewerShareUrl, parseViewerShare, type ViewerShareState,
} from '@/lib/viewerShare';
import {
  playBgm, playSceneSound, prefetchSceneAudio, setSceneSoundRate, stopBgm, stopSceneSound,
  type SceneAudioIndex,
} from '@/lib/sceneAudio';
import {
  ActionButton, ControlRow, ControlSection, LayerPanel, OverlaySelect, SegmentedControl,
  StoreStrip, ToggleRow, type LayerItem, type SelectOption,
} from '@/components/skinViewer/chrome';

type SkinViewerProps = {
  skin: string;
  height?: string | number;
  /** Fewer than two entries hides the store strip. */
  stores?: StoreKey[];
  store?: StoreKey;
  onStoreChange?: (store: StoreKey) => void;
  unavailable?: string;
};

type PlaybackContext = 'free_play' | 'lobby' | 'desire_view' | 'desire_story'
  | 'affection_view' | 'affection_story' | 'story';

const DEBUG_SCENE = true;
const dbg = (...args: unknown[]) => {
  if (DEBUG_SCENE) console.log('[scene]', ...args);
};

// Spine's own name for the empty animation a retired track carries.
const EMPTY_ANIMATION = '<empty>';

export default function SkinViewer({
  skin, height = '70vh', stores = [], store: storeProp, onStoreChange, unavailable,
}: SkinViewerProps) {
  const t = useT();
  const lang = useLang();
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
  const clearHoldReservationsRef = useRef<() => void>(() => {});

  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'fetching' | 'unpacking' | 'ready' | 'error'>('fetching');
  // Bumped when a Pixi/Spine build finishes; anything driving the rig waits on it, not on `layout`.
  const [rigBuilt, setRigBuilt] = useState(0);
  const [hasRigCamera, setHasRigCamera] = useState(false);
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const [resetKey, setResetKey] = useState(0);
  const sharedRef = useRef<ViewerShareState | null>(null);
  const sharedSelectionsAppliedRef = useRef(false);
  const sharedStageAppliedRef = useRef(false);
  const [shareStatus, setShareStatus] = useState('');
  const [recording, setRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState('');
  const recordingRef = useRef<VideoRecording | null>(null);

  const [bodyAnim, setBodyAnim] = useState('');
  const [faceAnim, setFaceAnim] = useState('');
  const [overlayAnim, setOverlayAnim] = useState('');
  const [overlayAnims, setOverlayAnims] = useState<Set<string>>(() => new Set());
  const {
    loop, playing, speed, showBg, mode, sceneVariant, followGameFlow,
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
  const [timelineRig, setTimelineRig] = useState<SceneTimelineRig | null>(null);
  const [sceneRunKey, setSceneRunKey] = useState(0);
  // Drawn in Pixi so its alpha runs on the scene clock.
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

  const [voiceIndex, setVoiceIndex] = useState<VoiceIndex | null>(null);
  const setVoiceOn = (value: boolean) => setViewer({ voiceOn: value });
  const setBgmOn = (value: boolean) => setViewer({ bgmOn: value });
  const [sceneAudioIndex, setSceneAudioIndex] = useState<SceneAudioIndex | null>(null);
  const [subtitle, setSubtitle] = useState<{ text: string; author?: string } | null>(null);
  // Lobby lines are a rotating set per (character, family), as in game.
  const lobbyLineRef = useRef(0);
  // -Infinity so the first touch can never fall inside `TOUCH_INTERRUPT_DELAY`.
  const lobbyStagedAtRef = useRef(-Infinity);
  const [emoticons, setEmoticons] = useState<EmoticonManifest | null>(null);
  const emoticonsRef = useRef(emoticons); emoticonsRef.current = emoticons;
  const showEmoteRef = useRef<(placement: EmotePlacement) => void>(() => {});
  const hideEmoteRef = useRef<() => void>(() => {});

  const setShowLayers = (value: boolean) => setViewer({ showLayers: value });
  const [layerItems, setLayerItems] = useState<LayerItem[]>([]);
  const [hiddenSlots, setHiddenSlots] = useState<Set<string>>(() => new Set());
  const hiddenSlotsRef = useRef(hiddenSlots); hiddenSlotsRef.current = hiddenSlots;
  const layerHoverRef = useRef<HTMLDivElement>(null);

  const boxOverlayRef = useRef<any>(null);
  const boundsRef = useRef<any>(null);
  // Authored seconds on the scene clock, read per frame, so a speed change rescales what is pending.
  const sceneTimerRef = useRef<{
    set: (run: () => void, seconds: number) => number;
    clear: (handle: number | null) => void;
    now: () => number;
  }>({ set: () => 0, clear: () => {}, now: () => 0 });
  const boringTimerRef = useRef<number | null>(null);
  const lobbyFaceTimerRef = useRef<number | null>(null);
  const autoDriveRef = useRef<((trigger: 'idle' | 'boring' | string) => void) | null>(null);

  const phases = useMemo<ActorPhase[]>(
    () => actorPhases(layout?.actor, layout?.animations ?? []), [layout]);
  const phase = phases[Math.min(phaseIdx, Math.max(phases.length - 1, 0))]
    ?? { idle: null, boring: null, active: null };
  // NPC and scene-prop standings ship an idle and nothing to react with.
  const hasLobby = phases.some((p) => p.active)
    || (layout?.touch?.jigglers?.length ?? 0) > 0;

  const selectedScriptScene = sceneVariant === 'story' ? timelineRig?.story : timelineRig?.view;
  const scriptScene = mode === 'scene' ? selectedScriptScene ?? null : null;
  const scenePlayerRef = useRef<ScenePlayer | null>(null);
  const installScenePlayerRef = useRef<
    ((program: Command[]) => ScenePlayer) | null>(null);
  const [sceneState, setSceneState] = useState<SceneState | null>(null);
  const canReset = !!sceneState?.armed.some((a) => a.kind === 'reset');
  const sceneLabels = useMemo(
    () => scriptScene?.modelCommands
      .filter((c) => c.class === 'Label' && c.label)
      .map((c) => c.label as string) ?? [],
    [scriptScene]);

  // Pleasure rigs have no script: numbered clip groups, one clip per tap.
  const storySeqs = useMemo(
    () => (layout ? storySequences(layout, isFaceAnim) : []), [layout]);
  const [storySeqIdx, setStorySeqIdx] = useState(0);
  const [storyIdx, setStoryIdx] = useState(0);
  const storySeq = mode === 'scene' && !scriptScene
    ? storySeqs[Math.min(storySeqIdx, Math.max(storySeqs.length - 1, 0))] ?? null
    : null;
  const storyStep = storySeq ? storyIdx % storySeq.clips.length : 0;

  const resetSceneVisualsRef = useRef<() => void>(() => {});

  // The pan gesture otherwise swallows the in-game jiggler drag.
  const setDragJiggle = (value: boolean) => setViewer({ dragJiggle: value });

  useEffect(() => {
    const shared = parseViewerShare(window.location.search);
    if (!shared || shared.skin !== skin) return;
    sharedRef.current = shared;
    const patch: Partial<ReturnType<typeof useViewerStore.getState>> = {};
    if (shared.context === 'free_play') patch.mode = 'manual';
    else if (shared.context === 'lobby') patch.mode = 'home';
    else if (shared.context) {
      patch.mode = 'scene';
      patch.sceneVariant = shared.context.endsWith('_view') ? 'view' : 'story';
    }
    if (shared.speed != null) patch.speed = shared.speed;
    if (shared.background != null) patch.showBg = shared.background;
    if (shared.camera) patch.followGameFlow = shared.camera === 'game';
    if (shared.aspect) patch.canvasAspect = shared.aspect;
    setViewer(patch);
  }, [skin, setViewer]);

  // Mirrors, so the async build effect can apply current UI state to a fresh skeleton.
  const playingRef = useRef(playing); playingRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const loopRef = useRef(loop); loopRef.current = loop;
  const bodyAnimRef = useRef(bodyAnim); bodyAnimRef.current = bodyAnim;
  const faceAnimRef = useRef(faceAnim); faceAnimRef.current = faceAnim;
  const overlayAnimRef = useRef(overlayAnim); overlayAnimRef.current = overlayAnim;
  const showBgRef = useRef(showBg); showBgRef.current = showBg;
  const modeRef = useRef(mode); modeRef.current = mode;
  // Separates entering a scene from the effect re-firing for another dependency.
  const previousModeRef = useRef(mode);
  const autoModeRef = useRef(autoMode); autoModeRef.current = autoMode;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const showBoxesRef = useRef(showBoxes); showBoxesRef.current = showBoxes;
  const showLayersRef = useRef(showLayers); showLayersRef.current = showLayers;
  const storySeqRef = useRef(storySeq); storySeqRef.current = storySeq;
  const scriptSceneRef = useRef(scriptScene);
  scriptSceneRef.current = scriptScene;
  const followGameFlowRef = useRef(followGameFlow);
  followGameFlowRef.current = followGameFlow;
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

  // The game does not voice every line, so a line with no clip still shows.
  const sayRef = useRef<(line: { text: string; author?: string; voice?: string }) => void>(
    () => {});
  sayRef.current = (line) => {
    if (line.text) setSubtitle({ text: line.text, author: line.author });
    if (line.voice && voiceOnRef.current) {
      void playVoice(voiceIndexRef.current, line.voice);
    }
  };

  // Lobby lines come from the interaction table, not the scenario scripts; `Situation<N>` rows repeat per phase.
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
    lobbyStagedAtRef.current = sceneTimerRef.current.now();
    sayRef.current({ text: row.text ?? '', voice: row.voice });
    return row;
  };

  // A row without `ani` is a non-moving standing variation, not a fall-through to the generic active clip.
  const stageLobbyRef = useRef<(row: VoiceInteraction | null) => string | null>(() => null);
  stageLobbyRef.current = (row) => {
    if (!row) return null;
    const anims = layout?.animations ?? [];
    const spine = spineRef.current;
    sceneTimerRef.current.clear(lobbyFaceTimerRef.current);
    lobbyFaceTimerRef.current = null;
    if (spine) spine.state.setEmptyAnimation(TRACK_FACE, 0.15);
    // `@wait` is authored duration, so it is held on the scene clock.
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
    // Independent of the clip: a line with no `ani` still pops one.
    const emote = emotePlacement(emoticonsRef.current, row.emo, layout?.character);
    if (emote) showEmoteRef.current(emote);
    return lobbyBodyAnimation(row, phase, anims);
  };

  // Voice is jp-only and not every character is recorded.
  const hasVoice = useMemo(() => {
    if (!voiceIndex || !lobbyCode) return false;
    const owner = lobbyCode.toLowerCase();
    return Object.values(voiceIndex.clips).some((f) => f.split('/')[1] === owner);
  }, [voiceIndex, lobbyCode]);

  const idleClipRef = useRef<() => string | null>(() => null);
  idleClipRef.current = () => phaseRef.current.idle;
  // A clip's own name declares its track: `10_idle` is track 10, `lobby/idle` and `00_idle_normal` track 0.
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
        lobbyStagedAtRef.current = -Infinity;
        setTimelineRig(null);
        setSceneState(null);
        setFade({ color: 'black', opacity: 0, duration: 0 });
        setStorySeqIdx(0);
        setStoryIdx(0);
        setLayerItems([]);
        setHiddenSlots(new Set());
        const currentMode = useViewerStore.getState().mode;
        if (currentMode === 'scene' && l.kind === 'standing') {
          useViewerStore.getState().set({ mode: 'manual' });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoadState('error');
      });
    return () => { cancelled = true; revokeSkinUrls(archive); };
  }, [archive, resetKey, unavailable]);

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

  // Taken whole and up front: family and situation change while the rig stays loaded, and a fetch would land after the reaction.
  useEffect(() => {
    if (!voiceOn || !voiceIndex || !layout?.character) return;
    const ids = (voiceIndex.interactions[layout.character] ?? [])
      .map((row) => row.voice)
      .filter((id): id is string => !!id);
    prefetchVoice(voiceIndex, ids);
  }, [voiceOn, voiceIndex, layout]);

  useEffect(() => {
    if (!voiceOn || !voiceIndex || !timelineRig) return;
    prefetchVoice(voiceIndex, sceneVoiceIds(timelineRig));
  }, [voiceOn, voiceIndex, timelineRig]);

  // Animation sounds are staged by a clip already playing and BGM by a script beat, so neither can wait on a fetch.
  useEffect(() => {
    if (!bgmOn || !sceneAudioIndex || !layout) return;
    const rig = baseSkinKey(layout.skin);
    prefetchSceneAudio(
      sceneAudioIndex, Object.values(sceneAudioIndex.animations[rig] ?? {}));
  }, [bgmOn, sceneAudioIndex, layout]);

  useEffect(() => {
    if (!bgmOn || !sceneAudioIndex || !timelineRig) return;
    prefetchSceneAudio(sceneAudioIndex, sceneBgmIds(timelineRig));
  }, [bgmOn, sceneAudioIndex, timelineRig]);

  // `followGameFlow` owns the commands authored before the first label, so with it off the index starts at that label.
  useEffect(() => {
    const install = installScenePlayerRef.current;
    if (!rigBuilt || !scriptScene || !install) {
      scenePlayerRef.current?.stop();
      scenePlayerRef.current = null;
      setSceneState(null);
      return;
    }
    dbg('scene start', {
      script: scriptScene.script,
      commands: scriptScene.modelCommands.length,
      skipEntry: !followGameFlow,
    });
    const player = install(scriptScene.modelCommands);
    scenePlayerRef.current = player;
    player.start(!followGameFlow);
    return () => {
      player.stop();
      if (scenePlayerRef.current === player) scenePlayerRef.current = null;
    };
  }, [scriptScene, rigBuilt, followGameFlow, sceneRunKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    let detachLayerHover = () => {};
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
        RegionAttachment, MeshAttachment, SkeletonBounds,
      } = await import('@esotericsoftware/spine-pixi-v8') as any;

      const files = filesRef.current;
      if (!files || !layout.atlas || !layout.skel) return;

      // `pma` decides whether the page's bytes are already premultiplied.
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

      // The Unity SkeletonDataAsset scale, applied at parse time as the game does.
      const binary = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
      binary.scale = layout.world?.skeleton?.dataScale ?? 1;
      const skeletonData = binary.readSkeletonData(await readBytes(files, layout.skel));
      if (destroyed) return;

      app = new PIXI.Application();
      // `autoDensity` pins the CSS size, so recording can raise the backing store alone.
      await app.init({
        backgroundAlpha: 0, antialias: true, autoDensity: true, resizeTo: hostRef.current!,
      });
      appReady = true;
      if (destroyed) { app.destroy(true); return; }
      appRef.current = app;
      hostRef.current!.replaceChildren(app.canvas);

      const W = layout.world ?? {};
      const sk = W.skeleton ?? { x: 0, y: 0, scale: 1, dataScale: 1 };
      // One space, Unity world units: `dataScale` is baked into the skeleton, so only the prefab transform scale applies here.
      const prefabScale = sk.scale || 1;

      const root = new PIXI.Container();
      root.sortableChildren = true;
      // `view` carries the `cam` bone alone: fit, pan/zoom and script camera write `root`, device staging writes `scene`.
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

      const spine = new Spine({ skeletonData });
      spineRef.current = spine;
      spine.position.set(sk.x, -sk.y);
      spine.scale.set(prefabScale);
      spine.zIndex = 0;
      scene.addChild(spine);
      app.stage.addChild(root);
      rootRef.current = root;

      // Built after the rig: the anchor bones the rooms hang on must exist.
      const backgrounds = await buildBackgrounds({
        PIXI,
        archive,
        files,
        scene,
        spine,
        world: W,
        showBg: () => showBgRef.current,
        isDestroyed: () => destroyed,
      });
      if (!backgrounds) { if (appReady) app?.destroy(true); return; }
      const {
        switchBackground, changeBackground,
        applyTransforms: applyBackgroundTransforms,
      } = backgrounds;
      bgSpritesRef.current = backgrounds.sprites;
      syncBackgroundVisibilityRef.current = backgrounds.applyVisibility;

      const clock = createSceneClock(
        () => (playingRef.current ? Math.max(speedRef.current, 0.01) : 0));
      const sceneNow = clock.now;
      const scheduleScene = clock.schedule;
      const cancelScene = clock.cancel;
      sceneTimerRef.current = { set: clock.schedule, clear: clock.cancel, now: clock.now };
      const fadeCover = createFadeCover(PIXI, app, clock);
      applyFadeRef.current = fadeCover.apply;
      // A rebuild inherits whatever cover is up, but never re-runs its fade.
      applyFadeRef.current({ ...fadeRef.current, duration: 0 });
      // Ordered so the cover advances against the scene time this frame carries.
      app.ticker.add(() => clock.tick(app.ticker.deltaMS));
      app.ticker.add(fadeCover.tick);
      app.ticker.add(() => scenePlayerRef.current?.tick());

      // The view is the inverse of the `cam` bone's pose, whose setup pose is not identity on every rig, so measure before animating.
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
      // A script camera offset is in the drawer's units: 100 to a world unit against a 1920-wide target.
      const scriptOffsetUnit = REFERENCE_VIEW_WIDTH * (sk.dataScale ?? 1)
        * prefabScale * (camSetup?.scale ?? 1) / 19.2;

      const animSet = new Set(layout.animations ?? []);

      // Overlay clips are measured from the parsed skeleton, not named.
      const overlaySet = overlayAnimations(skeletonData.animations, isFaceAnim);
      setOverlayAnims(overlaySet);

      // `Hold` reserves a track: the next animation on it takes `holdPrevious` and keeps the previous pose. Consumed once.
      const holdReservedTracks = new Set<number>();
      clearHoldReservationsRef.current = () => holdReservedTracks.clear();
      const consumeHold = (track: number, entry: any, reserve?: boolean) => {
        entry.holdPrevious = holdReservedTracks.delete(track);
        if (reserve) holdReservedTracks.add(track);
        return entry;
      };
      // Re-setting a loop already current on its track restarts it from frame 0.
      const driveAnimation = (
        track: number, clip: string, loop: boolean, reserve?: boolean,
      ) => {
        const current = spine.state.getCurrent(track);
        if (loop && current?.animation?.name === clip) {
          if (reserve) holdReservedTracks.add(track);
          return current;
        }
        return consumeHold(track, spine.state.setAnimation(track, clip, loop), reserve);
      };
      const queueAnimation = (
        track: number, clip: string, loop: boolean, reserve?: boolean,
      ) => consumeHold(track, spine.state.addAnimation(track, clip, loop, 0), reserve);
      // An empty animation mixes the track out; clearing it drops the pose outright.
      const retireTrack = (track: number) => {
        holdReservedTracks.delete(track);
        spine.state.setEmptyAnimation(track, 0);
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
      let sceneDragTapUntil = 0;

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

      const triangleContains = (
        x: number, y: number,
        ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
      ) => {
        const ab = (x - bx) * (ay - by) - (ax - bx) * (y - by);
        const bc = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
        const ca = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
        return !((ab < 0 || bc < 0 || ca < 0) && (ab > 0 || bc > 0 || ca > 0));
      };
      const layerAt = (x: number, y: number) => {
        const drawOrder = spine.skeleton.drawOrder ?? spine.skeleton.slots;
        for (let slotIndex = drawOrder.length - 1; slotIndex >= 0; slotIndex--) {
          const slot = drawOrder[slotIndex];
          if (!slot.bone.active || hiddenSlotsRef.current.has(slot.data.name)
            || slot.color.a * spine.skeleton.color.a <= 1e-3) continue;
          const attachment = slot.getAttachment();
          let vertices: Float32Array;
          let triangles: ArrayLike<number>;
          if (attachment instanceof RegionAttachment) {
            if ((attachment.color?.a ?? 1) <= 1e-3) continue;
            vertices = new Float32Array(8);
            attachment.computeWorldVertices(slot, vertices, 0, 2);
            triangles = [0, 1, 2, 0, 2, 3];
          } else if (attachment instanceof MeshAttachment) {
            if ((attachment.color?.a ?? 1) <= 1e-3) continue;
            vertices = new Float32Array(attachment.worldVerticesLength);
            attachment.computeWorldVertices(
              slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
            triangles = attachment.triangles;
          } else {
            continue;
          }
          for (let i = 0; i < triangles.length; i += 3) {
            const a = triangles[i] * 2;
            const b = triangles[i + 1] * 2;
            const c = triangles[i + 2] * 2;
            if (triangleContains(
              x, y,
              vertices[a], vertices[a + 1],
              vertices[b], vertices[b + 1],
              vertices[c], vertices[c + 1],
            )) return { slot: slot.data.name, attachment: attachment.name };
          }
        }
        return null;
      };
      const hideLayerHover = () => {
        if (layerHoverRef.current) layerHoverRef.current.style.display = 'none';
      };
      const moveLayerHover = (event: PointerEvent) => {
        const tooltip = layerHoverRef.current;
        const panel = panelRef.current;
        if (!tooltip || !panel || !showLayersRef.current) {
          hideLayerHover();
          return;
        }
        const canvasRect = app.canvas.getBoundingClientRect();
        if (!canvasRect.width || !canvasRect.height) return;
        const local = spine.toLocal({
          x: (event.clientX - canvasRect.left) * app.screen.width / canvasRect.width,
          y: (event.clientY - canvasRect.top) * app.screen.height / canvasRect.height,
        });
        const layer = layerAt(local.x, local.y);
        if (!layer) {
          hideLayerHover();
          return;
        }
        const panelRect = panel.getBoundingClientRect();
        const x = event.clientX - panelRect.left;
        const y = Math.min(event.clientY - panelRect.top + 12, panelRect.height - 52);
        tooltip.textContent = layer.attachment === layer.slot
          ? layer.slot
          : `${layer.slot}\n${layer.attachment}`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${Math.max(8, y)}px`;
        tooltip.style.transform = x > panelRect.width / 2
          ? 'translateX(calc(-100% - 12px))'
          : 'translateX(12px)';
      };
      app.canvas.addEventListener('pointermove', moveLayerHover);
      app.canvas.addEventListener('pointerleave', hideLayerHover);
      detachLayerHover = () => {
        app.canvas.removeEventListener('pointermove', moveLayerHover);
        app.canvas.removeEventListener('pointerleave', hideLayerHover);
        hideLayerHover();
      };

      const slotByName = new Map<string, any>(
        spine.skeleton.slots.map((s: any) => [s.data.name, s]));
      let lastStep = performance.now();
      spine.beforeUpdateWorldTransforms = () => {
        const now = performance.now();
        const dt = Math.min((now - lastStep) / 1000, 0.1);
        lastStep = now;
        // A held drag poses the bone directly and must survive a pause; only the spring is tied to playback.
        if (modeRef.current === 'home') {
          if (spine.state.timeScale !== 0) jiggle.step(dt * spine.state.timeScale);
          jiggle.apply();
        }
        for (const name of hiddenSlotsRef.current) {
          const slot = slotByName.get(name);
          if (slot) slot.color.a = 0;
        }
      };
      // The bone's local pose must not keep the offset, or it compounds on bones no animation keys.
      spine.afterUpdateWorldTransforms = () => jiggle.restore();

      // --- Lobby / Free play drive --------------------------------------------
      // Scene playback does not come through here: a script owns its animations.
      const clearBoring = () => {
        cancelScene(boringTimerRef.current);
        boringTimerRef.current = null;
      };
      const armBoring = () => {
        clearBoring();
        if (!autoModeRef.current || modeRef.current === 'scene') return;
        const p = phaseRef.current;
        if (!p.boring || !p.idle) return;
        boringTimerRef.current = scheduleScene(() => {
          // Armed when a reaction starts, so boredom can come due mid-reaction.
          if (!playingRef.current || reacting()) { armBoring(); return; }
          const row = modeRef.current === 'home' ? speakLobbyRef.current('Onlook') : null;
          const authored = stageLobbyRef.current(row);
          if (!row || authored) autoDriveRef.current?.(authored ?? 'boring');
          else armBoring();
        }, BORING_DELAY_MS / 1000);
      };
      const reacting = () => {
        for (const cur of spine.state.tracks ?? []) {
          if (cur && !cur.loop && !cur.isComplete()) return true;
        }
        return false;
      };
      autoDriveRef.current = (trigger) => {
        const idle = idleClipRef.current();
        if (!idle) return;
        const bodyTrack = bodyTrackRef.current();
        clearBoring();
        if (trigger === 'idle') {
          driveAnimation(bodyTrack, idle, true);
          setReaction(null);
          armBoring();
          return;
        }
        const clip = trigger === 'boring' ? phaseRef.current.boring : trigger;
        if (!clip || !animSet.has(clip)) { armBoring(); return; }
        const track = spineTrack(clip);
        const entry = driveAnimation(track, clip, false);
        requestSceneSoundRef.current(baseSkinKey(skin), clip);
        // A layered clip is cut in: mixing blends its slot from alpha 1 and flashes a stamp clip's finished art.
        entry.mixDuration = track === bodyTrack ? 0.15 : 0;
        if (track === bodyTrack) queueAnimation(bodyTrack, idle, true);
        setReaction(clip);
        armBoring();
      };

      // --- script playback ------------------------------------------------
      // The actor's return target: a non-looping clip finishing here sets the idle on this track again.
      let sceneIdle: { clip: string; track: number } | null = null;
      // Not the Lobby phase's track — a desire scene drives 10, the lobby widget 0. The first clip played names it until an idle does.
      let sceneBodyTrack: number | null = null;
      const sceneTrack = (clip: string, track: number | null) => (
        track ?? spineTrack(clip));
      const sceneMix = (track: number) => (track === sceneBodyTrack ? 0.15 : 0);

      installScenePlayerRef.current = (program) => {
        sceneIdle = null;
        sceneBodyTrack = null;
        return createScenePlayer(program, {
          now: sceneNow,
          schedule: scheduleScene,
          cancel: cancelScene,
          remaining: (track) => {
            const current = spine.state.getCurrent(track ?? bodyTrackRef.current());
            if (!current || current.loop) return 0;
            const end = current.animationEnd ?? current.animation?.duration ?? 0;
            return Math.max(0, end - (current.trackTime ?? 0));
          },
          remainingReaction: () => {
            let longest = 0;
            for (const cur of spine.state.tracks ?? []) {
              if (!cur || cur.loop || cur.animation?.name === EMPTY_ANIMATION) continue;
              const end = cur.animationEnd ?? cur.animation?.duration ?? 0;
              longest = Math.max(longest, end - (cur.trackTime ?? 0));
            }
            return Math.max(0, longest);
          },
          playAnimation: (clip, loop, track, hold) => {
            if (!animSet.has(clip)) return;
            const index = sceneTrack(clip, track);
            sceneBodyTrack ??= index;
            dbg('play', { clip, track: index, loop, hold });
            const entry = driveAnimation(index, clip, loop, hold);
            entry.mixDuration = sceneMix(index);
            requestSceneSoundRef.current(baseSkinKey(skin), clip);
            if (!loop) setReaction(clip);
          },
          setIdle: (clip, track) => {
            if (!animSet.has(clip)) return;
            const index = sceneTrack(clip, track);
            sceneIdle = { clip, track: index };
            sceneBodyTrack = index;
            dbg('idle', { clip, track: index });
            driveAnimation(index, clip, true).mixDuration = sceneMix(index);
            setReaction(null);
          },
          clearAnimation: (clip) => {
            // Its final frame still poses the figure until something takes that track.
            const current = (spine.state.tracks ?? []).find(
              (t: any) => t?.animation?.name === clip);
            if (current) retireTrack(current.trackIndex);
          },
          clearTrack: (track) => retireTrack(track ?? bodyTrackRef.current()),
          resetActor: () => {
            // Clearing tracks alone leaves every slot colour and attachment where the last clip left it.
            spine.state.clearTracks();
            spine.skeleton.setToSetupPose();
            clearHoldReservationsRef.current();
            sceneIdle = null;
            setReaction(null);
          },
          say: (text, author, voice) => {
            sayRef.current({ text, author: author ?? undefined, voice: voice ?? undefined });
          },
          voice: (clip) => {
            if (voiceOnRef.current) void playVoice(voiceIndexRef.current, clip);
          },
          subtitle: (visible) => { if (!visible) setSubtitle(null); },
          background: (appearance, visible) => {
            dbg('background', { appearance, visible });
          },
          fade: (color, opacity, duration) => {
            dbg('fade', { color, opacity, duration });
            // A fade to transparent keeps the current colour: repainting it would flash the authored colour at full opacity.
            setFade((current) => ({
              color: opacity <= 0 ? current.color : color,
              opacity,
              duration,
            }));
          },
          camera: (offset, zoom, duration) => applyCamera(offset, zoom, duration),
          bgm: (clip, intro, fade) => {
            requestBgmRef.current(clip, intro ?? undefined, fade);
          },
          stopBgm: (fade) => {
            pendingBgmRef.current = null;
            desiredBgmRef.current = null;
            stopBgm(fade);
          },
          ending: () => setReaction(null),
          onState: (state) => {
            dbg('park', {
              label: state.label,
              park: state.park,
              armed: state.armed.map(
                (a) => (a.kind === 'touch' || a.kind === 'drag' ? a.box : a.kind)),
              vars: { ...state.vars },
            });
            setSceneState(state);
          },
        });
      };

      const resumeSceneIdle = (track: number) => {
        if (!sceneIdle || track !== sceneIdle.track) return;
        dbg('resume idle', { clip: sceneIdle.clip, track });
        driveAnimation(sceneIdle.track, sceneIdle.clip, true)
          .mixDuration = sceneMix(sceneIdle.track);
        setReaction(null);
      };

      // Bounding-box attachments are the touch regions; what a region does comes from the exporter's table, never its name.
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
          if (performance.now() <= sceneDragTapUntil) {
            sceneDragTapUntil = 0;
            return;
          }
          // The DOM pointer-down handler owns Lobby jiggle, so the matching Pixi tap must not kick a second time.
          if (modeRef.current === 'home' && performance.now() <= jiggleTapUntil) {
            jiggleTapUntil = 0;
            return;
          }
          const local = spine.toLocal(e.global);
          bounds.update(spine.skeleton, true);
          // `local` is already y-down; overlapping desire regions resolve by phase and smallest match, or by the armed boxes under a script.
          const player = scenePlayerRef.current;
          const armed = player?.armedBoxes();
          let hit: TouchRegion | null = null;
          let hitBox: string | null = null;
          let bestArea = Infinity;
          // Tracked separately so an unbound box can be reported without outranking a bound one.
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
            const bound = armed ? armed.has(name) : false;
            if (!armed && (!region || !regionLiveInPhase(region, phaseRef.current))) continue;
            if (!polyList[i] || !bounds.containsPointPolygon(polyList[i], local.x, local.y)) continue;
            const area = polygonArea(polyList[i]);
            if (armed && !bound) {
              if (area < looseArea) { looseArea = area; looseRegion = region ?? null; looseBox = name; }
              continue;
            }
            if (area < bestArea) { bestArea = area; hit = region ?? null; hitBox = name; }
          }

          // Under a script an unbound box is inert and must not fall through to the phase's `active` clip.
          if (player) {
            if (player.advance()) return;
            dbg('touch', { box: hitBox, vars: { ...(player.machine.vars) } });
            // An onlook is bound to no box, so a tap that reached none still goes to the player.
            if (!player.touch(hitBox)) {
              if (hitBox) {
                setTouchInfo({ box: hitBox, effect: 'inert', detail: 'no armed trigger here' });
              } else {
                setTouchInfo(looseBox
                  ? {
                    box: looseBox,
                    effect: looseRegion?.effect === 'physics' ? 'physics' : 'inert',
                    detail: looseRegion?.effect === 'physics'
                      ? (looseRegion.bone ?? '')
                      : 'not armed here',
                  }
                  : { box: '(no region)', effect: 'inert', detail: 'nothing here' });
              }
              return;
            }
            setTouchInfo({
              box: hitBox ?? '(no region)',
              effect: 'reaction',
              detail: [
                player.machine.label ?? 'start',
                Object.entries(player.machine.vars).map(([k, v]) => `${k}=${v}`).join(' '),
              ].filter(Boolean).join('  '),
            });
            return;
          }

          // Fallback linear playback for rigs without a script.
          if (modeRef.current === 'scene' && storySeqRef.current) {
            setStoryIdx((i) => i + 1);
            return;
          }

          // The touched box selects its jiggler and the direction from the live bone toward the touch point.
          if (modeRef.current === 'home') {
            const box = hitBox ?? hit?.box ?? '';
            const jiggleHit = box ? jiggle.pokeToward(box, local.x, local.y) : null;
            if (jiggleHit) {
              setTouchInfo({ box, effect: 'jiggle', detail: jiggleHit.bone });
              armBoring();
              return;
            }
            // Only a real bounding box is an input surface.
            if (!box) return;
            // A touch restages the line from the top, unless it arrives inside `TOUCH_INTERRUPT_DELAY` of the staged one.
            const staged = sceneNow() - lobbyStagedAtRef.current;
            const busy = reacting() || voicePlaying() || lobbyFaceTimerRef.current !== null;
            if (busy && staged < TOUCH_INTERRUPT_DELAY) return;
            stopVoice();
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
              // A line with no `@ani` is a real reaction that keeps the idle running.
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

          // A `gyro_*` bone is sprung by Unity-side physics with no Spine equivalent.
          if (effect === 'physics') {
            setTouchInfo({ box: hit?.box ?? '', effect, detail: bone ?? '' });
            armBoring();
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
        event: (entry: any, event: any) => {
          const name = event?.data?.name;
          if (name !== 'bg_on' && name !== 'bg_off' && name !== 'bg_change') return;
          dbg('bg event', {
            name,
            from: entry?.animation?.name,
            index: event.intValue ?? 0,
            sprite: event.stringValue ?? '',
          });
          if (name === 'bg_change') {
            changeBackground(event.intValue ?? 0, event.stringValue ?? '');
          } else {
            switchBackground(name, event.intValue ?? 0);
          }
        },
        complete: (entry: any) => {
          // A looping idle completes every cycle, which would re-arm boredom forever.
          if (!autoModeRef.current || entry?.loop) return;
          const track = entry?.trackIndex;
          const done = entry?.animation?.name;
          // A retired track completes like any other entry, and is not a clip.
          if (done === EMPTY_ANIMATION) return;
          dbg('complete', { clip: done, track });
          // The return to idle belongs to the entry that ends the chain.
          if (entry?.next) return;
          if (scenePlayerRef.current) {
            resumeSceneIdle(track);
            return;
          }
          // A completed clip's track is left alone: its pose stays applied.
          if (track !== bodyTrackRef.current()) {
            setReaction((r) => (r === done ? null : r));
            return;
          }
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

      if (hasBoxes) {
        const overlay = createTouchOverlay({
          PIXI,
          scene,
          spine,
          bounds,
          regionByBox,
          visible: showBoxesRef.current,
          // Exactly the tests the input paths apply; jiggle is Lobby-only, so its boxes are too.
          isLive: (name, region, attachment) => {
            if (!attachmentIsVisible(attachment)) return false;
            const player = scenePlayerRef.current;
            if (player) return player.armedBoxes().has(name);
            if (region && !regionLiveInPhase(region, phaseRef.current)) return false;
            if (jiggle.hasBox(name)) return modeRef.current === 'home';
            return true;
          },
        });
        boxOverlayRef.current = overlay.graphics;
        app.ticker.add(overlay.tick);
      }

      const emote = createEmoteBubble({
        PIXI, scene, spine, now: sceneNow, isDestroyed: () => destroyed,
      });
      const emoteSprite = emote.sprite;
      showEmoteRef.current = emote.show;
      hideEmoteRef.current = emote.hide;
      app.ticker.add(emote.tick);

      // Pivot for the rig camera, in `view`-local units. Measured by `fit()`.
      let rigCameraCentre = { x: 0, y: 0 };
      const resetRigCamera = () => {
        view.pivot.set(0, 0);
        view.position.set(0, 0);
        view.scale.set(1);
        view.rotation = 0;
      };
      // Spine runs at a higher ticker priority, so the `cam` bone's world transform is already current here.
      const applyRigCamera = () => {
        if (!camBone || !camSetup) return;
        if (!followGameFlowRef.current) {
          resetRigCamera();
          return;
        }
        // Skeleton to `view` units: rotation is 0 and both scales uniform, so only the scale factors and staging rotation apply.
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
        // Measured in the authored base space, device staging applied to the scene afterwards so room, actor and overlay move as one.
        scene.position.set(0, 0);
        scene.scale.set(1);
        scene.rotation = 0;
        // Measuring on a zoomed-in enter frame would re-frame the composition around whatever corner the camera is on.
        resetRigCamera();
        // The room is part of what is measured, so it must be on its bone first.
        applyBackgroundTransforms();
        // Boxes can exceed the art and the emote hangs above the head, so either would re-frame the character.
        const boxOverlay = boxOverlayRef.current;
        const boxesVisible = boxOverlay?.visible ?? false;
        const emoteVisible = emoteSprite.visible;
        if (boxOverlay) boxOverlay.visible = false;
        emoteSprite.visible = false;
        const b = root.getLocalBounds();
        if (boxOverlay) boxOverlay.visible = boxesVisible;
        emoteSprite.visible = emoteVisible;
        if (!b.width || !b.height) return;
        // The reference view width around the bone, scaled by setup and staging scale; the height is that width over the drawn aspect.
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
        // `view` is at identity here, so the frame's centre is also the pivot.
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
        // The staging scale is a camera zoom, already in the frame width, so it must not scale the scene as well.
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

      // `Zoom` divides by `1 - zoom`.
      function applyCamera(
        offset: (number | null)[] | null, zoom: number | null, duration: number,
      ) {
        if (!followGameFlowRef.current) return;
        if (offset) {
          if (offset[0] !== null && offset[0] !== undefined) {
            cameraState.offsetX = offset[0] * scriptOffsetUnit;
          }
          if (offset[1] !== null && offset[1] !== undefined) {
            cameraState.offsetY = offset[1] * scriptOffsetUnit;
          }
        }
        if (zoom !== null) cameraState.zoom = zoom;
        const target = scriptCameraTransform(cameraBase, cameraState);
        if (duration <= 0) {
          cameraTween = null;
          root.position.set(target.x, target.y);
          root.scale.set(target.scale);
          return;
        }
        cameraTween = {
          from: { x: root.position.x, y: root.position.y, scale: root.scale.x },
          to: target,
          started: sceneNow(),
          duration,
        };
      }
      app.ticker.add(() => {
        if (!cameraTween) return;
        const t = Math.min(1, (sceneNow() - cameraTween.started) / cameraTween.duration);
        const x = cameraTween.from.x + (cameraTween.to.x - cameraTween.from.x) * t;
        const y = cameraTween.from.y + (cameraTween.to.y - cameraTween.from.y) * t;
        const scale = cameraTween.from.scale
          + (cameraTween.to.scale - cameraTween.from.scale) * t;
        root.position.set(x, y);
        root.scale.set(scale);
        if (t >= 1) cameraTween = null;
      });

      resetSceneVisualsRef.current = () => {
        cameraState.offsetX = 0;
        cameraState.offsetY = 0;
        cameraState.zoom = 0;
        cameraTween = null;
        backgrounds.reset();
        setFade({ color: 'black', opacity: 0, duration: 0 });
        fit();
      };

      // Measured in the current pose, so a saved PNG comes out at native resolution.
      spinePixelScaleRef.current = () => sourcePixelScale(
        attachmentScales(spine, RegionAttachment, MeshAttachment), bgSpritesRef.current);

      app.renderer.on('resize', fit);
      // Following the game's flow hands framing to the game, so it refuses pan and zoom.
      const manualCameraAllowed = () => !(followGameFlowRef.current
        && (camBone || scriptSceneRef.current));
      // Pointer-down arrives before pan/zoom turns the gesture into a drag, so the jiggle kicks immediately.
      attachPanZoom(app.canvas as HTMLCanvasElement, root, (cx, cy) => {
        const local = spine.toLocal({ x: cx, y: cy });
        bounds.update(spine.skeleton, true);
        const boxList = bounds.boundingBoxes ?? [];
        const polyList = bounds.polygons ?? [];

        if (modeRef.current === 'scene') {
          const player = scenePlayerRef.current;
          const liveEntries = player?.armed() ?? [];
          const touchBoxes = new Set(liveEntries
            .filter((entry) => entry.kind === 'touch')
            .map((entry) => entry.box));
          const dragBoxes = new Set(liveEntries
            .filter((entry) => entry.kind === 'drag')
            .map((entry) => entry.box));
          // A newly armed touch target, such as CH0043's feather, owns an
          // overlapping point instead of letting a broader drag zone swallow it.
          for (let i = 0; i < polyList.length; i++) {
            const name: string = boxList[i]?.name ?? '';
            if (!name || !touchBoxes.has(name)) continue;
            if (!attachmentIsVisible(boxList[i])) continue;
            if (polyList[i] && bounds.containsPointPolygon(polyList[i], local.x, local.y)) {
              return null;
            }
          }
          let box: string | null = null;
          let bestArea = Infinity;
          for (let i = 0; i < polyList.length; i++) {
            const name: string = boxList[i]?.name ?? '';
            if (!name || !dragBoxes.has(name)) continue;
            if (!attachmentIsVisible(boxList[i])) continue;
            if (!polyList[i] || !bounds.containsPointPolygon(polyList[i], local.x, local.y)) continue;
            const area = polygonArea(polyList[i]);
            if (area < bestArea) { bestArea = area; box = name; }
          }
          if (!box || !player) return null;
          const held = box;
          const started = performance.now();
          let last = local;
          let distance = 0;
          return {
            move: (mx: number, my: number) => {
              const point = spine.toLocal({ x: mx, y: my });
              distance += Math.hypot(point.x - last.x, point.y - last.y);
              last = point;
            },
            end: () => {
              sceneDragTapUntil = performance.now() + 1000;
              const seconds = (performance.now() - started) / 1000;
              if (!player.drag(held, distance, seconds)) return;
              setTouchInfo({
                box: held,
                effect: 'reaction',
                detail: `${player.machine.label ?? 'start'}  drag ${distance.toFixed(1)}`,
              });
            },
          };
        }

        if (modeRef.current !== 'home') return null;
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
      }, manualCameraAllowed, manualCameraAllowed);

      setRigBuilt((built) => built + 1);
    })().catch((e) => !destroyed && setError(String(e)));

    return () => {
      destroyed = true;
      // The scene clock dies with the app, so every handle on it goes too.
      sceneTimerRef.current = { set: () => 0, clear: () => {}, now: () => 0 };
      scenePlayerRef.current?.stop();
      scenePlayerRef.current = null;
      installScenePlayerRef.current = null;
      boringTimerRef.current = null;
      lobbyFaceTimerRef.current = null;
      applyFadeRef.current = () => {};
      autoDriveRef.current = null;
      clearHoldReservationsRef.current = () => {};
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
      resetSceneVisualsRef.current = () => {};
      detachLayerHover();
      // Destroying before init() resolves throws.
      if (app && appReady) app.destroy(true);
    };
  }, [layout, skin, archive]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- live state -> skeleton ---------------------------------------------
  // One clock for rig, voice and animation sounds, so a reaction played at 2x still lines up.
  useEffect(() => {
    const spine = spineRef.current;
    if (spine) spine.state.timeScale = playing ? speed : 0;
    setVoiceRate(speed);
    setSceneSoundRate(speed);
  }, [playing, speed]);

  // The playback context survives a skin change, so a rig without a lobby hands the mode back.
  useEffect(() => {
    if (layout && mode === 'home' && !hasLobby) setMode('manual');
  }, [layout, mode, hasLobby]); // eslint-disable-line react-hooks/exhaustive-deps

  // In auto mode the state machine owns track 0 and would overwrite a manual pick.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine || autoMode || !bodyAnim) return;
    // Clear the previous clip's pose from bones this one does not key.
    spine.skeleton.setToSetupPose();
    spine.state.setAnimation(TRACK_BODY, bodyAnim, loop);
  }, [bodyAnim, loop, autoMode]);

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

  useEffect(() => {
    const spine = spineRef.current;
    if (!spine) return;
    if (mode !== 'home') jiggleRef.current?.reset();
    clearHoldReservationsRef.current();
    // Each mode owns different tracks — a desire scene 10, Free play and Lobby 0 — so outgoing clips would play over the incoming mode.
    spine.state.clearTracks();
    spine.skeleton.setToSetupPose();
    setTouchInfo(null);
    setSubtitle(null);
    stopVoice();
    sceneTimerRef.current.clear(lobbyFaceTimerRef.current);
    lobbyFaceTimerRef.current = null;
    lobbyLineRef.current = 0;
    lobbyStagedAtRef.current = -Infinity;
    hideEmoteRef.current();
    // Declared after the scene player's effect, whose teardown has just wiped the clips it set.
    const cameFrom = previousModeRef.current;
    previousModeRef.current = mode;
    if (mode === 'scene' && cameFrom !== mode) setSceneRunKey((key) => key + 1);
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

  // The toggle moves the base framing from composition bounds to the camera viewport, so it has to re-fit.
  useEffect(() => {
    if (!rigBuilt) return;
    fitCameraRef.current();
  }, [followGameFlow, rigBuilt]);

  // Pixi's resize plugin only watches the window, not the canvas host.
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

  // Lobby's Enter row is a real interaction; keyed on `rigBuilt` and declared after the mode effect, which clears the tracks.
  useEffect(() => {
    if (mode !== 'home' || !rigBuilt || !voiceIndex) return;
    const row = speakLobbyRef.current('Enter');
    const clip = stageLobbyRef.current(row);
    if (clip) autoDriveRef.current?.(clip);
  }, [mode, rigBuilt, voiceIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (boxOverlayRef.current) boxOverlayRef.current.visible = showBoxes;
  }, [showBoxes]);

  // The subtitle stays: it transcribes what is on screen, not the audio.
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

  // Emptying the track hands the face back to the body animation's own keys.
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

  useEffect(() => {
    if (!showLayers && layerHoverRef.current) layerHoverRef.current.style.display = 'none';
  }, [showLayers]);

  // Hiding is enforced per frame in the Spine hook; showing restores the setup alpha once.
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
    saveStagePng({
      PIXI,
      app,
      root,
      pixelScale: spinePixelScaleRef.current(),
      fileName: `${archive}${faceAnim ? `_${animLabel(faceAnim)}` : ''}.png`,
    });
  };

  // Screen px per world unit needed for the art's own resolution, capped by frame size.
  const recordScale = (host: HTMLDivElement) => {
    const fitScale = rootRef.current?.scale.x ?? 0;
    const pixelScale = spinePixelScaleRef.current();
    const native = fitScale > 0 && pixelScale > 0 ? (1 / pixelScale) / fitScale : 1;
    const longEdge = Math.max(host.clientWidth, host.clientHeight);
    const cap = longEdge > 0 ? MAX_RECORD_DIM / longEdge : 1;
    const scale = Math.min(native, cap);
    return Number.isFinite(scale) ? Math.max(1, scale) : 1;
  };

  const handleRecord = () => {
    if (recordingRef.current) {
      recordingRef.current.stop();
      return;
    }
    const app = appRef.current;
    const host = hostRef.current;
    const canvas = app?.canvas ?? app?.renderer?.canvas;
    if (!app || !host || !canvas || !canRecordCanvas()) {
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    // The frame is the aspect box, so only its pixel density is raised.
    const restore = app.renderer.resolution;
    app.renderer.resolution = recordScale(host);
    let recording_: VideoRecording | null = null;
    try {
      recording_ = startCanvasVideo({
        canvas,
        fileName: archive,
        onStop: () => {
          if (appRef.current) appRef.current.renderer.resolution = restore;
          if (recordingRef.current !== recording_) return;
          recordingRef.current = null;
          setRecording(false);
        },
      });
    } catch {
      app.renderer.resolution = restore;
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    if (!recording_) {
      app.renderer.resolution = restore;
      setVideoStatus(t('videoUnsupported'));
      return;
    }
    recordingRef.current = recording_;
    setVideoStatus(`${t(recording_.audio ? 'videoWithAudio' : 'videoVisualOnly')} ${
      recording_.width}×${recording_.height}`);
    setRecording(true);
  };

  useEffect(() => () => {
    const recording_ = recordingRef.current;
    recordingRef.current = null;
    recording_?.cancel();
  }, []);

  // Memoised so the `?? []` fallback does not hand the option memos a fresh identity every render.
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
      ? [{ value: '', label: text(lang, 'optAnimationDefault') }, ...groupedOptions(faces)]
      : [];
  }, [anims, lang]);
  const overlayOptions = useMemo(() => {
    const overlays = anims.filter((a) => overlayAnims.has(a));
    return overlays.length
      ? [{ value: '', label: text(lang, 'optNone') }, ...groupedOptions(overlays)]
      : [];
  }, [anims, overlayAnims, lang]);

  useEffect(() => {
    const shared = sharedRef.current;
    if (!shared || sharedSelectionsAppliedRef.current || !anims.length) return;
    if (shared.body && bodyOptions.some((option) => option.value === shared.body)) {
      setBodyAnim(shared.body);
    }
    if (shared.face != null && faceOptions.some((option) => option.value === shared.face)) {
      setFaceAnim(shared.face);
    }
    if (shared.overlay != null && overlayOptions.some((option) => option.value === shared.overlay)) {
      setOverlayAnim(shared.overlay);
    }
    sharedSelectionsAppliedRef.current = true;
  }, [anims, bodyOptions, faceOptions, overlayOptions]);

  const playbackContext: PlaybackContext = mode === 'manual' ? 'free_play'
    : mode === 'home' ? 'lobby'
    : layout?.kind === 'desire' ? `desire_${sceneVariant}`
    : layout?.kind === 'affection' ? `affection_${sceneVariant}`
    : 'story';
  const playbackContextOptions: SelectOption[] = [
    { value: 'free_play', label: t('ctxFreePlay'), hint: t('ctxFreePlayHint') },
    ...(hasLobby ? [{ value: 'lobby', label: t('ctxLobby'), hint: t('ctxLobbyHint') }] : []),
    ...(layout?.kind === 'desire' && timelineRig?.view
      ? [{ value: 'desire_view', label: t('ctxDesireView'), hint: t('ctxViewHint') }]
      : []),
    ...(layout?.kind === 'desire' && timelineRig?.story
      ? [{ value: 'desire_story', label: t('ctxDesireStory'), hint: t('ctxStoryHint') }]
      : []),
    ...(layout?.kind === 'affection' && timelineRig?.view
      ? [{ value: 'affection_view', label: t('ctxAffectionView'), hint: t('ctxViewTimelineHint') }]
      : []),
    ...(layout?.kind === 'affection' && timelineRig?.story
      ? [{ value: 'affection_story', label: t('ctxAffectionStory'), hint: t('ctxStoryHint') }]
      : []),
    ...(layout?.kind === 'pleasure' && storySeqs.length
      ? [{ value: 'story', label: t('ctxStory'), hint: t('ctxSequenceHint') }]
      : []),
  ];
  const reloadPlayback = () => {
    resetSceneVisualsRef.current();
    setStoryIdx(0);
    setResetKey((key) => key + 1);
    setSceneRunKey((key) => key + 1);
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
    setStoryIdx(0);
    if (context === 'free_play') {
      setMode('manual');
    } else if (context === 'lobby') {
      setMode('home');
    } else {
      setSceneVariant(context.endsWith('_view') ? 'view' : 'story');
      setMode('scene');
    }
    setSceneRunKey((key) => key + 1);
  };

  useEffect(() => {
    const stage = sharedRef.current?.stage;
    if (!stage || sharedStageAppliedRef.current || !sceneLabels.includes(stage)) return;
    const player = scenePlayerRef.current;
    if (!player) return;
    player.goto(stage);
    sharedStageAppliedRef.current = true;
  }, [rigBuilt, sceneRunKey, sceneLabels]);

  const handleShare = async () => {
    const url = buildViewerShareUrl(window.location.href, {
      skin,
      store,
      context: playbackContext,
      speed,
      background: showBg,
      camera: followGameFlow ? 'game' : 'free',
      aspect: canvasAspect,
      body: bodyAnim || undefined,
      face: faceAnim || undefined,
      overlay: overlayAnim || undefined,
      stage: sceneState?.label ?? undefined,
    });
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus(t('shareCopied'));
    } catch {
      setShareStatus(t('shareCopyFailed'));
    }
  };

  // CSS `aspect-ratio` cannot letterbox this: clamping the second axis distorts the box instead of shrinking the first.
  const aspectRatio = CANVAS_ASPECTS.find((a) => a.value === canvasAspect)?.ratio ?? 0;
  const hostBox = aspectRatio && panelSize.w && panelSize.h
    ? (panelSize.w / panelSize.h > aspectRatio
      ? { width: `${Math.round(panelSize.h * aspectRatio)}px`, height: `${panelSize.h}px` }
      : { width: `${panelSize.w}px`, height: `${Math.round(panelSize.w / aspectRatio)}px` })
    : { width: '100%', height: '100%' };

  // Takes a value rather than toggling: re-selecting the active side must not restart the scene.
  const setGameFlow = (next: boolean) => {
    if (next === followGameFlow) return;
    resetSceneVisualsRef.current();
    setFollowGameFlow(next);
    setStoryIdx(0);
    setSceneRunKey((key) => key + 1);
  };
  // The `cam` bone is consulted in every mode.
  const hasCameraControl = hasRigCamera || (mode === 'scene' && !!selectedScriptScene);

  return (
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
      <Flex direction={{ base: 'column', lg: 'row' }} align="stretch" gap={2}
        h={theater ? '100%' : undefined}>
        {/* `flex: 1` sets flex-basis 0, which replaces the main-axis size — the
            height in the stacked layout, where growing collapses the panel. */}
        <Box ref={panelRef} flex={{ base: '0 0 auto', lg: '1' }} minW={0}
          h={theater ? '100%' : height} bg="gray.900"
          borderRadius="md" overflow="hidden"
          position="relative" border="1px solid" borderColor="whiteAlpha.200">
          {/* Centred so a chosen aspect letterboxes rather than stretches. */}
          <Center position="absolute" inset={0}>
            <Box ref={hostRef} style={hostBox}
              opacity={loadState === 'ready' ? 1 : 0} />
          </Center>
          <Box ref={layerHoverRef} role="tooltip" display="none" position="absolute"
            zIndex={3} pointerEvents="none" maxW="220px" px={2} py={1.5}
            borderRadius="md" bg="blackAlpha.800" color="gray.100" fontSize="xs"
            fontFamily="mono" lineHeight="short" whiteSpace="pre-line" boxShadow="md" />
          {loadState !== 'ready' && !error && !unavailable && (
            <Center position="absolute" inset={0} color="gray.500" pointerEvents="none"
              flexDirection="column" gap={2}>
              <Spinner />
              <Text fontSize="sm">
                {loadState === 'unpacking' ? t('stateUnpacking') : t('stateFetching')}
              </Text>
            </Center>
          )}

          {autoMode && loadState === 'ready' && (
            <Box position="absolute" top={2} left={2} bg="blackAlpha.700" borderRadius="md"
              px={2} py={1} pointerEvents="none" maxW="calc(100% - 16px)" zIndex={2}>
              <Text fontSize="xs" color="gray.300" noOfLines={1}>
                {sceneState?.park.kind === 'wait-input'
                  ? t('hintClickAdvance')
                  : storySeq
                  ? t('hintStoryStep', {
                    group: storySeq.group,
                    step: storyStep + 1,
                    total: storySeq.clips.length,
                  })
                  : reaction
                    ? t('hintReacting', { clip: animLabel(reaction) })
                    : hasTouchBoxes
                      ? `${t('hintClickFigure')}${
                        mode === 'home' && jigglerCount
                          ? dragJiggle
                            ? t('hintDragJiggles')
                            : t('hintJigglerCount', { n: jigglerCount })
                          : ''}`
                      : t('hintNoTouchRegions')}
              </Text>
              {touchInfo && (
                <Text fontSize="xs" color="gray.500" noOfLines={1} fontFamily="mono">
                  {touchInfo.box} → {EFFECT_LABEL[touchInfo.effect]?.[lang] ?? touchInfo.effect}
                  {touchInfo.detail ? ` (${touchInfo.detail})` : ''}
                </Text>
              )}
              {sceneState && (
                <Text fontSize="xs" color="pink.300" noOfLines={2} fontFamily="mono">
                  {sceneState.label ?? t('sceneStart')}
                  {'  '}{sceneState.park.kind}
                  {Object.keys(sceneState.vars).length
                    ? '  ' + Object.entries(sceneState.vars).map(([k, v]) => `${k}=${v}`).join(' ')
                    : ''}
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

          {/* Theatre mode hides the sidebar, so its exit lives on the canvas. */}
          {theater && (
            <Box position="absolute" top={2} right={2} zIndex={3}>
              <ActionButton icon="close" label={t('btnExitTheatre')}
                onClick={() => setViewer({ theater: false })} />
            </Box>
          )}
        </Box>

        {!theater && (
        <VStack w={{ base: '100%', lg: '260px', xl: '300px' }} flexShrink={0} align="stretch"
          spacing={3} h={{ base: 'auto', lg: height }} maxH={{ base: '60vh', lg: height }}
          overflowY="auto" bg="gray.900" borderRadius="md" border="1px solid"
          borderColor="whiteAlpha.200" p={2}>

          <ControlSection title={t('viewerPlayback')}>
            {loadState === 'ready' && (
              <ControlRow label={t('rowMode')}>
                <OverlaySelect icon="auto" value={playbackContext}
                  options={playbackContextOptions}
                  onChange={(value) => selectPlaybackContext(value as PlaybackContext)}
                  minW="0" label={t('ariaPlaybackContext')} />
              </ControlRow>
            )}
            {loadState === 'ready' && (
              <ControlRow label={t('rowSpeed')}>
                <OverlaySelect icon="speed" value={String(speed)} options={speedOptions(lang)}
                  onChange={(v) => setSpeed(Number(v))} minW="0" label={t('ariaPlaybackSpeed')} />
              </ControlRow>
            )}
            {!autoMode && (
              <ToggleRow label={t('rowLoopClip')} value={loop} onChange={setLoop} />
            )}
            <Wrap spacing={1} pt={1}>
              <WrapItem>
                <ActionButton icon={playing ? 'pause' : 'play'}
                  label={playing ? t('btnPause') : t('btnPlay')}
                  onClick={() => setPlaying(!playing)} />
              </WrapItem>
              <WrapItem>
                <ActionButton icon="reload" label={t('btnRestart')} onClick={reloadPlayback} />
              </WrapItem>
              {/* A parked `reset` waits on the view menu's own button. */}
              {canReset && (
                <WrapItem>
                  <ActionButton icon="reload" label={t('btnReset')}
                    onClick={() => scenePlayerRef.current?.reset()} />
                </WrapItem>
              )}
              <WrapItem>
                <ActionButton icon="save" label={t('btnSavePng')} onClick={handleSave} />
              </WrapItem>
              <WrapItem>
                <ActionButton icon="share" label={t('btnShare')} onClick={handleShare} />
              </WrapItem>
              <WrapItem>
                <ActionButton icon="record"
                  label={recording ? t('btnStopRecording') : t('btnRecordVideo')}
                  onClick={handleRecord} disabled={loadState !== 'ready'} />
              </WrapItem>
            </Wrap>
            {shareStatus && <Text fontSize="xs" color="green.300">{shareStatus}</Text>}
            {videoStatus && <Text fontSize="xs" color="gray.500">{videoStatus}</Text>}
          </ControlSection>

          <ControlSection title={t('viewerAnimation')}>
            {mode === 'manual' && bodyOptions.length > 1 && (
              <ControlRow label={t('rowBody')}>
                <OverlaySelect icon="body" value={bodyAnim} options={bodyOptions}
                  onChange={setBodyAnim} minW="0" label={t('ariaBodyAnimation')} />
              </ControlRow>
            )}
            {mode === 'home' && phases.length > 1 && (
              <ControlRow label={t('rowVariation')}>
                <OverlaySelect icon="home" value={String(phaseIdx)} minW="0"
                  label={t('ariaHomeVariation')}
                  options={phases.map((p, i) => ({
                    value: String(i),
                    label: t('optVariation', { n: i + 1 }),
                    hint: animLabel(p.idle ?? p.active ?? '?'),
                  }))}
                  onChange={(v) => setPhaseIdx(Number(v))} />
              </ControlRow>
            )}
            {sceneLabels.length > 1 && (
              <ControlRow label={t('rowStage')}>
                <OverlaySelect icon="body" value={sceneState?.label ?? ''} minW="0"
                  label={t('ariaScriptLabel')}
                  options={sceneLabels.map((label, i) => ({
                    value: label,
                    label: `${i + 1}. ${label}`,
                  }))}
                  onChange={(label) => scenePlayerRef.current?.goto(label)} />
              </ControlRow>
            )}
            {storySeq && storySeqs.length > 1 && (
              <ControlRow label={t('rowSequence')}>
                <OverlaySelect icon="auto" value={String(storySeqIdx)} minW="0"
                  label={t('ariaStorySequence')}
                  options={storySeqs.map((s, i) => ({
                    value: String(i),
                    label: `${s.group} (${s.clips.length})`,
                  }))}
                  onChange={(v) => { setStorySeqIdx(Number(v)); setStoryIdx(0); }} />
              </ControlRow>
            )}
            {storySeq && (
              <ControlRow label={t('rowStep')}>
                <OverlaySelect icon="body" value={String(storyStep)} minW="0"
                  label={t('ariaStoryBeat')}
                  options={storySeq.clips.map((c, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${animLabel(c)}`,
                  }))}
                  onChange={(v) => setStoryIdx(Number(v))} />
              </ControlRow>
            )}
            {/* The region→clip mapping is not in the rig, so clips no region
                maps to are listed rather than left silently unplayable. */}
            {mode === 'scene' && reactionClips.length > 0 && (
              <ControlRow label={t('rowReaction')}>
                <OverlaySelect icon="touch" value="" minW="0" label={t('ariaReactionClip')}
                  placeholder={t('optPlayOneOf', { n: reactionClips.length })}
                  options={reactionClips.map((c) => ({
                    value: c,
                    label: animLabel(c),
                    hint: orphanReactions.includes(c) ? t('optConditional') : undefined,
                  }))}
                  onChange={(c) => {
                    if (!c) return;
                    setTouchInfo({ box: t('manualTouch'), effect: 'reaction', detail: c });
                    autoDriveRef.current?.(c);
                  }} />
              </ControlRow>
            )}
            {faceOptions.length > 1 && (
              <ControlRow label={t('rowFace')}>
                <OverlaySelect icon="face" value={faceAnim} options={faceOptions}
                  onChange={setFaceAnim} minW="0" label={t('ariaFaceExpression')} />
              </ControlRow>
            )}
            {overlayOptions.length > 1 && (
              <ControlRow label={t('rowOverlay')}>
                <OverlaySelect icon="overlay" value={overlayAnim} options={overlayOptions}
                  onChange={setOverlayAnim} minW="0" label={t('ariaOverlayClip')} />
              </ControlRow>
            )}
          </ControlSection>

          <ControlSection title={t('viewerCamera')}>
            {loadState === 'ready' && hasCameraControl && (
              <ControlRow label={t('viewerCamera')}>
                <SegmentedControl<'free' | 'game'> ariaLabel={t('ariaCameraMode')}
                  value={followGameFlow ? 'game' : 'free'}
                  options={[
                    { value: 'free', label: t('camFree'), title: t('camFreeHint') },
                    { value: 'game', label: t('camGame'), title: t('camGameHint') },
                  ]}
                  onChange={(value) => setGameFlow(value === 'game')} />
              </ControlRow>
            )}
            {loadState === 'ready' && (
              <ControlRow label={t('rowAspect')}>
                <OverlaySelect icon="aspect" value={canvasAspect} minW="0"
                  label={t('ariaCanvasAspect')}
                  options={CANVAS_ASPECTS.map((a) => ({
                    value: a.value,
                    label: a.value === 'fill' ? t('aspectFill') : a.label,
                  }))}
                  onChange={(v) => setViewer({ canvasAspect: v as CanvasAspect })} />
              </ControlRow>
            )}
            {loadState === 'ready' && (
              <ToggleRow label={t('rowTheatre')} value={theater}
                onChange={(value) => setViewer({ theater: value })} />
            )}
          </ControlSection>

          <ControlSection title={t('viewerDisplay')}>
            {((mode === 'scene' && hasTouchBoxes)
              || (mode === 'home' && (hasTouchBoxes || jigglerCount > 0))) && (
              <ToggleRow label={t('rowTouchZones')} value={showBoxes} onChange={setShowBoxes} />
            )}
            {mode === 'home' && jigglerCount > 0 && (
              <ControlRow label={t('rowDrag')}>
                <SegmentedControl<'pan' | 'jiggle'> ariaLabel={t('ariaDragMode')}
                  value={dragJiggle ? 'jiggle' : 'pan'}
                  options={[
                    { value: 'pan', label: t('dragPan'), icon: 'pan', title: t('dragPanHint') },
                    {
                      value: 'jiggle',
                      label: t('dragJiggle'),
                      icon: 'jiggle',
                      title: t('dragJiggleHint'),
                    },
                  ]}
                  onChange={(value) => setDragJiggle(value === 'jiggle')} />
              </ControlRow>
            )}
            {layerItems.length > 0 && (
              <ToggleRow label={t('rowLayers')} value={showLayers} onChange={setShowLayers} />
            )}
            {layout?.world?.bg && (
              <ToggleRow label={t('rowBackground')} value={showBg} onChange={setShowBg} />
            )}
          </ControlSection>

          {showLayers && layerItems.length > 0 && (
            <LayerPanel items={layerItems} hidden={hiddenSlots} onSet={setLayerHidden}
              onReset={() => setLayerHidden(Array.from(hiddenSlots), false)}
              onClose={() => setShowLayers(false)} />
          )}

          <ControlSection title={t('viewerAudio')}>
            {hasVoice && (
              <ToggleRow label={t('rowVoice')} value={voiceOn} onChange={setVoiceOn} />
            )}
            {(layout?.kind === 'desire' || layout?.kind === 'affection') && (
              <ToggleRow label={t('rowSceneAudio')} value={bgmOn} onChange={setBgmOn} />
            )}
          </ControlSection>

          <ControlSection title={t('viewerStore')}>
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
