// Filtered by the axes the game itself uses, each drawn with its in-game icon.
import { nextFilterMode, nextRouterAdapter, textMatch } from '@altterisk/game-hub/filters';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Badge, Box, Text, VStack, Wrap, WrapItem } from '@altterisk/game-hub/ui';
import {
  EmptyState, FilterChip, FilterPanel, FilterRow, ListToolbar, LoadState, SearchBox, TabPanel, UnitGrid, UnitTile,
  UrlTabs, tabParam,
} from '@altterisk/game-hub';
import { nextLink } from '@/lib/hubLink';
import CharacterEquipmentTab from '@/components/characterEquipmentTab';
import CharacterLineOrderTab from '@/components/characterLineOrderTab';
import CharacterStatsTab from '@/components/characterStatsTab';
import { GameIcon, StarRating } from '@/components/gameIcon';
import {
  KIND_ICON, KIND_ORDER, TYPE_LABEL, characterName, characterSubName, filterRows,
  hasProfile, isPlayable, rosterNote, skinsByCharacter, typeIcons, typeLabel, typeOf, typeTint,
  typeValue, type TypeTable,
} from '@/lib/characters';
import { characterIcon } from '@/lib/icons';
import { spoilerFacts, useSpoilerFilter } from '@/lib/spoilers';
import { readData } from '@/lib/staticData';
import { StaticLinks, type StaticLink } from '@/components/staticLinks';
import type { GetStaticProps } from 'next';
import { useFilters } from '@/lib/filterStore';
import { useCollection } from '@/lib/collectionStore';
import { dataText, useLang, useT, type Lang } from '@/lib/i18n';
import {
  KIND_LABEL, loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type CharacterEntry, type EventIndex, type IconManifest, type SkinListEntry,
} from '@/lib/data';
import { Seo } from '@/components/seo';
import { PageTitle } from '@/components/pageTitle';
import { characterHref } from '@/lib/routes';

// Faction is the only axis rendered as a scrolling icon strip.
const CHIP_TABLES: TypeTable[] = ['attribute', 'role', 'position', 'division'];

const STARS = [1, 2, 3];

export const getStaticProps: GetStaticProps<{ links: StaticLink[] }> = () => {
  const chars = readData<CharacterData>('characters.json');
  const hidden = spoilerFacts(chars, readData<EventIndex>('events.json')).units;
  const links = Object.values(chars.characters)
    .filter((c) => !hidden.has(c.code) && hasProfile(c))
    .map((c) => ({ href: characterHref(c.code), name: characterName(c, 'en') }));
  return { props: { links } };
};

export default function CharactersPage({ links }: { links: StaticLink[] }) {
  const t = useT();
  return <><Seo title={t('navCharacters')} description={t('seoDescCharacters')} /><PageTitle>{t('navCharacters')}</PageTitle><CharactersContent links={links} /></>;
}

function CharactersContent({ links }: { links: StaticLink[] }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filters live in the store so returning from a character page restores them.
  const { query, npcs, unreleased, skinsOnly, collected: wantCollected,
    favorite: wantFavorite, star, artist, picked } = useFilters((s) => s.characters);
  const collected = useCollection((s) => s.collected);
  const favorites = useCollection((s) => s.favorites);
  const setCollected = useCollection((s) => s.setCollected);
  const setCollectedMany = useCollection((s) => s.setCollectedMany);
  const set = useFilters((s) => s.setCharacters);
  const toggle = useFilters((s) => s.toggleType);
  const reset = useFilters((s) => s.resetCharacters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { hide, facts } = useSpoilerFilter();
  const isSpoiler = useCallback(
    (c: CharacterEntry) => hide && (!!c.unreleased || !!facts?.units.has(c.code)), [hide, facts]);

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    // both are decoration: a failure must leave the list usable
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const byCharacter = useMemo(() => skinsByCharacter(skins), [skins]);

  const list = useMemo(() => {
    const all = Object.values(chars?.characters ?? {});
    return all.filter((c) => {
      if (isSpoiler(c)) return false;
      if (c.unreleased) {
        if (!unreleased) return false;
      } else if (!npcs && !isPlayable(c)) return false;
      if (skinsOnly && !byCharacter.has(c.code)) return false;
      if (wantCollected !== 0 && !!collected[c.code] !== (wantCollected === 1)) {
        return false;
      }
      if (wantFavorite !== 0 && !!favorites[c.code] !== (wantFavorite === 1)) {
        return false;
      }
      if (star != null && c.defaultStar !== star) return false;
      if (artist != null && c.artist !== artist) return false;
      for (const [table, want] of Object.entries(picked)) {
        if (want == null) continue;
        if (typeValue(c, table as TypeTable) !== want) return false;
      }
      return textMatch(query, [c.name, c.code, c.nameEn, c.nameUppercase]);
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [chars, query, npcs, unreleased, skinsOnly, wantCollected, wantFavorite, star,
    artist, picked, byCharacter, collected, favorites, isSpoiler]);

  const artists = useMemo(() => {
    const count = new Map<string, { n: number; en?: string | null }>();
    for (const c of Object.values(chars?.characters ?? {})) {
      if (!c.artist || !isPlayable(c)) continue;
      const seen = count.get(c.artist);
      count.set(c.artist, { n: (seen?.n ?? 0) + 1, en: seen?.en ?? c.artistEn });
    }
    return [...count.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  }, [chars]);

  if (error || !chars || (hide && !facts)) {
    return (
      <>
        <StaticLinks links={links} />
        <LoadState loading error={error} labels={{ loading: t('loading'), error }} />
      </>
    );
  }

  const tabItems = [
    { id: 'list', label: t('charactersTabList') },
    { id: 'stats', label: t('charactersTabStats') },
    { id: 'equipment', label: t('charactersTabEquipment') },
    { id: 'order', label: t('charactersTabOrder') },
  ];
  const [tab, setTab] = tabParam(nextRouterAdapter(router), tabItems);
  // only playable units have stats to compare and equipment slots
  const units = list.filter((c) => isPlayable(c) && !c.unreleased);

  const total = Object.values(chars.characters).filter(
    (c) => !isSpoiler(c) && (c.unreleased ? unreleased : npcs || isPlayable(c))).length;

  const markable = list.filter((c) => isPlayable(c) && !collected[c.code]);
  const markAll = () => {
    if (!window.confirm(t('collectionMarkAllConfirm', { n: markable.length }))) return;
    setCollectedMany(markable.map((c) => c.code), true);
  };
  const activeFilters = [star != null, artist != null, skinsOnly, wantCollected !== 0,
    wantFavorite !== 0, npcs, unreleased].filter(Boolean).length
    + Object.values(picked).filter((v) => v != null).length;

  return (
    <VStack align="stretch" spacing={4}>
      <UrlTabs tabs={tabItems} active={tab} onChange={setTab} label={t('navCharacters')} idBase="chars" />
      <ListToolbar
        search={<SearchBox value={query} onChange={(v) => set({ query: v })}
          placeholder={t('search')} clearLabel={t('clearSearch')} />}
        count={t('countOf', { shown: list.length, total })}
        activeFilters={activeFilters} onClearFilters={reset}
        labels={{ clearFilters: t('clearFilters') }}
        actions={tab === 'list' && markable.length > 0 && (
          <FilterChip active={false} onClick={markAll}>
            <Text>{t('collectionMarkAll')}</Text>
            <Text color="gray.500">{markable.length}</Text>
          </FilterChip>
        )} />
      <FilterPanel open={filtersOpen} onToggle={() => setFiltersOpen(!filtersOpen)}
        activeCount={activeFilters}
        labels={{ filters: t('filtersTitle'), show: t('filtersShow'), hide: t('filtersHide') }}>
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

        <FilterRow label={t('rowArtist')}>
          {artists.map(([name, info]) => (
            <FilterChip key={name} active={artist === name}
              onClick={() => set({ artist: artist === name ? null : name })}>
              <Text>{dataText(lang, name, info.en)}</Text>
              <Text color="gray.500">{info.n}</Text>
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
            <FilterChip active={skinsOnly} onClick={() => set({ skinsOnly: !skinsOnly })}>
              <Text>{t('hasSkins')}</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip mode={wantCollected}
              onClick={() => set({ collected: nextFilterMode(wantCollected) })}>
              <Text>{t('collectionCollected')}</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip mode={wantFavorite}
              onClick={() => set({ favorite: nextFilterMode(wantFavorite) })}>
              <Text>{t('collectionFavorites')}</Text>
            </FilterChip>
          </WrapItem>
          <WrapItem>
            <FilterChip active={npcs} onClick={() => set({ npcs: !npcs })}>
              <Text>{t('includeNpcs')}</Text>
            </FilterChip>
          </WrapItem>
          {!hide && (
            <WrapItem>
              <FilterChip active={unreleased} onClick={() => set({ unreleased: !unreleased })}>
                <Text>{t('includeUnreleased')}</Text>
              </FilterChip>
            </WrapItem>
          )}
        </Wrap>
      </VStack>
      </FilterPanel>

      <TabPanel tab={tab} idBase="chars">
        {tab === 'stats' && <CharacterStatsTab list={units} chars={chars} icons={icons} />}
        {tab === 'equipment' && <CharacterEquipmentTab list={units} chars={chars} icons={icons} />}
        {tab === 'order' && (
          <CharacterLineOrderTab list={units} chars={chars} icons={icons}
            focus={typeof router.query.focus === 'string' ? router.query.focus : undefined} />
        )}
        {tab === 'list' && (
          <>
            <UnitGrid density="portrait">
              {list.map((c) => (
                <CharacterCard key={c.code} entry={c} types={chars.types} icons={icons}
                  skins={byCharacter.get(c.code) ?? NO_SKINS} lang={lang}
                  collected={!!collected[c.code]} favorite={!!favorites[c.code]}
                  setCollected={setCollected} />
              ))}
            </UnitGrid>
            {list.length === 0 && <EmptyState title={t('noMatch')} />}
          </>
        )}
      </TabPanel>
    </VStack>
  );
}

const NO_SKINS: SkinListEntry[] = [];

const CharacterCard = memo(function CharacterCard({
  entry, types, icons, skins, lang, collected, favorite, setCollected,
}: {
  entry: CharacterEntry; types: CharacterData['types'];
  icons: IconManifest | null; skins: SkinListEntry[]; lang: Lang;
  collected: boolean; favorite: boolean; setCollected: (code: string, value: boolean) => void;
}) {
  const t = useT();
  const element = typeOf(entry, types, 'attribute');
  const role = typeOf(entry, types, 'role');
  const faction = typeOf(entry, types, 'faction');
  const kinds = KIND_ORDER.filter((k) => skins.some((s) => s.kind === k));
  const roster = rosterNote(entry, lang);
  // Prefer rig thumbnails because story-only characters can lack portraits.
  const art = characterIcon(icons, entry, skins);

  const subName = characterSubName(entry, lang);

  return (
    <UnitTile density="portrait" href={characterHref(entry.code)} renderLink={nextLink}
      accent={element?.color}
      art={art ? <Box as="img" src={art} alt="" loading="lazy" /> : undefined}
      title={characterName(entry, lang)} subtitle={subName || undefined} id={entry.code}
      start={(
        <>
          <GameIcon manifest={icons} group="ui" names={typeIcons(element)} size={5}
            tint={typeTint(element)} title={typeLabel(element, lang)} reserve={false} />
          <GameIcon manifest={icons} group="ui" names={typeIcons(role)} size={5}
            title={typeLabel(role, lang)} reserve={false} />
        </>
      )}
      end={(
        <>
          {favorite && <Badge colorScheme="pink" fontSize="0.55rem">♥</Badge>}
          {isPlayable(entry) && (
            // The card is a link, so the toggle has to keep the click.
            <Box as="button" fontSize="0.55rem" lineHeight={1.4} px={1} borderRadius="sm"
              fontWeight="700" title={t('collectionCollected')}
              bg={collected ? 'accent.400' : 'whiteAlpha.300'}
              color={collected ? 'gray.900' : 'gray.500'}
              _hover={{ bg: collected ? 'accent.300' : 'whiteAlpha.600', color: collected ? 'gray.900' : 'gray.100' }}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setCollected(entry.code, !collected);
              }}>
              ✓
            </Box>
          )}
          <GameIcon manifest={icons} group="ui" names={typeIcons(faction)} size={5}
            title={typeLabel(faction, lang)} reserve={false} />
        </>
      )}
      corner={kinds.length > 0 && kinds.map((k) => (
        <GameIcon key={k} manifest={icons} group="ui" name={KIND_ICON[k]}
          size={4} title={KIND_LABEL[k][lang]} opacity={0.9} reserve={false} />
      ))}
      badges={roster
        ? <Badge colorScheme={roster.scheme} fontSize="0.55rem">{roster.label}</Badge>
        : <StarRating manifest={icons} star={entry.defaultStar ?? 0} size={3} />} />
  );
});
