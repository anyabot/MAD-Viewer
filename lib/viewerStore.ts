// Viewer controls are session preferences, so changing the selected skin must
// not silently reset them. Animation names and script progress remain local to
// each rig; only controls that have the same meaning across rigs live here.
import { create } from 'zustand';
import type { PlayMode } from '@/components/skinViewer/types';

type ViewerStore = {
  playing: boolean;
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
  set: (patch: Partial<Omit<ViewerStore, 'set'>>) => void;
};

export const useViewerStore = create<ViewerStore>((set) => ({
  playing: true,
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
  set: (patch) => set(patch),
}));
