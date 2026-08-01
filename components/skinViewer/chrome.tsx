// Shared overlay chrome for the skin viewer: dropdowns, icon buttons, the
// store-variant strip and the advanced layer panel.
//
// The LO viewer this was ported from used PNG icons extracted from the game's
// UI atlas. No MAD UI art is extracted, so these are inline SVG paths instead —
// self-contained, themeable, and no asset pipeline dependency.
import { useMemo, useState } from 'react';
import {
  Box, Divider, Flex, HStack, Input, Menu, MenuButton, MenuItem, MenuList,
  Portal, Spinner, Text, Tooltip, VStack,
} from '@chakra-ui/react';
import type { StoreKey } from './types';

type IconName =
  | 'play' | 'pause' | 'reload' | 'save' | 'loop' | 'bg' | 'face' | 'body' | 'store'
  | 'auto' | 'touch' | 'home' | 'layers' | 'chevron' | 'close' | 'jiggle' | 'overlay'
  | 'camera';

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
  // ripple: a jiggle-only region
  jiggle: 'M3 13c1.5-2 3-2 4.5 0S10.5 15 12 13s3-2 4.5 0 3 2 4.5 0v2.5c-1.5 2-3 2-4.5 0s-3-2-4.5 0-3 2-4.5 0-3-2-4.5 0zm0-6c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0v2.5c-1.5 2-3 2-4.5 0s-3-2-4.5 0-3 2-4.5 0-3-2-4.5 0z',
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <Box as="svg" viewBox="0 0 24 24" width={`${size}px`} height={`${size}px`}
      fill="currentColor" aria-hidden="true" flexShrink={0}>
      <path d={ICON_PATHS[name]} />
    </Box>
  );
}

// Icon button used in the canvas overlay panels. `active=false` dims it and
// draws a slash, matching the LO viewer's on/off affordance.
export function IconBtn({ icon, label, active, onClick, placement = 'left' }: {
  icon: IconName; label: string; active: boolean;
  onClick: () => void; placement?: 'left' | 'top';
}) {
  return (
    <Tooltip label={label} fontSize="xs" hasArrow placement={placement}>
      <Box as="button" onClick={onClick} position="relative" boxSize="34px"
        display="flex" alignItems="center" justifyContent="center" color="gray.100"
        borderRadius="md" opacity={active ? 1 : 0.45} transition="opacity 0.15s"
        _hover={{ opacity: active ? 0.85 : 0.7 }} aria-label={label}>
        <Icon name={icon} />
        {!active && (
          <Box position="absolute" inset={0} display="flex" alignItems="center"
            justifyContent="center" pointerEvents="none">
            <Box w="78%" h="2px" bg="red.400" transform="rotate(-45deg)" borderRadius="full" />
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

// Plain (never-slashed) overlay icon button.
function OverlayIconButton({ icon, label, onClick, dim = false, busy = false }: {
  icon: IconName; label: string; onClick: () => void; dim?: boolean; busy?: boolean;
}) {
  return (
    <Tooltip label={label} fontSize="xs" hasArrow placement="left">
      <Box as="button" onClick={onClick} boxSize="34px" display="flex" alignItems="center"
        justifyContent="center" color="gray.100" borderRadius="md"
        opacity={dim ? 0.45 : 0.85} _hover={{ opacity: 1 }} transition="opacity 0.15s"
        aria-label={label}>
        {busy ? <Spinner size="sm" /> : <Icon name={icon} />}
      </Box>
    </Tooltip>
  );
}

export function PlayPauseButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return <OverlayIconButton icon={playing ? 'pause' : 'play'}
    label={playing ? 'Pause' : 'Play'} onClick={onToggle} />;
}

export function ReloadButton({ onClick }: { onClick: () => void }) {
  return <OverlayIconButton icon="reload" label="Reload skin" onClick={onClick} />;
}

export function SaveButton({ onClick, saving = false }: { onClick: () => void; saving?: boolean }) {
  return <OverlayIconButton icon="save" label="Save visible area as PNG"
    onClick={onClick} busy={saving} />;
}

export function LoopButton({ loop, onToggle }: { loop: boolean; onToggle: () => void }) {
  return <IconBtn icon="loop" label={loop ? 'Looping' : 'Play once'}
    active={loop} onClick={onToggle} />;
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
    <Box position="absolute" top={2} right="52px" bottom={2}
      w={{ base: 'calc(100% - 64px)', md: '300px' }} bg="blackAlpha.800" backdropFilter="blur(4px)"
      borderRadius="md" border="1px solid" borderColor="whiteAlpha.300"
      display="flex" flexDirection="column" overflow="hidden" zIndex={5}>
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

// Store-build labels. OneStore ships the uncensored art; Google Play ships the
// censored edit. Only affection art differs.
export const STORE_META: Record<StoreKey, { short: string; label: string }> = {
  onestore: { short: 'ONE', label: 'ONE store — uncensored' },
  google: { short: 'GP', label: 'Google Play — censored' },
};

// Store-variant radio strip, shown only for skins whose art actually diverges.
export function StoreStrip({ stores, active, onSelect }: {
  stores: StoreKey[]; active: StoreKey; onSelect: (k: StoreKey) => void;
}) {
  if (stores.length < 2) return null;
  return (
    <HStack bg="blackAlpha.600" borderRadius="md" px={1} py={1} spacing={1}>
      {stores.map((k) => {
        const isActive = active === k;
        return (
          <Tooltip key={k} label={STORE_META[k].label} fontSize="xs" hasArrow placement="top">
            <Box as="button" onClick={() => { if (!isActive) onSelect(k); }}
              px={2} py={1} borderRadius="sm" fontSize="xs" fontWeight="bold" lineHeight="1"
              bg={isActive ? 'yellow.400' : 'whiteAlpha.200'}
              color={isActive ? 'gray.900' : 'gray.300'}
              _hover={{ bg: isActive ? 'yellow.300' : 'whiteAlpha.300' }}
              transition="background 0.15s" aria-pressed={isActive}>
              {STORE_META[k].short}
            </Box>
          </Tooltip>
        );
      })}
    </HStack>
  );
}
