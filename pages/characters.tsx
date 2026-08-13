// Filtered by the axes the game itself uses, each drawn with its in-game icon.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, Grid, HStack, Input, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon, StarRating } from '@/components/gameIcon';
import { FilterChip, FilterRow } from '@/components/filters';
import {
  KIND_ICON, KIND_ORDER, TYPE_LABEL, characterName, characterSubName, filterRows,
  isPlayable, rosterNote, skinsByCharacter, typeIcons, typeLabel, typeOf, typeTint,
  typeValue, type TypeTable,
} from '@/lib/characters';
import { characterIcon } from '@/lib/icons';
import { useFilters, type Tri } from '@/lib/filterStore';
import { useCollection } from '@/lib/collectionStore';
import { useLang, useT, type Lang } from '@/lib/i18n';
import {
  KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type IconManifest, type SkinListEntry,
} from '@/lib/data';

// Faction is the only axis rendered as a scrolling icon strip.
const CHIP_TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division'];

const nextTri = (tri: Tri): Tri => (tri === 'all' ? 'yes' : tri === 'yes' ? 'no' : 'all');
const STARS = [1, 2, 3];

export default function CharactersPage() {
  const t = useT();
  const lang = useLang();
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filters live in the store so returning from a character page restores them.
  const { query, npcs, unreleased, skinsOnly, collected: wantCollected,
    favorite: wantFavorite, star, picked } = useFilters((s) => s.characters);
  const collected = useCollection((s) => s.collected);
  const favorites = useCollection((s) => s.favorites);
  const setCollected = useCollection((s) => s.setCollected);
  const setCollectedMany = useCollection((s) => s.setCollectedMany);
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
      if (wantCollected !== 'all' && !!collected[c.code] !== (wantCollected === 'yes')) {
        return false;
      }
      if (wantFavorite !== 'all' && !!favorites[c.code] !== (wantFavorite === 'yes')) {
        return false;
      }
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
  }, [chars, query, npcs, unreleased, skinsOnly, wantCollected, wantFavorite, star,
    picked, byCharacter, collected, favorites]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!chars) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }

  const total = Object.values(chars.characters).filter(
    (c) => (c.unreleased ? unreleased : npcs || isPlayable(c))).length;

  const markable = list.filter((c) => isPlayable(c) && !collected[c.code]);
  const markAll = () => {
    if (!window.confirm(t('collectionMarkAllConfirm', { n: markable.length }))) return;
    setCollectedMany(markable.map((c) => c.code), true);
  };

  return (
    <VStack align="stretch" spacing={4}>
      <VStack align="stretch" spacing={2}>
        {CHIP_TABLES.map((table) => (
          <FilterRow key={table} label={TYPE_LABEL[table][lang]}>
            {filterRows(chars.types, table).map(([value, row]) => (
              <FilterChip key={value} active={picked[table] === Number(value)}
                onClick={() => toggle(table, Number(value))}
                color={row.color}>
                <GameIcon manifest={icons} group="ui" names={typeIcons(row)} size={5}
                  tint={typeTint(row)} />
                <Text color={row.color}>{typeLabel(row, lang)}</Text>
              </FilterChip>
            ))}
          </FilterRow>
        ))}

        <FilterRow label={t('rarity')}>
          {STARS.map((s) => (
            <FilterChip key={s} active={star === s}
              onClick={() => set({ star: star === s ? null : s })}>
              <StarRating manifest={icons} star={s} size={4} />
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label={TYPE_LABEL.faction[lang]}>
          {filterRows(chars.types, 'faction').map(([value, row]) => (
            <FilterChip key={value} active={picked.faction === Number(value)}
              onClick={() => toggle('faction', Number(value))}>
              <GameIcon manifest={icons} group="ui" names={typeIcons(row)} size={5}
                title={row.name} />
              <Text>{typeLabel(row, lang)}</Text>
            </FilterChip>
          ))}
        </FilterRow>

        <Wrap spacing={2} align="center" pt={1}>
          <WrapItem>
            <Input size="sm" maxW="220px" placeholder={t('search')}
              value={query} onChange={(e) => set({ query: e.target.value })}
              bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
          </WrapItem>
          <WrapItem>
            <FilterChip active={skinsOnly} onClick={() => set({ skinsOnly: !skinsOnly })}>
              <Text>{t('hasSkins')}</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip active={wantCollected !== 'all'}
              onClick={() => set({ collected: nextTri(wantCollected) })}>
              <Text>
                {wantCollected === 'no'
                  ? t('collectionNotCollected') : t('collectionCollected')}
              </Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip active={wantFavorite !== 'all'}
              onClick={() => set({ favorite: nextTri(wantFavorite) })}>
              <Text>
                {wantFavorite === 'no'
                  ? t('collectionNotFavorite') : t('collectionFavorites')}
              </Text>
            </FilterChip>
          </WrapItem>
          {markable.length > 0 && (
            <WrapItem>
              <FilterChip active={false} onClick={markAll}>
                <Text>{t('collectionMarkAll')}</Text>
                <Text color="gray.500">{markable.length}</Text>
              </FilterChip>
            </WrapItem>
          )}
          <WrapItem>
            <FilterChip active={npcs} onClick={() => set({ npcs: !npcs })}>
              <Text>{t('includeNpcs')}</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip active={unreleased} onClick={() => set({ unreleased: !unreleased })}>
              <Text>{t('includeUnreleased')}</Text>
            </FilterChip>
          </WrapItem>
          {(star != null || Object.values(picked).some((v) => v != null)) && (
            <WrapItem>
              <FilterChip active={false} onClick={clearTypes}>
                <Text>{t('clear')}</Text>
              </FilterChip>
            </WrapItem>
          )}
          <WrapItem>
            <Text fontSize="xs" color="gray.500">
              {t('countOf', { shown: list.length, total })}
            </Text>
          </WrapItem>
        </Wrap>
      </VStack>

      <Grid gap={3} templateColumns={{
        base: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)',
        md: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)',
      }}>
        {list.map((c) => (
          <CharacterCard key={c.code} entry={c} types={chars.types} icons={icons}
            skins={byCharacter.get(c.code) ?? []} lang={lang}
            collected={!!collected[c.code]} favorite={!!favorites[c.code]}
            onCollect={() => setCollected(c.code, !collected[c.code])} />
        ))}
      </Grid>
      {list.length === 0 && <Text fontSize="sm" color="gray.500">{t('noMatch')}</Text>}
    </VStack>
  );
}

function CharacterCard({
  entry, types, icons, skins, lang, collected, favorite, onCollect,
}: {
  entry: CharacterEntry; types: CharacterData['types'];
  icons: IconManifest | null; skins: SkinListEntry[]; lang: Lang;
  collected: boolean; favorite: boolean; onCollect: () => void;
}) {
  const t = useT();
  const element = typeOf(entry, types, 'attribute');
  const role = typeOf(entry, types, 'role');
  const faction = typeOf(entry, types, 'faction');
  const kinds = KIND_ORDER.filter((k) => skins.some((s) => s.kind === k));
  const roster = rosterNote(entry, lang);
  // Prefer rig thumbnails because story-only characters can lack portraits.
  const art = characterIcon(icons, entry, skins);

  return (
    <Box as={NextLink} href={{ pathname: '/character', query: { code: entry.code } }}
      borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="xl" overflow="hidden"
      bg="linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))"
      boxShadow="0 12px 28px rgba(0,0,0,0.14)" display="block"
      _hover={{ borderColor: element?.color ?? 'whiteAlpha.500', transform: 'translateY(-2px)',
        boxShadow: '0 18px 38px rgba(0,0,0,0.24)', textDecoration: 'none' }}
      transition="border-color 0.16s, transform 0.16s, box-shadow 0.16s">
      <Box position="relative" bg="blackAlpha.400" sx={{ aspectRatio: '1 / 1' }}>
        {art && (
          <Box as="img" src={art} alt="" w="100%" h="100%" objectFit="contain" />
        )}
        <HStack position="absolute" top={1} left={1} spacing={1}
          bg="blackAlpha.700" borderRadius="md" px={1} py={0.5}
          backdropFilter="blur(2px)" _empty={{ display: 'none' }}>
          <GameIcon manifest={icons} group="ui" names={typeIcons(element)} size={5}
            tint={typeTint(element)} title={typeLabel(element, lang)} reserve={false} />
          <GameIcon manifest={icons} group="ui" names={typeIcons(role)} size={5}
            title={typeLabel(role, lang)} reserve={false} />
        </HStack>
        <HStack position="absolute" top={1} right={1} spacing={1}
          bg="blackAlpha.700" borderRadius="md" px={1} py={0.5}
          backdropFilter="blur(2px)" _empty={{ display: 'none' }}>
          {favorite && <Badge colorScheme="pink" fontSize="0.55rem">♥</Badge>}
          {isPlayable(entry) && (
            // The card is a link, so the toggle has to keep the click.
            <Box as="button" fontSize="0.55rem" lineHeight={1.4} px={1} borderRadius="sm"
              fontWeight="700" title={t('collectionCollected')}
              bg={collected ? 'yellow.400' : 'whiteAlpha.300'}
              color={collected ? 'gray.900' : 'gray.500'}
              _hover={{ bg: collected ? 'yellow.300' : 'whiteAlpha.600', color: collected ? 'gray.900' : 'gray.100' }}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onCollect();
              }}>
              ✓
            </Box>
          )}
          <GameIcon manifest={icons} group="ui" names={typeIcons(faction)} size={5}
            title={typeLabel(faction, lang)} reserve={false} />
        </HStack>
        {kinds.length > 0 && (
          <HStack position="absolute" bottom={1} right={1} spacing={0.5}
            bg="blackAlpha.700" borderRadius="md" px={1} py={0.5}
            backdropFilter="blur(2px)" _empty={{ display: 'none' }}>
            {kinds.map((k) => (
              <GameIcon key={k} manifest={icons} group="ui" name={KIND_ICON[k]}
                size={4} title={KIND_LABEL[k][lang]} opacity={0.9} reserve={false} />
            ))}
          </HStack>
        )}
      </Box>
      <VStack align="stretch" spacing={0.5} px={2} py={1.5}>
        <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{characterName(entry, lang)}</Text>
        {characterSubName(entry, lang) && (
          <Text fontSize="0.65rem" color="gray.500" noOfLines={1}>
            {characterSubName(entry, lang)}
          </Text>
        )}
        <Flex align="center" justify="space-between" gap={1}>
          {roster
            ? <Badge colorScheme={roster.scheme} fontSize="0.55rem">{roster.label}</Badge>
            : <StarRating manifest={icons} star={entry.defaultStar ?? 0} size={3} />}
          <Text fontSize="0.65rem" fontFamily="mono" color="gray.500">{entry.code}</Text>
        </Flex>
      </VStack>
    </Box>
  );
}
