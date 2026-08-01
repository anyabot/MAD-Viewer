// PixiJS + Spine skin viewer, ported from the LO viewer's spine path.
//
// Differences from that original, all forced by MAD's asset shape:
//   * skeletons are BINARY Spine 4.2 (`.skel`) -> SkeletonBinary over a
//     Uint8Array, not SkeletonJson over parsed JSON;
//   * every rig has a single `default` skin, so the whole skin-composition
//     layer (base/face/parts skins, setSkin, setupPose) is gone;
//   * face expressions are ANIMATIONS on track 1 (`01_*`), not skins — the
//     body animation plays on track 0 (`00_*`). Affection rigs namespace their
//     animations with `/` instead (`lobby/idle`, `story/story_001`, ...);
//   * the censorship axis is the store build (ONE store uncensored vs Google
//     Play censored) and the two builds have DIFFERENT skeletons, so switching
//     loads a different archive rather than swapping textures in place.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Center, HStack, Spinner, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import {
  loadSkinArchive, loadTexture, readBytes, readText, revokeSkinUrls, urlFor,
} from '@/lib/skinArchive';
import {
  BORING_DELAY_MS, actorPhases, archiveName, attachPanZoom, baseSkinKey,
  effectOf, layerGroup, mappedSourcePixelScale, overlayAnimations, regionLiveInPhase,
  storySequences, zoomAt,
  type ActorPhase, type Layout, type PlayMode, type StoreKey, type TouchRegion,
} from '@/components/skinViewer/types';
import { JiggleField } from '@/components/skinViewer/jiggle';
import {
  applyAssignments, armedBoxes, entryExtras, evaluate, fireOnlook, fireTouch, holds,
  sectionIndexByLabel, type RigScript, type Vars,
} from '@/components/skinViewer/interactions';
import {
  cutsceneOffsetAt, isLinearScene, scriptCameraTransform, spineBackgroundEventFade,
  waitAnimationDeadline,
  type CameraAction, type CameraBase, type CameraState, type DesirePresentation,
  type LinearScene, type SceneAction, type SceneTimelineRig,
} from '@/components/skinViewer/scenes';
import { loadDesireInteractions, loadSceneTimelines } from '@/lib/data';
import {
  IconBtn, LayerPanel, LoopButton, OverlaySelect, PlayPauseButton, ReloadButton,
  SaveButton, StoreStrip, type LayerItem, type SelectOption,
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
// Verified against the rigs: standing `01_*` clips touch 3-7 face bones while
// `00_*` clips drive 85+ body bones; affection `mouth/*` clips are lip poses.
const FACE_GROUPS = new Set(['01', 'mouth']);

export function isFaceAnim(name: string): boolean {
  return FACE_GROUPS.has(animGroup(name));
}

const TRACK_BODY = 0;
const TRACK_FACE = 1;
const TRACK_OVERLAY = 2;

// This composition uses the widest authored CutsceneOffset key even when the
// viewer panel itself is narrower than the game's long-screen presentation.
const WIDE_CUTSCENE_STAGING_SKINS = new Set(['ds_ch0022']);

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
  const appRef = useRef<any>(null);
  const rootRef = useRef<any>(null);
  const fitCameraRef = useRef<() => void>(() => {});
  const pixiRef = useRef<any>(null);
  const spineRef = useRef<any>(null);
  const bgSpriteRef = useRef<any>(null);
  const spinePixelScaleRef = useRef<() => number>(() => 1);
  const filesRef = useRef<Map<string, Blob> | null>(null);
  const jiggleRef = useRef<JiggleField | null>(null);
  // Attachments a finished overlay clip left on screen — see the build effect.
  const clearPersistentRef = useRef<() => void>(() => {});

  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'fetching' | 'unpacking' | 'ready' | 'error'>('fetching');
  const [resetKey, setResetKey] = useState(0);

  const [bodyAnim, setBodyAnim] = useState('');
  const [faceAnim, setFaceAnim] = useState('');
  const [overlayAnim, setOverlayAnim] = useState('');
  const [overlayAnims, setOverlayAnims] = useState<Set<string>>(() => new Set());
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [showBg, setShowBg] = useState(true);

  const [mode, setMode] = useState<PlayMode>('manual');
  const autoMode = mode !== 'manual';
  const [sceneVariant, setSceneVariant] = useState<'view' | 'story'>('view');
  const [followGameFlow, setFollowGameFlow] = useState(false);
  const [timelineRig, setTimelineRig] = useState<SceneTimelineRig | null>(null);
  const [sceneBeatIdx, setSceneBeatIdx] = useState(0);
  const [sceneRunKey, setSceneRunKey] = useState(0);
  const [sceneLoop, setSceneLoop] = useState(true);
  const [fade, setFade] = useState({ color: 'black', opacity: 0, duration: 0 });
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [showBoxes, setShowBoxes] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [touchInfo, setTouchInfo] = useState<
    { box: string; effect: string; detail: string } | null>(null);

  const [showLayers, setShowLayers] = useState(false);
  const [layerItems, setLayerItems] = useState<LayerItem[]>([]);
  const [hiddenSlots, setHiddenSlots] = useState<Set<string>>(() => new Set());
  const hiddenSlotsRef = useRef(hiddenSlots); hiddenSlotsRef.current = hiddenSlots;

  const boxOverlayRef = useRef<any>(null);
  const boundsRef = useRef<any>(null);   // Spine SkeletonBounds for hit-testing
  const boringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDriveRef = useRef<
    ((trigger: 'idle' | 'boring' | string, holdAfter?: boolean,
      extras?: string[]) => void) | null>(null);
  // Section index a transition clip is on its way to. The scene must not switch
  // phases until that clip has finished playing, or the transition (ds_ch0068's
  // `open_H1`, ds_ch0035's `10_H1`) is cut off the frame it starts.
  const pendingSectionRef = useRef<number | null>(null);
  const pendingTrackRef = useRef(0);
  const pendingPresentationUntilRef = useRef(0);
  const pendingPresentationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phases = useMemo<ActorPhase[]>(
    () => actorPhases(layout?.actor, layout?.animations ?? []), [layout]);
  const phase = phases[Math.min(phaseIdx, Math.max(phases.length - 1, 0))]
    ?? { idle: null, boring: null, active: null };

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
  const enterDisplayRef = useRef(false);

  // Home-view pointer mode: pan the canvas (default) or drag the jigglers,
  // which is the in-game input the pan gesture otherwise swallows.
  const [dragJiggle, setDragJiggle] = useState(false);

  // Mirrors so the async build effect can apply current UI state to a freshly
  // built skeleton (a reload while paused must stay paused).
  const playingRef = useRef(playing); playingRef.current = playing;
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

  // The idle clip the state machine returns to: the script section's when a
  // scenario table is driving, otherwise the actor phase's.
  const idleClipRef = useRef<() => string | null>(() => null);
  idleClipRef.current = () => sectionRef.current?.idle ?? phaseRef.current.idle;

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
        setShowBg(true);
        setPhaseIdx(0);
        setReaction(null);
        setTouchInfo(null);
        setShowBoxes(false);
        setRigScript(null);
        setTimelineRig(null);
        setSectionIdx(0);
        setVars({});
        setSceneVariant('view');
        setFollowGameFlow(false);
        setSceneBeatIdx(0);
        setFade({ color: 'black', opacity: 0, duration: 0 });
        setStorySeqIdx(0);
        setStoryIdx(0);
        setDragJiggle(false);
        setLayerItems([]);
        setHiddenSlots(new Set());
        setShowLayers(false);
        setMode((m) => (m === 'scene' ? 'manual' : m));
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

  // Entering a section applies its variable initialisation and restarts the
  // idle loop, mirroring what the script does when it jumps to a label.
  useEffect(() => {
    const spine = spineRef.current;
    const target = interactiveScene?.sections[sectionIdx];
    if (!spine || !target) return;
    const next = applyAssignments(target.set, varsRef.current);
    setVars(next);
    varsRef.current = next;
    // Ambience the section shows on entry, gated on the carried-over state
    // (ds_ch0057's toy overlays persist into phase 2 only when h2/h3 are set).
    const extras = entryExtras(target, next);
    const presentation = desirePresentation?.sections[sectionIdx];
    if (enterDisplayRef.current) {
      enterDisplayRef.current = false;
      if (followGameFlowRef.current) {
        const entryActions: SceneAction[] = [
          ...(desirePresentation?.entry ?? []),
          ...(presentation?.entry ?? []),
        ];
        if (entryActions.length) {
          entryActions.push({ type: 'wait-animation' });
          if (target.enter && target.enter !== target.idle) {
            entryActions.push({
              type: 'animation', clip: target.enter, loop: false, track: 0, wait: true,
            });
          }
          if (target.idle) entryActions.push({
            type: 'animation', clip: target.idle, loop: true, track: 0, wait: false,
          });
          for (const clip of extras) entryActions.push({
            type: 'animation', clip, loop: true, track: 2, wait: false,
          });
          playSceneActionsRef.current(entryActions);
          return;
        }
        if (interactiveScene.entry) {
          autoDriveRef.current?.(interactiveScene.entry, false, extras);
          return;
        }
      }
    } else if (presentation?.entry.length) {
      playSceneActionsRef.current(presentation.entry);
    }
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
  }, [interactiveScene, desirePresentation, sectionIdx, sceneRunKey]);

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
    const timer = setTimeout(() => {
      setSceneBeatIdx((i) => (i + 1) % linearScene.beats.length);
    }, Math.max(duration, 0.25) * 1000);
    return () => {
      clearTimeout(timer);
      cancelSceneActionsRef.current();
    };
  }, [linearScene, sceneBeatIdx, mode, playing, sceneLoop, followGameFlow, sceneRunKey]);

  // Fallback for rigs without extracted script timelines.
  useEffect(() => {
    const spine = spineRef.current;
    if (!spine || !storySeq) return;
    spine.state.setAnimation(TRACK_BODY, storySeq.clips[storyStep], true);
    setReaction(null);
  }, [storySeq, storyStep]);

  // --- build the Pixi app + Spine skeleton ---------------------------------
  useEffect(() => {
    if (!layout || baseSkinKey(layout.skin) !== baseSkinKey(skin)) return;
    let destroyed = false;
    let app: any = null;
    let appReady = false;
    let sceneTimers: ReturnType<typeof setTimeout>[] = [];
    spineRef.current = null;
    bgSpriteRef.current = null;
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
      const scene = new PIXI.Container();
      scene.sortableChildren = true;
      root.addChild(scene);
      let cameraBase: CameraBase = { x: 0, y: 0, scale: 1, width: 1, height: 1 };
      const cameraState: CameraState = { offsetX: 0, offsetY: 0, zoom: 0 };
      let cameraTween: {
        from: { x: number; y: number; scale: number };
        to: { x: number; y: number; scale: number };
        started: number;
        duration: number;
      } | null = null;

      if (W.bg) {
        const bgTex = await loadTexture(PIXI, archive, files, W.bg.tex);
        if (destroyed) { if (appReady) app?.destroy(true); return; }
        const bg = new PIXI.Sprite(bgTex);
        bg.anchor.set(0.5);
        // Pixi's y axis points down; Unity's points up.
        bg.position.set(W.bg.x, -W.bg.y);
        bg.width = W.bg.w;
        bg.height = W.bg.h;
        bg.zIndex = -10;
        bg.visible = showBgRef.current;
        scene.addChild(bg);
        bgSpriteRef.current = bg;
      }

      const spine = new Spine({ skeletonData });
      spineRef.current = spine;
      spine.position.set(sk.x, -sk.y);
      spine.scale.set(prefabScale);
      spine.zIndex = 0;
      scene.addChild(spine);
      app.stage.addChild(root);
      rootRef.current = root;

      const animSet = new Set(layout.animations ?? []);

      // Overlay clips are measured from the parsed skeleton, not named.
      const overlaySet = overlayAnimations(skeletonData.animations, isFaceAnim);
      const overlaySetRef = { current: overlaySet };
      setOverlayAnims(overlaySet);

      // Overlay clips enable art that has to stay on screen: ds_ch0042's pen
      // strokes are 11 clips that each switch on their own doodle attachment
      // and never switch anything off. Spine erases them anyway — a slot keyed
      // only by an animation that is mixing out is flagged unkeyed and restored
      // to its setup attachment at the end of `AnimationState.apply` — so each
      // stroke wiped the one before it. Pin the finished clip's own end state
      // and re-assert it after `apply`.
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
          if (spine.state.timeScale !== 0) jiggle.step(dt);
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
        if (boringTimerRef.current) clearTimeout(boringTimerRef.current);
        boringTimerRef.current = null;
      };
      const armBoring = () => {
        clearBoring();
        if (!autoModeRef.current) return;
        // Scene mode: the section's onlook trigger owns the idle timeout —
        // its body can carry the phase's whole escalation (ds_ch0057 sets
        // `h1=true` from it), so it must actually fire.
        const sec = sectionRef.current;
        if (sec?.onlook) {
          const ms = (sec.onlook.delay ?? BORING_DELAY_MS / 1000) * 1000;
          boringTimerRef.current = setTimeout(() => runOnlook(), ms);
          return;
        }
        const p = phaseRef.current;
        if (!p.boring || !p.idle) return;
        boringTimerRef.current = setTimeout(() => autoDriveRef.current?.('boring'), BORING_DELAY_MS);
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
        if (!sec?.onlook || pendingSectionRef.current !== null || reacting()) {
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
        clearBoring();
        if (trigger === 'idle') {
          if (idle) spine.state.setAnimation(TRACK_BODY, idle, true);
          setReaction(null);
          armBoring();
          return;
        }
        const clip = trigger === 'boring' ? phaseRef.current.boring : trigger;
        if (!clip || !animSet.has(clip)) { armBoring(); return; }
        const track = overlaySetRef.current.has(clip) ? TRACK_OVERLAY : TRACK_BODY;
        const entry = spine.state.setAnimation(track, clip, false);
        // Overlay clips are cut in, not mixed in. A stamp clip switches its art
        // on at t=0 and hides it with an alpha-0 colour key until the reveal
        // (ds_ch0042's early strokes); during a mix the attachment applies
        // immediately but the colour only blends in from the slot's current
        // alpha 1, flashing the finished art before it is drawn.
        entry.mixDuration = track === TRACK_OVERLAY ? 0 : 0.15;
        // The rest of the reaction: same-track clips queue behind the main
        // one (ds_ch0015's tail_1 after A5), an overlay during a body reaction
        // layers immediately (ds_ch0010's twinkle) or queues behind a running
        // overlay one-shot so neither is cut before its art is pinned.
        let bodyStarted = track === TRACK_BODY;
        for (const x of extras ?? []) {
          if (!animSet.has(x)) continue;
          const xt = overlaySetRef.current.has(x) ? TRACK_OVERLAY : TRACK_BODY;
          let e;
          if (xt === track || (xt === TRACK_BODY && bodyStarted)) {
            e = spine.state.addAnimation(xt, x, false, 0);
          } else if (xt === TRACK_BODY) {
            e = spine.state.setAnimation(xt, x, false);
            bodyStarted = true;
          } else {
            const cur = spine.state.getCurrent(TRACK_OVERLAY);
            e = cur && !cur.loop && !cur.isComplete()
              ? spine.state.addAnimation(TRACK_OVERLAY, x, false, 0)
              : spine.state.setAnimation(TRACK_OVERLAY, x, false);
          }
          e.mixDuration = xt === TRACK_OVERLAY ? 0 : 0.15;
        }
        // A transition clip must NOT queue the current phase's idle behind it:
        // the phase is about to change, and the next section sets its own idle
        // when the clip completes. Queueing here would play the outgoing idle
        // for a frame and fight the incoming one.
        if (bodyStarted && !holdAfter && idle) {
          spine.state.addAnimation(TRACK_BODY, idle, true, 0);
        }
        // The phase switch waits for the reaction's LAST body clip when there
        // is one (ds_ch0010's drag ends on 10_H1), else the main clip's track.
        if (holdAfter) pendingTrackRef.current = bodyStarted ? TRACK_BODY : track;
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
          // as in game. Interrupting is not just cosmetic: a touch consumes
          // script state (counters, flags), and an overlay one-shot replaced
          // before its `complete` never pins its end art — a pen stroke cut
          // short by an eager tap left no permanent mark. Jiggle pokes stay
          // live: the game's jiggler input handler is separate from its click
          // handler.
          const local = spine.toLocal(e.global);
          bounds.update(spine.skeleton, true);
          // Already in the Spine object's local (y-down) space — see the
          // overlay below; no extra flip.
          // Desire rigs attach every state's regions at once, so restrict the
          // hit test to regions live in the current phase and take the smallest
          // match — the region sets overlap heavily.
          // Script mode hit-tests every box the section arms, since the
          // scenario decides what is live, not the region's name suffix.
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
          // scene in game. The script is also the whole authority here: a box it
          // does not bind in this phase must leave playback ALONE. Falling
          // through to the phase's generic `active` clip played a `lobby/*` pose
          // that visibly reset the scene — touching the breasts after the legs
          // opened snapped them shut and back.
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
                pendingPresentationUntilRef.current = performance.now()
                  + presentationTime * 1000;
                pendingPresentationTimerRef.current = setTimeout(() => {
                  pendingPresentationTimerRef.current = null;
                  pendingPresentationUntilRef.current = 0;
                  pendingSectionRef.current = null;
                  enterSectionIndex(next);
                }, Math.max(presentationTime, 0) * 1000);
              } else if (!held) {
                const timer = setTimeout(() => {
                  setReaction(null);
                  autoDriveRef.current?.('idle');
                }, Math.max(presentationTime, 0) * 1000);
                sceneTimers.push(timer);
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
              ? performance.now() + presentationTime * 1000
              : 0;
            if (!mainClip && advancing) {
              if (presentationTime > 0) {
                pendingPresentationTimerRef.current = setTimeout(() => {
                  pendingPresentationTimerRef.current = null;
                  pendingPresentationUntilRef.current = 0;
                  enterSectionIndex(next);
                }, presentationTime * 1000);
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
            if (reacting()) return;
            const regionClip = hit?.effect === 'region' ? hit.clip : null;
            const clip = regionClip ?? phaseRef.current.active;
            if (clip && animSet.has(clip)) {
              setTouchInfo({
                box: box || '(no region)',
                effect: regionClip ? 'region' : 'touch',
                detail: clip,
              });
              autoDriveRef.current?.(clip);
            } else {
              setTouchInfo({
                box: box || '(no region)',
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

      // `bg_on`/`bg_off` drive the scene's white Naninovel overlay, not the
      // exported room sprite. The room remains under the user's background
      // toggle; the animation event only opens or clears the overlay above it.
      spine.state.addListener({
        event: (_entry: any, event: any) => {
          const name = event?.data?.name;
          if (name === 'bg_on' || name === 'bg_off') {
            setFade((current) => spineBackgroundEventFade(current, name));
          }
        },
        // Release the slots a starting overlay clip drives, so the pinned
        // state does not fight its own animation. On `start`, not at queue
        // time: a queued stroke must not un-pin art while its predecessor is
        // still playing.
        start: (entry: any) => {
          if (entry?.trackIndex === TRACK_BODY || entry?.trackIndex === TRACK_FACE) return;
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
            const timer = setTimeout(() => {
              if (destroyed) return;
              preserveHeldEndStates();
              setReaction(null);
              autoDriveRef.current?.('idle');
            }, 0);
            sceneTimers.push(timer);
            return;
          }
          // A layered one-shot pins its end art whether or not a phase change
          // is pending — ds_ch0009's glass_on completes DURING the transition
          // to phase 2 and its glass must survive it.
          if (track !== TRACK_BODY) {
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
            const remaining = pendingPresentationUntilRef.current - performance.now();
            if (remaining > 0) {
              if (pendingPresentationTimerRef.current) {
                clearTimeout(pendingPresentationTimerRef.current);
              }
              pendingPresentationTimerRef.current = setTimeout(finish, remaining);
            } else {
              finish();
            }
            return;
          }
          // A one-shot ending on a layered track is not a return to idle.
          if (track !== TRACK_BODY) return;
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
      if (!playingRef.current) spine.state.timeScale = 0;

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
        // measurement, so it scales the room, actor, and touch overlay as one.
        scene.position.set(0, 0);
        scene.scale.set(1);
        scene.rotation = 0;
        const boxOverlay = boxOverlayRef.current;
        const boxesVisible = boxOverlay?.visible ?? false;
        if (boxOverlay) boxOverlay.visible = false;
        const b = root.getLocalBounds();
        if (boxOverlay) boxOverlay.visible = boxesVisible;
        if (!b.width || !b.height) return;
        const pad = 40;
        const s = Math.min((app.screen.width - pad) / b.width, (app.screen.height - pad) / b.height);
        cameraBase = {
          x: app.screen.width / 2 - (b.x + b.width / 2) * s,
          y: app.screen.height / 2 - (b.y + b.height / 2) * s,
          scale: s,
          width: app.screen.width,
          height: app.screen.height,
        };
        scene.position.set(
          (staging?.position.x ?? 0) * dataScale,
          -(staging?.position.y ?? 0) * dataScale,
        );
        scene.scale.set(staging?.scale ?? 1);
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
        for (const timer of sceneTimers) clearTimeout(timer);
        sceneTimers = [];
      };
      cancelSceneActionsRef.current = clearSceneTimers;
      const applyCamera = (action: CameraAction) => {
        if (!followGameFlowRef.current) return;
        if (action.offset) {
          if (action.offset[0] !== null && action.offset[0] !== undefined) {
            cameraState.offsetX = action.offset[0];
          }
          if (action.offset[1] !== null && action.offset[1] !== undefined) {
            cameraState.offsetY = action.offset[1];
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
          started: performance.now(),
          duration: action.duration * 1000,
        };
      };
      app.ticker.add(() => {
        if (!cameraTween) return;
        const t = Math.min(1, (performance.now() - cameraTween.started) / cameraTween.duration);
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
        return action.clip && overlaySetRef.current.has(action.clip)
          ? TRACK_OVERLAY : TRACK_BODY;
      };
      playSceneActionsRef.current = (actions, actionVars = {}, onReset) => {
        preserveHeldEndStates();
        clearSceneTimers();
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
            const current = spine.state.getCurrent(lastAnimationTrack ?? TRACK_BODY);
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
          const timer = setTimeout(() => {
            if (destroyed) return;
            if (action.type === 'camera') {
              applyCamera(action);
            } else if (action.type === 'fade') {
              setFade({ color: action.color, opacity: action.opacity, duration: action.duration });
            } else if (action.type === 'reset-animation') {
              if (action.track === null || action.track === undefined) {
                spine.state.clearTracks();
                clearPersistentRef.current();
              } else {
                const track = authoredTrack(action, actionVars);
                spine.state.clearTrack(track);
                if (track !== TRACK_BODY && track !== TRACK_FACE) pinned.clear();
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
              entry.mixDuration = track === TRACK_BODY ? 0.15 : 0;
              if (action.hold) entry._madHold = true;
              queuedAt.set(track, at);
              queuedLoop.set(track, action.loop);
            }
          }, Math.max(0, at * 1000));
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
      // meshes) stretched orders of magnitude past their own size. Reducing
      // with `max` lets one such sliver set the export resolution for the whole
      // figure, so take a low percentile of the band instead: near-native for
      // the detailed art, immune to outliers at either end. The background
      // stays a fallback only — it is usually stretched well past its own
      // resolution, and admitting it would halve the figure's export scale.
      spinePixelScaleRef.current = () => {
        const scales = attachmentScales(spine).sort((a, b) => a - b);
        if (scales.length) {
          return scales[Math.floor((scales.length - 1) * EXPORT_SCALE_PERCENTILE)];
        }
        const bg = bgSpriteRef.current;
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
      });
    })().catch((e) => !destroyed && setError(String(e)));

    return () => {
      destroyed = true;
      for (const timer of sceneTimers) clearTimeout(timer);
      sceneTimers = [];
      if (pendingPresentationTimerRef.current) clearTimeout(pendingPresentationTimerRef.current);
      pendingPresentationTimerRef.current = null;
      pendingPresentationUntilRef.current = 0;
      if (boringTimerRef.current) clearTimeout(boringTimerRef.current);
      boringTimerRef.current = null;
      autoDriveRef.current = null;
      cancelSceneActionsRef.current = () => {};
      clearPersistentRef.current = () => {};
      boundsRef.current = null;
      boxOverlayRef.current = null;
      spineRef.current = null;
      bgSpriteRef.current = null;
      jiggleRef.current = null;
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
  useEffect(() => {
    const spine = spineRef.current;
    if (spine) spine.state.timeScale = playing ? 1 : 0;
  }, [playing]);

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
    clearPersistentRef.current();
    setTouchInfo(null);
    if (mode === 'home') {
      autoDriveRef.current?.('idle');
    } else if (mode === 'manual') {
      if (boringTimerRef.current) clearTimeout(boringTimerRef.current);
      boringTimerRef.current = null;
      setReaction(null);
      if (bodyAnim) spine.state.setAnimation(TRACK_BODY, bodyAnim, loop);
    }
    fitCameraRef.current();
  }, [mode, phaseIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (boxOverlayRef.current) boxOverlayRef.current.visible = showBoxes;
  }, [showBoxes]);

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
    if (bgSpriteRef.current) bgSpriteRef.current.visible = showBg;
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

  const cameraOptions: SelectOption[] = [
    { value: 'fit', label: 'Fit to view', hint: 'reset pan and zoom' },
    { value: 'zoom-in', label: 'Zoom in', hint: '+10% around centre' },
    { value: 'zoom-out', label: 'Zoom out', hint: '-10% around centre' },
  ];
  const playbackContext: PlaybackContext = mode === 'manual' ? 'free_play'
    : mode === 'home' ? 'lobby'
    : layout?.kind === 'desire' ? `desire_${sceneVariant}`
    : layout?.kind === 'affection' ? `affection_${sceneVariant}`
    : 'story';
  const playbackContextOptions: SelectOption[] = [
    { value: 'free_play', label: 'Free play', hint: 'choose animations manually' },
    ...(phases.length ? [{ value: 'lobby', label: 'Lobby', hint: 'touch and boredom flow' }] : []),
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
  const handleCameraAction = (action: string) => {
    if (action === 'fit') {
      fitCameraRef.current();
      return;
    }
    const app = appRef.current;
    const root = rootRef.current;
    if (!app || !root) return;
    const factor = action === 'zoom-in' ? 1.1 : action === 'zoom-out' ? 1 / 1.1 : 1;
    if (factor === 1) return;
    const x = app.screen.width / 2;
    const y = app.screen.height / 2;
    zoomAt(root, factor, x, y);
  };

  const resetInteractiveScene = () => {
    if (!rigScript) return;
    enterDisplayRef.current = true;
    setSectionIdx(0);
    setSceneRunKey((key) => key + 1);
    const initial = applyAssignments(rigScript.sections[0]?.set ?? {}, {});
    setVars(initial);
    varsRef.current = initial;
  };

  const reloadPlayback = () => {
    const target = section?.reset;
    const resetActions = desirePresentation?.sections[sectionIdx]?.resetActions ?? [];
    const next = target && rigScript ? sectionIndexByLabel(rigScript, target) : -1;
    if (next >= 0) {
      const enterResetSection = () => {
        setSectionIdx(next);
        setSceneRunKey((key) => key + 1);
      };
      const resetsDuringPlayback = resetActions.some(
        (action) => action.type === 'reset-animation');
      const duration = resetActions.length
        ? playSceneActionsRef.current(
          resetActions,
          varsRef.current,
          resetsDuringPlayback ? enterResetSection : undefined,
        )
        : 0;
      if (!resetsDuringPlayback) {
        setTimeout(enterResetSection, Math.max(0, duration) * 1000);
      }
      return;
    }
    setResetKey((key) => key + 1);
  };

  const selectPlaybackContext = (context: PlaybackContext) => {
    resetSceneVisualsRef.current();
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

  const toggleFollowGameFlow = () => {
    resetSceneVisualsRef.current();
    const next = !followGameFlow;
    setFollowGameFlow(next);
    setSceneBeatIdx(0);
    setStoryIdx(0);
    pendingSectionRef.current = null;
    if (playbackContext === 'desire_view') resetInteractiveScene();
    setSceneRunKey((key) => key + 1);
  };

  return (
    <Box>
      {error && <Text color="red.400" fontSize="sm" mb={1}>{error}</Text>}
      <Box h={height} bg="gray.900" borderRadius="md" overflow="hidden" position="relative"
        border="1px solid" borderColor="whiteAlpha.200">
        <Box ref={hostRef} position="absolute" inset={0}
          opacity={loadState === 'ready' ? 1 : 0} />
        <Box position="absolute" inset={0} bg={fade.color} opacity={fade.opacity}
          transition={`opacity ${fade.duration}s linear`} pointerEvents="none" zIndex={1} />

        {loadState !== 'ready' && !error && !unavailable && (
          <Center position="absolute" inset={0} color="gray.500" pointerEvents="none"
            flexDirection="column" gap={2}>
            <Spinner />
            <Text fontSize="sm">{loadState === 'unpacking' ? 'unpacking…' : 'fetching…'}</Text>
          </Center>
        )}

        {/* Top-left: playback context and controls for that context. */}
        <Wrap position="absolute" top={2} left={2} spacing={1}
          maxW="calc(100% - 60px)" zIndex={2}>
          {loadState === 'ready' && (
            <WrapItem>
              <OverlaySelect icon="auto" value={playbackContext}
                options={playbackContextOptions}
                onChange={(value) => selectPlaybackContext(value as PlaybackContext)}
                minW="155px" label="Playback context" />
            </WrapItem>
          )}
          {mode === 'manual' && bodyOptions.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="body" value={bodyAnim} options={bodyOptions}
                onChange={setBodyAnim} minW="170px" label="Body animation" />
            </WrapItem>
          )}
          {mode === 'home' && phases.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="home" value={String(phaseIdx)} minW="190px"
                label="Home variation"
                options={phases.map((p, i) => ({
                  value: String(i),
                  label: `variation ${i + 1}`,
                  hint: animLabel(p.idle ?? p.active ?? '?'),
                }))}
                onChange={(v) => setPhaseIdx(Number(v))} />
            </WrapItem>
          )}
          {interactiveScene && interactiveScene.sections.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="body" value={String(sectionIdx)} minW="190px"
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
            </WrapItem>
          )}
          {linearScene && linearScene.beats.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="body" value={String(sceneBeatIdx)} minW="190px"
                label={sceneLoop ? 'Script beat — autoplay loops' : 'Script beat — click advances'}
                options={linearScene.beats.map((beat, i) => ({
                  value: String(i),
                  label: `${i + 1}. ${animLabel(beat.label)}`,
                }))}
                onChange={(value) => setSceneBeatIdx(Number(value))} />
            </WrapItem>
          )}
          {storySeq && storySeqs.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="auto" value={String(storySeqIdx)} minW="120px"
                label="Story sequence"
                options={storySeqs.map((s, i) => ({
                  value: String(i),
                  label: `${s.group} (${s.clips.length})`,
                }))}
                onChange={(v) => { setStorySeqIdx(Number(v)); setStoryIdx(0); }} />
            </WrapItem>
          )}
          {storySeq && (
            <WrapItem>
              <OverlaySelect icon="body" value={String(storyStep)} minW="190px"
                label="Story beat — clicking the figure advances"
                options={storySeq.clips.map((c, i) => ({
                  value: String(i),
                  label: `${i + 1}. ${animLabel(c)}`,
                }))}
                onChange={(v) => setStoryIdx(Number(v))} />
            </WrapItem>
          )}
          {/* Reaction clips no touch region maps to are only reachable here.
              The mapping is not encoded in the rig itself, so they are
              listed rather than silently unplayable. */}
          {interactiveScene && reactionClips.length > 0 && (
            <WrapItem>
              <OverlaySelect icon="touch" value="" minW="160px" label="Play a reaction clip"
                placeholder={`reactions (${reactionClips.length})`}
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
            </WrapItem>
          )}
          {faceOptions.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="face" value={faceAnim} options={faceOptions}
                onChange={setFaceAnim} minW="150px" label="Face expression" />
            </WrapItem>
          )}
          {overlayOptions.length > 1 && (
            <WrapItem>
              <OverlaySelect icon="overlay" value={overlayAnim} options={overlayOptions}
                onChange={setOverlayAnim} minW="150px" label="Prop / effect overlay" />
            </WrapItem>
          )}
          {loadState === 'ready' && (
            <WrapItem>
              <OverlaySelect icon="camera" value="" options={cameraOptions}
                onChange={handleCameraAction} minW="120px" label="Camera controls"
                placeholder="camera" />
            </WrapItem>
          )}
        </Wrap>

        {/* Auto-mode status: what the state machine is doing, and what the last
            touch actually resolved to (region -> effect -> clip or bone). */}
        {autoMode && loadState === 'ready' && (
          <Box position="absolute" top={12} left={2} bg="blackAlpha.700" borderRadius="md"
            px={2} py={1} pointerEvents="none" maxW="calc(100% - 60px)" zIndex={2}>
            <Text fontSize="xs" color="gray.300" noOfLines={1}>
              {linearScene
                ? `${sceneVariant} ${sceneBeatIdx + 1}/${linearScene.beats.length} — ${
                  sceneLoop ? 'autoplay loop; click to skip' : 'click to advance'}`
                : storySeq
                ? `${storySeq.group} ${storyStep + 1}/${storySeq.clips.length} — click to advance`
                : reaction
                  ? `reacting: ${animLabel(reaction)}`
                  : hasTouchBoxes
                    ? `idle — click the figure to touch${
                      mode === 'home' && jigglerCount
                        ? dragJiggle ? ' (drag jiggles)' : ` (${jigglerCount} jigglers live)`
                        : ''}`
                    : 'idle — no touch regions in this rig'}
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

        {/* Top-right: playback + capture controls */}
        <VStack position="absolute" top={2} right={2} spacing={1} align="flex-end"
          bg="blackAlpha.500" borderRadius="md" px={1} py={1} zIndex={2}>
          <PlayPauseButton playing={playing} onToggle={() => setPlaying((v) => !v)} />
          {!autoMode && <LoopButton loop={loop} onToggle={() => setLoop((v) => !v)} />}
          {linearScene && <LoopButton loop={sceneLoop} onToggle={() => setSceneLoop((v) => !v)} />}
          {mode === 'scene' && selectedScriptScene && (
            <IconBtn icon="camera"
              label={followGameFlow
                ? 'Follow game flow: play entry and scripted camera'
                : 'Viewer flow: skip entry and scripted camera'}
              active={followGameFlow} onClick={toggleFollowGameFlow} />
          )}
          <ReloadButton onClick={reloadPlayback} />
          <SaveButton onClick={handleSave} />
        </VStack>

        {showLayers && layerItems.length > 0 && (
          <LayerPanel items={layerItems} hidden={hiddenSlots} onSet={setLayerHidden}
            onReset={() => setLayerHidden(Array.from(hiddenSlots), false)}
            onClose={() => setShowLayers(false)} />
        )}

        {/* Bottom-right: store variant, touch boxes, layers, background. */}
        <HStack position="absolute" bottom={2} right={2} spacing={1} align="flex-end" zIndex={2}>
          <StoreStrip stores={stores} active={store}
            onSelect={(k) => { setStore(k); onStoreChange?.(k); }} />
          <VStack bg="blackAlpha.500" borderRadius="md" px={1} py={1} spacing={1}>
            {((interactiveScene && hasTouchBoxes)
              || (mode === 'home' && (hasTouchBoxes || jigglerCount > 0))) && (
              <IconBtn icon="touch" label={showBoxes
                ? `Hide ${mode === 'home' ? 'home touch zones' : 'touch regions'}`
                : `Show ${mode === 'home' ? 'home touch zones' : 'touch regions'}`}
                active={showBoxes} onClick={() => setShowBoxes((v) => !v)} />
            )}
            {mode === 'home' && jigglerCount > 0 && (
              <IconBtn icon="jiggle"
                label={dragJiggle
                  ? 'Drag-jiggle enabled — click to restore canvas pan'
                  : 'Tap jiggle is active — click to enable drag-jiggle'}
                active={dragJiggle} onClick={() => setDragJiggle((v) => !v)} />
            )}
            {layerItems.length > 0 && (
              <IconBtn icon="layers"
                label={showLayers ? 'Close the layer panel' : 'Advanced: turn skin layers on and off'}
                active={showLayers} onClick={() => setShowLayers((v) => !v)} />
            )}
            {layout?.world?.bg && (
              <IconBtn icon="bg" label={showBg ? 'Hide background' : 'Show background'}
                active={showBg} onClick={() => setShowBg((v) => !v)} />
            )}
          </VStack>
        </HStack>

        {unavailable && (
          <Center position="absolute" inset={0} px={4}>
            <Text fontSize="sm" color="gray.400" textAlign="center">{unavailable}</Text>
          </Center>
        )}
      </Box>
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
