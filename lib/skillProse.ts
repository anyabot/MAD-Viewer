import {
  CATEGORY_LABEL, DURATION_CATEGORY_CONST, OP_LABEL, SKILL_CATEGORY_LABEL, SORT_LABEL, STAT_LABEL, TARGET_LABEL, TRIGGER_LABEL, castSummary, chanceText,
  colorRuns, gateSummary, growValue, labelOf, moveSummary, opAmounts, statAmount,
} from '@/lib/characters';
import { dataText, pick, type Lang } from '@/lib/i18n';
import type {
  CharacterData, SkillBehaviour, SkillEntry, SkillHit, SkillOp, SkillTrigger,
} from '@/lib/data';

// Names states per kit; `skill` labels a skill type the way the kit lists it, `trigger` is the kit's trigger skill.
export type StateNamer = ((id: string) => string) & {
  skill?: (type: number) => string; trigger?: string; stacks?: Set<string>; signal?: (id: string) => string[] | undefined;
};

export type Delivery = 'projectile' | 'travelling' | 'instant';

// How a hitbox reaches its target: on arrival of the effect, riding the effect, or opened at once.
export function hitDelivery(hit: SkillHit): Delivery {
  return hit.arrive ? 'projectile' : hit.attach === 'ATTACH_DISPATCHER' ? 'travelling' : 'instant';
}

export function deliveries(skill: SkillEntry): Delivery[] {
  const out = new Set<Delivery>();
  for (const b of behavioursOf(skill)) {
    for (const hit of b.hits ?? []) {
      if (hit.ops.length) out.add(hitDelivery(hit));
    }
  }
  return (['projectile', 'travelling', 'instant'] as const).filter((d) => out.has(d));
}

// Every grade's skills, ascending, so the kit and the rotation letter states the same way.
export function kitSkills(group: number | null | undefined, data: CharacterData): SkillEntry[] {
  const grades = data.skillSets[String(group ?? '')] ?? {};
  const ids = [...new Set(Object.values(grades).flat())].sort((a, b) => a - b);
  return ids.map((id) => data.skills[String(id)]).filter((s): s is SkillEntry => !!s);
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function plain(text: string): string {
  return colorRuns(text).map((r) => (r.break ? ' ' : r.text)).join('').trim();
}

// Skills sharing a name are told apart by category, or by slot when that is shared too.
export function skillLabel(s: SkillEntry, skills: SkillEntry[], lang: Lang): string {
  const name = plain(dataText(lang, s.name, s.nameEn));
  const twins = s.name ? skills.filter((x) => x.name === s.name && x.skillType !== s.skillType) : [];
  if (!twins.length) return name;
  if (twins.every((x) => x.categorize !== s.categorize)) return `${name} (${pick(SKILL_CATEGORY_LABEL[s.categorize], lang)})`;
  return lang === 'ko' ? `스킬 ${s.skillType}` : `Skill ${s.skillType}`;
}

function behavioursOf(skill: SkillEntry): SkillBehaviour[] {
  return [skill.behaviour, skill.variant?.behaviour].filter((b): b is SkillBehaviour => !!b);
}

function opsOf(b: SkillBehaviour): SkillOp[] {
  return [...(b.hits ?? []).flatMap((h) => h.ops), ...(b.triggers ?? []).flatMap((t) => t.ops)];
}

// The grades of one passive share their leading words (Entertainment I / II / III).
function readerName(readers: SkillEntry[], lang: Lang): string {
  const names = [...new Set(readers.map((s) => plain(dataText(lang, s.name, s.nameEn))).filter(Boolean))];
  if (!names.length) return '';
  const words = names.map((n) => n.split(' '));
  let n = 0;
  while (n < words[0].length && words.every((ws) => ws[n] === words[0][n])) n++;
  return words[0].slice(0, n).join(' ');
}

// Unnamed internal states get a letter per kit, so an apply and its expire read as the same state.
export function kitStates(skills: SkillEntry[], lang: Lang): StateNamer {
  const named = new Map<string, string>();
  const order: string[] = [];
  const see = (id: string | null | undefined, name?: string | null, nameEn?: string | null) => {
    if (!id || !id.startsWith('define_')) return;
    if (!order.includes(id)) order.push(id);
    const text = plain(dataText(lang, name, nameEn));
    if (text && !named.has(id)) named.set(id, text);
  };
  for (const skill of skills) {
    for (const b of behavioursOf(skill)) {
      for (const t of b.triggers ?? []) for (const v of t.value ?? []) see(v);
      if (b === skill.variant?.behaviour) see(skill.variant.when.define);
      for (const op of opsOf(b)) {
        see(op.define, op.name, op.nameEn);
        for (const v of op.gate?.values ?? []) see(v.id, v.name, v.nameEn);
        if (op.detail && !op.detail.kind.endsWith('Category')) {
          for (const v of op.detail.values) see(v.id, v.name, v.nameEn);
        }
      }
    }
  }
  const label = (s: SkillEntry) => skillLabel(s, skills, lang);
  // an unnamed state set at battle start by one passive grade stands for that grade being equipped
  const markers = new Map<string, { self: boolean; long: boolean; short: boolean; skill: SkillEntry; start: boolean }[]>();
  const owners = new Map<string, SkillEntry[]>();
  const made = new Set<string>();
  const stacks = new Set<string>();
  for (const skill of skills) {
    for (const b of behavioursOf(skill)) {
      const add = (op: SkillOp, start: boolean) => {
        if (op.define && op.kind === 'duration') owners.set(op.define, [...(owners.get(op.define) ?? []), skill]);
        if (op.op === 'MARKER' && op.define) {
          const s = op.seconds?.base?.[0] ?? 0;
          const row = { self: op.applyTo === 'CASTER' || op.team === 'SELF', long: s >= 9999, short: s > 0 && s <= 1, skill, start };
          markers.set(op.define, [...(markers.get(op.define) ?? []), row]);
        }
        if (op.when?.state && Number(op.when.value) > 1) stacks.add(op.when.state);
      };
      for (const hit of b.hits ?? []) for (const op of hit.ops) add(op, false);
      for (const tr of b.triggers ?? []) for (const op of tr.ops) add(op, tr.on === 'TRIGGER_TYPE_BATTLE_START');
    }
  }
  const signals = new Map<string, string[]>();
  const watchers = (id: string) => skills.filter((s) => behavioursOf(s).some((b) => (b.triggers ?? []).some((t) => t.value?.includes(id))));
  for (const [id, rows] of markers) {
    if (named.has(id)) continue;
    if (rows.every((r) => r.start && r.self && r.long && r.skill.categorize === 4) && new Set(rows.map((r) => r.skill)).size === 1) {
      named.set(id, plain(dataText(lang, rows[0].skill.name, rows[0].skill.nameEn)));
    } else if (rows.every((r) => !r.start && r.self && r.short && (r.skill.behaviour?.hits ?? []).length) && watchers(id).length) {
      signals.set(id, [...new Set(rows.map((r) => label(r.skill)))]);
      const reader = readerName(watchers(id), lang);
      named.set(id, reader
        ? (lang === 'ko' ? `${reader} 발동 표식` : `${/^[aeiou]/i.test(reader) ? 'an' : 'a'} ${reader} trigger mark`)
        : (lang === 'ko' ? '스킬 사용 표식' : 'a skill-use mark'));
    }
  }
  // any other unnamed mark is named after the skills that set it, a passive's grades counting once
  for (const [id, rows] of owners) {
    if (named.has(id)) continue;
    const slots = new Map<number, SkillEntry[]>();
    for (const x of new Set(rows)) slots.set(x.skillType, [...(slots.get(x.skillType) ?? []), x]);
    const names = [...new Set([...slots.values()].map((group) => (group.length > 1 && readerName(group, lang)) || label(group[0])))];
    if (!names.length || names.some((n) => !n)) continue;
    made.add(id);
    named.set(id, lang === 'ko' ? `${names.join('/')} 표식`
      : names.length === 1 ? `${names[0]}'s mark` : `the ${names.join(' / ')} mark`);
  }
  // marks that end up sharing a name are told apart by the words of their own id
  const byName = new Map<string, string[]>();
  for (const [id, name] of named) if (made.has(id)) byName.set(name, [...(byName.get(name) ?? []), id]);
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const tail = id.replace(/^define_/, '').replace(/^(trigger|duration|buff|debuff)_/, '').replace(/^(ch|np)\d+_/, '')
        .replace(/^(skill\d+|ulti|passive)_/, '').replace(/_/g, ' ');
      named.set(id, /^\d+$/.test(tail) ? `${named.get(id)} ${Number(tail)}` : `${named.get(id)} (${tail})`);
    }
  }
  const letters = new Map<string, string>();
  for (const id of order) {
    if (!named.has(id)) letters.set(id, `${lang === 'ko' ? '표식' : 'Mark'} ${LETTERS[letters.size] ?? letters.size + 1}`);
  }
  const namer: StateNamer = (id) => named.get(id) ?? letters.get(id) ?? (lang === 'ko' ? '내부 상태' : 'an internal state');
  namer.stacks = stacks;
  namer.signal = (id) => signals.get(id);
  namer.skill = (type) => {
    const s = skills.find((x) => x.skillType === type);
    return s ? label(s) : (lang === 'ko' ? `스킬 ${type}` : `Skill ${type}`);
  };
  const trigger = skills.find((x) => x.categorize === 5);
  namer.trigger = trigger ? label(trigger) : undefined;
  return namer;
}

// A passive work's own check: a state's stacks compared with a number, on itself or on the unit that set the trigger off.
export function workCheck(when: NonNullable<SkillOp['when']>, lang: Lang, states: StateNamer): string {
  const ko = lang === 'ko';
  const state = when.state ? states(when.state) : '';
  const v = when.value ?? '';
  if (when.check === 'CHECK_HP' && when.state) {
    const pct = `${when.state}%`;
    const side = { COMPARISON_LESS_OR_EQUAL: ['이하', 'or below'], COMPARISON_LESS_THAN: ['미만', 'below'], COMPARISON_GREATER_OR_EQUAL: ['이상', 'or above'], COMPARISON_GREATER_THAN: ['초과', 'above'] }[when.op ?? ''];
    if (side) return ko ? `체력 ${pct} ${side[0]}일 때` : side[1].startsWith('or') ? `only at ${pct} HP ${side[1]}` : `only ${side[1]} ${pct} HP`;
  }
  if (when.check === 'CHECK_DURATION_CATEGORIZE' && when.state && (when.op === 'COMPARISON_GREATER_OR_EQUAL' && when.value === '1')) {
    const what = labelOf(CATEGORY_LABEL, DURATION_CATEGORY_CONST[when.state] ?? when.state, lang);
    const target = when.on === 'TRIGGER_TARGET';
    return ko ? `${target ? '대상이 ' : ''}${what} 보유 시` : `only while ${target ? 'the target has' : 'it has'} ${what.toLowerCase()}`;
  }
  if (when.check !== 'CHECK_DURATION_DEFINE' || !state) return when.check ?? '';
  if (when.on === 'TRIGGER_TARGET' && v === '1' && (when.op === 'COMPARISON_EQUAL_TO' || when.op === 'COMPARISON_LESS_THAN')) {
    const has = when.op === 'COMPARISON_EQUAL_TO';
    return ko ? `대상이 ${state} ${has ? '보유' : '미보유'} 시` : `only while the target ${has ? 'has' : 'lacks'} ${state}`;
  }
  switch (when.op) {
    case 'COMPARISON_EQUAL_TO':
      if (v === '1') return ko ? `${state} 보유 시` : `only with ${state}`;
      return ko ? `${state} ${v}중첩일 때` : `if ${state} is at ${v} stacks`;
    case 'COMPARISON_LESS_THAN': return v === '1' ? (ko ? `${state} 없을 때` : `only without ${state}`) : (ko ? `${state} ${v}중첩 미만일 때` : `if ${state} is below ${v} stacks`);
    case 'COMPARISON_GREATER_THAN': return ko ? `${state} ${v}중첩 초과일 때` : `if ${state} is above ${v} stacks`;
    case 'COMPARISON_GREATER_OR_EQUAL': return ko ? `${state} ${v}중첩 이상일 때` : `if ${state} is at ${v}+ stacks`;
    case 'COMPARISON_LESS_OR_EQUAL': return ko ? `${state} ${v}중첩 이하일 때` : `if ${state} is at ${v} stacks or fewer`;
    default: return `${state} ${when.op ?? ''} ${v}`;
  }
}

function seconds(op: SkillOp, level: number, period: number, lang: Lang): string {
  if (!op.seconds) return '';
  const s = growValue(op.seconds, level, period);
  if (!s) return '';
  if (s >= 9999) return lang === 'ko' ? '전투 내내' : 'for the whole battle';
  return lang === 'ko' ? `${s}초간` : `for ${s}s`;
}

// Whose stat a coefficient reads: the caster's own, or the target's.
function scaled(op: SkillOp, level: number, period: number, lang: Lang): string {
  const amounts = opAmounts(op, level, period);
  if (!amounts.length || !op.scale) return '';
  const stat = labelOf(STAT_LABEL, op.scale, lang);
  const amount = amounts.join(' / ');
  // a state scaling off its holder reads the holder's stat, which is itself when it lands on itself
  const own = op.scaleOf !== 'HOLDER' || (op.kind === 'duration' && (op.applyTo === 'CASTER' || op.team === 'SELF'));
  const holder = op.kind === 'duration';
  if (lang === 'ko') return `${own ? '자신' : holder ? '보유자' : '대상'}의 ${stat} ${amount}`;
  return `${amount} of ${own ? 'its' : holder ? "the holder's" : "the target's"} ${stat}`;
}

const ONE: Record<string, string> = {
  ENEMY: 'enemy', FRIENDLY: 'ally', FRIENDLY_NOT_SELF: 'other ally', ALL_UNIT: 'unit',
  SUMMON_MINE: 'own summon', SUMMON_ENEMY: 'enemy summon', SUMMON_FRIENDLY: 'allied summon', SUMMON_ALL: 'summon',
};

function list(names: string[], lang: Lang, or = false): string {
  const unique = [...new Set(names)];
  if (lang === 'ko' || unique.length < 2) return unique.join(', ');
  return `${unique.slice(0, -1).join(', ')} ${or ? 'or' : 'and'} ${unique[unique.length - 1]}`;
}

function who(op: SkillOp, inHit: boolean, lang: Lang, castName?: string): string {
  if (op.applyTo === 'CASTER' || op.team === 'SELF') return lang === 'ko' ? '자신' : 'itself';
  if (op.team === 'CAST_TARGET' && castName) return castName;
  const team = op.team ?? '';
  if (lang === 'ko') {
    const base = labelOf(TARGET_LABEL, team, 'ko');
    if (op.pick === 'ALL') return inHit ? `범위 내 모든 ${base}` : `모든 ${base}`;
    const sort = op.sort ? `${labelOf(SORT_LABEL, op.sort, 'ko')} ` : '';
    return op.count > 1 ? `${sort}${base} ${op.count}명` : `${sort}${base}`;
  }
  const many = labelOf(TARGET_LABEL, team, 'en');
  if (!ONE[team]) return many;
  const hit = inHit ? ' hit' : '';
  if (op.pick === 'ALL') return `every ${ONE[team]}${hit}`;
  const sort = op.sort ? `${labelOf(SORT_LABEL, op.sort, 'en')} ` : '';
  if (op.count > 1) return `the ${op.count} ${sort}${many}${hit}`;
  return `the ${sort}${ONE[team]}${hit}`;
}

function detailNames(op: SkillOp, lang: Lang, states: StateNamer): string {
  const values = op.detail?.values ?? [];
  const names = op.detail?.kind.endsWith('Category')
    ? values.map((v) => labelOf(CATEGORY_LABEL, v.name ?? v.id, lang))
    : values.map((v) => (v.name ? plain(dataText(lang, v.name, v.nameEn)) : states(v.id)));
  return list(names, lang);
}

// A check that repeats the gate on the same unit: the hit unit is the one that set the trigger off.
function sameCheck(op: SkillOp): boolean {
  const g = op.gate;
  const w = op.when;
  if (!g || !w || w.check !== 'CHECK_DURATION_DEFINE' || g.values.length !== 1 || g.values[0].id !== w.state || w.value !== '1') return false;
  if (!(g.on === 'HOLDER' && op.applyTo === 'HOLDER' && op.team !== 'SELF' && w.on === 'TRIGGER_TARGET')) return false;
  return (g.condition === 'LACKS_DURATIONS' && w.op === 'COMPARISON_LESS_THAN') || (g.condition === 'HAS_DURATIONS' && w.op === 'COMPARISON_EQUAL_TO');
}

// One effect as a clause: verb, magnitude, whom, how long.
export type Spread = { landings: number; groups: number };

// Several landings: with no weight each one deals the whole value, a weight splits the value between them.
function perHit(op: SkillOp, level: number, period: number, spread: Spread | undefined, lang: Lang): string {
  if (!spread || spread.landings * spread.groups < 2 || !op.value) return '';
  const ko = lang === 'ko';
  if (op.weight == null) return ko ? ' (타격마다)' : ' per hit';
  const coef = growValue(op.value, level, period, 0);
  const fmt = (v: number) => (op.scale?.endsWith('_RATE') ? `${Number((v * 100).toPrecision(6))}%` : `${Number(v.toPrecision(6))}`);
  const weights = Array.isArray(op.weight) ? op.weight : Array<number>(spread.landings).fill(op.weight);
  const whole = spread.groups === 1 && Math.abs(weights.reduce((a, b) => a + b, 0) - 100) < 0.01;
  const runs: string[] = [];
  for (let i = 0; i < weights.length;) {
    let j = i;
    while (j < weights.length && weights[j] === weights[i]) j += 1;
    const each = fmt((coef * weights[i]) / 100);
    runs.push(weights.length === 1 || j - i === weights.length ? each : ko ? `${each} ${j - i}회` : `${each} on ${j - i === 1 ? '1 hit' : `${j - i} hits`}`);
    i = j;
  }
  const split = runs.length === 1 ? (ko ? `타격당 ${runs[0]}` : `${runs[0]} per hit`) : (ko ? `타격별 ${runs.join(', ')}` : `${runs.join(', ')}`);
  if (whole) return ko ? ` (총합, ${split})` : ` in total (${split})`;
  // the rest of the split lands elsewhere, so this hit's share is spelled out
  const shares = [...new Set(weights)].map((w) => `${w}%`).join('/');
  return ko ? ` (타격당 ${shares}: ${runs.join(', ')})` : ` (${shares} of it per hit: ${runs.join(', ')})`;
}

export function opClause(
  op: SkillOp, level: number, period: number, data: CharacterData, lang: Lang, states: StateNamer, inHit = false,
  castName?: string, spread?: Spread,
): string {
  const ko = lang === 'ko';
  const per = perHit(op, level, period, spread, lang);
  const target = who(op, inHit, lang, castName);
  const amount = scaled(op, level, period, lang);
  const time = seconds(op, level, period, lang);
  const gate = op.gate ? gateSummary(op.gate, data, lang, states) : '';
  const odds = chanceText(op, lang);
  let text: string;
  switch (op.op) {
    case 'ADD_DAMAGE':
      text = ko ? `${target}에게 ${amount} 피해${per}` : `deals ${amount} as damage to ${target}${per}`;
      break;
    case 'ADD_HEAL':
      text = ko ? `${target}을(를) ${amount} 회복${per}` : `heals ${target} for ${amount}${per}`;
      break;
    case 'ADD_FORCE_CRITICAL_DAMAGE':
    case 'ADD_FORCE_PENETRATION_DAMAGE': {
      // the second magnitude replaces the critical chance or the penetration rate for this hit
      const value = op.value!;
      const first = scaled({ ...op, value: { base: value.base.slice(0, 1), up: value.up.slice(0, 1), extra: value.extra.slice(0, 1) } }, level, period, lang);
      const rate = growValue(value, level, period, 1);
      const pct = `${Number((rate * 100).toPrecision(6))}%`;
      const crit = op.op === 'ADD_FORCE_CRITICAL_DAMAGE';
      const extra = crit
        ? (rate >= 1 ? (ko ? '치명타 확정' : 'a guaranteed critical') : (ko ? `치명타 확률 ${pct}` : `a ${pct} critical chance`))
        : (ko ? `관통 ${pct}` : `${pct} penetration`);
      text = ko ? `${target}에게 ${first} 피해${per} (${extra})` : `deals ${first} as damage to ${target}${per} with ${extra}`;
      break;
    }
    case 'OVERTIME_DAMAGE':
    case 'OVERTIME_HEAL': {
      const every = op.interval ? (ko ? ` ${op.interval}초마다` : ` every ${op.interval}s`) : '';
      const what = op.op === 'OVERTIME_DAMAGE' ? (ko ? '피해' : 'damage') : (ko ? '회복' : 'healing');
      text = ko ? `${target}에게${every} ${amount} ${what}, ${time}` : `${what} of ${amount}${every} to ${target} ${time}`;
      break;
    }
    case 'MARKER': {
      const state = op.define ? states(op.define) : (ko ? '내부 상태' : 'an internal state');
      const self = op.applyTo === 'CASTER' || op.team === 'SELF';
      if (op.define && self && states.stacks?.has(op.define)) {
        const timed = time && !time.includes('battle') && !time.includes('전투') ? ` ${time}` : '';
        text = ko ? `${state} 1중첩 획득${timed}` : `gains a stack of ${state}${timed}`;
        break;
      }
      text = ko ? `${target}에게 ${state} 부여${time ? ` (${time})` : ''}` : `marks ${target} with ${state}${time ? ` ${time}` : ''}`;
      break;
    }
    case 'IMMUNE_DURATION_CATEGORIZE_TYPE':
    case 'IMMUNE_ONETIME_CATEGORIZE_TYPE':
    case 'IMMUNE_DURATION_DEFINE_ID':
    case 'IMMUNE_ONETIME_DEFINE_ID':
      text = ko ? `${target} ${detailNames(op, lang, states)} 면역 ${time}` : `makes ${target} immune to ${detailNames(op, lang, states)} ${time}`;
      break;
    case 'CLEAR_DURATION_DEFINE_ID':
    case 'CLEAR_DURATION_CATEGORIZE_TYPE':
      text = ko ? `${target}의 ${detailNames(op, lang, states)} 해제` : `removes ${detailNames(op, lang, states)} from ${target}`;
      break;
    case 'USE_TRIGGER_SKILL':
      text = ko ? `${states.trigger ?? '발동 스킬'} 시전` : `casts ${states.trigger ?? 'its trigger skill'}`;
      break;
    case 'CC_KNOCKBACK':
      text = ko ? `${target} 넉백` : `knocks back ${target}`;
      break;
    default: {
      const label = op.name ? plain(dataText(lang, op.name, op.nameEn)) : labelOf(OP_LABEL, op.op, lang);
      const size = amount ? (ko ? ` (${amount})` : ` (${amount})`) : '';
      const stack = (op.maxStack ?? 0) > 1 && (op.maxStack ?? 0) < 99
        ? (ko ? `, 최대 ${op.maxStack}중첩` : `, up to ${op.maxStack} stacks`) : '';
      text = op.kind === 'duration'
        ? (ko ? `${target}에게 ${label}${size} ${time}${stack}` : `gives ${target} ${label}${size} ${time}${stack}`)
        : (ko ? `${target}에게 ${label}${size}` : `${label.toLowerCase()} on ${target}${size}`);
    }
  }
  const lock = op.kind === 'duration' && op.dispellable === false && (op.categorize ?? 0) > 0
    ? (ko ? ' (해제 불가)' : ' (cannot be removed)') : '';
  const check = op.when && !sameCheck(op) ? workCheck(op.when, lang, states) : '';
  const gated = !gate ? '' : ko ? ` — ${gate.endsWith('만') ? gate : `${gate}만`}` : ` — ${gate.startsWith('only ') ? gate : `only ${gate}`}`;
  const only = [gated, check ? ` — ${check}` : ''].join('');
  const chance = odds ? (ko ? `${odds}로 ` : `${odds}: `) : '';
  return `${chance}${text.replace(/\s+/g, ' ').trim()}${lock}${only}`;
}

const HAS = 'HAS_DURATIONS';
const LACKS = 'LACKS_DURATIONS';

// The one state a gate tests for, held or missing.
function single(op: SkillOp): { id: string; held: boolean } | null {
  const g = op.gate;
  if (!g || op.when || op.chance != null || g.values.length !== 1 || (g.condition !== HAS && g.condition !== LACKS)) return null;
  return { id: `${g.on ?? ''}:${g.values[0].id}`, held: g.condition === HAS };
}

// Two ops on opposite sides of one state read as one choice, the held side as the difference.
function opsText(
  ops: SkillOp[], clause: (op: SkillOp) => string, data: CharacterData, lang: Lang, states: StateNamer,
): string {
  const ko = lang === 'ko';
  const used = new Set<number>();
  const out: string[] = [];
  for (const [i, op] of ops.entries()) {
    if (used.has(i)) continue;
    const mine = single(op);
    const j = mine ? ops.findIndex((other, k) => k > i && !used.has(k) && single(other)?.id === mine.id && single(other)?.held !== mine.held) : -1;
    if (!mine || j < 0) {
      out.push(clause(op));
      continue;
    }
    used.add(j);
    const [held, missing] = mine.held ? [op, ops[j]] : [ops[j], op];
    const base = clause({ ...missing, gate: undefined });
    const alt = clause({ ...held, gate: undefined });
    const when = gateSummary(held.gate!, data, lang, states);
    if (alt.startsWith(base) && alt.length > base.length) {
      const extra = alt.slice(base.length).trim().replace(/^\(|\)$/g, '').replace(/^with /, '');
      out.push(ko ? `${base} (${when} ${extra})` : `${base} (${extra} ${when})`);
    } else {
      out.push(ko ? `${when} ${alt}, 아니면 ${base}` : `${when}, ${alt}; otherwise ${base}`);
    }
  }
  return out.join('; ');
}

// Centre = anchor x + offset along its facing; FIELD_CENTER swaps only the depth for the field's centre line, then `offsetZ` shifts it.
function areaPhrase(hits: SkillHit[], lang: Lang): string {
  const ko = lang === 'ko';
  const hit = hits[0];
  if (hit.shape === 'GLOBAL') return ko ? '필드 전체' : 'across the whole field';
  let shape = '';
  if (hit.shape === 'CIRCLE') shape = ko ? `반경 ${hit.range} 원` : `in a ${hit.range}-radius circle`;
  else if (hit.shape === 'X_AXIS') shape = ko ? `폭 ${hit.range} 띠` : `in a ${hit.range}-wide band`;
  const anchor = hit.cast?.team && hit.cast.team !== 'SELF' ? castSummary(hit.cast, lang) : '';
  const self = !anchor;
  const at = anchor || (ko ? '자신' : 'itself');
  const xs = [...new Set(hits.map((h) => (h.offset === 'BACKWARD' ? -1 : 1) * (h.offset ? h.offsetValue ?? 0 : 0)))];
  const zs = [...new Set(hits.map((h) => h.offsetZ ?? 0))];
  const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  let where: string;
  const pairs = [...new Map(hits.map((h) => {
    const x = (h.offset === 'BACKWARD' ? -1 : 1) * (h.offset ? h.offsetValue ?? 0 : 0);
    const z = h.offsetZ ?? 0;
    return [`${x}:${z}`, { x, z }] as const;
  })).values()];
  const line = hit.fieldCenter ? (ko ? ', 필드 중앙선' : ", on the field's centre line") : '';
  if (xs.length > 1 && zs.length > 1) {
    const each = pairs.map(({ x, z }) => [
      x ? (ko ? `${x > 0 ? '앞' : '뒤'} ${Math.abs(x)}` : `${Math.abs(x)} ${x > 0 ? 'ahead' : 'behind'}`) : '',
      z ? (ko ? `깊이 ${signed(z)}` : `depth ${signed(z)}`) : '',
    ].filter(Boolean).join(' / ') || (ko ? '중심' : 'the centre'));
    return ko ? `${at} 기준 ${list(each, lang)}${line} ${shape}` : `${shape} at ${list(each, lang)} from ${at}${line}`;
  }
  if (xs.every((x) => x === 0)) {
    where = ko ? `${at} 중심` : (self ? 'around itself' : `on ${at}`);
  } else if (xs.every((x) => x >= 0)) {
    where = ko ? `${at} 앞 ${list(xs.map(String), lang)}` : `centred ${list(xs.map(String), lang)} ahead of ${at}`;
  } else if (xs.every((x) => x <= 0)) {
    where = ko ? `${at} 뒤 ${list(xs.map((x) => String(-x)), lang)}` : `centred ${list(xs.map((x) => String(-x)), lang)} behind ${at}`;
  } else {
    where = ko ? `${at} 기준 ${list(xs.map(signed), lang)}` : `centred ${list(xs.map(signed), lang)} along ${self ? 'its' : 'the'} facing from ${at}`;
  }
  const depth = zs.some((z) => z !== 0) ? (ko ? `, 깊이 ${list(zs.map(signed), lang)}` : `, depth ${list(zs.map(signed), lang)}`) : '';
  return ko ? `${where}${line}${depth} ${shape}` : `${shape} ${where}${line}${depth}`;
}

// Hits differing only in where they sit are one sentence with a count.
function hitKey(hit: SkillHit): string {
  const { offset: _o, offsetValue: _v, offsetZ: _z, delay: _d, ...rest } = hit;
  return JSON.stringify(rest);
}

// A `CAST_TARGET` work keeps only the cast's main target, and only while it is inside the hitbox.
function singleTarget(hit: SkillHit): boolean {
  return hit.ops.length > 0 && hit.ops.every((op) => op.team === 'CAST_TARGET' || op.team === 'SELF' || op.applyTo === 'CASTER');
}

function hitSentences(
  b: SkillBehaviour, level: number, period: number, data: CharacterData, lang: Lang, states: StateNamer,
): string[] {
  const groups: SkillHit[][] = [];
  for (const hit of b.hits ?? []) {
    const last = groups[groups.length - 1];
    if (last && hitKey(last[0]) === hitKey(hit)) last.push(hit);
    else groups.push([hit]);
  }
  const ko = lang === 'ko';
  return groups.map((hits) => {
    const hit = hits[0];
    const landings = hits.length * hit.count * Math.max(1, hit.ticks);
    const times = landings > 1 ? (ko ? `, ${landings}회 타격` : `, ${landings} hits`) : '';
    const repeat = hit.ticks === 0 && hit.cycle && hit.lifetime
      ? (ko ? ` (${hit.lifetime}초간 ${hit.cycle}초마다)` : ` (every ${hit.cycle}s for ${hit.lifetime}s)`)
      : hit.lifetime ? (ko ? ` (${hit.lifetime}초 유지)` : ` (lasts ${hit.lifetime}s)`) : '';
    const target = hit.cast?.team && hit.cast.team !== 'SELF' ? castSummary(hit.cast, lang) : '';
    const single = target && singleTarget(hit);
    const castName = single ? (ko ? '그 대상' : 'it') : undefined;
    const spread = { landings: hit.count * Math.max(1, hit.ticks), groups: hits.length };
    const ops = opsText(hit.ops, (op) => opClause(op, level, period, data, lang, states, true, castName, spread), data, lang, states);
    const fired = hit.arrive && target ? (ko ? `${target}에게 발사, 도착 시 ` : `Fires at ${target}; on arrival, `) : '';
    const moving = !hit.arrive && hit.attach === 'ATTACH_DISPATCHER'
      ? (ko ? ` (스킬 이펙트를 따라 이동${target ? `, 목표: ${target}` : ''})` : ` that moves with the skill's effect${target ? `, aimed at ${target}` : ''}`)
      : hit.attach === 'ATTACH_TARGET' ? (ko ? ' (대상을 따라 이동)' : ' that follows its target') : '';
    if (single) {
      const offset = hits.some((h) => h.offsetValue || h.offsetZ || h.fieldCenter);
      // a single-target hit aimed at several units lands on each of them separately
      const many = !!hit.cast && (hit.cast.pick === 'ALL' || (hit.cast.pick !== 'NTH_TARGET_SELECT' && hit.cast.count > 1));
      const count = landings > 1 ? (ko ? ` ${landings}회` : ` ${landings} times`) : '';
      const inside = offset
        ? (ko ? ` (${areaPhrase(hits, lang)} 안에 있을 때)` : ` (only while it is inside ${areaPhrase(hits, lang).replace(/^in /, '')})`) : '';
      const lead = ko
        ? `${fired}${fired ? '' : `${target} `}${many ? '각각 ' : ''}단일 대상${count} 타격`
        : fired
          ? `${fired}hits ${many ? 'each' : 'it'}${count}`
          : `Hits ${many ? (hit.cast!.pick === 'ALL' ? `${target}, one at a time` : `each of ${target}`) : target}${count ? `,${count}` : ''}`;
      return `${lead}${inside}${repeat}: ${ops}.`;
    }
    const shape = hit.shape === 'CIRCLE' ? (ko ? `반경 ${hit.range} 원` : `a ${hit.range}-radius circle`)
      : hit.shape === 'X_AXIS' ? (ko ? `폭 ${hit.range} 띠` : `a ${hit.range}-wide band`) : '';
    // a hitbox riding the effect is wherever the effect is, so it is described by what it moves with
    const area = hit.attach === 'ATTACH_DISPATCHER' && shape && !hit.arrive
      ? (ko ? `${shape}${moving}` : `${shape}${moving}`)
      : `${areaPhrase(hits, lang)}${moving}`;
    const head = fired ? `${fired}${area}` : `${area[0].toUpperCase()}${area.slice(1)}`;
    return `${head}${times}${repeat}: ${ops}.`;
  });
}

// What sets a trigger off, as the details view lists it: the skills it watches, or the states.
export function triggerSubject(t: SkillTrigger, lang: Lang, states: StateNamer): string {
  const values = t.value ?? [];
  if (!values.length) return '';
  if (t.on === 'TRIGGER_TYPE_USE_SKILL' && states.skill) return list(values.map((v) => states.skill!(Number(v))), lang, true);
  if (values.every((v) => v.startsWith('define_'))) return list(values.map((v) => states(v)), lang, true);
  return '';
}

function whenText(t: SkillTrigger, lang: Lang, states: StateNamer): string {
  const ko = lang === 'ko';
  const state = t.value?.[0]?.startsWith('define_') ? states(t.value[0]) : '';
  const on = t.check ? labelOf(TARGET_LABEL, t.check, lang) : '';
  switch (t.on) {
    case 'TRIGGER_TYPE_DURATION_DEFINE_APPLY': {
      const from = t.value?.[0] ? states.signal?.(t.value[0]) : undefined;
      if (from?.length) return ko ? `${list(from, lang)} 사용 시` : `After using ${list(from, lang, true)}`;
      if (state) return ko ? `${on ? `${on}에게 ` : ''}${state}이(가) 부여될 때` : `When ${state} is applied${on ? ` to ${on}` : ''}`;
      break;
    }
    case 'TRIGGER_TYPE_DURATION_DEFINE_EXPIRED':
      if (state) return ko ? `${on ? `${on}의 ` : ''}${state}이(가) 끝날 때` : `When ${state}${on ? ` on ${on}` : ''} runs out`;
      break;
    case 'TRIGGER_TYPE_USE_SKILL':
      if (t.value?.length && states.skill) {
        const names = list(t.value.map((v) => states.skill!(Number(v))), lang, true);
        return ko ? `${names} 사용 시` : `After using ${names}`;
      }
      break;
    case 'TRIGGER_TYPE_DURATION_DEFINE_DISPEL':
      if (state) return ko ? `${on ? `${on}의 ` : ''}${state}이(가) 해제될 때` : `When ${state}${on ? ` on ${on}` : ''} is removed`;
      break;
    default:
  }
  return labelOf(TRIGGER_LABEL, t.on, lang);
}

function triggerSentences(
  b: SkillBehaviour, level: number, period: number, data: CharacterData, lang: Lang, states: StateNamer,
): string[] {
  const ko = lang === 'ko';
  return (b.triggers ?? []).map((t) => {
    const limits = [
      t.limit === 1 ? (ko ? '전투당 1회' : 'once per battle')
        : t.limit > 1 ? (ko ? `전투당 ${t.limit}회` : `up to ${t.limit} times per battle`) : '',
      t.cooldown > 0 ? (ko ? `재사용 ${t.cooldown}초` : `${t.cooldown}s cooldown`) : '',
    ].filter(Boolean);
    const head = `${whenText(t, lang, states)}${limits.length ? ` (${limits.join(', ')})` : ''}`;
    // the same cast behind several conditions reads as one cast with alternatives
    const casts = t.ops.length > 1 && t.ops.every((op) => op.op === 'USE_TRIGGER_SKILL' && op.when);
    const ops = casts
      ? `${opClause({ ...t.ops[0], when: undefined }, level, period, data, lang, states)} — ${t.ops
        .map((op) => workCheck(op.when!, lang, states).replace(/^only with /, 'while it has ').replace(/^only without /, 'while it lacks '))
        .join(ko ? ' 또는 ' : ', or ')}`
      : t.ops.length
        ? opsText(t.ops, (op) => opClause(op, level, period, data, lang, states), data, lang, states)
        : (ko ? '효과 없음' : 'nothing');
    return `${head}: ${ops}.`;
  });
}

export function behaviourSentences(
  b: SkillBehaviour, level: number, period: number, data: CharacterData, lang: Lang, states: StateNamer,
): string[] {
  const moves = [
    ...(b.moveTargets ?? []).map((m) => moveSummary(m, lang)),
  ].map((m) => `${m[0].toUpperCase()}${m.slice(1)}.`);
  const stats = (b.stats ?? []).map((s) => `${labelOf(STAT_LABEL, s.stat, lang)} ${statAmount(s)}.`);
  return [
    ...moves,
    ...hitSentences(b, level, period, data, lang, states),
    ...stats,
    ...triggerSentences(b, level, period, data, lang, states),
  ];
}

