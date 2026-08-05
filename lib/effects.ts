import {
  CATEGORY_LABEL, OP_LABEL, SHAPE_LABEL, SKILL_CATEGORY_LABEL, SORT_LABEL,
  STAT_LABEL, TARGET_LABEL, TRIGGER_LABEL, labelOf, prettyConst,
} from '@/lib/characters';
import type {
  CharacterData, CharacterEntry, SkillEntry, SkillHit, SkillOp, SkillTrigger,
} from '@/lib/data';

export type EffectGroup =
  'effect' | 'grant' | 'lands' | 'slot' | 'area' | 'pick' | 'shape' | 'scale' | 'trigger';

export const GROUP_LABEL: Record<EffectGroup, string> = {
  effect: 'Effect',
  grant: 'Passive grant',
  lands: 'Affects',
  slot: 'Skill type',
  area: 'Cast area',
  pick: 'Cast picks',
  shape: 'Hitbox',
  scale: 'Scales off',
  trigger: 'Passive trigger',
};

/** The groups behind the effect rows, in the order they are drawn. */
export const EXTRA_GROUPS: EffectGroup[] =
  ['lands', 'slot', 'area', 'pick', 'shape', 'scale', 'trigger'];

export type EffectSelection = Partial<Record<EffectGroup, string[]>>;

export type SkillFacets = Record<EffectGroup, Set<string>>;

export type KitSkill = { id: number; skill: SkillEntry; facets: SkillFacets };

/**
 * What a clear or immunity needs to know about the rest of the roster, since a
 * state is only meaningful as the thing some *other* character applies.
 */
export type EffectIndex = {
  /** Plain state name -> the characters whose kit applies it. */
  appliedBy: Map<string, Set<string>>;
  /** Plain state name -> the effect type that best names it, for a label the
   *  game itself has no English for. */
  stateOp: Map<string, string>;
};

export type EffectContext = { code: string; index: EffectIndex };

export type CharacterKit = {
  entry: CharacterEntry; skills: KitSkill[]; ctx: EffectContext;
};

// The game shows the player nothing for the markers a skill sets and then
// clears, so they are not effects anyone can search for.
const INTERNAL_OPS = new Set(['MARKER', 'EMPTY_EFFECT']);

// A clear or an immunity reads as the thing it addresses rather than as the
// bare operation: "Remove 보호막", not "Remove a named state".
const DETAIL_VERB: Record<string, string> = {
  CLEAR_DURATION_DEFINE_ID: 'Remove',
  CLEAR_DURATION_CATEGORIZE_TYPE: 'Cleanse',
  IMMUNE_DURATION_DEFINE_ID: 'Immune to',
  IMMUNE_DURATION_CATEGORIZE_TYPE: 'Immune to',
  IMMUNE_ONETIME_DEFINE_ID: 'Immune to',
  IMMUNE_ONETIME_CATEGORIZE_TYPE: 'Immune to',
};

const SECTION_PREFIX: [string, string][] = [
  ['BUFF_', 'Buff'],
  ['DAMAGE_REDUCE', 'Buff'],
  ['DEBUFF_', 'Debuff'],
  ['CC_', 'Control'],
  ['IMMUNE_', 'Immunity'],
  ['EXCLUDE_', 'Immunity'],
  ['CLEAR_', 'Cleanse'],
  ['OVERTIME_', 'Over time'],
];

export const EFFECT_SECTIONS =
  ['Instant', 'Over time', 'Buff', 'Debuff', 'Control', 'Cleanse', 'Immunity'];

export function effectSection(value: string): string {
  const op = value.split('|')[0];
  return SECTION_PREFIX.find(([prefix]) => op.startsWith(prefix))?.[1] ?? 'Instant';
}

// A state name carries the game's own colour markup; a chip is plain text.
function plain(name: string): string {
  return name.replace(/<[^>]+>/g, '').trim();
}

function lower(text: string): string {
  return text ? text[0].toLowerCase() + text.slice(1) : '';
}

/**
 * One key per thing a clear or immunity addresses, so stripping a shield and
 * clearing a private marker are not the same search. Every other operation is
 * its own key. The key carries the label, since a state has no English name of
 * its own and is named by the effect type behind it.
 *
 * **Two kinds of clear yield no key at all**: one naming an unnamed state (the
 * markers a skill sets and clears, which the game never shows the player), and
 * one naming a state **no other character applies** — a skill ending its own
 * mechanic, not a dispel.
 */
function effectKeys(op: SkillOp, ctx: EffectContext): string[] {
  if (!op.op || INTERNAL_OPS.has(op.op)) return [];
  const detail = op.detail;
  if (!detail) return [op.op];
  if (detail.kind.endsWith('Category')) {
    return detail.values.map((v) => `${op.op}|${labelOf(CATEGORY_LABEL, v.name ?? v.id)}`);
  }
  return detail.values.flatMap((v) => {
    if (!v.name) return [];
    const state = plain(v.name);
    const holders = ctx.index.appliedBy.get(state);
    const foreign = !!holders && [...holders].some((code) => code !== ctx.code);
    const named = ctx.index.stateOp.get(state);
    return foreign && named ? [`${op.op}|${lower(labelOf(OP_LABEL, named))}`] : [];
  });
}

export function effectLabel(value: string): string {
  const [op, addressed] = value.split('|');
  if (!addressed) return labelOf(OP_LABEL, op);
  const verb = DETAIL_VERB[op];
  return verb ? `${verb} ${addressed}` : `${labelOf(OP_LABEL, op)} — ${addressed}`;
}

/** As its chip reads, so a result names the thing that was searched for. */
export function opLabel(op: SkillOp, ctx: EffectContext): string {
  const keys = effectKeys(op, ctx);
  return keys.length ? keys.map(effectLabel).join(', ') : labelOf(OP_LABEL, op.op);
}

function sentence(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

export function facetLabel(group: EffectGroup, value: string): string {
  switch (group) {
    case 'effect': return effectLabel(value);
    case 'grant': return labelOf(STAT_LABEL, value);
    case 'lands': return sentence(labelOf(TARGET_LABEL, value));
    case 'slot': return SKILL_CATEGORY_LABEL[Number(value)] ?? value;
    case 'area': return sentence(labelOf(SHAPE_LABEL, value));
    case 'pick': return sentence(labelOf(SORT_LABEL, value));
    case 'shape': return sentence(labelOf(SHAPE_LABEL, value));
    case 'scale': return sentence(labelOf(STAT_LABEL, value));
    case 'trigger': return labelOf(TRIGGER_LABEL, value);
    default: return prettyConst(value);
  }
}

function emptyFacets(): SkillFacets {
  return {
    effect: new Set(), grant: new Set(), lands: new Set(), slot: new Set(),
    area: new Set(), pick: new Set(), shape: new Set(), scale: new Set(),
    trigger: new Set(),
  };
}

function addOp(facets: SkillFacets, op: SkillOp, ctx: EffectContext): void {
  for (const key of effectKeys(op, ctx)) facets.effect.add(key);
  if (op.team) facets.lands.add(op.team);
  if (op.scale) facets.scale.add(op.scale);
}

export function skillFacets(skill: SkillEntry, ctx: EffectContext): SkillFacets {
  const facets = emptyFacets();
  facets.slot.add(String(skill.categorize));
  const behaviour = skill.behaviour;
  for (const hit of behaviour?.hits ?? []) {
    if (hit.shape) facets.shape.add(hit.shape);
    if (hit.cast?.range) facets.area.add(hit.cast.range);
    if (hit.cast?.sort) facets.pick.add(hit.cast.sort);
    for (const op of hit.ops) addOp(facets, op, ctx);
  }
  for (const stat of behaviour?.stats ?? []) {
    if (stat.stat) facets.grant.add(stat.stat);
  }
  for (const trigger of behaviour?.triggers ?? []) {
    if (trigger.on) facets.trigger.add(trigger.on);
    for (const op of trigger.ops) addOp(facets, op, ctx);
  }
  return facets;
}

function allOps(skill: SkillEntry): SkillOp[] {
  return [
    ...(skill.behaviour?.hits ?? []).flatMap((hit) => hit.ops),
    ...(skill.behaviour?.triggers ?? []).flatMap((trigger) => trigger.ops),
  ];
}

/**
 * Every skill the character can ever hold: a grade below its own rarity is
 * unreachable, and the passive tiers only appear at 3★/4★/5★, so no single
 * grade carries the whole kit.
 */
function kitSkills(
  entry: CharacterEntry, data: CharacterData,
): { id: number; skill: SkillEntry }[] {
  const set = data.skillSets[String(entry.skillSetGroup ?? '')];
  if (!set) return [];
  const floor = entry.defaultStar ?? 1;
  const ids: number[] = [];
  for (const [grade, list] of Object.entries(set)) {
    if (Number(grade) < floor) continue;
    for (const id of list) if (!ids.includes(id)) ids.push(id);
  }
  return ids.flatMap((id) => {
    const skill = data.skills[String(id)];
    return skill ? [{ id, skill }] : [];
  });
}

/**
 * A state is named by the effect type that applies it, taking the commonest
 * where several do — the state's own name is Korean and the game carries no
 * English for it. A state only ever applied by `MARKER` has nothing to name it
 * and stays unsearchable.
 */
function buildIndex(
  rosters: { entry: CharacterEntry; skills: { skill: SkillEntry }[] }[],
): EffectIndex {
  const appliedBy = new Map<string, Set<string>>();
  const counts = new Map<string, Map<string, number>>();
  for (const { entry, skills } of rosters) {
    for (const { skill } of skills) {
      for (const op of allOps(skill)) {
        if (op.kind !== 'duration' || !op.name) continue;
        const state = plain(op.name);
        const holders = appliedBy.get(state) ?? new Set<string>();
        holders.add(entry.code);
        appliedBy.set(state, holders);
        if (!op.op || INTERNAL_OPS.has(op.op)) continue;
        const byOp = counts.get(state) ?? new Map<string, number>();
        byOp.set(op.op, (byOp.get(op.op) ?? 0) + 1);
        counts.set(state, byOp);
      }
    }
  }
  const stateOp = new Map<string, string>();
  for (const [state, byOp] of counts) {
    const best = [...byOp.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) stateOp.set(state, best[0]);
  }
  return { appliedBy, stateOp };
}

export function buildKits(data: CharacterData): CharacterKit[] {
  const rosters = Object.values(data.characters)
    .map((entry) => ({ entry, skills: kitSkills(entry, data) }))
    .filter((kit) => kit.skills.length > 0);
  const index = buildIndex(rosters);
  return rosters
    .map(({ entry, skills }) => {
      const ctx: EffectContext = { code: entry.code, index };
      return {
        entry,
        ctx,
        skills: skills.map((s) => ({ ...s, facets: skillFacets(s.skill, ctx) })),
      };
    })
    .sort((a, b) => a.entry.code.localeCompare(b.entry.code));
}

export function selectionCount(selection: EffectSelection): number {
  return Object.values(selection).reduce((n, values) => n + (values?.length ?? 0), 0);
}

/** Every group with a selection has to be satisfied by the same skill. */
export function skillMatches(facets: SkillFacets, selection: EffectSelection): boolean {
  for (const [group, values] of Object.entries(selection)) {
    if (!values?.length) continue;
    const own = facets[group as EffectGroup];
    if (!values.some((v) => own.has(v))) return false;
  }
  return true;
}

export function matchingSkills(kit: CharacterKit, selection: EffectSelection): KitSkill[] {
  return kit.skills.filter((s) => skillMatches(s.facets, selection));
}

export type FacetOption = { value: string; label: string; count: number };

/**
 * How many characters each value would leave, with every other group's
 * selection still applied — so a chip that reads 0 is one that cannot be
 * combined with what is already picked.
 */
export function facetOptions(
  kits: CharacterKit[], selection: EffectSelection, group: EffectGroup,
): FacetOption[] {
  const others: EffectSelection = { ...selection, [group]: [] };
  const counts = new Map<string, number>();
  for (const kit of kits) {
    const seen = new Set<string>();
    for (const { facets } of kit.skills) {
      if (!skillMatches(facets, others)) continue;
      for (const value of facets[group]) seen.add(value);
    }
    for (const value of seen) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  for (const value of selection[group] ?? []) {
    if (!counts.has(value)) counts.set(value, 0);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, label: facetLabel(group, value) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Operations that answer the filter, kept under the hitbox or the trigger
 *  they belong to — that is where their targeting is authored. */
export type MatchedGroup = {
  hit: SkillHit | null;
  trigger: SkillTrigger | null;
  ops: SkillOp[];
};

function opSignature(op: SkillOp): string {
  return [op.op, op.name, op.scale, op.scaleOf, op.team, op.pick, op.applyTo,
    op.gate?.condition, ...(op.gate?.values ?? []).map((v) => v.id),
    ...(op.detail?.values ?? []).map((v) => v.id)].join('~');
}

function groupSignature(group: MatchedGroup): string {
  const { hit, trigger } = group;
  const head = hit
    ? [hit.shape, hit.range, hit.ticks, hit.cycle, hit.count, hit.cast?.team,
      hit.cast?.range, hit.cast?.pick, hit.cast?.sort, hit.cast?.count]
    : [trigger?.on, trigger?.check, trigger?.cooldown, trigger?.limit];
  return [...head, ...group.ops.map(opSignature)].join('~');
}

/**
 * With no effect picked every operation the page can name is shown. A skill
 * that authors the same hitbox once per hit reads as one group rather than as
 * a dozen identical ones.
 */
export function matchedGroups(
  skill: SkillEntry, selection: EffectSelection, ctx: EffectContext,
): MatchedGroup[] {
  const wanted = selection.effect ?? [];
  const keep = (op: SkillOp) => (wanted.length
    ? effectKeys(op, ctx).some((key) => wanted.includes(key))
    : effectKeys(op, ctx).length > 0);

  const groups: MatchedGroup[] = [
    ...(skill.behaviour?.hits ?? [])
      .map((hit) => ({ hit, trigger: null, ops: hit.ops.filter(keep) })),
    ...(skill.behaviour?.triggers ?? [])
      .map((trigger) => ({ hit: null, trigger, ops: trigger.ops.filter(keep) })),
  ];

  const seen = new Set<string>();
  return groups.filter((group) => {
    if (!group.ops.length) return false;
    const key = groupSignature(group);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
