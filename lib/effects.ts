import {
  CATEGORY_LABEL, OP_LABEL, SHAPE_LABEL, SKILL_CATEGORY_LABEL, SORT_LABEL,
  STAT_LABEL, TARGET_LABEL, TRIGGER_LABEL, labelOf, prettyConst,
} from '@/lib/characters';
import { pick, type Lang, type Localized } from '@/lib/i18n';
import type {
  CharacterData, CharacterEntry, SkillEntry, SkillHit, SkillOp, SkillTrigger,
} from '@/lib/data';

export type EffectGroup =
  'effect' | 'grant' | 'lands' | 'slot' | 'area' | 'pick' | 'shape' | 'scale' | 'trigger';

export const GROUP_LABEL: Record<EffectGroup, Localized> = {
  effect: { en: 'Effect', ko: '효과' },
  grant: { en: 'Passive grant', ko: '패시브 능력치' },
  lands: { en: 'Affects', ko: '적용 대상' },
  slot: { en: 'Skill type', ko: '스킬 종류' },
  area: { en: 'Cast area', ko: '시전 범위' },
  pick: { en: 'Cast picks', ko: '대상 선정' },
  shape: { en: 'Hitbox', ko: '판정 범위' },
  scale: { en: 'Scales off', ko: '계수 스탯' },
  trigger: { en: 'Passive trigger', ko: '패시브 발동' },
};

/** The groups behind the effect rows, in the order they are drawn. */
export const EXTRA_GROUPS: EffectGroup[] =
  ['lands', 'slot', 'area', 'pick', 'shape', 'scale', 'trigger'];

export type EffectSelection = Partial<Record<EffectGroup, string[]>>;

export type SkillFacets = Record<EffectGroup, Set<string>>;

export type KitSkill = { id: number; skill: SkillEntry; facets: SkillFacets };

// A state is only meaningful as the thing some other character applies.
export type EffectIndex = {
  /** Plain state name -> the characters whose kit applies it. */
  appliedBy: Map<string, Set<string>>;
    /** Plain state name -> the effect type that best names it. */
  stateOp: Map<string, string>;
};

export type EffectContext = { code: string; index: EffectIndex };

export type CharacterKit = {
  entry: CharacterEntry; skills: KitSkill[]; ctx: EffectContext;
};

// The game shows the player nothing for the markers a skill sets and then clears.
const INTERNAL_OPS = new Set(['MARKER', 'EMPTY_EFFECT']);

// A clear reads as what it addresses ("Remove 보호막"); the Korean puts the verb last, which `effectLabel` composes.
const DETAIL_VERB: Record<string, Localized> = {
  CLEAR_DURATION_DEFINE_ID: { en: 'Remove', ko: '해제' },
  CLEAR_DURATION_CATEGORIZE_TYPE: { en: 'Cleanse', ko: '정화' },
  IMMUNE_DURATION_DEFINE_ID: { en: 'Immune to', ko: '면역' },
  IMMUNE_DURATION_CATEGORIZE_TYPE: { en: 'Immune to', ko: '면역' },
  IMMUNE_ONETIME_DEFINE_ID: { en: 'Immune to', ko: '면역' },
  IMMUNE_ONETIME_CATEGORIZE_TYPE: { en: 'Immune to', ko: '면역' },
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

export const SECTION_LABEL: Record<string, Localized> = {
  Instant: { en: 'Instant', ko: '즉시' },
  'Over time': { en: 'Over time', ko: '지속' },
  Buff: { en: 'Buff', ko: '버프' },
  Debuff: { en: 'Debuff', ko: '디버프' },
  Control: { en: 'Control', ko: '군중 제어' },
  Cleanse: { en: 'Cleanse', ko: '해제' },
  Immunity: { en: 'Immunity', ko: '면역' },
};

export function effectSection(value: string): string {
  const op = value.split('|')[0];
  return SECTION_PREFIX.find(([prefix]) => op.startsWith(prefix))?.[1] ?? 'Instant';
}

// A state name carries the game's own colour markup; a chip is plain text.
function plain(name: string): string {
  return name.replace(/<[^>]+>/g, '').trim();
}

function lower(text: string, lang: Lang): string {
  if (lang === 'ko' || !text) return text;
  return text[0].toLowerCase() + text.slice(1);
}

// One key per thing a clear or immunity addresses, holding the constant so a selection survives a language change; a clear naming an unnamed state, or one no other character applies, yields none.
function effectKeys(op: SkillOp, ctx: EffectContext): string[] {
  if (!op.op || INTERNAL_OPS.has(op.op)) return [];
  const detail = op.detail;
  if (!detail) return [op.op];
  if (detail.kind.endsWith('Category')) {
    return detail.values.map((v) => `${op.op}|${v.name ?? v.id}`);
  }
  return detail.values.flatMap((v) => {
    if (!v.name) return [];
    const state = plain(v.name);
    const holders = ctx.index.appliedBy.get(state);
    const foreign = !!holders && [...holders].some((code) => code !== ctx.code);
    const named = ctx.index.stateOp.get(state);
    return foreign && named ? [`${op.op}|${named}`] : [];
  });
}

export function effectLabel(value: string, lang: Lang = 'en'): string {
  const [op, addressed] = value.split('|');
  if (!addressed) return labelOf(OP_LABEL, op, lang);
  // A category constant for the `*_CATEGORIZE_TYPE` ops, the effect type behind the state for the rest.
  const what = op.includes('CATEGORIZE_TYPE')
    ? labelOf(CATEGORY_LABEL, addressed, lang)
    : lower(labelOf(OP_LABEL, addressed, lang), lang);
  const verb = DETAIL_VERB[op];
  if (!verb) return `${labelOf(OP_LABEL, op, lang)} — ${what}`;
  return lang === 'ko' ? `${what} ${verb.ko}` : `${verb.en} ${what}`;
}

/** As its chip reads, so a result names the thing that was searched for. */
export function opLabel(op: SkillOp, ctx: EffectContext, lang: Lang = 'en'): string {
  const keys = effectKeys(op, ctx);
  return keys.length
    ? keys.map((key) => effectLabel(key, lang)).join(', ')
    : labelOf(OP_LABEL, op.op, lang);
}

function sentence(text: string, lang: Lang): string {
  if (lang === 'ko' || !text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

export function facetLabel(group: EffectGroup, value: string, lang: Lang = 'en'): string {
  switch (group) {
    case 'effect': return effectLabel(value, lang);
    case 'grant': return labelOf(STAT_LABEL, value, lang);
    case 'lands': return sentence(labelOf(TARGET_LABEL, value, lang), lang);
    case 'slot': return pick(SKILL_CATEGORY_LABEL[Number(value)], lang) || value;
    case 'area': return sentence(labelOf(SHAPE_LABEL, value, lang), lang);
    case 'pick': return sentence(labelOf(SORT_LABEL, value, lang), lang);
    case 'shape': return sentence(labelOf(SHAPE_LABEL, value, lang), lang);
    case 'scale': return sentence(labelOf(STAT_LABEL, value, lang), lang);
    case 'trigger': return labelOf(TRIGGER_LABEL, value, lang);
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

// No single grade carries the whole kit: passive tiers appear at 3★/4★/5★.
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

// A state is named by the commonest effect type applying it; one applied only by `MARKER` stays unsearchable.
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

// Counted with every other group's selection applied, so a chip reading 0 cannot be combined with what is picked.
export function facetOptions(
  kits: CharacterKit[], selection: EffectSelection, group: EffectGroup,
  lang: Lang = 'en',
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
    .map(([value, count]) => ({ value, count, label: facetLabel(group, value, lang) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Kept under the hitbox or trigger they belong to, where their targeting is authored. */
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

// With no effect picked, every operation the page can name is shown, one group per hitbox rather than one per hit.
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
