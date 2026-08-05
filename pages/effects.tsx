// Finds a unit by what its skills do, rather than by what the roster says it is.
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Center, Flex, HStack, Input, Spinner, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { GameIcon, StarRating } from '@/components/gameIcon';
import { FilterChip, FilterRow } from '@/components/filters';
import {
  BUFF_CATEGORY, OP_SCHEME, SIDE_LABEL, SKILL_CATEGORY_LABEL, STAT_LABEL,
  TARGET_LABEL, TRIGGER_LABEL, castSummary, colorRuns, gateSummary, hitSummary,
  isPlayable, labelOf, rosterNote, scaleSummary, skinsByCharacter, statAmount,
  typeIcons, typeOf, typeTint, typeLabel,
} from '@/lib/characters';
import {
  EFFECT_SECTIONS, EXTRA_GROUPS, GROUP_LABEL, buildKits, effectSection,
  facetOptions, matchedGroups, matchingSkills, opLabel, selectionCount,
  type CharacterKit, type EffectContext, type EffectSelection, type FacetOption,
  type KitSkill, type MatchedGroup,
} from '@/lib/effects';
import { characterIcon } from '@/lib/icons';
import { useFilters } from '@/lib/filterStore';
import {
  loadCharacters, loadIcons, loadSkinList,
  type CharacterData, type IconManifest, type SkillOp, type SkinListEntry,
} from '@/lib/data';

export default function EffectsPage() {
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [skins, setSkins] = useState<SkinListEntry[]>([]);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const { query, npcs, unreleased, picked } = useFilters((s) => s.effects);
  const set = useFilters((s) => s.setEffects);
  const toggle = useFilters((s) => s.toggleEffect);
  const clear = useFilters((s) => s.clearEffects);

  useEffect(() => {
    loadCharacters().then(setChars).catch((e) => setError(String(e)));
    loadSkinList().then((l) => setSkins(l.skins)).catch(() => setSkins([]));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const byCharacter = useMemo(() => skinsByCharacter(skins), [skins]);
  const kits = useMemo(() => (chars ? buildKits(chars) : []), [chars]);

  // The roster scope decides which chips exist at all, so the counts are
  // computed against it rather than against the whole index.
  const scoped = useMemo(() => kits.filter((kit) => {
    const c = kit.entry;
    if (c.unreleased) return unreleased;
    return npcs || isPlayable(c);
  }), [kits, npcs, unreleased]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.flatMap((kit) => {
      const matched = matchingSkills(kit, picked);
      if (!matched.length) return [];
      if (!q) return [{ kit, skills: matched }];
      const c = kit.entry;
      const named = c.name.toLowerCase().includes(q)
        || c.code.toLowerCase().includes(q)
        || (c.nameEn ?? '').toLowerCase().includes(q);
      if (named) return [{ kit, skills: matched }];
      const bySkill = matched.filter((s) => (s.skill.name ?? '').toLowerCase().includes(q));
      return bySkill.length ? [{ kit, skills: bySkill }] : [];
    });
  }, [scoped, picked, query]);

  if (error) return <Text color="red.400">{error}</Text>;
  if (!chars) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">loading…</Text></VStack>
      </Center>
    );
  }

  const effects = facetOptions(scoped, picked, 'effect');
  const grants = facetOptions(scoped, picked, 'grant');

  return (
    <VStack align="stretch" spacing={4}>
      <VStack align="stretch" spacing={2}>
        {EFFECT_SECTIONS.map((section) => {
          const options = effects.filter((o) => effectSection(o.value) === section);
          if (!options.length) return null;
          return (
            <FilterRow key={section} label={section}>
              {options.map((option) => (
                <Chip key={option.value} option={option}
                  active={(picked.effect ?? []).includes(option.value)}
                  onClick={() => toggle('effect', option.value)} />
              ))}
            </FilterRow>
          );
        })}
        {grants.length > 0 && (
          <FilterRow label={GROUP_LABEL.grant}>
            {grants.map((option) => (
              <Chip key={option.value} option={option}
                active={(picked.grant ?? []).includes(option.value)}
                onClick={() => toggle('grant', option.value)} />
            ))}
          </FilterRow>
        )}

        {more && EXTRA_GROUPS.map((group) => {
          const options = facetOptions(scoped, picked, group);
          if (!options.length) return null;
          return (
            <FilterRow key={group} label={GROUP_LABEL[group]}>
              {options.map((option) => (
                <Chip key={option.value} option={option}
                  active={(picked[group] ?? []).includes(option.value)}
                  onClick={() => toggle(group, option.value)} />
              ))}
            </FilterRow>
          );
        })}

        <Wrap spacing={2} align="center" pt={1}>
          <WrapItem>
            <Input size="sm" maxW="220px" placeholder="search…"
              value={query} onChange={(e) => set({ query: e.target.value })}
              bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
          </WrapItem>
          <WrapItem>
            <FilterChip active={more} onClick={() => setMore(!more)}>
              <Text>More filters</Text>
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
          {selectionCount(picked) > 0 && (
            <WrapItem>
              <FilterChip active={false} onClick={clear}><Text>Clear</Text></FilterChip>
            </WrapItem>
          )}
          <WrapItem>
            <Text fontSize="xs" color="gray.500">
              {results.length} of {scoped.length}
            </Text>
          </WrapItem>
        </Wrap>
      </VStack>

      <VStack align="stretch" spacing={2}>
        {results.map(({ kit, skills }) => (
          <ResultRow key={kit.entry.code} kit={kit} skills={skills} data={chars}
            icons={icons} skins={byCharacter.get(kit.entry.code) ?? []}
            selection={picked} />
        ))}
      </VStack>
      {results.length === 0 && <Text fontSize="sm" color="gray.500">no match</Text>}
    </VStack>
  );
}

function Chip({ option, active, onClick }: {
  option: FacetOption; active: boolean; onClick: () => void;
}) {
  return (
    <Box opacity={option.count === 0 && !active ? 0.4 : 1}>
      <FilterChip active={active} onClick={onClick}>
        <Text>{option.label}</Text>
        <Text color="gray.500">{option.count}</Text>
      </FilterChip>
    </Box>
  );
}

function ResultRow({ kit, skills, data, icons, skins, selection }: {
  kit: CharacterKit; skills: KitSkill[]; data: CharacterData;
  icons: IconManifest | null; skins: SkinListEntry[];
  selection: EffectSelection;
}) {
  const entry = kit.entry;
  const element = typeOf(entry, data.types, 'attribute');
  const role = typeOf(entry, data.types, 'role');
  const roster = rosterNote(entry);
  const art = characterIcon(icons, entry, skins);

  return (
    <Flex borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="md"
      bg="whiteAlpha.50" overflow="hidden" direction={{ base: 'column', sm: 'row' }}>
      <Flex as={NextLink} href={{ pathname: '/character', query: { code: entry.code } }}
        direction={{ base: 'row', sm: 'column' }} align="center" gap={2} p={2}
        minW={{ sm: '132px' }} bg="blackAlpha.300"
        _hover={{ bg: 'blackAlpha.500' }}>
        <Box boxSize={{ base: 12, sm: '84px' }} flexShrink={0}>
          {art && <Box as="img" src={art} alt="" w="100%" h="100%" objectFit="contain" />}
        </Box>
        <VStack align={{ base: 'start', sm: 'center' }} spacing={0.5} minW={0}>
          <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
            {entry.name || entry.code}
          </Text>
          <HStack spacing={1}>
            <GameIcon manifest={icons} group="ui" names={typeIcons(element)} size={4}
              tint={typeTint(element)} title={typeLabel(element)} reserve={false} />
            <GameIcon manifest={icons} group="ui" names={typeIcons(role)} size={4}
              title={typeLabel(role)} reserve={false} />
            {roster
              ? <Badge colorScheme={roster.scheme} fontSize="0.55rem">{roster.label}</Badge>
              : <StarRating manifest={icons} star={entry.defaultStar ?? 0} size={3} />}
          </HStack>
        </VStack>
      </Flex>

      <VStack align="stretch" spacing={1.5} p={2} minW={0}
        flex={{ base: '0 0 auto', sm: '1' }}>
        {skills.map((s) => (
          <SkillResult key={s.id} kitSkill={s} ctx={kit.ctx} data={data} icons={icons}
            selection={selection}
            // an enemy's slots all share one placeholder name
            showSlot={skills.filter((o) => o.skill.name === s.skill.name).length > 1} />
        ))}
      </VStack>
    </Flex>
  );
}

function SkillResult({ kitSkill, ctx, data, icons, selection, showSlot }: {
  kitSkill: KitSkill; ctx: EffectContext; data: CharacterData;
  icons: IconManifest | null; selection: EffectSelection; showSlot?: boolean;
}) {
  const { skill } = kitSkill;
  const groups = matchedGroups(skill, selection, ctx);
  const grants = (skill.behaviour?.stats ?? []).filter((s) => s.stat);
  return (
    <Box borderTopWidth="1px" borderColor="whiteAlpha.100" pt={1.5}
      _first={{ borderTopWidth: 0, pt: 0 }}>
      <Wrap spacing={2} align="center">
        <WrapItem>
          <GameIcon manifest={icons} group="skill" name={skill.icon} size={5}
            borderRadius="sm" />
        </WrapItem>
        <WrapItem>
          <Text fontSize="sm" fontWeight="bold">{skill.name}</Text>
        </WrapItem>
        {showSlot && (
          <WrapItem>
            <Text fontFamily="mono" fontSize="0.6rem" color="gray.600">
              slot {skill.skillType}
            </Text>
          </WrapItem>
        )}
        <WrapItem>
          <Badge fontSize="0.55rem">{SKILL_CATEGORY_LABEL[skill.categorize]}</Badge>
        </WrapItem>
        {skill.openStar > 1 && (
          <WrapItem>
            <Badge fontSize="0.55rem" colorScheme="yellow">{skill.openStar}★</Badge>
          </WrapItem>
        )}
      </Wrap>

      {groups.map((group, i) => (
        <Box key={i} mt={1}>
          <Text fontSize="0.65rem" color="gray.500">{groupSummary(group)}</Text>
          <Wrap spacing={2} mt={0.5}>
            {group.ops.map((op, j) => (
              <WrapItem key={j}>
                <OpChip op={op} ctx={ctx} data={data} icons={icons} />
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      ))}

      {grants.length > 0 && (
        <Wrap spacing={2} mt={1}>
          {grants.map((grant, i) => (
            <WrapItem key={i}>
              <Badge fontSize="0.55rem" colorScheme="green">
                {labelOf(STAT_LABEL, grant.stat)} {statAmount(grant)}
              </Badge>
            </WrapItem>
          ))}
        </Wrap>
      )}
    </Box>
  );
}

// Where the operations under it land: the hitbox and what it centres on, or
// the battle event that fires the passive.
function groupSummary(group: MatchedGroup): string {
  const { hit, trigger } = group;
  if (hit) {
    const cast = hit.cast ? castSummary(hit.cast) : '';
    return [hitSummary(hit), cast && `on ${cast}`].filter(Boolean).join(' · ');
  }
  if (!trigger) return '';
  return [
    labelOf(TRIGGER_LABEL, trigger.on),
    trigger.check ? labelOf(TARGET_LABEL, trigger.check) : '',
    trigger.cooldown > 0 ? `${trigger.cooldown}s cd` : '',
    trigger.limit > 0 ? `×${trigger.limit} per battle` : '',
  ].filter(Boolean).join(' · ');
}

// Structure only — which operation lands on whom and off which stat. The
// arithmetic that turns a coefficient into a battle number is not decoded.
function OpChip({ op, ctx, data, icons }: {
  op: SkillOp; ctx: EffectContext; data: CharacterData; icons: IconManifest | null;
}) {
  const scheme = (op.op && OP_SCHEME[op.op])
    ?? BUFF_CATEGORY[op.categorize ?? 0]?.scheme
    ?? 'gray';
  const scale = scaleSummary(op);
  const where = [
    op.team ? labelOf(TARGET_LABEL, op.team) : '',
    op.pick === 'ALL' ? 'all in range' : (op.count ? `${op.count}` : ''),
    op.applyTo && op.applyTo !== 'HOLDER' ? `on the ${SIDE_LABEL[op.applyTo]}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <HStack spacing={1.5} align="center">
      {op.icon && <GameIcon manifest={icons} group="buff" name={op.icon} size={4} />}
      <Badge fontSize="0.55rem" colorScheme={scheme}>{opLabel(op, ctx)}</Badge>
      {op.name && <GameText text={op.name} bold />}
      {scale && <Text fontSize="0.65rem" color="gray.400">{scale}</Text>}
      {op.gate && (
        <Text fontSize="0.65rem" color="cyan.300">
          <GameText text={gateSummary(op.gate, data)} />
        </Text>
      )}
      {where && <Text fontSize="0.65rem" color="gray.600">{where}</Text>}
    </HStack>
  );
}

// Skill text carries the game's own colour markup.
function GameText({ text, bold }: { text: string; bold?: boolean }) {
  return (
    <Text as="span" fontSize="xs" fontWeight={bold ? 'bold' : undefined}>
      {colorRuns(text).map((run, i) => (
        <Text as="span" key={i} color={run.color}>{run.text}</Text>
      ))}
    </Text>
  );
}
