// Every control carries a visible name. A fixed set of choices is a segmented
// control or an on/off row; only an open-ended, rig-dependent list is a
// dropdown. The icons are inline SVG so nothing here depends on the pipeline.
import { Children, useMemo, useState, type ReactNode } from 'react';
import {
  Box, Divider, Flex, HStack, Image, Input, Menu, MenuButton, MenuItem, MenuList,
  Portal, Spinner, Text, Tooltip, VStack,
} from '@chakra-ui/react';
import type { StoreKey } from './types';

type IconName =
  | 'play' | 'pause' | 'reload' | 'save' | 'loop' | 'bg' | 'face' | 'body' | 'store'
  | 'auto' | 'touch' | 'home' | 'layers' | 'chevron' | 'close' | 'jiggle' | 'overlay'
  | 'camera' | 'voice' | 'music' | 'speed' | 'aspect' | 'theater' | 'pan';

const ICON_PATHS: Record<IconName, string> = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  reload: 'M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
  save: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  bg: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z',
  face: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 17.5c-2.3 0-4.3-1.4-5.2-3.5h10.4c-.9 2.1-2.9 3.5-5.2 3.5z',
  body: 'M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-2 5h4a2 2 0 0 1 2 2v4h-1.5l-.5 9h-4l-.5-9H8V9a2 2 0 0 1 2-2z',
  store: 'M4 4h16v4H4zm1 6h14v10H5zm4 2v6h6v-6z',
  // house: the home-screen widget, driven by the prefab itself
  home: 'M12 3 2 12h3v9h6v-6h2v6h6v-9h3z',
  // wand: the script-driven scene plays itself
  auto: 'M7.5 5.6 5 4l1.6 2.5L5 9l2.5-1.6L10 9 8.4 6.5 10 4zM19 15l-1.9 1.2L18.3 18l-2.5-1L14 19l.9-2.4L13 15h2.4l.9-2.4L17.2 15zM11.3 8.9 3 17.2 5.8 20l8.3-8.3z',
  // pointing hand: touch regions
  touch: 'M9 11V4.5a1.5 1.5 0 0 1 3 0V11h.5l3.6.7A2 2 0 0 1 18 13.7V17a4 4 0 0 1-4 4h-2.6a4 4 0 0 1-3.1-1.5l-3-3.8a1.5 1.5 0 0 1 2.2-2L9 15z',
  // stacked sheets: per-slot attachment visibility
  layers: 'M12 3 2 8.5 12 14l10-5.5zM4.2 12 2 13.2 12 18.7l10-5.5-2.2-1.2L12 16zm0 4.6L2 17.8 12 23.3l10-5.5-2.2-1.2L12 20.6z',
  // sparkle: a prop/effect clip layered over the body
  overlay: 'M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM18 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9zM5.5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  camera: 'M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  chevron: 'M7 10l5 5 5-5z',
  close: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z',
  // speaker with waves: character voice playback
  voice: 'M4 9v6h4l5 4V5L8 9zm12.5 3a4 4 0 0 0-2.3-3.6v7.2A4 4 0 0 0 16.5 12zM14.2 3.2v2.1A6.8 6.8 0 0 1 14.2 18.7v2.1a8.8 8.8 0 0 0 0-17.6z',
  music: 'M12 3v10.6A4 4 0 1 0 14 17V8h5V3zM8 19a2 2 0 1 1 2-2 2 2 0 0 1-2 2z',
  // stopwatch: the playback-rate control
  speed: 'M15 1H9v2h6zm-4 12h2V8h-2zm8.03-6.61 1.42-1.42a10 10 0 0 0-1.4-1.4l-1.43 1.42A8 8 0 1 0 20 13a7.95 7.95 0 0 0-.97-3.83zM12 20a6 6 0 1 1 6-6 6 6 0 0 1-6 6z',
  // ripple: a jiggle-only region
  jiggle: 'M3 13c1.5-2 3-2 4.5 0S10.5 15 12 13s3-2 4.5 0 3 2 4.5 0v2.5c-1.5 2-3 2-4.5 0s-3-2-4.5 0-3 2-4.5 0-3-2-4.5 0zm0-6c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0v2.5c-1.5 2-3 2-4.5 0s-3-2-4.5 0-3 2-4.5 0-3-2-4.5 0z',
  // empty frame: the canvas shape the rig is composed into
  aspect: 'M2 7h20v10H2V7zM4 15h16V9H4v6z',
  // outward corners: the canvas alone, filling the window
  theater: 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
  // four-way arrows: dragging moves the canvas
  pan: 'M12 2l3 3h-2v5h5V8l3 3-3 3v-2h-5v5h2l-3 3-3-3h2v-5H6v2l-3-3 3-3v2h5V5H9z',
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <Box as="svg" viewBox="0 0 24 24" width={`${size}px`} height={`${size}px`}
      fill="currentColor" aria-hidden="true" flexShrink={0}>
      <path d={ICON_PATHS[name]} />
    </Box>
  );
}

// --- labelled control primitives -------------------------------------------

// Renders nothing when it has no rows, so a heading never stands alone.
export function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  if (!rows.length) return null;
  return (
    <Box>
      <Text fontSize="0.6rem" fontWeight="bold" textTransform="uppercase" letterSpacing="wide"
        color="gray.500" px={1} pb={1}>{title}</Text>
      <VStack align="stretch" spacing={1}>{rows}</VStack>
    </Box>
  );
}

// The label column is text only; the glyph sits inside the control itself.
export function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex align="center" gap={2} minH="30px">
      <Text fontSize="xs" color="gray.400" w="82px" flexShrink={0} noOfLines={1}>{label}</Text>
      <Flex flex="1" minW={0} justify="flex-end">{children}</Flex>
    </Flex>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** Longer wording for the hover tooltip; the visible label stays short. */
  title?: string;
  icon?: IconName;
  /** Renders the art at `public/<src>`, in place of the icon. */
  image?: string;
};

// A small fixed set of mutually exclusive choices, shown side by side.
export function SegmentedControl<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  if (!options.length) return null;
  return (
    <HStack role="group" aria-label={ariaLabel} bg="blackAlpha.600" borderRadius="md"
      p="2px" spacing="2px" w="100%" border="1px solid" borderColor="whiteAlpha.200">
      {options.map((option) => {
        const isActive = option.value === value;
        const button = (
          <Box as="button" flex="1" minW={0} px={1.5} py={1} borderRadius="sm"
            display="flex" alignItems="center" justifyContent="center" gap={1}
            fontSize="xs" fontWeight={isActive ? 'bold' : 'normal'} lineHeight="1.4"
            bg={isActive ? 'yellow.400' : 'transparent'}
            color={isActive ? 'gray.900' : 'gray.400'}
            _hover={{ bg: isActive ? 'yellow.300' : 'whiteAlpha.200' }}
            transition="background 0.15s" aria-label={option.label} aria-pressed={isActive}
            onClick={() => { if (!isActive) onChange(option.value); }}>
            {option.image
              ? <StoreArt src={option.image} alt="" />
              : option.icon ? <Icon name={option.icon} size={14} /> : null}
            <Text as="span" noOfLines={1}>{option.label}</Text>
          </Box>
        );
        return option.title
          ? (
            <Tooltip key={option.value} label={option.title} fontSize="xs" hasArrow
              placement="top" openDelay={400}>
              {button}
            </Tooltip>
          )
          : <Box key={option.value} flex="1" minW={0} display="flex">{button}</Box>;
      })}
    </HStack>
  );
}

// The state is spelled out rather than implied by a dimmed icon, which reads
// as "unavailable" as often as "off".
export function ToggleRow({ label, value, onChange }: {
  label: string; value: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <ControlRow label={label}>
      <Box as="button" onClick={() => onChange(!value)} aria-label={label} aria-pressed={value}
        display="flex" alignItems="center" gap={2} px={2} py={1} borderRadius="md" w="72px"
        justifyContent="space-between" border="1px solid" transition="all 0.15s"
        bg={value ? 'whiteAlpha.100' : 'blackAlpha.600'}
        borderColor={value ? 'yellow.400' : 'whiteAlpha.200'}
        color={value ? 'yellow.300' : 'gray.500'}
        _hover={{ borderColor: value ? 'yellow.300' : 'whiteAlpha.400' }}>
        <Box boxSize="8px" borderRadius="full" flexShrink={0} border="1px solid"
          borderColor={value ? 'yellow.300' : 'whiteAlpha.500'}
          bg={value ? 'yellow.300' : 'transparent'} />
        <Text fontSize="0.65rem" fontWeight="bold" letterSpacing="wide">
          {value ? 'ON' : 'OFF'}
        </Text>
      </Box>
    </ControlRow>
  );
}

// Icon plus its name, never a bare glyph.
export function ActionButton({ icon, label, onClick, disabled = false, busy = false }: {
  icon: IconName; label: string; onClick: () => void;
  disabled?: boolean; busy?: boolean;
}) {
  return (
    <Box as="button" onClick={() => { if (!disabled) onClick(); }} aria-label={label}
      disabled={disabled} display="flex" alignItems="center" gap={1.5} px={2} py={1.5}
      borderRadius="md" bg="blackAlpha.600" border="1px solid" borderColor="whiteAlpha.200"
      color={disabled ? 'gray.600' : 'gray.100'} opacity={disabled ? 0.5 : 1}
      cursor={disabled ? 'not-allowed' : 'pointer'} transition="all 0.15s"
      _hover={disabled ? {} : { bg: 'blackAlpha.800', borderColor: 'whiteAlpha.400' }}>
      {busy ? <Spinner size="xs" /> : <Icon name={icon} size={14} />}
      <Text fontSize="xs" whiteSpace="nowrap">{label}</Text>
    </Box>
  );
}

export type SelectOption = {
  value: string;
  label: string;
  group?: string;
  hint?: string;
};

// Portalled so the viewer's `overflow: hidden` cannot clip the open list.
export function OverlaySelect({
  icon, value, options, onChange, minW = '150px', label, placeholder,
}: {
  icon: IconName;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  minW?: string;
  /** Accessible name for the trigger; falls back to the current option. */
  label?: string;
  /** Shown when nothing matches `value` (an action list with no persistent selection). */
  placeholder?: string;
}) {
  const grouped = useMemo(() => {
    const out: { group: string | null; options: SelectOption[] }[] = [];
    for (const o of options) {
      const g = o.group ?? null;
      const last = out[out.length - 1];
      if (last && last.group === g) last.options.push(o);
      else out.push({ group: g, options: [o] });
    }
    return out;
  }, [options]);

  if (options.length === 0) return null;
  const current = options.find((o) => o.value === value)?.label ?? placeholder ?? '(none)';

  return (
    <Menu isLazy placement="bottom-start" autoSelect={false}>
      <Tooltip label={label ?? current} fontSize="xs" hasArrow openDelay={600}>
        <MenuButton as={Box} role="button" tabIndex={0} aria-label={label ?? current}
          bg="blackAlpha.700" borderRadius="md" px={2} py={1} minW={minW} maxW="100%"
          color="gray.200" cursor="pointer" border="1px solid" borderColor="whiteAlpha.200"
          _hover={{ bg: 'blackAlpha.800', borderColor: 'whiteAlpha.400' }}
          _focusVisible={{ outline: '2px solid', outlineColor: 'yellow.400' }}
          transition="background 0.15s, border-color 0.15s">
          <Flex align="center" gap={1}>
            <Icon name={icon} size={16} />
            <Text fontSize="xs" whiteSpace="nowrap" overflow="hidden"
              textOverflow="ellipsis" flex="1" textAlign="left">{current}</Text>
            <Box color="whiteAlpha.600"><Icon name="chevron" size={14} /></Box>
          </Flex>
        </MenuButton>
      </Tooltip>
      <Portal>
        <MenuList bg="gray.800" borderColor="whiteAlpha.300" py={1} minW="220px"
          maxW="min(360px, calc(100vw - 24px))" maxH="min(60vh, 420px)" overflowY="auto"
          boxShadow="dark-lg" zIndex="popover">
          {grouped.map(({ group, options: opts }, gi) => (
            <Box key={group ?? `g${gi}`}>
              {group && (
                <Text px={3} pt={2} pb={1} fontSize="0.65rem" fontWeight="bold"
                  textTransform="uppercase" letterSpacing="wide" color="gray.500">
                  {group}
                </Text>
              )}
              {opts.map((o) => {
                const isActive = o.value === value;
                return (
                  <MenuItem key={o.value} onClick={() => onChange(o.value)}
                    bg={isActive ? 'whiteAlpha.200' : 'transparent'}
                    _hover={{ bg: 'whiteAlpha.300' }} _focus={{ bg: 'whiteAlpha.300' }}
                    fontSize="xs" py={1.5} px={3} display="block">
                    <Text color={isActive ? 'yellow.300' : 'gray.100'}
                      fontWeight={isActive ? 'bold' : 'normal'}>{o.label}</Text>
                    {o.hint && (
                      <Text fontSize="0.65rem" color="gray.500" fontFamily="mono">{o.hint}</Text>
                    )}
                  </MenuItem>
                );
              })}
            </Box>
          ))}
        </MenuList>
      </Portal>
    </Menu>
  );
}

// --- advanced layer panel ---------------------------------------------------

export type LayerItem = {
  slot: string;
  attachment: string;
  group: string;
};

export function LayerPanel({ items, hidden, onSet, onReset, onClose }: {
  items: LayerItem[];
  hidden: Set<string>;
  onSet: (slots: string[], hide: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, LayerItem[]>();
    for (const it of items) {
      if (q && !it.slot.toLowerCase().includes(q) && !it.attachment.toLowerCase().includes(q)) {
        continue;
      }
      const list = map.get(it.group);
      if (list) list.push(it);
      else map.set(it.group, [it]);
    }
    return Array.from(map.entries());
  }, [items, query]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <Box bg="blackAlpha.400" borderRadius="md" border="1px solid" borderColor="whiteAlpha.300"
      display="flex" flexDirection="column" overflow="hidden"
      maxH={{ base: '50vh', lg: '340px' }} minH="180px">
      <Flex align="center" gap={2} px={2} py={1.5} borderBottom="1px solid"
        borderColor="whiteAlpha.200">
        <Icon name="layers" size={16} />
        <Text fontSize="xs" fontWeight="bold" color="gray.100" flex="1">
          Layers{hidden.size ? ` — ${hidden.size} hidden` : ''}
        </Text>
        {hidden.size > 0 && (
          <Box as="button" onClick={onReset} fontSize="0.65rem" color="yellow.300"
            px={1.5} py={0.5} borderRadius="sm" _hover={{ bg: 'whiteAlpha.200' }}
            aria-label="Show all layers">reset</Box>
        )}
        <Box as="button" onClick={onClose} color="gray.400" _hover={{ color: 'gray.100' }}
          aria-label="Close layer panel"><Icon name="close" size={12} /></Box>
      </Flex>

      <Box px={2} py={1.5}>
        <Input size="xs" placeholder="filter slots…" value={query} borderRadius="md"
          onChange={(e) => setQuery(e.target.value)} bg="whiteAlpha.100"
          borderColor="whiteAlpha.300" _placeholder={{ color: 'gray.500' }} />
      </Box>

      <VStack align="stretch" spacing={0} overflowY="auto" flex="1" px={1} pb={2}>
        {groups.map(([group, list]) => {
          const allHidden = list.every((it) => hidden.has(it.slot));
          return (
            <Box key={group}>
              <Flex align="center" gap={2} px={2} pt={2} pb={1}>
                <Text fontSize="0.65rem" fontWeight="bold" textTransform="uppercase"
                  letterSpacing="wide" color="gray.500" flex="1">{group}</Text>
                <Box as="button" fontSize="0.65rem" color="gray.400"
                  _hover={{ color: 'yellow.300' }}
                  aria-label={`${allHidden ? 'Show' : 'Hide'} all ${group} layers`}
                  onClick={() => onSet(list.map((it) => it.slot), !allHidden)}>
                  {allHidden ? 'show all' : 'hide all'}
                </Box>
              </Flex>
              {list.map((it) => {
                const isHidden = hidden.has(it.slot);
                return (
                  <Flex key={it.slot} as="button" w="100%" align="center" gap={2} px={2} py={1}
                    borderRadius="sm" textAlign="left" _hover={{ bg: 'whiteAlpha.150' }}
                    aria-label={`${isHidden ? 'Show' : 'Hide'} ${it.slot}`}
                    aria-pressed={!isHidden}
                    onClick={() => onSet([it.slot], !isHidden)}>
                    <Box boxSize="12px" borderRadius="sm" border="1px solid" flexShrink={0}
                      borderColor={isHidden ? 'whiteAlpha.400' : 'yellow.400'}
                      bg={isHidden ? 'transparent' : 'yellow.400'} />
                    <Box minW={0} flex="1">
                      <Text fontSize="0.7rem" fontFamily="mono"
                        color={isHidden ? 'gray.600' : 'gray.100'} noOfLines={1}>
                        {it.slot}
                      </Text>
                      {it.attachment !== it.slot && (
                        <Text fontSize="0.6rem" color="gray.600" noOfLines={1}>
                          {it.attachment}
                        </Text>
                      )}
                    </Box>
                  </Flex>
                );
              })}
            </Box>
          );
        })}
        {shown === 0 && (
          <Text fontSize="xs" color="gray.500" p={3}>no slot matches</Text>
        )}
      </VStack>

      <Divider borderColor="whiteAlpha.200" />
      <Text fontSize="0.6rem" color="gray.500" px={2} py={1}>
        {items.length} renderable slots
      </Text>
    </Box>
  );
}

// OneStore ships the uncensored art, Google Play the censored edit.
export const STORE_META: Record<StoreKey, { short: string; label: string; image: string }> = {
  onestore: { short: 'ONE', label: 'ONE store — uncensored', image: 'stores/onestore.png' },
  google: { short: 'GP', label: 'Google Play — censored', image: 'stores/google.png' },
};

// Static assets are served under the export's base path.
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function StoreArt({ src, alt }: { src: string; alt: string }) {
  return <Image src={`${PUBLIC_BASE}/${src}`} alt={alt} boxSize="14px" flexShrink={0} />;
}

// Shown only for skins whose art actually diverges.
export function StoreStrip({ stores, active, onSelect }: {
  stores: StoreKey[]; active: StoreKey; onSelect: (k: StoreKey) => void;
}) {
  if (stores.length < 2) return null;
  return (
    <SegmentedControl<StoreKey> value={active} onChange={onSelect} ariaLabel="Store build"
      options={stores.map((k) => ({
        value: k,
        label: STORE_META[k].short,
        title: STORE_META[k].label,
        image: STORE_META[k].image,
      }))} />
  );
}
