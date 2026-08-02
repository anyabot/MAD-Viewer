// Character list — every character in the master data, filtered by the axes
// the game itself uses (element, rarity, role, position, division, faction),
// each drawn with its own in-game icon. A card leads to that character's page.
//
// Mobile-first: the filter groups wrap, the grid reflows from two columns to
// six, and nothing overflows the body.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, Grid, HStack, Input, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon, StarRating } from '@/components/gameIcon';
import {
  KIND_ICON, KIND_ORDER, TYPE_LABEL, filterRows, isPlayable, skinsByCharacter,
  typeIcons, typeLabel, typeOf, typeTint, typeValue, type TypeTable,
} from '@/lib/characters';
import { useFilters } from '@/lib/filterStore';
import {
  KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type IconManifest, type SkinListEntry,
} from '@/lib/data';

// Faction has 22 rows — too many for a chip row that stays readable, so it is
// the one axis rendered as a scrolling icon strip.
const CHIP_TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division'];
const STARS = [1, 2, 3];

export default function CharactersPage() {
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filters live in the store so returning from a character page restores them.
  const { query, npcs, unreleased, skinsOnly, star, picked } =
    useFilters((s) => s.characters);
  const set = useFilters((s) => s.setCharacters);
  const toggle = useFilters((s) => s.toggleType);
  const clearTypes = useFilters((s) => s.clearCharacterTypes);

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    // both are decoration: a failure must leave the list usable
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const byCharacter = useMemo(() => skinsByCharacter(skins), [skins]);

  const list = useMemo(() => {
    const all = Object.values(chars?.characters ?? {});
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (c.unreleased) {
        if (!unreleased) return false;
      } else if (!npcs && !isPlayable(c)) return false;
      if (skinsOnly && !byCharacter.has(c.code)) return false;
      if (star != null && c.defaultStar !== star) return false;
      for (const [table, want] of Object.entries(picked)) {
        if (want == null) continue;
        if (typeValue(c, table as TypeTable) !== want) return false;
      }
      if (!q) return true;
      return c.name.toLowerCase().includes(q)
        || c.code.toLowerCase().includes(q)
        || (c.nameEn ?? '').toLowerCase().includes(q)
        || (c.nameUppercase ?? '').toLowerCase().includes(q);
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [chars, query, npcs, unreleased, skinsOnly, star, picked, byCharacter]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!chars) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">loading…</Text></VStack>
      </Center>
    );
  }

  const total = Object.values(chars.characters).filter(
    (c) => (c.unreleased ? unreleased : npcs || isPlayable(c))).length;

  return (
    <VStack align="stretch" spacing={4}>
      <VStack align="stretch" spacing={2}>
        {CHIP_TABLES.map((table) => (
          <FilterRow key={table} label={TYPE_LABEL[table]}>
            {filterRows(chars.types, table).map(([value, t]) => (
              <FilterChip key={value} active={picked[table] === Number(value)}
                onClick={() => toggle(table, Number(value))}
                color={t.color}>
                <GameIcon manifest={icons} group="ui" names={typeIcons(t)} size={5}
                  tint={typeTint(t)} />
                <Text color={t.color}>{typeLabel(t)}</Text>
              </FilterChip>
            ))}
          </FilterRow>
        ))}

        <FilterRow label="Rarity">
          {STARS.map((s) => (
            <FilterChip key={s} active={star === s}
              onClick={() => set({ star: star === s ? null : s })}>
              <StarRating manifest={icons} star={s} size={4} />
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label={TYPE_LABEL.faction}>
          {filterRows(chars.types, 'faction').map(([value, t]) => (
            <FilterChip key={value} active={picked.faction === Number(value)}
              onClick={() => toggle('faction', Number(value))}>
              <GameIcon manifest={icons} group="ui" names={typeIcons(t)} size={5}
                title={t.name} />
              <Text>{typeLabel(t)}</Text>
            </FilterChip>
          ))}
        </FilterRow>

        <Wrap spacing={2} align="center" pt={1}>
          <WrapItem>
            <Input size="sm" maxW="220px" placeholder="search…"
              value={query} onChange={(e) => set({ query: e.target.value })}
              bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
          </WrapItem>
          <WrapItem>
            <FilterChip active={skinsOnly} onClick={() => set({ skinsOnly: !skinsOnly })}>
              <Text>Has skins</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip active={npcs} onClick={() => set({ npcs: !npcs })}>
              <Text>Include NPCs</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip active={unreleased} onClick={() => set({ unreleased: !unreleased })}>
              <Text>Include unreleased</Text>
            </FilterChip>
          </WrapItem>
          {(star != null || Object.values(picked).some((v) => v != null)) && (
            <WrapItem>
              <FilterChip active={false} onClick={clearTypes}>
                <Text>Clear</Text>
              </FilterChip>
            </WrapItem>
          )}
          <WrapItem>
            <Text fontSize="xs" color="gray.500">{list.length} of {total}</Text>
          </WrapItem>
        </Wrap>
      </VStack>

      <Grid gap={3} templateColumns={{
        base: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)',
        md: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)',
      }}>
        {list.map((c) => (
          <CharacterCard key={c.code} entry={c} types={chars.types} icons={icons}
            skins={byCharacter.get(c.code) ?? []} />
        ))}
      </Grid>
      {list.length === 0 && <Text fontSize="sm" color="gray.500">no match</Text>}
    </VStack>
  );
}

// One filter axis. The chips wrap rather than scroll so nothing is hidden on a
// narrow screen.
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Flex align="baseline" gap={2} wrap="wrap">
      <Text fontSize="xs" color="gray.500" minW="60px" textTransform="uppercase"
        letterSpacing="wide">{label}</Text>
      <Wrap spacing={1} flex="1" minW={0}>
        {Array.isArray(children)
          ? children.map((child, i) => <WrapItem key={i}>{child}</WrapItem>)
          : <WrapItem>{children}</WrapItem>}
      </Wrap>
    </Flex>
  );
}

function FilterChip({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color?: string; children: React.ReactNode;
}) {
  return (
    <Box as="button" onClick={onClick} px={2} py={1} borderRadius="full" fontSize="xs"
      display="flex" alignItems="center" gap={1} borderWidth="1px"
      borderColor={active ? (color ?? 'yellow.400') : 'whiteAlpha.300'}
      bg={active ? 'whiteAlpha.300' : 'whiteAlpha.100'}
      color={active ? 'white' : 'gray.300'} fontWeight={active ? 'bold' : 'normal'}
      _hover={{ bg: 'whiteAlpha.400' }} transition="background 0.15s">
      {children}
    </Box>
  );
}

function CharacterCard({ entry, types, icons, skins }: {
  entry: CharacterEntry; types: CharacterData['types'];
  icons: IconManifest | null; skins: SkinListEntry[];
}) {
  const element = typeOf(entry, types, 'attribute');
  const role = typeOf(entry, types, 'role');
  const faction = typeOf(entry, types, 'faction');
  const kinds = KIND_ORDER.filter((k) => skins.some((s) => s.kind === k));

  return (
    <Box as={NextLink} href={{ pathname: '/character', query: { code: entry.code } }}
      borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" overflow="hidden"
      bg="whiteAlpha.50" _hover={{ borderColor: element?.color ?? 'whiteAlpha.500' }}
      transition="border-color 0.15s" display="block">
      <Box position="relative" bg="blackAlpha.400">
        <GameIcon manifest={icons} group="char" name={entry.iconPath}
          names={[entry.iconPath, `Icon_${entry.code}`]}
          size="100%" w="100%" h="auto" sx={{ aspectRatio: '1 / 1' }} />
        <HStack position="absolute" top={1} left={1} spacing={1}>
          <GameIcon manifest={icons} group="ui" names={typeIcons(element)} size={5}
            tint={typeTint(element)} title={typeLabel(element)} reserve={false} />
          <GameIcon manifest={icons} group="ui" names={typeIcons(role)} size={5}
            title={typeLabel(role)} reserve={false} />
        </HStack>
        <HStack position="absolute" top={1} right={1} spacing={1}>
          <GameIcon manifest={icons} group="ui" names={typeIcons(faction)} size={5}
            title={typeLabel(faction)} reserve={false} />
        </HStack>
        {kinds.length > 0 && (
          <HStack position="absolute" bottom={1} right={1} spacing={0.5}>
            {kinds.map((k) => (
              <GameIcon key={k} manifest={icons} group="ui" name={KIND_ICON[k]}
                size={4} title={KIND_LABEL[k]} opacity={0.9} reserve={false} />
            ))}
          </HStack>
        )}
      </Box>
      <VStack align="stretch" spacing={0.5} px={2} py={1.5}>
        <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{entry.name || entry.code}</Text>
        {entry.nameEn && (
          <Text fontSize="0.65rem" color="gray.500" noOfLines={1}>{entry.nameEn}</Text>
        )}
        <Flex align="center" justify="space-between" gap={1}>
          {entry.unreleased
            ? <Badge colorScheme="purple" fontSize="0.55rem">UNRELEASED</Badge>
            : <StarRating manifest={icons} star={entry.defaultStar ?? 0} size={3} />}
          <Text fontSize="0.65rem" fontFamily="mono" color="gray.500">{entry.code}</Text>
        </Flex>
      </VStack>
    </Box>
  );
}
