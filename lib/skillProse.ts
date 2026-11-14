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
  rows?: (define: string) => number;
  cap?: (define: string) => number | undefined;
  reader?: (id: string) => string | undefined;
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
  const raw = plain(dataText(lang, s.name, s.nameEn));
  // a trigger skill with only the generic slot name is called what it is
  const name = s.categorize === 5 && /^(Skill|스킬)$/.test(raw) ? (lang === 'ko' ? '발동 스킬' : 'Trigger Skill') : raw;
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
// define -> the units whose kits set it and the op that does, across the whole roster
const SETTERS = new WeakMap<CharacterData, Map<string, { code: string; op: SkillOp }[]>>();
function setters(data: CharacterData): Map<string, { code: string; op: SkillOp }[]> {
  let map = SETTERS.get(data);
  if (map) return map;
  map = new Map();
  for (const [code, c] of Object.entries(data.characters)) {
    if (c.skillSetGroup == null) continue;
    for (const skill of kitSkills(c.skillSetGroup, data)) {
      for (const b of behavioursOf(skill)) {
        for (const op of opsOf(b)) if (op.define && op.kind === 'duration') map.set(op.define, [...(map.get(op.define) ?? []), { code, op }]);
      }
    }
  }
  SETTERS.set(data, map);
  return map;
}

// The words a define id adds past its owner and skill: `define_debuff_ch0071_chill` → "chill".
function idWord(id: string): string {
  return id.replace(/^define_/, '').replace(/^(trigger|duration|buff|debuff)_/, '').replace(/^(ch|np)\d+_/, '')
    .replace(/^(skill\d+|ulti|passive)_/, '').replace(/_(ch|np)\d+$/, '').replace(/_/g, ' ');
}

export function kitStates(skills: SkillEntry[], lang: Lang, data?: CharacterData): StateNamer {
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
  const rowsOf = new Map<string, Set<number>>();
  const caps = new Map<string, number>();
  for (const skill of skills) {
    for (const b of behavioursOf(skill)) {
      const add = (op: SkillOp, start: boolean) => {
        if (op.define && op.kind === 'duration') owners.set(op.define, [...(owners.get(op.define) ?? []), skill]);
        if (op.define && op.kind === 'duration' && op.row) rowsOf.set(op.define, (rowsOf.get(op.define) ?? new Set()).add(skill.skillType));
        if (op.define && op.kind === 'duration' && op.stacking === 'STACK') caps.set(op.define, Math.max(caps.get(op.define) ?? 0, op.rowMaxStack ? op.rowMaxStack : Infinity));
        if (op.op === 'MARKER' && op.define) {
          const s = op.seconds?.base?.[0] ?? 0;
          const row = { self: op.applyTo === 'CASTER' || op.team === 'SELF', long: s >= 9999, short: s > 0 && s <= 1, skill, start };
          markers.set(op.define, [...(markers.get(op.define) ?? []), row]);
        }
        if (op.when?.state && Number(op.when.value) > 1) stacks.add(op.when.state);
      };
      for (const hit of b.hits ?? []) for (const op of hit.ops) add(op, false);
      for (const tr of b.triggers ?? []) for (const op of tr.ops) add(op, tr.on === 'TRIGGER_TYPE_BATTLE_START' || tr.on === 'TRIGGER_TYPE_WAVE_START');
    }
  }
  const signals = new Map<string, string[]>();
  const readers = new Map<string, string>();
  const watchers = (id: string) => skills.filter((s) => behavioursOf(s).some((b) => (b.triggers ?? []).some((t) => t.value?.includes(id))));
  for (const [id, rows] of markers) {
    if (named.has(id)) continue;
    if (rows.every((r) => r.start && r.self && r.long && r.skill.categorize === 4) && new Set(rows.map((r) => r.skill)).size === 1) {
      named.set(id, plain(dataText(lang, rows[0].skill.name, rows[0].skill.nameEn)));
      // grades with one generic name are told apart like any other clash
      made.add(id);
    } else if (rows.every((r) => !r.start && r.self && r.short && (r.skill.behaviour?.hits ?? []).length) && watchers(id).length) {
      signals.set(id, [...new Set(rows.map((r) => label(r.skill)))]);
      const reader = readerName(watchers(id), lang);
      if (reader) readers.set(id, reader);
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
    // a mark carries the word its id gives it, unless that only repeats a slot or a number
    const word = idWord(id);
    const telling = word && !/^(\d+|(ch|np)\d+|(skill|ulti|passive|attack|trigger)\s?\d*)$/.test(word);
    named.set(id, `${lang === 'ko' ? `${names.join('/')} 표식`
      : names.length === 1 ? `${names[0]}'s mark` : `the ${names.join(' / ')} mark`}${telling ? ` (${word})` : ''}`);
  }
  // marks that end up sharing a name are told apart by the words of their own id
  const byName = new Map<string, string[]>();
  for (const [id, name] of named) if (made.has(id)) byName.set(name, [...(byName.get(name) ?? []), id]);
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const tail = idWord(id);
      named.set(id, /^\d+$/.test(tail) ? `${named.get(id)} ${Number(tail)}` : `${named.get(id)} (${tail})`);
    }
  }
  // a state another unit's kit sets is named after that unit; one no kit sets, after the unit its id names
  const unitName = (code: string) => {
    const c = data?.characters[code];
    return c ? plain(dataText(lang, c.name, c.nameEn)) : '';
  };
  for (const id of data ? order : []) {
    if (named.has(id)) continue;
    const from = setters(data!).get(id)?.[0];
    const owner = from ? unitName(from.code) : unitName((/_((?:np|ch)\d{4})(?:_|$)/.exec(id)?.[1] ?? '').toUpperCase());
    if (!owner) {
      if (!from) named.set(id, id.replace(/^define_/, '').replace(/_/g, ' '));
      continue;
    }
    const what = from && from.op.op !== 'MARKER' ? labelOf(OP_LABEL, from.op.op, lang) : (lang === 'ko' ? '표식' : 'mark');
    named.set(id, lang === 'ko' ? `${owner}의 ${what}` : `${owner}'s ${what}`);
  }
  const letters = new Map<string, string>();
  for (const id of order) {
    if (!named.has(id)) letters.set(id, `${lang === 'ko' ? '표식' : 'Mark'} ${LETTERS[letters.size] ?? letters.size + 1}`);
  }
  const namer: StateNamer = (id) => named.get(id) ?? letters.get(id) ?? (lang === 'ko' ? '내부 상태' : 'an internal state');
  namer.stacks = stacks;
  namer.rows = (define) => rowsOf.get(define)?.size ?? 0;
  namer.cap = (define) => caps.get(define);
  namer.signal = (id) => signals.get(id);
  namer.reader = (id) => readers.get(id);
  namer.skill = (type) => {
    const s = skills.find((x) => x.skillType === type);
    return s ? label(s) : (lang === 'ko' ? `스킬 ${type}` : `Skill ${type}`);
  };
  const trigger = skills.find((x) => x.categorize === 5);
  namer.trigger = trigger ? label(trigger) : undefined;
  return namer;
}

// A passive work's own check: a state's stacks compared with a number, on itself or on the unit that set the trigger off.
// decoded apply rule (battle-math.md): STACK adds to its own row's instance and restarts its one timer; TIME_REPLACE keeps the longer
export function stackRule(op: SkillOp, level: number, period: number, lang: Lang, states?: StateNamer): string {
  if (op.kind !== 'duration' || !op.stacking) return '';
  const ko = lang === 'ko';
  const s = op.seconds ? growValue(op.seconds, level, period) : 0;
  const timed = s > 0 && s < 9999;
  if (op.stacking === 'TIME_REPLACE') {
    return timed ? (ko ? '중첩 불가 · 더 긴 지속시간 유지' : "Doesn't stack · the longer duration is kept") : '';
  }
  if (op.stacking !== 'STACK') return ko ? '적용마다 별도 지속' : 'Each application lasts on its own';
  const cap = op.rowMaxStack ?? op.maxStack ?? 0;
  const stack = cap === 1 ? (ko ? '중첩 불가' : "Doesn't stack")
    : cap > 1 ? (ko ? `최대 ${cap}중첩` : `Stacks to ${cap}`) : (ko ? '무제한 중첩' : 'Stacks without limit');
  const parts = [stack];
  if (timed) parts.push(ko ? '다시 걸리면 지속시간 초기화' : cap === 1 ? 'reapplying restarts the timer' : 'reapplying restarts the timer for every stack');
  if (op.define && (states?.rows?.(op.define) ?? 0) > 1) {
    parts.push(ko ? (cap === 1 ? '스킬마다 따로 지속' : '스킬마다 따로 중첩·지속') : cap === 1 ? 'each skill times its own' : 'each skill stacks and times its own');
  }
  if (!timed) return cap > 1 ? stack : '';
  return parts.join(' · ');
}

export function workCheck(when: NonNullable<SkillOp['when']>, lang: Lang, states: StateNamer): string {
  // CompareValue passes every value under comparison NONE (1.11.6)
  if (!when.op) return '';
  const ko = lang === 'ko';
  const state = when.state ? states(when.state) : '';
  const v = when.value ?? '';
  if (when.check === 'CHECK_HP' && when.state) {
    const pct = `${when.state}%`;
    const side = { COMPARISON_LESS_OR_EQUAL: ['이하', 'or below'], COMPARISON_LESS_THAN: ['미만', 'below'], COMPARISON_GREATER_OR_EQUAL: ['이상', 'or above'], COMPARISON_GREATER_THAN: ['초과', 'above'] }[when.op ?? ''];
    if (side) return ko ? `체력 ${pct} ${side[0]}일 때` : side[1].startsWith('or') ? `only at ${pct} HP ${side[1]}` : `only ${side[1]} ${pct} HP`;
  }
  if (when.check === 'CHECK_DURATION_CATEGORIZE' && when.state && (when.op === 'COMPARISON_GREATER_OR_EQUAL' && when.value === '1')) {
    const what = list(when.state.split('|').map((c) => labelOf(CATEGORY_LABEL, DURATION_CATEGORY_CONST[c] ?? c, lang)), lang, true);
    const target = when.on === 'TRIGGER_TARGET';
    return ko ? `${target ? '대상이 ' : ''}${what} 보유 시` : `only while ${target ? 'the target has' : 'it has'} ${what.toLowerCase()}`;
  }
  if (when.check !== 'CHECK_DURATION_DEFINE' || !state) return when.check ?? '';
  if (when.on === 'TRIGGER_TARGET' && v === '1' && ['COMPARISON_EQUAL_TO', 'COMPARISON_GREATER_OR_EQUAL', 'COMPARISON_LESS_THAN'].includes(when.op ?? '')) {
    const has = when.op !== 'COMPARISON_LESS_THAN';
    return ko ? `대상이 ${state} ${has ? '보유' : '미보유'} 시` : `only while the target ${has ? 'has' : 'lacks'} ${state}`;
  }
  switch (when.op) {
    case 'COMPARISON_EQUAL_TO':
      if (v === '1') return ko ? `${state} 보유 시` : `only with ${state}`;
      return ko ? `${state} ${v}중첩일 때` : `if ${state} is at ${v} stacks`;
    case 'COMPARISON_LESS_THAN': return v === '1' ? (ko ? `${state} 없을 때` : `only without ${state}`) : (ko ? `${state} ${v}중첩 미만일 때` : `if ${state} is below ${v} stacks`);
    case 'COMPARISON_GREATER_THAN': return ko ? `${state} ${v}중첩 초과일 때` : `if ${state} is above ${v} stacks`;
    case 'COMPARISON_GREATER_OR_EQUAL':
      // one stack or more is simply holding it
      if (v === '1') return ko ? `${state} 보유 시` : `only while it has ${state}`;
      return ko ? `${state} ${v}중첩 이상일 때` : `if ${state} is at ${v}+ stacks`;
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

const DAMAGE_OPS = new Set(['ADD_DAMAGE', 'ADD_FORCE_CRITICAL_DAMAGE', 'ADD_FORCE_PENETRATION_DAMAGE', 'OVERTIME_DAMAGE']);

// Whose stat a coefficient reads: the caster's own, or the target's.
function scaled(op: SkillOp, level: number, period: number, lang: Lang): string {
  const amounts = opAmounts(op, level, period);
  if (!amounts.length || !op.scale) return '';
  const stat = labelOf(STAT_LABEL, op.scale, lang);
  const amount = amounts.join(' / ');
  // a state scaling off its holder reads the holder's stat, which is itself when it lands on itself
  const own = op.scaleOf !== 'HOLDER' || (op.kind === 'duration' && (op.applyTo === 'CASTER' || op.team === 'SELF'));
  const holder = op.kind === 'duration';
  // a heal, shield or buff on someone else reads "its" as the recipient's, so the caster is named
  const caster = own && !(op.applyTo === 'CASTER' || op.team === 'SELF') && !DAMAGE_OPS.has(op.op ?? '');
  if (lang === 'ko') return `${caster ? '시전자' : own ? '자신' : holder ? '보유자' : '대상'}의 ${stat} ${amount}`;
  return `${amount} of ${caster ? "the caster's" : own ? 'its' : holder ? "the holder's" : "the target's"} ${stat}`;
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
  if (op.sort === 'RANDOM') return op.count > 1 ? `${op.count} random ${many}${hit}` : `a random ${ONE[team]}${hit}`;
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
  if (!g || !w || w.check !== 'CHECK_DURATION_DEFINE' || g.values[0]?.id !== w.state || w.value !== '1') return false;
  if (!(g.on === 'HOLDER' && op.applyTo === 'HOLDER' && op.team !== 'SELF' && w.on === 'TRIGGER_TARGET')) return false;
  // a 1+ stack gate is the same test as holding it
  const one = (g.values.length === 1 && (g.condition === HAS || g.condition === LACKS)) || (g.condition === 'HAS_DURATION_STACK_MORE' && g.values.length === 2 && g.values[1].id === '1');
  if (!one) return false;
  return (g.condition === 'LACKS_DURATIONS' && w.op === 'COMPARISON_LESS_THAN') || (g.condition !== 'LACKS_DURATIONS' && w.op === 'COMPARISON_EQUAL_TO');
}

// One effect as a clause: verb, magnitude, whom, how long.
export type Spread = { landings: number; groups: number; ticks: number };

// Several landings: with no weight each one deals the whole value, a weight splits the value between them.
function perHit(op: SkillOp, level: number, period: number, spread: Spread | undefined, lang: Lang): string {
  const tick = op.tickWeights?.length ? op.tickWeights : undefined;
  if (!spread || (spread.landings * spread.groups < 2 && !tick) || !op.value) return '';
  const ko = lang === 'ko';
  if (op.weight == null && !tick) return ko ? ' (타격마다)' : ' per hit';
  const coef = growValue(op.value, level, period, 0);
  const fmt = (v: number) => (op.scale?.endsWith('_RATE') ? `${Number((v * 100).toPrecision(6))}%` : `${Number(v.toPrecision(6))}`);
  // as dps.ts: a tick past the tick-weight list deals nothing, and a zero-weight tick is no landing
  const weights = tick
    ? Array.from({ length: spread.ticks }, (_, t) => Array<number>(spread.landings / spread.ticks).fill(tick[t] ?? 0)).flat()
      .map((w, i) => (w * (Array.isArray(op.weight) ? op.weight[i] ?? op.weight.at(-1)! : op.weight ?? 100)) / 100).filter((w) => w > 0)
    : Array.isArray(op.weight) ? op.weight : Array<number>(spread.landings).fill(op.weight!);
  if (weights.length === 1 && weights[0] === 100 && spread.groups === 1) return '';
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
  const sum = weights.reduce((a, b) => a + b, 0);
  if (tick && spread.groups === 1) {
    if (spread.landings === 1) return ko ? ` (${sum}%만: ${runs[0]})` : ` (only ${sum}% of it: ${runs[0]})`;
    const some = weights.length < spread.landings ? (ko ? ` ${spread.landings}회 중 ${weights.length}회만` : ` on only ${weights.length} of the ${spread.landings} hits`) : '';
    const total = fmt((coef * sum) / 100);
    return ko ? `${some} (${split}, 총 ${total})` : `${some} (${split}, ${total} in total)`;
  }
  // the rest of the split lands elsewhere, so this hit's share is spelled out
  const shares = [...new Set(weights)].map((w) => `${w}%`).join('/');
  return ko ? ` (타격당 ${shares}: ${runs.join(', ')})` : ` (${shares} of it per hit: ${runs.join(', ')})`;
}

export function opClause(
  op: SkillOp, level: number, period: number, data: CharacterData, lang: Lang, states: StateNamer, inHit = false,
  castName?: string, spread?: Spread,
): string {
  const ko = lang === 'ko';
  // a cast target that is the unit itself reads, and scales, as itself
  if (op.team === 'CAST_TARGET' && (castName === 'itself' || castName === '자신')) op = { ...op, team: 'SELF' };
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
      // an all-zero coefficient is left out of the data
      const size = amount || scaled({ ...op, value: { base: [1e-9], up: [0], extra: [0] } }, level, period, lang).replace(/[\d.e-]+%/, '0%');
      text = ko ? `${target}에게${every} ${size} ${what}, ${time}` : `${what} of ${size}${every} to ${target} ${time}`;
      break;
    }
    case 'MARKER': {
      const state = op.define ? states(op.define) : (ko ? '내부 상태' : 'an internal state');
      const self = op.applyTo === 'CASTER' || op.team === 'SELF';
      // a short self mark only a passive reads is that passive being set off
      const reader = op.define && self ? states.reader?.(op.define) : undefined;
      if (reader) {
        text = ko ? `${reader} 발동` : `sets off ${reader}`;
        break;
      }
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
    case 'BUFF_SPIRITLINK':
      // decoded from HeroBase_V2::ApplyFinalLifeDamageWithSpiritLink / IsKeepingAlive (1.11.6 libil2cpp)
      // the partner is that ally, never an enemy; "상대" read as the opponent
      text = ko
        ? `자신과 ${target}을(를) ${time} 연결: 둘 중 한쪽이 남은 체력보다 큰 피해를 받으면 넘치는 피해는 연결된 다른 쪽이 받음. 체력이 0이 되어도 연결된 다른 쪽이 살아 있는 동안은 쓰러지지 않으며, 둘 다 0이 되면 함께 쓰러짐`
        : `links itself with ${target} ${time}: when either one takes more damage than its remaining HP, the excess goes to the other; a linked unit at 0 HP stays in the fight while its partner is alive, and both fall once both reach 0 HP`;
      break;
    case 'USE_TRIGGER_SKILL':
      text = ko ? `${states.trigger ?? '발동 스킬'} 시전` : `casts ${states.trigger ?? 'its trigger skill'}`;
      break;
    case 'CC_KNOCKBACK':
      text = ko ? `${target} 넉백` : `knocks ${target} back`;
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

// an HP threshold and its complement split the same way: the low side is the held one
const HP_SIDES: Record<string, { pair: string; low: boolean }> = {
  HP_GREATER_THAN: { pair: 'gt', low: false }, HP_LESS_OR_EQUAL: { pair: 'gt', low: true },
  HP_GREATER_OR_EQUAL: { pair: 'ge', low: false }, HP_LESS_THAN: { pair: 'ge', low: true },
};

// The one state a gate tests for, held or missing.
function single(op: SkillOp): { id: string; held: boolean } | null {
  const g = op.gate;
  if (!g || op.when || op.chance != null || g.values.length !== 1) return null;
  const hp = HP_SIDES[g.condition ?? ''];
  if (hp) return { id: `${g.on ?? ''}:hp:${hp.pair}:${g.values[0].id}`, held: hp.low };
  if (g.condition !== HAS && g.condition !== LACKS) return null;
  return { id: `${g.on ?? ''}:${g.values[0].id}`, held: g.condition === HAS };
}

// One state's factors (Shadow Arts: ATK and healing) read as one clause listing each amount.
function joinFactors(op: SkillOp, rest: SkillOp[], clause: (op: SkillOp) => string, lang: Lang): { text: string; used: SkillOp[] } | null {
  if (op.kind !== 'duration' || !op.define || !op.value) return null;
  const key = (o: SkillOp) => JSON.stringify({ ...o, op: null, value: null, scale: null, scaleOf: null, icon: null });
  const run: SkillOp[] = [];
  for (const o of rest) {
    if (o.kind !== 'duration' || !o.value || key(o) !== key(op)) break;
    run.push(o);
  }
  if (!run.length) return null;
  const bare = clause({ ...op, value: undefined });
  const amounts: string[] = [];
  let at = -1;
  let first = '';
  for (const o of [op, ...run]) {
    const full = clause(o);
    if (clause({ ...o, value: undefined }) !== bare) return null;
    let k = 0;
    while (k < bare.length && full[k] === bare[k]) k += 1;
    const piece = full.slice(k, k + full.length - bare.length);
    const m = /^ ?\((.+)\) ?$/.exec(piece);
    if (!m || full.slice(k + piece.length) !== bare.slice(k) || (at >= 0 && at !== k)) return null;
    at = k;
    first ||= piece;
    amounts.push(m[1]);
  }
  return { text: `${bare.slice(0, at)}${first.replace(amounts[0], list(amounts, lang))}${bare.slice(at)}`, used: run };
}

// Two ops on opposite sides of one state read as one choice, the held side as the difference.
function opsText(
  ops: SkillOp[], clause: (op: SkillOp) => string, data: CharacterData, lang: Lang, states: StateNamer,
): string {
  const ko = lang === 'ko';
  const used = new Set<number>();
  const out: string[] = [];
  // an empty instant no trigger relays on does nothing
  ops = ops.filter((op) => op.op !== 'EMPTY_EFFECT');
  for (const [i, op] of ops.entries()) {
    if (used.has(i)) continue;
    const factors = joinFactors(op, ops.slice(i + 1).filter((_, k) => !used.has(i + 1 + k)), clause, lang);
    if (factors) {
      factors.used.forEach((o) => used.add(ops.indexOf(o)));
      out.push(factors.text);
      continue;
    }
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
    const summary = gateSummary(held.gate!, data, lang, states);
    // a state the caster holds reads as its own, not as something the hit carries
    const when = !ko && held.gate!.on === 'CASTER' ? summary.replace(/^with /, 'while it has ').replace(/^without /, 'while it lacks ') : summary;
    if (alt.startsWith(base) && alt.length > base.length) {
      const extra = alt.slice(base.length).trim().replace(/^\(|\)$/g, '').replace(/^with /, '');
      out.push(ko ? `${base} (${when} ${extra})` : `${base} (${extra} ${when})`);
    } else {
      out.push(ko ? `${when} ${alt}, 아니면 ${base}` : `${when}, ${alt}; otherwise ${base}`);
    }
  }
  // the same effect applied several times over reads once, with its count
  const runs: string[] = [];
  for (let i = 0; i < out.length;) {
    let j = i;
    while (j < out.length && out[j] === out[i]) j += 1;
    runs.push(j - i > 1 ? `${out[i]} (${ko ? `${j - i}회` : `${j - i} times`})` : out[i]);
    i = j;
  }
  // a condition every clause ends with is said once
  const tail = runs.length > 1 ? / — [^—;]+$/.exec(runs[0])?.[0] : undefined;
  if (tail && runs.every((r) => r.endsWith(tail) && !r.slice(0, -tail.length).includes(tail))) {
    const cond = tail.slice(3);
    const all = ko ? ` — 모두 ${cond}` : ` — ${runs.length === 2 ? 'both' : 'all'} ${cond}`;
    return `${runs.map((r) => r.slice(0, -tail.length)).join('; ')}${all}`;
  }
  return runs.join('; ');
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
  return groups.filter((hits) => hits[0].ops.some((op) => op.op !== 'EMPTY_EFFECT')).map((hits) => {
    const hit = hits[0];
    const landings = hits.length * hit.count * Math.max(1, hit.ticks);
    const times = landings > 1 ? (ko ? `, ${landings}회 타격` : `, ${landings} hits`) : '';
    const repeat = hit.ticks === 0 && hit.cycle && hit.lifetime && !hit.ops.every((op) => op.once)
      ? (ko ? ` (${hit.lifetime}초간 ${hit.cycle}초마다)` : ` (every ${hit.cycle}s for ${hit.lifetime}s)`)
      : hit.lifetime ? (ko ? ` (${hit.lifetime}초 유지)` : ` (lasts ${hit.lifetime}s)`) : '';
    // a hitbox cast on itself whose every op lands on its cast target is just an effect on itself
    if (hit.cast?.team === 'SELF' && hits.length === 1 && !hit.lifetime && hit.ops.length && hit.ops.every((op) => op.team === 'CAST_TARGET' || op.team === 'SELF' || op.applyTo === 'CASTER')) {
      const own = opsText(hit.ops, (op) => opClause(op, level, period, data, lang, states, true, ko ? '자신' : 'itself'), data, lang, states);
      const text = landings > 1 ? (ko ? `${landings}회: ${own}` : `${landings} times: ${own}`) : own;
      return `${text[0].toUpperCase()}${text.slice(1)}.`;
    }
    const target = hit.cast?.team && hit.cast.team !== 'SELF' ? castSummary(hit.cast, lang) : '';
    const single = target && singleTarget(hit);
    const castName = single ? (ko ? '그 대상' : 'it') : hit.cast?.team === 'SELF' ? (ko ? '자신' : 'itself') : undefined;
    const spread = { landings: hit.count * Math.max(1, hit.ticks), groups: hits.length, ticks: Math.max(1, hit.ticks) };
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
    const placed = areaPhrase(hits, lang);
    // a projectile's hitbox on the unit it was fired at names that unit once
    const there = fired && target ? (ko ? placed.replace(`${target} 중심`, '그 대상 중심') : placed.replace(` on ${target}`, ' on it')) : placed;
    const area = hit.attach === 'ATTACH_DISPATCHER' && shape && !hit.arrive
      ? (ko ? `${shape}${moving}` : `${shape}${moving}`)
      : `${there}${moving}`;
    const head = fired ? `${fired}${area}` : `${area[0].toUpperCase()}${area.slice(1)}`;
    return `${head}${times}${repeat}: ${ops}.`;
  });
}

// an attack trigger's values are the skill types whose attacks count
const ATTACK_EVENTS = new Set(['TRIGGER_TYPE_ATTACK', 'TRIGGER_TYPE_ATTACK_CRI']);

// What sets a trigger off, as the details view lists it: the skills it watches, or the states.
export function triggerSubject(t: SkillTrigger, lang: Lang, states: StateNamer): string {
  const values = t.value ?? [];
  if (!values.length) return '';
  if ((t.on === 'TRIGGER_TYPE_USE_SKILL' || ATTACK_EVENTS.has(t.on ?? '')) && states.skill) {
    return list(values.map((v) => states.skill!(Number(v))), lang, true);
  }
  if (values.every((v) => v.startsWith('define_'))) return list(values.map((v) => states(v)), lang, true);
  if ((t.on ?? '').startsWith('TRIGGER_TYPE_DURATION_CATEGORIZE_')) return list(values.map((v) => labelOf(CATEGORY_LABEL, DURATION_CATEGORY_CONST[v] ?? v, lang)), lang, true);
  return '';
}

const CATEGORY_ONE: Record<string, string> = { 1: 'a buff', 2: 'a debuff', 3: 'crowd control' };
const HOLDER_ONE: Record<string, { en: string; ko: string }> = {
  SELF: { en: 'itself', ko: '자신' }, FRIENDLY: { en: 'an ally', ko: '아군' }, FRIENDLY_NOT_SELF: { en: 'another ally', ko: '다른 아군' },
  ENEMY: { en: 'an enemy', ko: '적' },
};

// a trigger on its own state whose every work waits for one stack count; `each` when it can fire again at or past that count
export function reachedCount(t: SkillTrigger, states?: StateNamer): { n: string; each: boolean } | null {
  // the same count can be a gate on the unit holding the state
  const g = t.ops[0]?.gate;
  if (t.on === 'TRIGGER_TYPE_DURATION_DEFINE_APPLY' && !t.ops[0]?.when && g?.condition === 'HAS_DURATION_STACK_MORE' && g.on === 'HOLDER'
    && g.values[0]?.id === t.value?.[0] && t.ops.every((op) => !op.when && JSON.stringify(op.gate) === JSON.stringify(g))) {
    const resets = t.ops.some((op) => op.op === 'CLEAR_DURATION_DEFINE_ID' && op.detail?.values.some((v) => v.id === g.values[0].id));
    return { n: String(Number(g.values[1]?.id)), each: t.limit !== 1 && !resets };
  }
  const w = t.ops[0]?.when;
  if (t.on !== 'TRIGGER_TYPE_DURATION_DEFINE_APPLY' || !w || w.check !== 'CHECK_DURATION_DEFINE' || w.state !== t.value?.[0]) return null;
  if (!['SELF', 'HOLDER'].includes(w.on ?? '') || t.check !== 'SELF' || !['COMPARISON_EQUAL_TO', 'COMPARISON_GREATER_OR_EQUAL'].includes(w.op ?? '')) return null;
  if (!t.ops.every((op) => JSON.stringify(op.when) === JSON.stringify(w))) return null;
  const n = Number(w.value);
  const cap = states?.cap?.(w.state);
  const again = w.op === 'COMPARISON_GREATER_OR_EQUAL' || cap === n;
  return { n: String(n), each: t.limit !== 1 && again };
}

function whenText(t: SkillTrigger, lang: Lang, states: StateNamer): string {
  const ko = lang === 'ko';
  const state = t.value?.[0]?.startsWith('define_') ? states(t.value[0]) : '';
  const on = t.check ? labelOf(TARGET_LABEL, t.check, lang) : '';
  const on0 = t.on ?? '';
  if (on0.startsWith('TRIGGER_TYPE_DURATION_CATEGORIZE_') && t.value?.length) {
    const holder = HOLDER_ONE[t.check ?? ''];
    if (ko) {
      const what = [...new Set(t.value.map((v) => labelOf(CATEGORY_LABEL, DURATION_CATEGORY_CONST[v] ?? v, lang)))].join(' 또는 ');
      return `${holder ? `${t.holds ? `${states(t.holds)} 보유 ` : ''}${holder.ko}의 ` : ''}${what}이(가) ${on0.endsWith('_APPLY') ? '부여될 때' : on0.endsWith('_DISPEL') ? '해제될 때' : '끝날 때'}`;
    }
    const what = list(t.value.map((v) => CATEGORY_ONE[v] ?? v), lang, true);
    const where = holder ? `${holder.en}${t.holds ? ` with ${states(t.holds)}` : ''}` : '';
    if (on0.endsWith('_APPLY')) return `When ${what} is applied${where ? ` to ${where}` : ''}`;
    if (on0.endsWith('_DISPEL')) return `When ${what} is removed${where ? ` from ${where}` : ''}`;
    return `When ${what} runs out${where ? ` on ${where}` : ''}`;
  }
  const reached = reachedCount(t, states);
  if (reached && state) {
    const holder = t.check && t.check !== 'SELF' ? HOLDER_ONE[t.check] : undefined;
    const on = holder ? (ko ? `${holder.ko}의 ` : ` on ${holder.en}`) : '';
    if (reached.each) return ko ? `${on}${state}이(가) ${reached.n}중첩에 도달할 때와 이후 부여될 때마다` : `When ${state}${on} reaches ${reached.n} stacks and on every application after`;
    return ko ? `${on}${state}이(가) ${reached.n}중첩에 도달할 때` : `When ${state}${on} reaches ${reached.n} stacks`;
  }
  // an event on another unit names that unit
  const other = t.check && t.check !== 'SELF' ? HOLDER_ONE[t.check] : undefined;
  const event: Record<string, [string, string]> = {
    TRIGGER_TYPE_ATTACK: ['attacks', '공격할 때'], TRIGGER_TYPE_HIT: ['is hit', '피격될 때'],
    TRIGGER_TYPE_ATTACK_CRI: ['lands a critical hit', '치명타를 가할 때'], TRIGGER_TYPE_HIT_CRI: ['takes a critical hit', '치명타를 받을 때'],
    TRIGGER_TYPE_ACTOR_DEAD: ['dies', '쓰러질 때'],
  };
  if (other && event[on0]) return ko ? `${other.ko}이(가) ${event[on0][1]}` : `When ${other.en} ${event[on0][0]}`;
  if (ATTACK_EVENTS.has(on0) && t.value?.length && states.skill) {
    const names = list(t.value.map((v) => states.skill!(Number(v))), lang, true);
    return ko ? `${names}(으)로 ${event[on0][1]}` : `When it ${event[on0][0]} with ${names}`;
  }
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Two works that differ only in which state category they wait for read as one work waiting for either.
function joinCategoryChecks(ops: SkillOp[]): SkillOp[] {
  const out: SkillOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    const w = op.when;
    const lw = last?.when;
    if (w?.check === 'CHECK_DURATION_CATEGORIZE' && lw?.check === 'CHECK_DURATION_CATEGORIZE'
      && same({ ...last, when: { ...lw, state: null } }, { ...op, when: { ...w, state: null } })) {
      out[out.length - 1] = { ...last, when: { ...lw, state: `${lw.state}|${w.state}` } };
    } else out.push(op);
  }
  return out;
}

// A trigger on an instant that another trigger of the skill lands is that trigger's next step; a no-op instant is only the relay.
export function foldRelays(triggers: SkillTrigger[]): SkillTrigger[] {
  const made = new Set(triggers.flatMap((t) => t.ops.flatMap((op) => (op.instant ? [op.instant] : []))));
  const relay = new Map<string, SkillTrigger>();
  for (const t of triggers) {
    if (t.on === 'TRIGGER_TYPE_ONETIME_DEFINE_APPLY' && t.value?.length === 1 && made.has(t.value[0])) relay.set(t.value[0], t);
  }
  const expand = (ops: SkillOp[], seen: string[]): SkillOp[] => ops.flatMap((op) => {
    const next = op.instant && !seen.includes(op.instant) ? relay.get(op.instant) : undefined;
    if (!next) return [op];
    const marker = op.op === 'EMPTY_EFFECT';
    const kids = joinCategoryChecks(next.ops).map((o) => ({
      ...o, then: marker ? op.then : true, perBattle: next.limit || op.perBattle, when: o.when ?? (marker ? op.when : undefined),
    }));
    return [...(marker ? [] : [op]), ...expand(kids, [...seen, op.instant!])];
  });
  const listening = new Set(relay.values());
  return triggers.filter((t) => !listening.has(t)).map((t) => {
    // a relay's condition on the unit that set it off reads as part of the trigger
    const markers = t.ops.filter((op) => op.op === 'EMPTY_EFFECT' && op.instant && relay.has(op.instant));
    const w = markers[0]?.when;
    const holds = w && markers.every((m) => same(m.when, w)) && w.check === 'CHECK_DURATION_DEFINE' && w.on === 'TRIGGER_TARGET'
      && w.op === 'COMPARISON_GREATER_OR_EQUAL' && w.value === '1' && w.state ? w.state : undefined;
    const ops = expand(joinCategoryChecks(holds ? t.ops.map((op) => (markers.includes(op) ? { ...op, when: undefined } : op)) : t.ops), []);
    return tidy({ ...t, ops, ...(holds ? { holds } : {}) });
  });
}

// Drop checks the event itself already guarantees, up to the first step that could undo them.
function tidy(t: SkillTrigger): SkillTrigger {
  const ops = joinCategoryChecks(t.ops);
  const applied = t.on === 'TRIGGER_TYPE_DURATION_CATEGORIZE_APPLY' ? t.value ?? [] : [];
  let held = !!t.holds;
  let fresh = applied.length > 0;
  return {
    ...t,
    ops: ops.map((op) => {
      let out = op;
      const target = op.via === 'TRIGGER_TARGET';
      const w = op.when;
      if (target && held && w?.check === 'CHECK_DURATION_DEFINE' && w.on === 'TRIGGER_TARGET' && w.state === t.holds && w.value === '1'
        && (w.op === 'COMPARISON_GREATER_OR_EQUAL' || w.op === 'COMPARISON_EQUAL_TO')) out = { ...out, when: undefined };
      if (target && fresh && w?.check === 'CHECK_DURATION_CATEGORIZE' && w.on === 'TRIGGER_TARGET' && w.op === 'COMPARISON_GREATER_OR_EQUAL'
        && w.value === '1' && applied.every((c) => (w.state ?? '').split('|').includes(c))) out = { ...out, when: undefined };
      const g = op.gate;
      if (target && held && g?.condition === HAS && g.on === 'HOLDER' && g.values.length === 1 && g.values[0].id === t.holds) out = { ...out, gate: undefined };
      if (op.op === 'CLEAR_DURATION_DEFINE_ID' && op.detail?.values.some((v) => v.id === t.holds)) held = false;
      if (op.op === 'CLEAR_DURATION_CATEGORIZE_TYPE') fresh = false;
      return out;
    }),
  };
}

// Whom a passive work's CAST_TARGET op lands on: its holder, or the unit the event happened to or came from (wording per the game's own skill text).
function workTarget(t: SkillTrigger, via: string | null | undefined, lang: Lang): string | undefined {
  const ko = lang === 'ko';
  const on = t.on ?? '';
  if (via === 'HOLDER') return ko ? '자신' : 'itself';
  if (via === 'TRIGGER_TARGET') {
    const one = t.check && t.check !== 'SELF' ? HOLDER_ONE[t.check] : undefined;
    return one ? (ko ? `그 ${one.ko}` : `that ${t.check === 'ENEMY' ? 'enemy' : 'ally'}`) : undefined;
  }
  if (via === 'TRIGGER_INSTIGATOR') {
    if (on.startsWith('TRIGGER_TYPE_ATTACK')) return ko ? '공격받은 적' : 'the enemy hit';
    if (on.startsWith('TRIGGER_TYPE_HIT')) return ko ? '공격한 적' : 'the attacker';
    if (on === 'TRIGGER_TYPE_SUMMON_AFTER') return ko ? '그 소환물' : 'the summon';
  }
  return undefined;
}

function triggerSentences(
  b: SkillBehaviour, level: number, period: number, data: CharacterData, lang: Lang, states: StateNamer,
): string[] {
  const ko = lang === 'ko';
  return foldRelays(b.triggers ?? []).map((t) => {
    const limits = [
      t.limit === 1 ? (ko ? '전투당 1회' : 'once per battle')
        : t.limit > 1 ? (ko ? `전투당 ${t.limit}회` : `up to ${t.limit} times per battle`) : '',
      t.cooldown > 0 && t.limit !== 1 ? (ko ? `재사용 ${t.cooldown}초` : `${t.cooldown}s cooldown`) : '',
    ].filter(Boolean);
    const head = `${whenText(t, lang, states)}${limits.length ? ` (${limits.join(', ')})` : ''}`;
    const subject = (op: SkillOp) => workTarget(t, op.via, lang);
    const step = (op: SkillOp, text: string) => `${op.then ? (ko ? '이어서 ' : 'then ') : ''}${text}${op.perBattle
      ? (ko ? ` (전투당 ${op.perBattle}회)` : op.perBattle === 1 ? ' (once per battle)' : ` (up to ${op.perBattle} times per battle)`) : ''}`;
    if (reachedCount(t, states)) t = { ...t, ops: t.ops.map((op) => ({ ...op, when: undefined, gate: op.when ? op.gate : undefined })) };
    // the same cast behind several conditions reads as one cast with alternatives
    const casts = t.ops.length > 1 && t.ops.every((op) => op.op === 'USE_TRIGGER_SKILL' && op.when);
    const ops = casts
      ? `${opClause({ ...t.ops[0], when: undefined }, level, period, data, lang, states)} — ${t.ops
        .map((op) => workCheck(op.when!, lang, states).replace(/^only with /, 'while it has ').replace(/^only without /, 'while it lacks '))
        .join(ko ? ' 또는 ' : ', or ')}`
      : t.ops.some((op) => op.op !== 'EMPTY_EFFECT')
        ? opsText(t.ops, (op) => step(op, opClause(op, level, period, data, lang, states, false, subject(op))), data, lang, states)
        : (ko ? '효과 없음' : 'nothing');
    // "the target" of a work check is the unit the event happened to, named as the trigger names it
    const unit = workTarget(t, 'TRIGGER_TARGET', lang);
    const named = unit
      ? (ko ? ops.replace(/대상이 /g, `${unit}이(가) `) : ops.replace(/only while the target (has|lacks) /g, `only while ${unit} $1 `))
      : ops;
    return `${head}: ${named}.`;
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

