// Session preferences, so changing the selected skin must not reset them. Only
// controls that mean the same thing across rigs belong here.
import { create } from 'zustand';
import type { PlayMode } from '@/components/skinViewer/types';

type ViewerStore = {
  playing: boolean;
  /** Drives the Spine clock, the in-world timers and the voice together, so a
   *  sped-up reaction stays in sync with its line. */
  speed: number;
  loop: boolean;
  showBg: boolean;
  mode: PlayMode;
  sceneVariant: 'view' | 'story';
  followGameFlow: boolean;
  sceneLoop: boolean;
  showBoxes: boolean;
  voiceOn: boolean;
  bgmOn: boolean;
  showLayers: boolean;
  dragJiggle: boolean;
  /** The named ratios are the ones the rigs author `CutsceneOffset` samples
   *  for; `fill` uses the panel as it is. */
  canvasAspect: CanvasAspect;
  /** Canvas alone, filling the window, with the sidebar out of the way. */
  theater: boolean;
  set: (patch: Partial<Omit<ViewerStore, 'set'>>) => void;
};

export type CanvasAspect = 'fill' | '4:3' | '16:10' | '16:9' | '19.5:9';

export const CANVAS_ASPECTS: { value: CanvasAspect; label: string; ratio: number }[] = [
  { value: 'fill', label: 'Fill panel', ratio: 0 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '16:10', label: '16:10', ratio: 16 / 10 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '19.5:9', label: '19.5:9', ratio: 19.5 / 9 },
];

export const useViewerStore = create<ViewerStore>((set) => ({
  playing: true,
  speed: 1,
  loop: true,
  showBg: true,
  mode: 'manual',
  sceneVariant: 'view',
  followGameFlow: true,
  sceneLoop: true,
  showBoxes: false,
  voiceOn: true,
  bgmOn: true,
  showLayers: false,
  dragJiggle: false,
  canvasAspect: 'fill',
  theater: false,
  set: (patch) => set(patch),
}));
