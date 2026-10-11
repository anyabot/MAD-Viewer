// Every control carries a visible name. A fixed set of choices is a segmented
// control or an on/off row; only an open-ended, rig-dependent list is a
// dropdown.
import {
  LayerPanel as HubLayerPanel, OverlaySelect as HubOverlaySelect, SegmentedControl,
  ToggleRow as HubToggleRow, type LayerItem, type ViewerIconName,
  type SelectOption,
} from '@altterisk/game-hub/viewer';
import { useLang, useT, type Localized } from '@/lib/i18n';
import type { StoreKey } from './types';

export {
  ActionButton, ControlRow, ControlSection, SegmentedControl,
  type LayerItem, type SegmentOption, type SelectOption,
} from '@altterisk/game-hub/viewer';

export function ToggleRow(props: {
  label: string; value: boolean; onChange: (value: boolean) => void;
}) {
  const t = useT();
  return <HubToggleRow {...props} labels={{ on: t('toggleOn'), off: t('toggleOff') }} />;
}

// Portalled so the viewer's `overflow: hidden` cannot clip the open list.
export function OverlaySelect({ placeholder, ...props }: {
  icon: ViewerIconName;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  minW?: string;
  label?: string;
  placeholder?: string;
}) {
  const t = useT();
  return <HubOverlaySelect {...props} placeholder={placeholder ?? t('optNone')} />;
}

export function LayerPanel(props: {
  items: LayerItem[];
  hidden: Set<string>;
  onSet: (slots: string[], hide: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <HubLayerPanel {...props} labels={{
      title: t('layers'),
      hidden: (n) => t('layersHidden', { n }),
      reset: t('layersReset'),
      showAll: t('layersShowAll'),
      close: t('layersClose'),
      filter: t('layersFilter'),
      noMatch: t('layersNoMatch'),
      count: (n) => t('layersCount', { n }),
      showGroup: t('layersShowGroup'),
      hideGroup: t('layersHideGroup'),
      showGroupAria: (group) => t('layersShowGroupAria', { group }),
      hideGroupAria: (group) => t('layersHideGroupAria', { group }),
      showSlot: (slot) => t('layersShowSlot', { slot }),
      hideSlot: (slot) => t('layersHideSlot', { slot }),
    }} />
  );
}

// OneStore ships the uncensored art, Google Play the censored edit.
export const STORE_META: Record<StoreKey, { short: string; label: Localized; image: string }> = {
  onestore: {
    short: 'ONE',
    label: { en: 'ONE store — uncensored', ko: '원스토어 — 무수정' },
    image: 'stores/onestore.png',
  },
  google: {
    short: 'GP',
    label: { en: 'Google Play — censored', ko: '구글 플레이 — 수정판' },
    image: 'stores/google.png',
  },
};

// Static assets are served under the export's base path.
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Shown only for skins whose art actually diverges.
export function StoreStrip({ stores, active, onSelect }: {
  stores: StoreKey[]; active: StoreKey; onSelect: (k: StoreKey) => void;
}) {
  const t = useT();
  const lang = useLang();
  if (stores.length < 2) return null;
  return (
    <SegmentedControl<StoreKey> value={active} onChange={onSelect} ariaLabel={t('ariaStoreBuild')}
      options={stores.map((k) => ({
        value: k,
        label: STORE_META[k].short,
        title: STORE_META[k].label[lang],
        image: `${PUBLIC_BASE}/${STORE_META[k].image}`,
      }))} />
  );
}
