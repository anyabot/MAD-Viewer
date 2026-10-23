// A query route rather than a `[code]` segment: all game data is fetched at
// runtime, so a build-time path list would need regenerating per character.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSpoilerGate } from '@/components/spoilers';
import { useHideSpoilers, useSpoilerFacts } from '@/lib/spoilers';
import { createPersisted } from '@altterisk/game-hub/persist';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Divider, Flex, Grid, HStack, Popover, PopoverArrow, PopoverBody,
  PopoverContent, PopoverTrigger, Portal, SimpleGrid, Text,
  VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { nextRouterAdapter } from '@altterisk/game-hub/filters';
import SkinViewer from '@/components/skinViewer';
import CollectionEditor from '@/components/collectionEditor';
import SdViewer from '@/components/sdViewer';
import { VoiceLines } from '@/components/voiceLines';
import { BondChats } from '@/components/bondChats';
import { STORE_META } from '@/components/skinViewer/chrome';
import type { StoreKey } from '@/components/skinViewer/types';
import { GameIcon, StarRating } from '@/components/gameIcon';
import { ShareButton } from '@/components/shareButton';
import { GameText, Rotation, Skills } from '@/components/skillKit';
import {
  EmptyState, LevelControl, LoadState, PageHeader, Panel, TabPanel, UrlTabs, tabParam,
} from '@altterisk/game-hub';
import InfusionTree, { bonusText, infusionLabel } from '@/components/infusionTree';
import { characterIcon, resolveIcon, skinIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import { artistAnchor } from '@/lib/artists';
import {
  INFUSION_PATHS, KIND_ICON, STAT_LABEL, TYPE_LABEL, activeInfusion, altNameEn, birthdayText,
  characterName, infusionNodes, infusionReach,
  characterSubName,
  computeStats, datePlacesOf, equipLabel, equipmentGrants, equipmentSlotsOf,
  giftsOf, isPlayable, labelOf, lockedUntilText,
  lineMembers,
  membersOfType,
  rosterNote, skillGrades, skinIconNames,
  skinsByCharacter,
  statGrades, statText, typeIcons, typeLabel, typeOf, typeTint, typeValue,
  type EquipInput, type TypeTable,
} from '@/lib/characters';
import { dataText, text, useLang, useT, type Lang, type UiKey } from '@/lib/i18n';
import {
  KIND_COLOR, KIND_LABEL, loadBondIndex, loadCharacters, loadGrowth, loadIcons, loadSdIndex, loadSkinList,
  type BondIndex, type CharacterData, type CharacterEntry, type IconManifest,
  type GrowthData, type SdIndex, type SkinListEntry,
} from '@/lib/data';

const INFO_TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division', 'faction'];

export default function CharacterPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : null;
  const sharedSkin = typeof router.query.skin === 'string' ? router.query.skin : null;
  const sharedStore = router.query.store === 'google' || router.query.store === 'onestore'
    ? router.query.store : null;

  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [sd, setSd] = useState<SdIndex | null>(null);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [bond, setBond] = useState<BondIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('onestore');

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
    loadSdIndex().then(setSd).catch(() => setSd(null));
    loadGrowth().then(setGrowth).catch(() => setGrowth(null));
    loadBondIndex().then(setBond).catch(() => setBond(null));
  }, []);

  const mine = useMemo(
    () => (code ? skinsByCharacter(skins).get(code) ?? [] : []), [skins, code]);
  const facts = useSpoilerFacts();
  const unitSpoiler = !code || !chars || !facts ? null
    : !!chars.characters[code]?.unreleased || facts.units.has(code);
  const hideSpoilers = useHideSpoilers();
  const gated = useSpoilerGate(unitSpoiler, '/characters');
  const blocked = gated || (hideSpoilers && unitSpoiler !== false);

  useEffect(() => { setSelected(sharedSkin); }, [code, sharedSkin]);
  const current = useMemo(
    () => mine.find((s) => s.key === selected) ?? mine[0] ?? null, [mine, selected]);

  useEffect(() => {
    if (current && sharedStore && current.stores.includes(sharedStore)) {
      setStore(sharedStore);
      return;
    }
    if (current && !current.stores.includes(store)) setStore(current.stores[0] ?? 'onestore');
  }, [current, store, sharedStore]);

  if (error || !chars || !router.isReady || blocked) {
    return <LoadState loading error={error} labels={{ loading: t('loading'), error }} />;
  }

  const entry: CharacterEntry | null = code ? chars.characters[code] ?? null : null;
  if (!entry) {
    return (
      <EmptyState title={code ? t('noCharacterData', { code }) : t('noCharacterSelected')}
        action={<Text as={NextLink} href="/characters" color="yellow.300" fontSize="sm">{t('backToCharacters')}</Text>} />
    );
  }

  const element = typeOf(entry, chars.types, 'attribute');
  const roster = rosterNote(entry, lang);

  // Only what the character has gets a tab, and with one section left the tab
  // bar goes too.
  const tabs: { key: string; label: string; count?: number; panel: React.ReactNode }[] = [];

  tabs.push({
    key: 'profile',
    label: t('tabProfile'),
    panel: (
      <Grid templateColumns={{ base: '1fr', lg: '300px minmax(0, 1fr)' }} gap={4}
        alignItems="start">
        <Infobox entry={entry} data={chars} icons={icons} accent={element?.color}
          skins={mine} />

        <VStack align="stretch" spacing={3} minW={0}>
          {entry.desc && (
            <Panel title={t('tabProfile')}>
              <Text fontSize="sm" whiteSpace="pre-wrap">
                {dataText(lang, entry.desc, entry.descEn)}
              </Text>
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

  const sdCharacter = sd?.characters[entry.code];
  if (sdCharacter) {
    tabs.push({
      key: 'sd',
      label: t('tabSd'),
      count: sdCharacter.animations.length,
      panel: <SdViewer character={sdCharacter} />,
    });
  }

  if (skillGrades(entry, chars).length > 0) {
    tabs.push({
      key: 'skills',
      label: t('tabSkills'),
      panel: (
        <VStack align="stretch" spacing={3} minW={0}>
          <Skills entry={entry} data={chars} icons={icons} />
          <Rotation entry={entry} data={chars} icons={icons} />
        </VStack>
      ),
    });
  }

  if (entry.baseStats) {
    tabs.push({
      key: 'stats',
      label: t('tabStats'),
      panel: (
        <VStack align="stretch" spacing={2} minW={0}>
          {entry.statsProvisional && <Text fontSize="xs" color="orange.200">{t('statsProvisional')}</Text>}
          <StatCalculator key={entry.code} entry={entry} data={chars} icons={icons} />
        </VStack>
      ),
    });
  }

  if (entry.voiceGroupId) {
    tabs.push({
      key: 'voice',
      label: t('tabVoice'),
      panel: <VoiceLines code={entry.code} />,
    });
  }

  const bondChats = bond?.characters[entry.code];
  if (bond && bondChats?.length) {
    tabs.push({
      key: 'bond',
      label: dataText(lang, '모찌톡', 'MochiTalk'),
      count: bondChats.length,
      panel: (
        <BondChats code={entry.code} chats={bondChats} refs={bond.refs} chars={chars} icons={icons}
          skinKeys={new Set(mine.map((s) => s.key))} />
      ),
    });
  }

  if (entry.infusion && chars.infusion) {
    tabs.push({
      key: 'infusion',
      label: infusionLabel(chars, 'title', lang),
      panel: <InfusionTree entry={entry} data={chars} icons={icons} />,
    });
  }

  if (mine.length === 0) {
    if (entry.skinsLockedUntil) tabs.push({
      key: 'skins',
      label: t('tabSkins'),
      panel: (
        <Panel title={t('tabSkins')}>
          <Text fontSize="sm" color="gray.400">
            {t('lockedUntil', { date: lockedUntilText(entry.skinsLockedUntil, lang) })}
          </Text>
        </Panel>
      ),
    });
  } else {
    tabs.push({
      key: 'skins',
      label: t('tabSkins'),
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
                    {KIND_LABEL[current.kind][lang]}
                  </Badge>
                </WrapItem>
                <WrapItem>
                  <Text fontFamily="mono" fontSize="sm" color="gray.400">
                    {current.key}
                  </Text>
                </WrapItem>
                <WrapItem>
                  <Text fontSize="xs" color="gray.500">
                    {t('animCount', { n: current.animations })}
                    {current.faces ? ` · ${t('faceCount', { n: current.faces })}` : ''}
                  </Text>
                </WrapItem>
                {current.stores.length > 1 && (
                  <WrapItem>
                    <Badge colorScheme="yellow" title={t('storeDiffTitle')}>
                      {t('badgeDiff')} · {STORE_META[store].short}
                    </Badge>
                  </WrapItem>
                )}
                {current.hasBg && (
                  <WrapItem><Badge colorScheme="blue">{t('badgeBackground')}</Badge></WrapItem>
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

  const tabItems = tabs.map(({ key, label, count }) => ({ id: key, label, count }));
  const [tab, setTab] = tabParam(nextRouterAdapter(router), tabItems);

  return (
    <VStack align="stretch" spacing={4}>
      <Text as={NextLink} href="/characters" fontSize="sm" color="gray.500" alignSelf="start"
        _hover={{ color: 'gray.200' }}>{t('backToCharacters')}</Text>
      <PageHeader title={characterName(entry, lang)} id={entry.code}
        subtitle={(characterSubName(entry, lang) || altNameEn(entry)) && (
          <HStack spacing={3} wrap="wrap">
            {characterSubName(entry, lang) && <Text color="gray.500">{characterSubName(entry, lang)}</Text>}
            {altNameEn(entry) && <Text fontSize="sm" color="gray.600">{altNameEn(entry)}</Text>}
          </HStack>
        )}
        badges={
          <>
            {roster && <Badge colorScheme={roster.scheme}>{roster.label}</Badge>}
            {/* a story-only character is named by the scripts, through this id */}
            {entry.actorId && (
              <Text fontFamily="mono" fontSize="xs" color="gray.500">{entry.actorId}</Text>
            )}
          </>
        }
        actions={<ShareButton query={{ code: entry.code }} />} />

      {isPlayable(entry) && growth && (
        <CollectionEditor entry={entry} data={chars} growth={growth} icons={icons} />
      )}

      {tabs.length === 1 ? (
        <Box pt={1}>{tabs[0].panel}</Box>
      ) : (
        <>
          <UrlTabs tabs={tabItems} active={tab} onChange={setTab} label={t('characterSections')} idBase="char" />
          {tabs.filter((x) => x.key === tab).map((x) => (
            <TabPanel key={x.key} tab={x.key} idBase="char">{x.panel}</TabPanel>
          ))}
        </>
      )}
    </VStack>
  );
}

// Opens the character list filtered to the characters sharing this value.
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

// Hover only: on a touch screen the row itself links to the same list.
function MemberPopover({ members, icons, current, children }: {
  members: CharacterEntry[]; icons: IconManifest | null; current?: string; children: React.ReactNode;
}) {
  const lang = useLang();
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
                  bg={m.code === current ? 'whiteAlpha.300' : undefined}
                  _hover={{ bg: 'whiteAlpha.200' }}>
                  <GameIcon manifest={icons} group="char" name={m.iconPath}
                    names={[m.iconPath, `Icon_${m.code}`]} size="100%" w="100%" h="auto"
                    sx={{ aspectRatio: '1 / 1' }} borderRadius="sm" />
                  <Text fontSize="0.6rem" noOfLines={1} textAlign="center" w="100%">
                    {characterName(m, lang)}
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

// A row with no value is omitted rather than shown empty, and a character with
// neither art nor facts gets no card at all. Most NPCs have no cut-in art, so
// the character's own rig icon stands in.
function Infobox({ entry, data, icons, accent, skins }: {
  entry: CharacterEntry; data: CharacterData;
  icons: IconManifest | null; accent?: string; skins: SkinListEntry[];
}) {
  const t = useT();
  const lang = useLang();
  const focusType = useFilters((s) => s.focusType);
  const focusStar = useFilters((s) => s.focusStar);
  const rows: { label: string; node: React.ReactNode }[] = [];

  for (const table of INFO_TABLES) {
    const row = typeOf(entry, data.types, table);
    const value = typeValue(entry, table);
    if (!row || value == null) continue;
    // The other language's name sits beside it, since the game names a type in
    // both and neither is a translation of the other.
    const alt = lang === 'ko' ? row.en : row.name;
    const link = (
      <FilterLink onClick={() => focusType(table, value, !isPlayable(entry))}>
        <GameIcon manifest={icons} group="ui" names={typeIcons(row)} size={5}
          tint={typeTint(row)} />
        <Text color={row.color}>{typeLabel(row, lang)}</Text>
        <Text color="gray.500" fontSize="xs">{alt}</Text>
      </FilterLink>
    );
    rows.push({
      label: TYPE_LABEL[table][lang],
      node: table === 'faction'
        ? (
          <MemberPopover members={membersOfType(data.characters, table, value)} icons={icons}>
            {link}
          </MemberPopover>
        )
        : link,
    });
    const line = table === 'position' ? lineMembers(data.characters, entry) : [];
    const rank = line.findIndex((m) => m.code === entry.code);
    if (table === 'position' && entry.approach != null) {
      rows.push({ label: t('rowApproach'), node: <Text>{entry.approach}</Text> });
    }
    if (table === 'position' && entry.hitRadius != null) {
      rows.push({ label: t('rowHitRadius'), node: <Text>{entry.hitRadius}</Text> });
    }
    if (rank >= 0) {
      rows.push({
        label: t('rowLineOrder'),
        node: (
          <MemberPopover members={line} icons={icons} current={entry.code}>
            <Box as="button" type="button" _hover={{ textDecoration: 'underline' }}>
              {rank + 1} / {line.length}
            </Box>
          </MemberPopover>
        ),
      });
    }
  }
  if (entry.defaultStar) {
    const star = entry.defaultStar;
    rows.splice(1, 0, {
      label: t('rarity'),
      node: (
        <FilterLink onClick={() => focusStar(star)}>
          <StarRating manifest={icons} star={star} size={4} />
        </FilterLink>
      ),
    });
  }

  const facts: [UiKey, string | null | undefined][] = [
    ['rowBirthday', birthdayText(entry, lang)],
    ['rowCv', dataText(lang, entry.cv, entry.cvEn)],
    ['rowHobby', dataText(lang, entry.hobby, entry.hobbyEn)],
    ['rowSpecialty', dataText(lang, entry.specialty, entry.specialtyEn)],
    ['rowLikes', dataText(lang, entry.likes, entry.likesEn)],
  ];
  if (entry.artist) {
    rows.push({
      label: t('rowArtist'),
      node: (
        <Box as={NextLink} href={`/artists#${artistAnchor(entry.artist)}`}
          display="inline-flex" alignItems="center" _hover={{ textDecoration: 'underline' }}>
          <Text>{dataText(lang, entry.artist, entry.artistEn)}</Text>
        </Box>
      ),
    });
  }
  for (const [key, value] of facts) {
    if (value) rows.push({ label: t(key), node: <Text>{value}</Text> });
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
          {/* a rig icon is a small square and must not be blown up to the
              height a tall cut-in takes */}
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
                <Text fontSize="xs" color="gray.500">{t('statusMessage')}</Text>
                <Text>{dataText(lang, entry.comment, entry.commentEn)}</Text>
              </Box>
            )}
            {entry.birthdayComment && (
              <Box>
                <Text fontSize="xs" color="gray.500">{t('birthdayMessage')}</Text>
                <Text>
                  {dataText(lang, entry.birthdayComment, entry.birthdayCommentEn)}
                </Text>
              </Box>
            )}
          </VStack>
        </>
      )}
    </Box>
  );
}

// The art is the empty slot: what goes in it is player inventory, not master
// data.
function EquipmentSlots({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const slots = equipmentSlotsOf(entry, data.equipment);
  if (!slots.length) return null;
  return (
    <Panel title={t('panelEquipmentSlots')}>
      <HStack spacing={2} align="start">
        {slots.map((slot) => {
          const label = equipLabel(slot, lang);
          return (
            <VStack key={slot.type} spacing={0.5} flex="1" minW={0}>
              <GameIcon manifest={icons} group="equip" name={slot.icon} size={10} />
              <Text fontSize="xs" color="gray.300" noOfLines={1}>{label}</Text>
              {slot.name && slot.name !== label && (
                <Text fontSize="0.6rem" color="gray.600" noOfLines={1}>{slot.name}</Text>
              )}
            </VStack>
          );
        })}
      </HStack>
    </Panel>
  );
}

// `gift_item_id_favorite` ships empty for every character, so there is no
// second tier to show.
function Gifts({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const gifts = giftsOf(entry, data.items);
  if (!gifts.length) return null;
  return (
    <Panel title={t('panelLikedGifts')}>
      <VStack align="stretch" spacing={2}>
        {gifts.map((gift) => (
          <HStack key={gift.id} align="start" spacing={2}>
            <GameIcon manifest={icons} group="item" name={gift.icon} size={8} reserve={false} />
            <Box minW={0}>
              <Text fontSize="sm">{dataText(lang, gift.name, gift.nameEn) || gift.id}</Text>
              {gift.flavor && (
                <Text fontSize="xs" color="gray.500" noOfLines={2}>
                  {dataText(lang, gift.flavor, gift.flavorEn)}
                </Text>
              )}
            </Box>
          </HStack>
        ))}
      </VStack>
    </Panel>
  );
}

function DateVenues({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const regions = datePlacesOf(entry, data.places).filter((r) => r.places.length);
  if (!regions.length) return null;
  return (
    <>
      {regions.map(({ division, places }) => {
        const row = data.types.division[String(division)] ?? null;
        return (
          <Panel key={division} title={t('panelDateVenues')}
            note={`${typeLabel(row, lang) || division} · ${places.length}`}>
            <Wrap spacing={2}>
              {places.map((place) => (
                <WrapItem key={place.id}>
                  <VStack spacing={1} w="72px"
                    title={dataText(lang, place.desc, place.descEn) || undefined}>
                    <GameIcon manifest={icons} group="place" name={place.thumbnail}
                      size="auto" w="72px" h="44px" borderRadius="sm" reserve={false} />
                    <Text fontSize="0.65rem" color="gray.400" noOfLines={2}
                      textAlign="center">
                      {dataText(lang, place.name, place.nameEn) || place.id}
                    </Text>
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

// The column is too narrow for label, slider and number on one row.
const STACKED_LEVELS = {
  '.hub-level': { gridTemplateColumns: '1fr 72px' },
  '.hub-level__label': { gridColumn: '1 / -1' },
};

function DialLabel({ label, note }: { label: string; note?: string | null }) {
  return (
    <Flex as="span" align="baseline" gap={2} wrap="wrap" whiteSpace="normal">
      <Text as="span" fontSize="xs" color="gray.500" textTransform="uppercase"
        letterSpacing="wide">{label}</Text>
      {note && <Text as="span" fontSize="xs" color="gray.600">{note}</Text>}
    </Flex>
  );
}

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

// Tier 0 is the empty slot. A tier is picked by the game's own filled-slot
// art, since the tiers differ by colour, which a `T3` label does not carry.
function GearSlot({ slot, icons, tier, level, onChange }: {
  slot: ReturnType<typeof equipmentSlotsOf>[number]; icons: IconManifest | null;
  tier: number; level: number; onChange: (tier: number, level: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  const tiers = slot.tiers ?? [];
  const current = tiers.find((row) => row.tier === tier) ?? null;
  const cap = current?.maxLevel ?? 1;
  const label = equipLabel(slot, lang);
  const options = [
    { value: 0, icon: slot.icon, title: t('gearEmpty') },
    ...tiers.map((row) => ({
      value: row.tier, icon: row.icon, title: t('gearTier', { n: row.tier }),
    })),
  ];
  return (
    <Box>
      <HStack spacing={2} align="center" mb={1}>
        <GameIcon manifest={icons} group="equip" name={slot.icon} size={7} />
        <Text fontSize="sm">{label}</Text>
        {slot.name && slot.name !== label && (
          <Text fontSize="xs" color="gray.600">{slot.name}</Text>
        )}
      </HStack>
      <Wrap spacing={1}>
        {options.map((option) => {
          const active = option.value === tier;
          return (
            <WrapItem key={option.value}>
              <Box as="button" title={option.title} aria-label={option.title}
                onClick={() => onChange(option.value, Math.min(level,
                  tiers.find((row) => row.tier === option.value)?.maxLevel ?? 1))}
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
          <LevelControl label={<DialLabel label={t('dialLevel')} note={t('dialMax', { n: cap })} />}
            value={Math.min(level, cap)} min={1} max={cap} onChange={(next) => onChange(tier, next)} />
        </Box>
      )}
    </Box>
  );
}

function PresetButtons({ onMax, onMin, max, min }: {
  onMax: () => void; onMin: () => void; max: string; min: string;
}) {
  return (
    <HStack spacing={1}>
      {[{ text: max, onClick: onMax }, { text: min, onClick: onMin }].map((b) => (
        <Box key={b.text} as="button" onClick={b.onClick} px={2} py={0.5} fontSize="xs"
          borderWidth="1px" borderRadius="md" borderColor="whiteAlpha.200" color="gray.400"
          _hover={{ borderColor: 'yellow.400', color: 'yellow.200' }}>
          {b.text}
        </Box>
      ))}
    </HStack>
  );
}

type Preset = 'max' | 'min';
const storedPreset = createPersisted<Preset | null>({
  key: 'mad.statPreset', version: 1, empty: () => null,
  sanitize: (raw) => (raw === 'max' || raw === 'min' ? raw : null),
});

// The terms are shown apart because each has its own source.
function StatCalculator({ entry, data, icons }: {
  entry: CharacterEntry; data: CharacterData; icons: IconManifest | null;
}) {
  const t = useT();
  const lang = useLang();
  const caps = data.statCaps;
  const grades = statGrades(entry, data);
  const slots = equipmentSlotsOf(entry, data.equipment);
  const [initial] = useState(storedPreset.load);
  const unitFor = (preset: Preset) => (preset === 'max'
    ? { star: grades[grades.length - 1] ?? null, level: caps.level, love: caps.love }
    : { star: grades[0] ?? null, level: 1, love: 1 });
  const gearFor = (preset: Preset) => Object.fromEntries(preset === 'max'
    ? slots.flatMap((slot) => {
      const top = (slot.tiers ?? []).reduce<NonNullable<typeof slot.tiers>[number] | null>(
        (best, row) => (!best || row.tier > best.tier ? row : best), null);
      return top ? [[slot.type, { tier: top.tier, level: top.maxLevel }]] : [];
    })
    : []) as Record<number, { tier: number; level: number }>;
  const infuseFor = (preset: Preset): Record<string, number> => (preset === 'max'
    ? Object.fromEntries(INFUSION_PATHS.map((path) => [path, infusionNodes(entry, path).length]))
    : {});
  const [star, setStar] = useState<number | null>(initial ? unitFor(initial).star : null);
  const [level, setLevel] = useState(initial ? unitFor(initial).level : caps.level);
  // every character starts at affection rank 1
  const [love, setLove] = useState(initial ? unitFor(initial).love : 1);
  const [gear, setGear] = useState(() => (initial ? gearFor(initial) : {}));
  const [infuse, setInfuse] = useState(() => (initial ? infuseFor(initial) : {}));
  const applyUnit = (preset: Preset) => {
    const unit = unitFor(preset);
    setStar(unit.star);
    setLevel(unit.level);
    setLove(unit.love);
  };
  const applyAll = (preset: Preset) => {
    applyUnit(preset);
    setGear(gearFor(preset));
    setInfuse(infuseFor(preset));
    storedPreset.save(preset);
  };

  const shown = star ?? grades[grades.length - 1] ?? entry.defaultStar ?? 1;
  const equipment: EquipInput[] = slots.flatMap((slot) => {
    const set = gear[slot.type];
    return set?.tier ? [{ type: slot.type, tier: set.tier, level: set.level }] : [];
  });
  const rows = useMemo(
    () => computeStats(entry, data,
      { level, star: shown, love, equipment, infusion: infuse }, lang),
    // `equipment` is rebuilt every render; `gear` is what actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, data, level, shown, love, gear, infuse, slots, lang]);
  const hasInfusion = Boolean(entry.infusion && data.infusion);
  const infused = activeInfusion(entry, infuse, shown);

  return (
    <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 320px) minmax(0, 1fr)' }}
      gap={4} alignItems="start">
      <VStack align="stretch" spacing={3} sx={STACKED_LEVELS}>
        <Flex justify="flex-end">
          <PresetButtons max={t('presetMaxAll')} min={t('presetMinAll')}
            onMax={() => applyAll('max')} onMin={() => applyAll('min')} />
        </Flex>
        <Panel title={t('panelUnit')} actions={
          <PresetButtons max={t('presetMax')} min={t('presetMin')}
            onMax={() => applyUnit('max')} onMin={() => applyUnit('min')} />
        }>
          <VStack align="stretch" spacing={3}>
            {grades.length > 1 && (
              <Choices label={t('dialStar')} value={shown} onChange={setStar}
                options={grades.map((g) => ({ value: g, text: `${g}★` }))} />
            )}
            <LevelControl label={<DialLabel label={t('dialLevel')} />} value={level} min={1} max={caps.level}
              onChange={setLevel} />
            <LevelControl label={<DialLabel label={t('dialAffection')} note={dataText(lang,
              data.loveTitles[love - 1]?.name, data.loveTitles[love - 1]?.en)} />}
              value={love} min={1} max={caps.love} onChange={setLove} />
          </VStack>
        </Panel>

        {slots.length > 0 && (
          <Panel title={t('panelEquipment')} actions={
            <PresetButtons max={t('presetMax')} min={t('presetMin')}
              onMax={() => setGear(gearFor('max'))} onMin={() => setGear(gearFor('min'))} />
          }>
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

        {hasInfusion && (
          <Panel title={infusionLabel(data, 'title', lang)} actions={
            <PresetButtons max={t('presetMax')} min={t('presetMin')}
              onMax={() => setInfuse(infuseFor('max'))} onMin={() => setInfuse(infuseFor('min'))} />
          }>
            <VStack align="stretch" spacing={3}>
              {INFUSION_PATHS.map((path) => {
                const nodes = infusionNodes(entry, path);
                const reach = infusionReach(entry, path, shown);
                const value = Math.min(infuse[path] ?? 0, reach);
                const locked = nodes[reach];
                const name = data.infusion?.paths[path];
                return (
                  <LevelControl key={path} label={<DialLabel label={dataText(lang, name?.name, name?.nameEn) || path}
                    note={locked ? infusionLabel(data, 'unlock', lang)
                      .replace('{0}', String(locked.grade)) : `/ ${nodes.length}`} />}
                    value={value} min={0} max={Math.max(reach, 0)}
                    onChange={(next) => setInfuse((prev) => ({ ...prev, [path]: next }))} />
                );
              })}
            </VStack>
          </Panel>
        )}
      </VStack>

      <Panel title={t('tabStats')} note={t('statsNote', { star: shown, level, love })}>
        <Box overflowX="auto">
          <Box as="table" w="100%" minW="360px" fontSize="sm"
            sx={{ 'th, td': { py: 1, px: 2, textAlign: 'right' },
              'th:first-of-type, td:first-of-type': { textAlign: 'left', pl: 0 } }}>
            <Box as="thead">
              <Box as="tr" color="gray.500" fontSize="xs">
                <Box as="th" fontWeight="normal">{t('headStat')}</Box>
                <Box as="th" fontWeight="normal">{t('headBase')}</Box>
                <Box as="th" fontWeight="normal">{t('headGear')}</Box>
                <Box as="th" fontWeight="normal">{t('headAffection')}</Box>
                {hasInfusion && (
                  <Box as="th" fontWeight="normal">{infusionLabel(data, 'title', lang)}</Box>
                )}
                <Box as="th" fontWeight="normal">{t('headTotal')}</Box>
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
                  {hasInfusion && (
                    <Box as="td" color={row.infusion ? 'teal.300' : 'gray.700'}
                      fontFamily="mono">
                      {row.infusion ? `+${statText(row.display, row.infusion)}` : '—'}
                    </Box>
                  )}
                  <Box as="td" fontWeight="bold" fontFamily="mono">
                    {statText(row.display, row.total)}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
        {equipment.length > 0 && <GearGrants data={data} equipment={equipment} />}
        {infused.length > 0 && (
          <Wrap spacing={2} mt={3} pt={2} borderTopWidth="1px" borderColor="whiteAlpha.100">
            {infused.flatMap((node) => node.bonuses.map((bonus, i) => (
              <WrapItem key={`${node.path}-${node.step}-${i}`}>
                <Badge fontSize="0.6rem" variant="subtle"
                  colorScheme={bonus.special ? 'purple' : 'teal'}
                  title={bonus.special ? infusionLabel(data, 'special', lang) : undefined}>
                  {bonusText(data, bonus, lang)}
                </Badge>
              </WrapItem>
            )))}
          </Wrap>
        )}
      </Panel>
    </Grid>
  );
}

// The options themselves, before the base stat is applied to the fractional
// ones.
function GearGrants({ data, equipment }: {
  data: CharacterData; equipment: EquipInput[];
}) {
  const lang = useLang();
  return (
    <Wrap spacing={2} mt={3} pt={2} borderTopWidth="1px" borderColor="whiteAlpha.100">
      {equipment.flatMap((slot) => equipmentGrants(data, slot).map((grant, i) => (
        <WrapItem key={`${slot.type}-${i}`}>
          <Badge fontSize="0.6rem" colorScheme="cyan" variant="subtle">
            {labelOf(STAT_LABEL, grant.stat, lang)}{' '}
            {grant.calc === 'MULTIPLICATION'
              ? `+${Number((grant.value * 100).toFixed(2))}%`
              : `+${Number(grant.value.toFixed(2))}`}
          </Badge>
        </WrapItem>
      )))}
    </Wrap>
  );
}

// Scrolls horizontally on a narrow screen rather than widening the page.
function SkinStrip({ skins, entry, icons, selected, onSelect }: {
  skins: SkinListEntry[]; entry: CharacterEntry; icons: IconManifest | null;
  selected: string | null; onSelect: (key: string) => void;
}) {
  const t = useT();
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
                <Box position="absolute" bottom={0.5} left={0.5} bg="blackAlpha.700"
                  borderRadius="md" p={0.5} backdropFilter="blur(2px)">
                  <GameIcon manifest={icons} group="ui" name={KIND_ICON[s.kind]} size={4} />
                </Box>
                {s.stores.length > 1 && (
                  <Badge position="absolute" top={0.5} right={0.5} colorScheme="yellow"
                    fontSize="0.55rem">{t('badgeDiff')}</Badge>
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
