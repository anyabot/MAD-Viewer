// One character, in as many tabs as it has content for: a wiki-style infobox
// of the non-gameplay master data, the skill kit with what each skill
// mechanically does, a unit stat calculator, and every skin the character has —
// standing, affection, desire — in the Spine viewer. An NPC usually has only
// the first, and then there is no tab bar at all.
//
// The route is `/character?code=CH0001` rather than a `[code]` segment: all
// game data is fetched at runtime, so a build-time path list would have to be
// regenerated whenever a character is added.
//
// Mobile-first: the infobox sits above the profile panels on `base` and beside
// them from `lg`; the skin strip scrolls inside its own box.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Divider, Flex, Grid, HStack, Popover, PopoverArrow, PopoverBody,
  PopoverContent, PopoverTrigger, Portal, SimpleGrid, Slider, SliderFilledTrack,
  SliderThumb, SliderTrack, Spinner, Tab, TabList, TabPanel, TabPanels, Tabs, Text,
  VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import SkinViewer from '@/components/skinViewer';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { StoreKey } from '@/components/skinViewer/types';
import { GameIcon, StarRating } from '@/components/gameIcon';
import { characterIcon, resolveIcon, skinIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import {
  BUFF_CATEGORY, EQUIP_EN, KIND_ICON, MOVE_LABEL, OP_LABEL, OP_SCHEME,
  SETUP_CONDITION_LABEL, SIDE_LABEL, SKILL_CATEGORY_LABEL, STAT_LABEL, TARGET_LABEL,
  TRIGGER_LABEL, TYPE_LABEL, altNameEn, birthdayText, castSummary, colorRuns,
  computeStats, datePlacesOf, detailSummary, equipmentGrants, equipmentSlotsOf,
  gateSummary, giftsOf, hitSummary, isPlayable, labelOf, membersOfType, opAmounts,
  opSeconds, rosterNote, scaleSummary, skillGrades, skillsAtGrade, skinIconNames,
  skinsByCharacter,
  statAmount, statGrades, statText, typeIcons, typeLabel, typeOf, typeTint, typeValue,
  type EquipInput, type TypeTable,
} from '@/lib/characters';
import {
  KIND_COLOR, KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type BuffEntry, type CharacterData, type CharacterEntry, type IconManifest,
  type SkillBehaviour, type SkillEntry, type SkillOp, type SkinListEntry,
} from '@/lib/data';

const INFO_TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division', 'faction'];

export default function CharacterPage() {
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : null;

  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('onestore');

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const mine = useMemo(
    () => (code ? skinsByCharacter(skins).get(code) ?? [] : []), [skins, code]);

  // Reset the selection when the route changes to a different character.
  useEffect(() => { setSelected(null); }, [code]);
  const current = useMemo(
    () => mine.find((s) => s.key === selected) ?? mine[0] ?? null, [mine, selected]);

  useEffect(() => {
    if (current && !current.stores.includes(store)) setStore(current.stores[0] ?? 'onestore');
  }, [current, store]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!chars || !router.isReady) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">loading…</Text></VStack>
      </Center>
    );
  }

  const entry: CharacterEntry | null = code ? chars.characters[code] ?? null : null;
  if (!entry) {
    return (
      <VStack align="start" spacing={3} py={10}>
        <Text color="gray.400">
          {code ? `no character data for ${code}` : 'no character selected'}
        </Text>
        <Text as={NextLink} href="/characters" color="yellow.300" fontSize="sm">
          ← characters
        </Text>
      </VStack>
    );
  }

  const element = typeOf(entry, chars.types, 'attribute');
  const roster = rosterNote(entry);

  // Only what the character has gets a tab. An NPC carries a profile and
  // little else, and a row of tabs whose panels all say "no data" is noise;
  // with one section left there is nothing to switch between, so the tab bar
  // goes too.
  const tabs: { key: string; label: string; count?: number; panel: React.ReactNode }[] = [];

  // The infobox is a fixed-width card; everything else flows beside it and
  // wraps under it on a narrow screen. Keeping the tall blocks (skills) in the
  // same column as the short ones stops the grid from leaving a column-height
  // gap.
  tabs.push({
    key: 'profile',
    label: 'Profile',
    panel: (
      <Grid templateColumns={{ base: '1fr', lg: '300px minmax(0, 1fr)' }} gap={4}
        alignItems="start">
        <Infobox entry={entry} data={chars} icons={icons} accent={element?.color}
          skins={mine} />

        <VStack align="stretch" spacing={3} minW={0}>
          {entry.desc && (
            <Panel title="Profile">
              <Text fontSize="sm" whiteSpace="pre-wrap">{entry.desc}</Text>
            </Panel>
          )}

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} alignItems="start">
            <EquipmentSlots entry={entry} data={chars} icons={icons} />
            <Gifts entry={entry} data={chars} icons={icons} />
          </SimpleGrid>

          <DateVenues entry={entry} data={chars} icons={icons} />
        </VStack>
      </Grid>
    ),
  });

  // The kit is its own tab: the skill rows carry a behaviour breakdown each,
  // which makes the block far taller than the profile column it used to share.
  if (skillGrades(entry, chars).length > 0) {
    tabs.push({
      key: 'skills',
      label: 'Skills',
      panel: (
        <VStack align="stretch" spacing={3} minW={0}>
          <Skills entry={entry} data={chars} icons={icons} />
          <Rotation entry={entry} data={chars} icons={icons} />
        </VStack>
      ),
    });
  }

  // The calculator owns its own inputs, so it is a tab rather than a profile
  // panel — the level, star, equipment and affection pickers are as tall as
  // the result table.
  if (entry.baseStats) {
    tabs.push({
      key: 'stats',
      label: 'Stats',
      panel: <StatCalculator entry={entry} data={chars} icons={icons} />,
    });
  }

  if (mine.length > 0) {
    tabs.push({
      key: 'skins',
      label: 'Skins',
      count: mine.length,
      panel: (
        <VStack align="stretch" spacing={3} minW={0}>
          <SkinStrip skins={mine} entry={entry} icons={icons}
            selected={current?.key ?? null} onSelect={setSelected} />
          {current && (
            <VStack align="stretch" spacing={2}>
              <Wrap spacing={2} align="center">
                <WrapItem>
                  <Badge colorScheme={KIND_COLOR[current.kind]}>
                    {KIND_LABEL[current.kind]}
                  </Badge>
                </WrapItem>
                <WrapItem>
                  <Text fontFamily="mono" fontSize="sm" color="gray.400">
                    {current.key}
                  </Text>
                </WrapItem>
                <WrapItem>
                  <Text fontSize="xs" color="gray.500">
                    {current.animations} anims
                    {current.faces ? ` · ${current.faces} faces` : ''}
                  </Text>
                </WrapItem>
                {current.stores.length > 1 && (
                  <WrapItem>
                    <Badge colorScheme="yellow" title="store art differs">
                      DIFF · {STORE_META[store].short}
                    </Badge>
                  </WrapItem>
                )}
                {current.hasBg && (
                  <WrapItem><Badge colorScheme="blue">background</Badge></WrapItem>
                )}
              </Wrap>
              <SkinViewer key={current.key} skin={current.key} stores={current.stores}
                store={store} onStoreChange={setStore} height="70vh" />
            </VStack>
          )}
        </VStack>
      ),
    });
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="baseline" gap={3} wrap="wrap">
        <Text as={NextLink} href="/characters" fontSize="sm" color="gray.500"
          _hover={{ color: 'gray.200' }}>← characters</Text>
        <Text fontSize="2xl" fontWeight="bold">{entry.name || entry.code}</Text>
        {entry.nameEn && <Text fontSize="md" color="gray.500">{entry.nameEn}</Text>}
        {/* the game's second, independent English name, when it is not just
            the first one in caps */}
        {altNameEn(entry) && (
          <Text fontSize="sm" color="gray.600">{altNameEn(entry)}</Text>
        )}
        <Text fontFamily="mono" fontSize="sm" color="gray.500">{entry.code}</Text>
        {roster && <Badge colorScheme={roster.scheme}>{roster.label}</Badge>}
        {/* a story-only character has no master-data row; the scripts address
            it by this id and that is where its name came from */}
        {entry.actorId && (
          <Text fontFamily="mono" fontSize="xs" color="gray.500">{entry.actorId}</Text>
        )}
      </Flex>

      {tabs.length === 1 ? (
        <Box pt={1}>{tabs[0].panel}</Box>
      ) : (
        // The viewer is tall enough to push the profile off a phone screen, so
        // the sections are tabs rather than one column. Each mounts only when
        // its tab is opened.
        <Tabs variant="line" colorScheme="yellow" isLazy>
          <TabList borderColor="whiteAlpha.200" overflowX="auto">
            {tabs.map((tab) => (
              <Tab key={tab.key} fontSize="sm" whiteSpace="nowrap">
                <HStack spacing={2}>
                  <Text>{tab.label}</Text>
                  {tab.count != null && (
                    <Badge fontSize="0.6rem" colorScheme="gray">{tab.count}</Badge>
                  )}
                </HStack>
              </Tab>
            ))}
          </TabList>

          <TabPanels>
            {tabs.map((tab) => (
              <TabPanel key={tab.key} px={0} pt={4}>{tab.panel}</TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      )}
    </VStack>
  );
}

// One infobox fact that also names a filter axis: clicking it opens the
// character list showing exactly the characters that share the value.
function FilterLink({ onClick, children }: {
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <Box as={NextLink} href="/characters" onClick={onClick} display="inline-flex"
      alignItems="center" gap={1.5} _hover={{ textDecoration: 'underline' }}>
      {children}
    </Box>
  );
}

// The characters that share a faction, shown on hover over the faction row.
// Hover only: on a touch screen the row itself is the link to the same list.
function MemberPopover({ members, icons, children }: {
  members: CharacterEntry[]; icons: IconManifest | null; children: React.ReactNode;
}) {
  if (!members.length) return <>{children}</>;
  return (
    <Popover trigger="hover" placement="right" isLazy openDelay={120} closeDelay={80}>
      <PopoverTrigger><Box>{children}</Box></PopoverTrigger>
      <Portal>
        <PopoverContent bg="gray.800" borderColor="whiteAlpha.300" w="280px">
          <PopoverArrow bg="gray.800" />
          <PopoverBody maxH="320px" overflowY="auto" px={2} py={2}>
            <SimpleGrid columns={3} spacing={1}>
              {members.map((m) => (
                <VStack key={m.code} as={NextLink} spacing={0.5} p={1} borderRadius="md"
                  href={{ pathname: '/character', query: { code: m.code } }}
                  _hover={{ bg: 'whiteAlpha.200' }}>
                  <GameIcon manifest={icons} group="char" name={m.iconPath}
                    names={[m.iconPath, `Icon_${m.code}`]} size="100%" w="100%" h="auto"
                    sx={{ aspectRatio: '1 / 1' }} borderRadius="sm" />
                  <Text fontSize="0.6rem" noOfLines={1} textAlign="center" w="100%">
                    {m.name || m.code}
                  </Text>
                </VStack>
              ))}
            </SimpleGrid>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

// The wiki infobox: cut-in art, then every non-gameplay fact the master data
// carries. Rows with no value are omitted entirely rather than shown empty,
// and a character with neither art nor facts gets no card at all. Every type
// row and the rarity are links into the character list.
//
// Only the playable roster and ten NPCs have cut-in art; where there is none,
// the character's own rig icon stands in.
function Infobox({ entry, data, icons, accent, skins }: {
  entry: CharacterEntry; data: CharacterData;
  icons: IconManifest | null; accent?: string; skins: SkinListEntry[];
}) {
  const focusType = useFilters((s) => s.focusType);
  const focusStar = useFilters((s) => s.focusStar);
  const rows: { label: string; node: React.ReactNode }[] = [];

  for (const table of INFO_TABLES) {
    const t = typeOf(entry, data.types, table);
    const value = typeValue(entry, table);
    if (!t || value == null) continue;
    const link = (
      <FilterLink onClick={() => focusType(table, value, !isPlayable(entry))}>
        <GameIcon manifest={icons} group="ui" names={typeIcons(t)} size={5}
          tint={typeTint(t)} />
        <Text color={t.color}>{typeLabel(t)}</Text>
        <Text color="gray.500" fontSize="xs">{t.name}</Text>
      </FilterLink>
    );
    rows.push({
      label: TYPE_LABEL[table],
      node: table === 'faction'
        ? (
          <MemberPopover members={membersOfType(data.characters, table, value)} icons={icons}>
            {link}
          </MemberPopover>
        )
        : link,
    });
  }
  if (entry.defaultStar) {
    const star = entry.defaultStar;
    rows.splice(1, 0, {
      label: 'Rarity',
      node: (
        <FilterLink onClick={() => focusStar(star)}>
          <StarRating manifest={icons} star={star} size={4} />
        </FilterLink>
      ),
    });
  }

  const text: [string, string | null | undefined][] = [
    ['Birthday', birthdayText(entry)],
    ['Artist', entry.artist],
    ['CV', entry.cv],
    ['Hobby', entry.hobby],
    ['Specialty', entry.specialty],
    ['Likes', entry.likes],
  ];
  for (const [label, value] of text) {
    if (value) rows.push({ label, node: <Text>{value}</Text> });
  }

  const cutin = resolveIcon(icons, 'cutin', [`Cut_${entry.code}`, `CUT_${entry.code}`]);
  const art = cutin ?? characterIcon(icons, entry, skins);
  if (!art && !rows.length && !entry.comment && !entry.birthdayComment) return null;

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.300" borderRadius="md"
      borderTopWidth="3px" borderTopColor={accent ?? 'whiteAlpha.400'}
      bg="whiteAlpha.50" overflow="hidden">
      {art && (
        <Center bg="blackAlpha.400" py={2}>
          {/* a cut-in is tall portrait art; a rig icon is a small square and
              must not be blown up to the same height */}
          <Box as="img" src={art} alt="" w="auto" objectFit="contain"
            maxH={cutin ? '260px' : '120px'} />
        </Center>
      )}

      <VStack align="stretch" spacing={0} fontSize="sm">
        {rows.map(({ label, node }) => (
          <Flex key={label} px={3} py={1.5} gap={2} align="center"
            borderTopWidth="1px" borderColor="whiteAlpha.100">
            <Text minW="82px" color="gray.500" fontSize="xs" textTransform="uppercase"
              letterSpacing="wide">{label}</Text>
            <Box flex="1" minW={0}>{node}</Box>
          </Flex>
        ))}
      </VStack>

      {(entry.comment || entry.birthdayComment) && (
        <>
          <Divider borderColor="whiteAlpha.200" />
          <VStack align="stretch" spacing={2} px={3} py={2} fontSize="sm">
            {entry.comment && (
              <Box>
                <Text fontSize="xs" color="gray.500">Status message</Text>
                <Text>{entry.comment}</Text>
              </Box>
            )}
            {entry.birthdayComment && (
              <Box>
                <Text fontSize="xs" color="gray.500">Birthday message</Text>
                <Text>{entry.birthdayComment}</Text>
              </Box>
            )}
          </VStack>
        </>
      )}
    </Box>
  );
}

// A titled panel. Used by every profile block below the infobox so they read
// as one column.
function Panel({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" p={3}>
      <Flex align="baseline" gap={2} mb={2} wrap="wrap">
        <Text fontSize="xs" color="gray.500" textTransform="uppercase"
          letterSpacing="wide">{title}</Text>
        {note && <Text fontSize="xs" color="gray.600">{note}</Text>}
      </Flex>
      {children}
    </Box>
  );
}

// The game's own `<color=#rrggbb>` markup around the numbers it highlights.
function GameText({ text }: { text: string }) {
  return (
    <>
      {colorRuns(text).map((run, i) => (
        <Text as="span" key={i} color={run.color}>{run.text}</Text>
      ))}
    </>
  );
}

// The three equipment slots this character can fill. The art is the empty
// slot; what goes in it is player inventory, not master data. The slot types
// have no English column in the master data, so `EQUIP_EN` supplies it and the
// game's own Korean label stays underneath.
function EquipmentSlots({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const slots = equipmentSlotsOf(entry, data.equipment);
  if (!slots.length) return null;
  return (
    <Panel title="Equipment slots">
      <HStack spacing={2} align="start">
        {slots.map((slot) => (
          <VStack key={slot.type} spacing={0.5} flex="1" minW={0}>
            <GameIcon manifest={icons} group="equip" name={slot.icon} size={10} />
            <Text fontSize="xs" color="gray.300" noOfLines={1}>
              {EQUIP_EN[slot.type] ?? slot.name ?? slot.type}
            </Text>
            {slot.name && (
              <Text fontSize="0.6rem" color="gray.600" noOfLines={1}>{slot.name}</Text>
            )}
          </VStack>
        ))}
      </HStack>
    </Panel>
  );
}

// The three gifts this character likes. `gift_item_id_favorite` ships empty
// for every character, so there is no second tier to show.
function Gifts({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const gifts = giftsOf(entry, data.items);
  if (!gifts.length) return null;
  return (
    <Panel title="Liked gifts">
      <VStack align="stretch" spacing={2}>
        {gifts.map((gift) => (
          <HStack key={gift.id} align="start" spacing={2}>
            <GameIcon manifest={icons} group="item" name={gift.icon} size={8} reserve={false} />
            <Box minW={0}>
              <Text fontSize="sm">{gift.name ?? gift.id}</Text>
              {gift.flavor && (
                <Text fontSize="xs" color="gray.500" noOfLines={2}>{gift.flavor}</Text>
              )}
            </Box>
          </HStack>
        ))}
      </VStack>
    </Panel>
  );
}

// The venues a date can be at. The master data records the *region* per
// character (`flirting_division_type`), not one favourite venue, so this lists
// the whole region.
function DateVenues({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const regions = datePlacesOf(entry, data.places).filter((r) => r.places.length);
  if (!regions.length) return null;
  return (
    <>
      {regions.map(({ division, places }) => {
        const t = data.types.division[String(division)] ?? null;
        return (
          <Panel key={division} title="Date venues"
            note={`${typeLabel(t) || division} · ${places.length}`}>
            <Wrap spacing={2}>
              {places.map((place) => (
                <WrapItem key={place.id}>
                  <VStack spacing={1} w="72px" title={place.desc ?? undefined}>
                    <GameIcon manifest={icons} group="place" name={place.thumbnail}
                      size="auto" w="72px" h="44px" borderRadius="sm" reserve={false} />
                    <Text fontSize="0.65rem" color="gray.400" noOfLines={2}
                      textAlign="center">{place.name ?? place.id}</Text>
                  </VStack>
                </WrapItem>
              ))}
            </Wrap>
          </Panel>
        );
      })}
    </>
  );
}

// A labelled slider. The value sits on the label row so the control stays one
// line high on a phone.
function Dial({ label, value, min, max, note, onChange }: {
  label: string; value: number; min: number; max: number;
  note?: string | null; onChange: (v: number) => void;
}) {
  return (
    <Box>
      <Flex align="baseline" gap={2} mb={1} wrap="wrap">
        <Text fontSize="xs" color="gray.500" textTransform="uppercase"
          letterSpacing="wide">{label}</Text>
        <Text fontSize="sm" fontWeight="bold" color="yellow.200">{value}</Text>
        {note && <Text fontSize="xs" color="gray.600">{note}</Text>}
      </Flex>
      <Slider value={value} min={min} max={max} step={1} onChange={onChange}
        focusThumbOnChange={false}>
        <SliderTrack bg="whiteAlpha.200"><SliderFilledTrack bg="yellow.400" /></SliderTrack>
        <SliderThumb boxSize={3.5} />
      </Slider>
    </Box>
  );
}

// A row of small toggles, used for the star grade.
function Choices({ label, options, value, onChange }: {
  label: string; options: { value: number; text: string }[];
  value: number; onChange: (v: number) => void;
}) {
  return (
    <Flex align="center" gap={1} wrap="wrap">
      <Text fontSize="xs" color="gray.500" mr={1}>{label}</Text>
      {options.map((option) => (
        <Box key={option.value} as="button" onClick={() => onChange(option.value)}
          px={2} py={0.5} fontSize="xs" borderWidth="1px" borderRadius="md"
          borderColor={option.value === value ? 'yellow.400' : 'whiteAlpha.200'}
          color={option.value === value ? 'yellow.200' : 'gray.400'}>
          {option.text}
        </Box>
      ))}
    </Flex>
  );
}

// One equipment slot's picker: which tier is in it, and how far it is levelled.
// Tier 0 is the empty slot, which is the state a character starts in, and its
// art is the slot's own empty icon. Each tier is picked by the game's art for a
// filled slot at that tier — the tiers differ by colour, which a `T3` label
// does not carry.
function GearSlot({ slot, icons, tier, level, onChange }: {
  slot: ReturnType<typeof equipmentSlotsOf>[number]; icons: IconManifest | null;
  tier: number; level: number; onChange: (tier: number, level: number) => void;
}) {
  const tiers = slot.tiers ?? [];
  const current = tiers.find((t) => t.tier === tier) ?? null;
  const cap = current?.maxLevel ?? 1;
  const options = [
    { value: 0, icon: slot.icon, title: 'Empty' },
    ...tiers.map((t) => ({ value: t.tier, icon: t.icon, title: `Tier ${t.tier}` })),
  ];
  return (
    <Box>
      <HStack spacing={2} align="center" mb={1}>
        <GameIcon manifest={icons} group="equip" name={slot.icon} size={7} />
        <Text fontSize="sm">{EQUIP_EN[slot.type] ?? slot.name ?? slot.type}</Text>
        {slot.name && <Text fontSize="xs" color="gray.600">{slot.name}</Text>}
      </HStack>
      <Wrap spacing={1}>
        {options.map((option) => {
          const active = option.value === tier;
          return (
            <WrapItem key={option.value}>
              <Box as="button" title={option.title} aria-label={option.title}
                onClick={() => onChange(option.value, Math.min(level,
                  tiers.find((t) => t.tier === option.value)?.maxLevel ?? 1))}
                p={0.5} borderWidth="1px" borderRadius="md" lineHeight={0}
                borderColor={active ? 'yellow.400' : 'whiteAlpha.200'}
                bg={active ? 'whiteAlpha.200' : 'transparent'}
                opacity={active ? 1 : 0.55}
                _hover={{ opacity: 1, borderColor: active ? 'yellow.400' : 'whiteAlpha.500' }}>
                <GameIcon manifest={icons} group="equip" name={option.icon} size={8} />
              </Box>
            </WrapItem>
          );
        })}
      </Wrap>
      {current && (
        <Box mt={1}>
          <Dial label="Level" value={Math.min(level, cap)} min={1} max={cap}
            note={`max ${cap}`} onChange={(next) => onChange(tier, next)} />
        </Box>
      )}
    </Box>
  );
}

// What a character's stats come to at a chosen level, star grade, equipment set
// and affection rank.
//
// The terms are shown apart because each has its own source: the base column is
// the character's own growth, the equipment column is the fraction-of-base and
// flat options of what is in the three slots, and the affection column is the
// flat gain the relationship ranks add.
function StatCalculator({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const caps = data.statCaps;
  const grades = statGrades(entry, data);
  const slots = equipmentSlotsOf(entry, data.equipment);
  const [star, setStar] = useState<number | null>(null);
  const [level, setLevel] = useState(caps.level);
  // every character starts at affection rank 1, so that is the floor
  const [love, setLove] = useState(1);
  const [gear, setGear] = useState<Record<number, { tier: number; level: number }>>({});

  const shown = star ?? grades[grades.length - 1] ?? entry.defaultStar ?? 1;
  const equipment: EquipInput[] = slots.flatMap((slot) => {
    const set = gear[slot.type];
    return set?.tier ? [{ type: slot.type, tier: set.tier, level: set.level }] : [];
  });
  const rows = useMemo(
    () => computeStats(entry, data, { level, star: shown, love, equipment }),
    // `equipment` is rebuilt every render; `gear` is what actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, data, level, shown, love, gear, slots]);

  return (
    <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 320px) minmax(0, 1fr)' }}
      gap={4} alignItems="start">
      <VStack align="stretch" spacing={3}>
        <Panel title="Unit">
          <VStack align="stretch" spacing={3}>
            {grades.length > 1 && (
              <Choices label="Star" value={shown} onChange={setStar}
                options={grades.map((g) => ({ value: g, text: `${g}★` }))} />
            )}
            <Dial label="Level" value={level} min={1} max={caps.level}
              onChange={setLevel} />
            <Dial label="Affection" value={love} min={1} max={caps.love}
              note={data.loveTitles[love - 1]} onChange={setLove} />
          </VStack>
        </Panel>

        {slots.length > 0 && (
          <Panel title="Equipment">
            <VStack align="stretch" spacing={3}>
              {slots.map((slot) => {
                const set = gear[slot.type] ?? { tier: 0, level: 1 };
                return (
                  <GearSlot key={slot.type} slot={slot} icons={icons}
                    tier={set.tier} level={set.level}
                    onChange={(tier, next) => setGear((prev) => ({
                      ...prev, [slot.type]: { tier, level: next },
                    }))} />
                );
              })}
            </VStack>
          </Panel>
        )}
      </VStack>

      <Panel title="Stats" note={`${shown}★ · Lv ${level} · ♥ ${love}`}>
        <Box overflowX="auto">
          <Box as="table" w="100%" minW="360px" fontSize="sm"
            sx={{ 'th, td': { py: 1, px: 2, textAlign: 'right' },
              'th:first-of-type, td:first-of-type': { textAlign: 'left', pl: 0 } }}>
            <Box as="thead">
              <Box as="tr" color="gray.500" fontSize="xs">
                <Box as="th" fontWeight="normal">Stat</Box>
                <Box as="th" fontWeight="normal">Base</Box>
                <Box as="th" fontWeight="normal">Gear</Box>
                <Box as="th" fontWeight="normal">Affection</Box>
                <Box as="th" fontWeight="normal">Total</Box>
              </Box>
            </Box>
            <Box as="tbody">
              {rows.map((row) => (
                <Box as="tr" key={row.stat} borderTopWidth="1px"
                  borderColor="whiteAlpha.100">
                  <Box as="td">
                    <Text>{row.label}</Text>
                    {row.name && (
                      <Text fontSize="0.6rem" color="gray.600">{row.name}</Text>
                    )}
                  </Box>
                  <Box as="td" color="gray.400" fontFamily="mono">
                    {statText(row.display, row.base)}
                  </Box>
                  <Box as="td" color={row.equipment ? 'cyan.300' : 'gray.700'}
                    fontFamily="mono">
                    {row.equipment ? `+${statText(row.display, row.equipment)}` : '—'}
                  </Box>
                  <Box as="td" color={row.love ? 'pink.300' : 'gray.700'}
                    fontFamily="mono">
                    {row.love ? `+${statText(row.display, row.love)}` : '—'}
                  </Box>
                  <Box as="td" fontWeight="bold" fontFamily="mono">
                    {statText(row.display, row.total)}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
        {equipment.length > 0 && <GearGrants data={data} equipment={equipment} />}
      </Panel>
    </Grid>
  );
}

// What the filled slots grant, before the base stat is applied to the
// fractional ones — the table above shows the resulting number, this shows the
// option that produced it.
function GearGrants({ data, equipment }: {
  data: CharacterData; equipment: EquipInput[];
}) {
  return (
    <Wrap spacing={2} mt={3} pt={2} borderTopWidth="1px" borderColor="whiteAlpha.100">
      {equipment.flatMap((slot) => equipmentGrants(data, slot).map((grant, i) => (
        <WrapItem key={`${slot.type}-${i}`}>
          <Badge fontSize="0.6rem" colorScheme="cyan" variant="subtle">
            {labelOf(STAT_LABEL, grant.stat)}{' '}
            {grant.calc === 'MULTIPLICATION'
              ? `+${Number((grant.value * 100).toFixed(2))}%`
              : `+${Number(grant.value.toFixed(2))}`}
          </Badge>
        </WrapItem>
      )))}
    </Wrap>
  );
}

// The lasting states a skill applies at the picked level. Both the magnitude
// and the duration scale with the level, so this re-renders with it.
function BuffList({ buffs, icons }: {
  buffs: BuffEntry[]; icons: IconManifest | null;
}) {
  if (!buffs.length) return null;
  return (
    <VStack align="stretch" spacing={1} mt={1.5} pl={2}
      borderLeftWidth="2px" borderColor="whiteAlpha.200">
      {buffs.map((buff, i) => {
        const cat = BUFF_CATEGORY[buff.categorize];
        return (
          <Flex key={i} gap={2} align="start">
            <GameIcon manifest={icons} group="buff" name={buff.icon} size={4} mt={0.5} />
            <Box minW={0}>
              <Wrap spacing={1.5} align="baseline">
                <WrapItem>
                  <Text fontSize="xs" fontWeight="bold">
                    <GameText text={buff.name ?? ''} />
                  </Text>
                </WrapItem>
                {cat && (
                  <WrapItem>
                    <Badge fontSize="0.55rem" colorScheme={cat.scheme}>{cat.label}</Badge>
                  </WrapItem>
                )}
                {buff.seconds > 0 && buff.seconds < 9999 && (
                  <WrapItem><Text fontSize="0.6rem" color="gray.600">{buff.seconds}s</Text></WrapItem>
                )}
                {buff.maxStack > 1 && buff.maxStack < 99 && (
                  <WrapItem>
                    <Text fontSize="0.6rem" color="gray.600">×{buff.maxStack} max</Text>
                  </WrapItem>
                )}
              </Wrap>
              {buff.desc && (
                <Text fontSize="xs" color="gray.500">
                  <GameText text={buff.desc} />
                </Text>
              )}
            </Box>
          </Flex>
        );
      })}
    </VStack>
  );
}

// One operation a skill performs. The description above it says what the game
// tells the player; this says what the tables say, which is where the target
// side, the scaling stat and the unnamed effects become visible.
function OpRow({ op, level, period, data, icons }: {
  op: SkillOp; level: number; period: number;
  data: CharacterData; icons: IconManifest | null;
}) {
  const scheme = (op.op && OP_SCHEME[op.op])
    ?? BUFF_CATEGORY[op.categorize ?? 0]?.scheme
    ?? 'gray';
  const where = [
    op.team ? labelOf(TARGET_LABEL, op.team) : '',
    op.pick === 'ALL' ? 'all in range' : (op.count ? `${op.count}` : ''),
    op.applyTo && op.applyTo !== 'HOLDER' ? `on the ${SIDE_LABEL[op.applyTo]}` : '',
  ].filter(Boolean).join(' · ');
  const scale = scaleSummary(op);
  const amounts = opAmounts(op, level, period);
  const seconds = opSeconds(op, level, period);
  // an internal marker's id is all that identifies it, and a boss can name six
  // at once; show enough to read and keep the rest in the tooltip
  const detail = op.detail ? detailSummary(op.detail) : [];
  const shown = detail.slice(0, 3);
  return (
    <Flex gap={2} align="start" wrap="wrap">
      {op.icon
        ? <GameIcon manifest={icons} group="buff" name={op.icon} size={4} mt={0.5} />
        : <Box w={4} />}
      <Badge fontSize="0.55rem" colorScheme={scheme} mt={0.5}>
        {labelOf(OP_LABEL, op.op)}
      </Badge>
      {op.name && (
        <Text fontSize="xs" fontWeight="bold">
          <GameText text={op.name} />
        </Text>
      )}
      {amounts.length > 0 && (
        <Text fontSize="xs" color="yellow.200">{amounts.join(' / ')}</Text>
      )}
      {scale && <Text fontSize="0.65rem" color="gray.400">{scale}</Text>}
      {detail.length > 0 && (
        <Text fontSize="0.65rem" color="gray.300" noOfLines={1}
          title={detail.join(', ')}>
          {shown.map((v, i) => (
            <Text as="span" key={i}>
              {i > 0 && ', '}
              <GameText text={v} />
            </Text>
          ))}
          {detail.length > shown.length && ` +${detail.length - shown.length}`}
        </Text>
      )}
      {op.gate && (
        <Text fontSize="0.65rem" color="cyan.300">{gateSummary(op.gate, data)}</Text>
      )}
      {seconds && <Text fontSize="0.65rem" color="gray.500">{seconds}</Text>}
      {op.interval ? (
        <Text fontSize="0.65rem" color="gray.500">every {op.interval}s</Text>
      ) : null}
      {(op.maxStack ?? 0) > 1 && (op.maxStack ?? 0) < 99 && (
        <Text fontSize="0.6rem" color="gray.600">×{op.maxStack} max</Text>
      )}
      {where && <Text fontSize="0.65rem" color="gray.600">{where}</Text>}
    </Flex>
  );
}

// What a skill mechanically does, as opposed to what its description says.
//
// Structure only — which operation lands on whom, scaled off which stat. The
// magnitudes stay in the description, because the arithmetic that turns a
// coefficient into a battle number is not decoded and must not be implied here.
function Behaviour({ behaviour, level, period, data, icons }: {
  behaviour: SkillBehaviour; level: number; period: number;
  data: CharacterData; icons: IconManifest | null;
}) {
  const { hits, moves, stats, triggers } = behaviour;

  return (
    <VStack align="stretch" spacing={1.5} mt={2} pt={2}
      borderTopWidth="1px" borderColor="whiteAlpha.100">
      {(moves ?? []).length > 0 && (
        <Text fontSize="xs" color="gray.400">
          {(moves ?? []).map((m) => labelOf(MOVE_LABEL, m)).join(', ')}
        </Text>
      )}

      {(hits ?? []).map((hit, i) => (
        <Box key={i}>
          <Text fontSize="0.65rem" color="gray.500">
            {hitSummary(hit)}
            {hit.cast && castSummary(hit.cast) && ` · on ${castSummary(hit.cast)}`}
          </Text>
          <VStack align="stretch" spacing={0.5} mt={0.5}>
            {hit.ops.map((op, j) => (
              <OpRow key={j} op={op} level={level} period={period} data={data}
                icons={icons} />
            ))}
          </VStack>
        </Box>
      ))}

      {(stats ?? []).map((stat, i) => (
        <Flex key={i} gap={2} align="baseline" wrap="wrap">
          <Box w={4} />
          <Badge fontSize="0.55rem" colorScheme="green">
            {labelOf(STAT_LABEL, stat.stat)} {statAmount(stat)}
          </Badge>
          {stat.condition && (
            <Text fontSize="0.65rem" color="gray.600">
              {labelOf(SETUP_CONDITION_LABEL, stat.condition)}
            </Text>
          )}
        </Flex>
      ))}

      {(triggers ?? []).map((trigger, i) => (
        <Box key={i}>
          <Wrap spacing={2} align="baseline">
            <WrapItem>
              <Text fontSize="0.65rem" color="gray.400">
                {labelOf(TRIGGER_LABEL, trigger.on)}
              </Text>
            </WrapItem>
            {trigger.check && (
              <WrapItem>
                <Text fontSize="0.6rem" color="gray.600">
                  {labelOf(TARGET_LABEL, trigger.check)}
                </Text>
              </WrapItem>
            )}
            {trigger.cooldown > 0 && (
              <WrapItem>
                <Text fontSize="0.6rem" color="gray.600">{trigger.cooldown}s cd</Text>
              </WrapItem>
            )}
            {trigger.limit > 0 && (
              <WrapItem>
                <Text fontSize="0.6rem" color="gray.600">×{trigger.limit} per battle</Text>
              </WrapItem>
            )}
          </Wrap>
          <VStack align="stretch" spacing={0.5} mt={0.5}>
            {trigger.ops.map((op, j) => (
              <OpRow key={j} op={op} level={level} period={period} data={data}
                icons={icons} />
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  );
}

// Skills at one star grade. The grade is picked because the master data
// carries a full set per grade: a passive unlocks at 3★ and upgrades at 4★ and
// 5★ regardless of the character's own rarity. Skill level is picked per
// skill, in `SkillRow`.
function Skills({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const grades = skillGrades(entry, data);
  const [grade, setGrade] = useState<number | null>(null);
  // opens at the character's own starting rarity, not at the cap
  const shown = grade ?? grades[0] ?? 0;
  const skills = shown ? skillsAtGrade(entry, data, shown) : [];
  if (!skills.length) return null;

  return (
    <Panel title="Skills">
      <HStack spacing={1} mb={3}>
        <Text fontSize="xs" color="gray.500">Star</Text>
        {grades.map((g) => (
          <Box key={g} as="button" onClick={() => setGrade(g)} px={2} py={0.5}
            fontSize="xs" borderWidth="1px" borderRadius="md"
            borderColor={g === shown ? 'yellow.400' : 'whiteAlpha.200'}
            color={g === shown ? 'yellow.200' : 'gray.400'}>{g}★</Box>
        ))}
      </HStack>

      <VStack align="stretch" spacing={3}>
        {skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} data={data} icons={icons}
            // most enemy slots share one placeholder name, so the slot the
            // rotation refers to is the only thing telling them apart
            showSlot={skills.filter((s) => s.name === skill.name).length > 1} />
        ))}
      </VStack>
    </Panel>
  );
}

// One skill. A levelable one carries its own level picker: skills level
// independently, so a single shared level would misreport every other row.
// A passive is keyed by star grade and the normal attack has no level at all,
// so neither shows a picker.
function SkillRow({ skill, data, icons, showSlot }: {
  skill: SkillEntry & { id: number }; data: CharacterData;
  icons: IconManifest | null; showSlot?: boolean;
}) {
  const [level, setLevel] = useState(1);
  const at = Math.min(level, skill.desc.length) - 1;
  return (
    <Flex gap={3} align="start" borderTopWidth="1px" borderColor="whiteAlpha.100" pt={2}>
      <GameIcon manifest={icons} group="skill" name={skill.icon} size={9} borderRadius="md" />
      <Box minW={0} flex="1">
        <Wrap spacing={2} align="center">
          <WrapItem><Text fontSize="sm" fontWeight="bold">{skill.name}</Text></WrapItem>
          {showSlot && (
            <WrapItem>
              <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">
                slot {skill.skillType}
              </Text>
            </WrapItem>
          )}
          <WrapItem>
            <Badge fontSize="0.6rem">{SKILL_CATEGORY_LABEL[skill.categorize]}</Badge>
          </WrapItem>
          {skill.openStar > 1 && (
            <WrapItem>
              <Badge fontSize="0.6rem" colorScheme="yellow">{skill.openStar}★</Badge>
            </WrapItem>
          )}
          {skill.levelable && (
            <WrapItem>
              <HStack spacing={1}>
                <Text fontSize="0.65rem" color="gray.600">Lv</Text>
                {skill.desc.map((_d, i) => (
                  <Box key={i} as="button" onClick={() => setLevel(i + 1)} px={1.5}
                    fontSize="0.65rem" borderWidth="1px" borderRadius="sm"
                    borderColor={i === at ? 'yellow.400' : 'whiteAlpha.200'}
                    color={i === at ? 'yellow.200' : 'gray.500'}>{i + 1}</Box>
                ))}
              </HStack>
            </WrapItem>
          )}
        </Wrap>
        <Text fontSize="sm" color="gray.300" mt={0.5}>
          <GameText text={skill.desc[at] ?? ''} />
        </Text>
        <BuffList buffs={skill.buffs[at] ?? []} icons={icons} />
        {skill.behaviour && (
          <Behaviour behaviour={skill.behaviour} level={at + 1}
            period={skill.levelPeriod} data={data} icons={icons} />
        )}
      </Box>
    </Flex>
  );
}

// The AI's skill order: `start` plays once at the opening, `repeat` loops.
// A list with more than one rotation is a set of alternatives; the game picks
// by the named condition, falling through to the unconditional 기본 패턴.
const ROTATION_LABEL: Record<string, string> = { start: 'Opening', repeat: 'Loop' };

function Rotation({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const patterns = entry.battlePatterns;
  if (!patterns) return null;
  // An enemy's slots share one placeholder name, so a bare name list would be
  // the same word ten times over. A name is ambiguous when *different* skills
  // carry it — a rotation naming one skill twice is not.
  const idsByName = new Map<string, Set<number>>();
  for (const rot of [...(patterns.start ?? []), ...(patterns.repeat ?? [])]) {
    for (const id of rot.steps) {
      const name = data.skills[String(id)]?.name ?? '';
      idsByName.set(name, (idsByName.get(name) ?? new Set()).add(id));
    }
  }
  return (
    <Panel title="Skill rotation">
      <VStack align="stretch" spacing={2}>
        {(['start', 'repeat'] as const).flatMap((key) => (patterns[key] ?? []).map((rot, i) => (
          <Box key={`${key}-${i}`}>
            <Wrap spacing={2} align="baseline" mb={1}>
              <WrapItem><Badge fontSize="0.6rem">{ROTATION_LABEL[key]}</Badge></WrapItem>
              {rot.name && (
                <WrapItem><Text fontSize="xs" color="gray.500">{rot.name}</Text></WrapItem>
              )}
            </Wrap>
            <Box overflowX="auto">
              <HStack spacing={1} minW="max-content">
                {rot.steps.map((id, step) => {
                  const skill = data.skills[String(id)];
                  const ambiguous = (idsByName.get(skill?.name ?? '')?.size ?? 0) > 1;
                  return (
                    <HStack key={step} spacing={1}>
                      {step > 0 && <Text fontSize="xs" color="gray.600">→</Text>}
                      <HStack spacing={1} borderWidth="1px" borderColor="whiteAlpha.200"
                        borderRadius="md" px={1.5} py={0.5}>
                        <GameIcon manifest={icons} group="skill" name={skill?.icon}
                          size={4} reserve={false} />
                        <Text fontSize="xs" whiteSpace="nowrap">{skill?.name ?? id}</Text>
                        {ambiguous && skill && (
                          <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">
                            {skill.skillType}
                          </Text>
                        )}
                      </HStack>
                    </HStack>
                  );
                })}
              </HStack>
            </Box>
          </Box>
        )))}
      </VStack>
    </Panel>
  );
}

// Every rig this character has. Scrolls horizontally on a narrow screen rather
// than widening the page.
function SkinStrip({ skins, entry, icons, selected, onSelect }: {
  skins: SkinListEntry[]; entry: CharacterEntry; icons: IconManifest | null;
  selected: string | null; onSelect: (key: string) => void;
}) {
  return (
    <Box overflowX="auto" pb={1}>
      <HStack spacing={2} minW="max-content" align="stretch">
        {skins.map((s) => {
          const src = skinIcon(icons, s, entry);
          const active = s.key === selected;
          return (
            <Box key={s.key} as="button" onClick={() => onSelect(s.key)}
              borderWidth="1px" borderRadius="md" overflow="hidden" w="92px"
              borderColor={active ? 'yellow.400' : 'whiteAlpha.200'}
              bg={active ? 'whiteAlpha.200' : 'whiteAlpha.50'}
              _hover={{ borderColor: active ? 'yellow.400' : 'whiteAlpha.500' }}>
              <Box position="relative" bg="blackAlpha.400" sx={{ aspectRatio: '1 / 1' }}>
                {src && (
                  <Box as="img" src={src} alt="" w="100%" h="100%" objectFit="contain" />
                )}
                <Box position="absolute" bottom={0.5} left={0.5}>
                  <GameIcon manifest={icons} group="ui" name={KIND_ICON[s.kind]} size={4} />
                </Box>
                {s.stores.length > 1 && (
                  <Badge position="absolute" top={0.5} right={0.5} colorScheme="yellow"
                    fontSize="0.55rem">DIFF</Badge>
                )}
              </Box>
              <Text fontSize="0.6rem" fontFamily="mono" px={1} py={0.5} noOfLines={1}
                color={active ? 'gray.100' : 'gray.500'}>{s.key}</Text>
            </Box>
          );
        })}
      </HStack>
    </Box>
  );
}
