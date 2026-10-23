import { useSpoilerUnit } from '@/lib/spoilers';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { LinkIcon } from '@chakra-ui/icons';
import {
  Box, Button, Flex, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, SimpleGrid, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { LoadState, PageHeader, Panel, TabPanel, UrlTabs, tabParam } from '@altterisk/game-hub';
import { nextRouterAdapter } from '@altterisk/game-hub/filters';
import { GameIcon } from '@/components/gameIcon';
import { FilterChip } from '@/components/filters';
import { PlanGrid, type PlanDraft } from '@/components/unitPlan';
import { useFarm } from '@/lib/farmStore';
import { emptyPlan, planStar, type UnitPlan } from '@/lib/farm';
import {
  NEMESIS_TEAMS, PARTY_SIZE, memberPlan, newId, readShareCode, shareCode, useParty,
  type FriendSlot, type NemesisGroup, type PartyMember, type ShareDoc, type Team, type TeamKind,
} from '@/lib/partyStore';
import {
  INFUSION_PATHS, characterName, equipmentSlotsOf, infusionNodes, infusionReach, isPlayable, typeLabel,
} from '@/lib/characters';
import { partyImage, saveBlob, type ImageRow } from '@/lib/partyImage';
import { GROUP_ICON_GROUPS, groupLabel } from '@/lib/stages';
import { hasIcon, resolveIcon, type IconGroup } from '@/lib/icons';
import { dataText, useLang, useT, type Lang } from '@/lib/i18n';
import {
  loadCharacters, loadGrowth, loadIcons, loadStages,
  type CharacterData, type CharacterEntry, type GrowthData, type IconManifest, type StageData,
} from '@/lib/data';

type Ctx = { chars: CharacterData; growth: GrowthData; icons: IconManifest | null; lang: Lang };

const PageCtx = createContext<Ctx | null>(null);

type NemesisZone = { id: number; name: string; image?: string };
type NemesisBoss = {
  boss: string; name: string; image?: string;
  attributes: { attribute: number; zones: NemesisZone[] }[];
};

const iconGroupOf = (icons: IconManifest | null, name?: string): IconGroup =>
  GROUP_ICON_GROUPS.find((g) => hasIcon(icons, g, name)) ?? GROUP_ICON_GROUPS[0];

// A season's boss is the one its first zone fields; its weak attribute is the season's.
function nemesisBosses(stages: StageData, lang: Lang): NemesisBoss[] {
  const seasons = new Map<string, { zones: Set<number>; boss?: string; attribute?: number; firstZone: number }>();
  for (const stage of stages.stages) {
    if (stage.mode !== 'nemesis' || stage.zoneId == null) continue;
    const season = seasons.get(stage.group) ?? { zones: new Set(), firstZone: Infinity };
    season.zones.add(stage.zoneId);
    if (stage.zoneId < season.firstZone) {
      season.firstZone = stage.zoneId;
      season.boss = stage.waves.find((w) => w.bossCode)?.bossCode ?? season.boss;
      season.attribute = stage.weakAttribute ?? season.attribute;
    }
    seasons.set(stage.group, season);
  }
  const out = new Map<string, NemesisBoss>();
  const order = [...seasons.entries()]
    .sort(([a], [b]) => (stages.groups[b]?.order ?? 0) - (stages.groups[a]?.order ?? 0));
  for (const [key, season] of order) {
    if (!season.boss || season.attribute == null) continue;
    const group = stages.groups[key];
    const boss = out.get(season.boss) ?? {
      boss: season.boss, name: group ? groupLabel(stages, group, lang) : season.boss,
      image: group?.image, attributes: [],
    };
    if (!boss.attributes.some((a) => a.attribute === season.attribute)) {
      boss.attributes.push({
        attribute: season.attribute,
        zones: [...season.zones].sort((a, b) => a - b).map((id) => {
          const zone = stages.zones[String(id)];
          return { id, name: dataText(lang, zone?.name?.ko, zone?.name?.en) || String(id), image: zone?.image };
        }),
      });
    }
    out.set(season.boss, boss);
  }
  for (const boss of out.values()) boss.attributes.sort((a, b) => a.attribute - b.attribute);
  return [...out.values()].sort((a, b) => a.boss.localeCompare(b.boss));
}

// The game places a party by approach, then id, frontmost first; it is drawn frontmost on the right.
function partyOrder(units: PartyMember[], chars: CharacterData): PartyMember[] {
  const key = (m: PartyMember) => chars.characters[m.code];
  return [...units].sort((a, b) => (key(b)?.approach ?? 0) - (key(a)?.approach ?? 0)
    || (key(b)?.id ?? 0) - (key(a)?.id ?? 0));
}

function planned(code: string): UnitPlan | null {
  return useFarm.getState().units[code]?.current ?? null;
}

function useCopy(): [string, (text: string) => void] {
  const t = useT();
  const [status, setStatus] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [status, async (text: string) => {
    let message = t('partyCodeCopied');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      message = t('partyCodeFailed');
    }
    setStatus(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(''), 2500);
  }];
}

export default function PartyPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [stages, setStages] = useState<StageData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const general = useParty((s) => s.general);
  const arena = useParty((s) => s.arena);
  const groups = useParty((s) => s.nemesis);
  const setTeams = useParty((s) => s.setTeams);
  const setGroups = useParty((s) => s.setGroups);
  const [code, setCode] = useState('');
  const [importFailed, setImportFailed] = useState(false);

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadGrowth().then(setGrowth).catch((e) => setError(String(e)));
    loadStages().then(setStages).catch((e) => setError(String(e)));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const tabItems = [
    { id: 'general', label: t('partyTabGeneral') },
    { id: 'arena', label: t('partyTabArena') },
    { id: 'nemesis', label: t('partyTabNemesis') },
  ];
  const [tab, setTab] = tabParam(nextRouterAdapter(router), tabItems);
  const bosses = useMemo(() => (stages ? nemesisBosses(stages, lang) : []), [stages, lang]);

  if (error || !chars || !growth || !stages) {
    return <LoadState loading={!error} error={error} labels={{ loading: t('loading'), error }} />;
  }
  const ctx: Ctx = { chars, growth, icons, lang };
  const kind: TeamKind = tab === 'arena' ? 'arena' : 'general';
  const teams = kind === 'arena' ? arena : general;

  const runImport = () => {
    const doc: ShareDoc | null = readShareCode(code);
    if (!doc) {
      setImportFailed(true);
      return;
    }
    setImportFailed(false);
    setCode('');
    if ('group' in doc) {
      setGroups([...groups, doc.group]);
      setTab('nemesis');
    } else {
      setTeams(kind, [...teams, doc.team]);
    }
  };
  return (
    <PageCtx.Provider value={ctx}>
    <VStack align="stretch" spacing={4}>
      <Head><title>{`MAD Viewer — ${t('navParty')}`}</title></Head>
      <PageHeader title={t('navParty')} />
      <Flex wrap="wrap" gap={2} align="center">
        <Input size="sm" maxW={{ base: '100%', md: '22rem' }} value={code}
          placeholder={t('partyImportPlaceholder')} fontFamily="mono"
          onChange={(e) => { setCode(e.target.value); setImportFailed(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') runImport(); }} />
        <Button size="sm" variant="outline" isDisabled={!code.trim()} onClick={runImport}>
          {t('partyImport')}
        </Button>
        {importFailed && <Text fontSize="xs" color="red.300">{t('partyImportFailed')}</Text>}
      </Flex>
      <UrlTabs tabs={tabItems} active={tab} onChange={setTab} label={t('navParty')} idBase="party" />
      <TabPanel tab={tab} idBase="party">
        {tab === 'nemesis'
          ? <NemesisTab ctx={ctx} bosses={bosses} groups={groups} setGroups={setGroups} />
          : <TeamList ctx={ctx} teams={teams} setTeams={(next) => setTeams(kind, next)} />}
      </TabPanel>
    </VStack>
    </PageCtx.Provider>
  );
}

function TeamList({ ctx, teams, setTeams }: {
  ctx: Ctx; teams: Team[]; setTeams: (teams: Team[]) => void;
}) {
  const t = useT();
  const replace = (id: string, team: Team) => setTeams(teams.map((x) => (x.id === id ? team : x)));
  return (
    <VStack align="stretch" spacing={3}>
      {teams.length === 0 && <Text fontSize="sm" color="gray.500">{t('partyEmpty')}</Text>}
      {teams.map((team, i) => {
        const name = team.name || t('partyTeamName', { n: i + 1 });
        return (
          <Panel key={team.id} title={
            <NameField value={team.name} placeholder={name}
              onChange={(v) => replace(team.id, { ...team, name: v })} />}
          actions={
            <EntryActions name={name} code={() => shareCode({ team })}
              rows={() => [{
                units: partyOrder(team.units, ctx.chars).map((m) => ({ code: m.code, plan: memberPlan(m) })),
              }]}
              onDuplicate={() => {
                const at = teams.indexOf(team) + 1;
                setTeams([...teams.slice(0, at), { ...team, id: newId(), name: team.name }, ...teams.slice(at)]);
              }}
              onDelete={() => setTeams(teams.filter((x) => x.id !== team.id))} />}>
            <MemberRow ctx={ctx} units={team.units}
              onChange={(units) => replace(team.id, { ...team, units })} />
          </Panel>
        );
      })}
      <Box>
        <Button size="sm" variant="outline"
          onClick={() => setTeams([...teams, { id: newId(), name: '', units: [] }])}>
          {t('partyNewTeam')}
        </Button>
      </Box>
    </VStack>
  );
}

function NemesisTab({ ctx, bosses, groups, setGroups }: {
  ctx: Ctx; bosses: NemesisBoss[]; groups: NemesisGroup[]; setGroups: (g: NemesisGroup[]) => void;
}) {
  const t = useT();
  const replace = (id: string, g: NemesisGroup) => setGroups(groups.map((x) => (x.id === id ? g : x)));
  return (
    <VStack align="stretch" spacing={4}>
      {bosses.map((boss) => (
        <Panel key={boss.boss} title={
          <HStack spacing={2}>
            <GameIcon manifest={ctx.icons} group={iconGroupOf(ctx.icons, boss.image)} name={boss.image}
              size={8} reserve={false} />
            <Text>{boss.name}</Text>
          </HStack>}>
          <VStack align="stretch" spacing={4}>
            {boss.attributes.map(({ attribute, zones }) => {
              const type = ctx.chars.types.attribute[String(attribute)] ?? null;
              const own = groups.filter((g) => g.boss === boss.boss && g.attribute === attribute);
              return (
                <VStack key={attribute} align="stretch" spacing={2}>
                  <HStack spacing={2}>
                    <Text fontSize="sm" color="gray.400">{t('stageWeakTo')}</Text>
                    <GameIcon manifest={ctx.icons} group="ui" name={type?.icon} size={5} reserve={false} />
                    <Text fontSize="sm" fontWeight="bold" color={type?.color ?? 'gray.200'}>
                      {typeLabel(type, ctx.lang) || attribute}
                    </Text>
                  </HStack>
                  {own.map((g, i) => {
                    const name = g.name || t('partyGroupName', { n: i + 1 });
                    return (
                      <Box key={g.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md" p={3}>
                        <Flex wrap="wrap" gap={2} align="center" mb={2}>
                          <NameField value={g.name} placeholder={name}
                            onChange={(v) => replace(g.id, { ...g, name: v })} />
                          <Box flex="1" />
                          <EntryActions name={name} code={() => shareCode({ group: g })}
                            subtitle={`${boss.name} · ${t('stageWeakTo')} ${typeLabel(type, ctx.lang)}`}
                            rows={() => g.teams.map((units, k) => ({
                              label: zones[k]?.name,
                              icon: resolveIcon(ctx.icons, iconGroupOf(ctx.icons, zones[k]?.image), [zones[k]?.image]),
                              units: rowItems(units, g.friend?.team === k ? g.friend : null, ctx.chars)
                                .map((x) => (x.friend ? { code: x.code, friend: true }
                                  : { code: x.member.code, plan: memberPlan(x.member) })),
                            }))}
                            onDuplicate={() => {
                              const at = groups.indexOf(g) + 1;
                              setGroups([...groups.slice(0, at), { ...g, id: newId() }, ...groups.slice(at)]);
                            }}
                            onDelete={() => setGroups(groups.filter((x) => x.id !== g.id))} />
                        </Flex>
                        <GroupTeams ctx={ctx} group={g} zones={zones}
                          onChange={(patch) => replace(g.id, { ...g, ...patch })} />
                      </Box>
                    );
                  })}
                  <Box>
                    <Button size="xs" variant="outline" onClick={() => setGroups([...groups, {
                      id: newId(), name: '', boss: boss.boss, attribute,
                      teams: Array.from({ length: NEMESIS_TEAMS }, () => []), friend: null,
                    }])}>
                      {t('partyNewGroup')}
                    </Button>
                  </Box>
                </VStack>
              );
            })}
          </VStack>
        </Panel>
      ))}
    </VStack>
  );
}

function GroupTeams({ ctx, group, zones, onChange }: {
  ctx: Ctx; group: NemesisGroup; zones: NemesisZone[];
  onChange: (patch: Partial<Pick<NemesisGroup, 'teams' | 'friend'>>) => void;
}) {
  const t = useT();
  const usedOutside = (i: number) => new Set(group.teams
    .flatMap((team, j) => (j === i ? [] : team.map((m) => m.code))));
  const setTeam = (i: number, units: PartyMember[]) =>
    onChange({ teams: group.teams.map((team, j) => (j === i ? units : team)) });
  return (
    <VStack align="stretch" spacing={3}>
      {group.teams.map((units, i) => {
        const zone = zones[i];
        return (
          <Flex key={i} direction={{ base: 'column', md: 'row' }} gap={2} minW={0}
            pt={i ? 3 : 0} borderTopWidth={i ? '1px' : 0} borderColor="whiteAlpha.100">
            <HStack spacing={2} minW={0} w={{ md: '14rem' }} flexShrink={0} align="center">
              <GameIcon manifest={ctx.icons} group={iconGroupOf(ctx.icons, zone?.image)} name={zone?.image}
                size={6} reserve={false} />
              <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
                {zone?.name ?? t('partyTeamName', { n: i + 1 })}
              </Text>
            </HStack>
            <MemberRow ctx={ctx} units={units} onChange={(next) => setTeam(i, next)}
              taken={usedOutside(i)}
              friend={{
                slot: group.friend?.team === i ? group.friend : null,
                canAdd: !group.friend,
                add: () => onChange({ friend: { team: i, code: null } }),
                set: (code) => onChange({ friend: { team: i, code } }),
                remove: () => onChange({ friend: null }),
              }} />
          </Flex>
        );
      })}
    </VStack>
  );
}

function NameField({ value, placeholder, onChange }: {
  value: string; placeholder: string; onChange: (v: string) => void;
}) {
  return (
    <Input size="sm" variant="flushed" value={value} placeholder={placeholder} maxLength={60}
      maxW="16rem" fontWeight="bold" _placeholder={{ color: 'gray.300' }}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function EntryActions({ name, subtitle, code, rows, onDuplicate, onDelete }: {
  name: string; subtitle?: string; code: () => string; rows: () => ImageRow[];
  onDuplicate: () => void; onDelete: () => void;
}) {
  const t = useT();
  const page = useContext(PageCtx);
  const [status, copy] = useCopy();
  const [busy, setBusy] = useState(false);
  const saveImage = async () => {
    if (!page) return;
    setBusy(true);
    const blob = await partyImage({
      title: name, subtitle, rows: rows(), chars: page.chars, icons: page.icons, lang: page.lang,
      friendLabel: t('partyFriend'),
    });
    setBusy(false);
    if (blob) saveBlob(blob, `${name.replace(/[\\/:*?"<>|]+/g, '_') || 'party'}.png`);
  };
  return (
    <Wrap spacing={1} align="center">
      <WrapItem>
        <Button size="xs" variant="outline" isLoading={busy} onClick={saveImage}>{t('partySaveImage')}</Button>
      </WrapItem>
      <WrapItem><Button size="xs" variant="outline" onClick={() => copy(code())}>{t('partyCopyCode')}</Button></WrapItem>
      <WrapItem><Button size="xs" variant="outline" onClick={onDuplicate}>{t('partyDuplicate')}</Button></WrapItem>
      <WrapItem>
        <Button size="xs" variant="outline" colorScheme="red"
          onClick={() => { if (window.confirm(t('partyDeleteConfirm', { name }))) onDelete(); }}>
          {t('partyDelete')}
        </Button>
      </WrapItem>
      {status && <WrapItem><Text fontSize="xs" color="green.300">{status}</Text></WrapItem>}
    </Wrap>
  );
}

type FriendControl = {
  slot: FriendSlot | null; canAdd: boolean;
  add: () => void; set: (code: string | null) => void; remove: () => void;
};

type RowItem = { friend: false; member: PartyMember } | { friend: true; code: string | null };

const TILE = { w: '6.5rem', h: '10.75rem', borderWidth: '1px', borderRadius: 'md' } as const;

// An unchosen friend has no approach, so it sits at the back end (left).
function rowItems(units: PartyMember[], slot: FriendSlot | null, chars: CharacterData): RowItem[] {
  const items: RowItem[] = units.map((member) => ({ friend: false, member }));
  if (slot?.code) items.push({ friend: true, code: slot.code });
  const order = partyOrder(items.map((x) => ({ code: x.friend ? x.code! : x.member.code, plan: emptyPlan() })), chars)
    .map((m) => m.code);
  const rank = (x: RowItem) => order.indexOf(x.friend ? x.code! : x.member.code);
  const sorted = items.sort((a, b) => rank(a) - rank(b));
  return slot && !slot.code ? [{ friend: true, code: null }, ...sorted] : sorted;
}

function MemberRow({ ctx, units, onChange, taken, friend }: {
  ctx: Ctx; units: PartyMember[]; onChange: (units: PartyMember[]) => void;
  taken?: Set<string>; friend?: FriendControl;
}) {
  const t = useT();
  const [picking, setPicking] = useState<'unit' | 'friend' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const editMember = units.find((m) => m.code === editing) ?? null;
  const replace = (code: string, member: PartyMember) =>
    onChange(units.map((m) => (m.code === code ? member : m)));
  const slot = friend?.slot ?? null;
  const full = units.length + (slot ? 1 : 0) >= PARTY_SIZE;
  const own = new Set(units.map((m) => m.code));
  return (
    <>
      <Wrap spacing={2}>
        {rowItems(units, slot, ctx.chars).map((item) => (item.friend ? (
          <WrapItem key="friend">
            <FriendTile ctx={ctx} code={item.code} onPick={() => setPicking('friend')}
              onRemove={() => friend?.remove()} />
          </WrapItem>
        ) : (
          <WrapItem key={item.member.code}>
            <MemberTile ctx={ctx} member={item.member}
              onSync={(on) => replace(item.member.code, setSync(item.member, on))}
              onEdit={() => setEditing(item.member.code)}
              onRemove={() => onChange(units.filter((x) => x.code !== item.member.code))} />
          </WrapItem>
        )))}
        {!full && (
          <WrapItem>
            <Box as="button" {...TILE} borderStyle="dashed"
              borderColor="whiteAlpha.300" color="gray.400" fontSize="xs"
              _hover={{ borderColor: 'yellow.400', color: 'yellow.200' }}
              onClick={() => setPicking('unit')}>
              + {t('partyAddUnit')}
            </Box>
          </WrapItem>
        )}
        {!full && friend?.canAdd && (
          <WrapItem>
            <Box as="button" {...TILE} borderStyle="dashed"
              borderColor="teal.700" color="teal.300" fontSize="xs" title={t('partyFriendHint')}
              _hover={{ borderColor: 'teal.300', color: 'teal.200' }}
              onClick={friend.add}>
              + {t('partyFriend')}
            </Box>
          </WrapItem>
        )}
      </Wrap>
      {picking === 'unit' && (
        <UnitPicker ctx={ctx} taken={new Set([...own, ...(taken ?? [])])}
          onClose={() => setPicking(null)}
          onPick={(code) => {
            onChange([...units, { code, plan: planned(code) ?? emptyPlan(), sync: true }]);
            setPicking(null);
          }} />
      )}
      {picking === 'friend' && friend && (
        <UnitPicker ctx={ctx} taken={own}
          onClose={() => setPicking(null)}
          onClear={() => { friend.set(null); setPicking(null); }}
          onPick={(code) => { friend.set(code); setPicking(null); }} />
      )}
      {editMember && (
        <InvestmentDialog ctx={ctx} member={editMember} onClose={() => setEditing(null)}
          onSave={(plan) => { replace(editMember.code, { ...editMember, plan }); setEditing(null); }} />
      )}
    </>
  );
}

function charIcon(entry: CharacterEntry | undefined): (string | null | undefined)[] {
  return [entry?.iconPath, entry ? `Icon_${entry.code}` : null];
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <Box as="button" aria-label={t('partyRemove')} title={t('partyRemove')} position="absolute"
      top={0} right={1} fontSize="xs" color="gray.500" _hover={{ color: 'red.300' }} onClick={onClick}>
      ×
    </Box>
  );
}

function Portrait({ ctx, entry }: { ctx: Ctx; entry: CharacterEntry | undefined }) {
  const attr = entry?.attributeType != null ? ctx.chars.types.attribute[String(entry.attributeType)] : null;
  return (
    <Box position="relative">
      <GameIcon manifest={ctx.icons} group="char" names={charIcon(entry)} size={16} borderRadius="md" />
      {attr && (
        <Box position="absolute" bottom={0} left={0} boxSize={5} borderRadius="full" bg="blackAlpha.700"
          display="flex" alignItems="center" justifyContent="center">
          <GameIcon manifest={ctx.icons} group="ui" name={attr.icon} size={3.5} tint={attr.color} reserve={false} />
        </Box>
      )}
    </Box>
  );
}

// Sync on seeds an empty Planner record from this copy; sync off freezes the Planner's state.
function setSync(m: PartyMember, on: boolean): PartyMember {
  if (!on) return { code: m.code, plan: memberPlan(m) };
  if (!planned(m.code)) useFarm.getState().setPlan(m.code, 'current', m.plan);
  return { ...m, sync: true };
}

function useMemberPlan(m: PartyMember): UnitPlan {
  const live = useFarm((s) => s.units[m.code]?.current);
  return m.sync ? live ?? emptyPlan() : m.plan;
}

// Every slot and path always renders, so tiles keep one height; unset ones are dimmed.
function GearInfusion({ ctx, entry, plan }: { ctx: Ctx; entry: CharacterEntry; plan: UnitPlan }) {
  const slots = equipmentSlotsOf(entry, ctx.chars.equipment);
  const star = planStar(plan, entry);
  const infused = INFUSION_PATHS
    .filter((path) => infusionNodes(entry, path).length > 0)
    .map((path) => ({ path, n: Math.min(plan.infusion?.[path] ?? 0, infusionReach(entry, path, star)) }));
  return (
    <VStack spacing={0.5}>
      <HStack spacing={1} h="1.85rem">
        {slots.map((slot) => {
          const gear = plan.gear[String(slot.type)];
          const on = (gear?.tier ?? 0) > 0;
          return (
            <VStack key={slot.type} spacing={0} opacity={on ? 1 : 0.3}>
              <GameIcon manifest={ctx.icons} group="equip" size={5}
                name={on ? (slot.tiers ?? []).find((r) => r.tier === gear!.tier)?.icon ?? slot.icon : slot.icon} />
              <Text fontSize="0.55rem" color="gray.400" fontFamily="mono" lineHeight={1}>
                {on ? gear!.level : '–'}
              </Text>
            </VStack>
          );
        })}
      </HStack>
      <HStack spacing={1.5} h="0.9rem">
        {infused.map(({ path, n }) => {
          const name = ctx.chars.infusion?.paths[path];
          return (
            <Text key={path} fontSize="0.6rem" fontFamily="mono" lineHeight={1}
              color={n ? 'purple.200' : 'whiteAlpha.400'}
              title={dataText(ctx.lang, name?.name, name?.nameEn) || path}>
              {(dataText(ctx.lang, name?.name, name?.nameEn) || path).charAt(0)}{n}
            </Text>
          );
        })}
      </HStack>
    </VStack>
  );
}

function MemberTile({ ctx, member, onSync, onEdit, onRemove }: {
  ctx: Ctx; member: PartyMember; onSync: (on: boolean) => void; onEdit: () => void; onRemove: () => void;
}) {
  const t = useT();
  const entry = ctx.chars.characters[member.code];
  const plan = useMemberPlan(member);
  const star = entry ? planStar(plan, entry) : plan.star ?? 0;
  return (
    <VStack {...TILE} spacing={1} p={1} position="relative" borderColor="whiteAlpha.200">
      <Box as="button" position="absolute" top={0.5} left={1} lineHeight={1}
        aria-pressed={!!member.sync} title={member.sync ? t('partySyncOn') : t('partySyncOff')}
        color={member.sync ? 'yellow.300' : 'whiteAlpha.400'} _hover={{ color: 'yellow.200' }}
        onClick={() => onSync(!member.sync)}>
        <LinkIcon boxSize={2.5} />
      </Box>
      <RemoveButton onClick={onRemove} />
      <Box as="button" onClick={onEdit} title={t('partyInvestment')}>
        <VStack spacing={0.5}>
          <Portrait ctx={ctx} entry={entry} />
          <Text fontSize="xs" noOfLines={1} maxW="6rem">{characterName(entry ?? null, ctx.lang) || member.code}</Text>
          <Text fontSize="0.65rem" color="gray.400" fontFamily="mono">
            Lv{plan.level} · {star}★
          </Text>
          {entry && <GearInfusion ctx={ctx} entry={entry} plan={plan} />}
        </VStack>
      </Box>
    </VStack>
  );
}

function FriendTile({ ctx, code, onPick, onRemove }: {
  ctx: Ctx; code: string | null; onPick: () => void; onRemove: () => void;
}) {
  const t = useT();
  const entry = code ? ctx.chars.characters[code] : undefined;
  return (
    <VStack {...TILE} spacing={1} p={1} position="relative" borderColor="teal.400"
      borderStyle={code ? 'solid' : 'dashed'}>
      <RemoveButton onClick={onRemove} />
      <Box as="button" onClick={onPick} title={t('partyFriendHint')} h="100%" w="100%">
        <VStack spacing={0.5} justify="center" h="100%">
          {code ? <Portrait ctx={ctx} entry={entry} /> : <Box boxSize={16} />}
          {code && (
            <Text fontSize="xs" noOfLines={1} maxW="5rem">{characterName(entry ?? null, ctx.lang) || code}</Text>
          )}
          <Text fontSize="0.65rem" color="teal.300" fontWeight="bold">{t('partyFriend')}</Text>
        </VStack>
      </Box>
    </VStack>
  );
}

function UnitPicker({ ctx, taken, onPick, onClear, onClose }: {
  ctx: Ctx; taken: Set<string>; onPick: (code: string) => void; onClear?: () => void; onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [attribute, setAttribute] = useState<number | null>(null);
  const spoilerUnit = useSpoilerUnit();
  const roster = useMemo(() => Object.values(ctx.chars.characters)
    .filter((e) => isPlayable(e) && !e.unreleased && !spoilerUnit(e.code))
    .sort((a, b) => characterName(a, ctx.lang).localeCompare(characterName(b, ctx.lang))), [ctx, spoilerUnit]);
  const q = query.trim().toLowerCase();
  const shown = roster.filter((e) => (attribute == null || e.attributeType === attribute)
    && (!q || [e.name, e.nameEn, characterName(e, ctx.lang), e.code]
      .some((s) => s?.toLowerCase().includes(q))));
  const attributes = Object.entries(ctx.chars.types.attribute)
    .filter(([id]) => roster.some((e) => String(e.attributeType) === id));
  return (
    <Modal isOpen onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="gray.800" mx={3}>
        <ModalHeader fontSize="md">{t('partyPickUnit')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <HStack spacing={2}>
              <Input size="sm" autoFocus value={query} placeholder={t('search')}
                onChange={(e) => setQuery(e.target.value)} />
              {onClear && (
                <Button size="sm" variant="outline" colorScheme="teal" flexShrink={0} onClick={onClear}>
                  {t('partyFriendAny')}
                </Button>
              )}
            </HStack>
            <Wrap spacing={1}>
              {attributes.map(([id, type]) => (
                <WrapItem key={id}>
                  <FilterChip active={attribute === Number(id)}
                    onClick={() => setAttribute(attribute === Number(id) ? null : Number(id))}>
                    <HStack spacing={1}>
                      <GameIcon manifest={ctx.icons} group="ui" name={type.icon} size={4} tint={type.color}
                        reserve={false} />
                      <Text as="span">{typeLabel(type, ctx.lang)}</Text>
                    </HStack>
                  </FilterChip>
                </WrapItem>
              ))}
            </Wrap>
            <SimpleGrid columns={{ base: 4, sm: 6, md: 8 }} spacing={2}>
              {shown.map((e) => {
                const used = taken.has(e.code);
                return (
                  <VStack key={e.code} as="button" spacing={0.5} p={1} borderRadius="md"
                    opacity={used ? 0.3 : 1} cursor={used ? 'not-allowed' : 'pointer'}
                    _hover={used ? undefined : { bg: 'whiteAlpha.100' }}
                    onClick={() => !used && onPick(e.code)}>
                    <GameIcon manifest={ctx.icons} group="char" names={charIcon(e)} size={12} borderRadius="md" />
                    <Text fontSize="0.65rem" noOfLines={1} maxW="100%">{characterName(e, ctx.lang)}</Text>
                  </VStack>
                );
              })}
            </SimpleGrid>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function InvestmentDialog({ ctx, member, onSave, onClose }: {
  ctx: Ctx; member: PartyMember; onSave: (plan: UnitPlan) => void; onClose: () => void;
}) {
  const t = useT();
  const entry = ctx.chars.characters[member.code];
  const [plan, setPlan] = useState<UnitPlan>(member.plan);
  const draft: PlanDraft = {
    pair: { current: plan, target: plan },
    setPlan: (_c, _s, patch) => setPlan((p) => ({ ...p, ...patch })),
    setSkill: (_c, _s, id, level) => setPlan((p) => ({ ...p, skills: { ...p.skills, [id]: level } })),
    setGear: (_c, _s, slot, gear) => setPlan((p) => ({ ...p, gear: { ...p.gear, [slot]: gear } })),
  };
  return (
    <Modal isOpen onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="gray.800" mx={3}>
        <ModalHeader fontSize="md">
          <HStack spacing={2}>
            <GameIcon manifest={ctx.icons} group="char" names={charIcon(entry)} size={8} borderRadius="md" />
            <Text as={NextLink} href={`/character?code=${member.code}`} _hover={{ color: 'yellow.300' }}>
              {characterName(entry ?? null, ctx.lang) || member.code}
            </Text>
            <Text fontSize="sm" color="gray.400" fontWeight="normal">
              {member.sync ? t('partySyncOn') : t('partyInvestment')}
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {entry && (member.sync
            ? <PlanGrid entry={entry} data={ctx.chars} growth={ctx.growth} icons={ctx.icons} sides={['current']} />
            : <PlanGrid entry={entry} data={ctx.chars} growth={ctx.growth} icons={ctx.icons}
                sides={['current']} draft={draft} />)}
        </ModalBody>
        <ModalFooter gap={2}>
          {member.sync ? (
            <Button size="sm" colorScheme="yellow" onClick={onClose}>{t('close')}</Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={onClose}>{t('planCancel')}</Button>
              <Button size="sm" colorScheme="yellow" onClick={() => onSave(plan)}>{t('planSave')}</Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

