// One character: a wiki-style infobox of the non-gameplay master data in one
// tab, and every skin the character has — standing, affection, desire — in the
// Spine viewer in the other.
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
  PopoverContent, PopoverTrigger, Portal, SimpleGrid, Spinner, Tab, TabList, TabPanel,
  TabPanels, Tabs, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import SkinViewer from '@/components/skinViewer';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { StoreKey } from '@/components/skinViewer/types';
import { GameIcon, StarRating } from '@/components/gameIcon';
import { resolveIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import {
  BUFF_CATEGORY, EQUIP_EN, KIND_ICON, SKILL_CATEGORY_LABEL, TYPE_LABEL, altNameEn,
  birthdayText, colorRuns, datePlacesOf, equipmentSlotsOf, giftsOf, isPlayable,
  membersOfType, skillGrades, skillsAtGrade, skinIconNames, skinsByCharacter, typeIcons,
  typeLabel, typeOf, typeTint, typeValue, type TypeTable,
} from '@/lib/characters';
import {
  KIND_COLOR, KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type BuffEntry, type CharacterData, type CharacterEntry, type IconManifest,
  type SkillEntry, type SkinListEntry,
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
        <Text fontFamily="mono" fontSize="sm" color="gray.600">{entry.code}</Text>
        {entry.unreleased && <Badge colorScheme="purple">unreleased</Badge>}
      </Flex>

      {/* Profile and skins are two different things to look at, and the viewer
          is tall enough to push the profile off a phone screen — so they are
          tabs rather than one column. The viewer mounts only when its tab is
          opened. */}
      <Tabs variant="line" colorScheme="yellow" isLazy>
        <TabList borderColor="whiteAlpha.200">
          <Tab fontSize="sm">Profile</Tab>
          <Tab fontSize="sm">
            <HStack spacing={2}>
              <Text>Skins</Text>
              {mine.length > 0 && (
                <Badge fontSize="0.6rem" colorScheme="gray">{mine.length}</Badge>
              )}
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* The infobox is a fixed-width card; everything else flows beside it
              and wraps under it on a narrow screen. Keeping the tall blocks
              (skills) in the same column as the short ones stops the grid from
              leaving a column-height gap. */}
          <TabPanel px={0} pt={4}>
            <Grid templateColumns={{ base: '1fr', lg: '300px minmax(0, 1fr)' }} gap={4}
              alignItems="start">
              <Infobox entry={entry} data={chars} icons={icons} accent={element?.color} />

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
                <Skills entry={entry} data={chars} icons={icons} />
                <Rotation entry={entry} data={chars} icons={icons} />
              </VStack>
            </Grid>
          </TabPanel>

          <TabPanel px={0} pt={4}>
            <VStack align="stretch" spacing={3} minW={0}>
              {mine.length > 0 ? (
                <>
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
                </>
              ) : (
                <Center h="30vh" borderWidth="1px" borderColor="whiteAlpha.200"
                  borderRadius="md">
                  <Text color="gray.500" fontSize="sm">no skin archive</Text>
                </Center>
              )}
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
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
// carries. Rows with no value are omitted entirely rather than shown empty.
// Every type row and the rarity are links into the character list.
function Infobox({ entry, data, icons, accent }: {
  entry: CharacterEntry; data: CharacterData;
  icons: IconManifest | null; accent?: string;
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

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.300" borderRadius="md"
      borderTopWidth="3px" borderTopColor={accent ?? 'whiteAlpha.400'}
      bg="whiteAlpha.50" overflow="hidden">
      <Center bg="blackAlpha.400" py={2}>
        <GameIcon manifest={icons} group="cutin"
          names={[`Cut_${entry.code}`, `CUT_${entry.code}`]}
          size="auto" maxH="260px" w="auto" />
      </Center>

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
        {skills.map((skill) => <SkillRow key={skill.id} skill={skill} icons={icons} />)}
      </VStack>
    </Panel>
  );
}

// One skill. A levelable one carries its own level picker: skills level
// independently, so a single shared level would misreport every other row.
// A passive is keyed by star grade and the normal attack has no level at all,
// so neither shows a picker.
function SkillRow({ skill, icons }: {
  skill: SkillEntry & { id: number }; icons: IconManifest | null;
}) {
  const [level, setLevel] = useState(1);
  const at = Math.min(level, skill.desc.length) - 1;
  return (
    <Flex gap={3} align="start" borderTopWidth="1px" borderColor="whiteAlpha.100" pt={2}>
      <GameIcon manifest={icons} group="skill" name={skill.icon} size={9} borderRadius="md" />
      <Box minW={0} flex="1">
        <Wrap spacing={2} align="center">
          <WrapItem><Text fontSize="sm" fontWeight="bold">{skill.name}</Text></WrapItem>
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
                  return (
                    <HStack key={step} spacing={1}>
                      {step > 0 && <Text fontSize="xs" color="gray.600">→</Text>}
                      <HStack spacing={1} borderWidth="1px" borderColor="whiteAlpha.200"
                        borderRadius="md" px={1.5} py={0.5}>
                        <GameIcon manifest={icons} group="skill" name={skill?.icon}
                          size={4} reserve={false} />
                        <Text fontSize="xs" whiteSpace="nowrap">{skill?.name ?? id}</Text>
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
          const names = skinIconNames(s, entry);
          // a standing rig has no thumbnail of its own — the portrait is its art
          const src = resolveIcon(icons, 'skin', names.skin)
            ?? resolveIcon(icons, 'char', names.char);
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
