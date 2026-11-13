import type { CharacterData, SkillBehaviour, SkillEntry, SkillGate, SkillHit, SkillOp, SkillTrigger } from '@/lib/data';

// `constants` hold for the shown star grade; `scratch` markers live inside one cast and start at 0.
export type UseClear = { define: string; skillTypes: string[]; by: SkillEntry };
export type KitFacts = { constants: Map<string, number>; scratch: Set<string>; useClears: UseClear[] };

const MAX_INPUTS = 3;
const LONG = 9999;

function behavioursOf(skill: SkillEntry): SkillBehaviour[] {
  return [skill.behaviour, skill.variant?.behaviour].filter((b): b is SkillBehaviour => !!b);
}

function cleared(op: SkillOp): string[] {
  return op.op === 'CLEAR_DURATION_DEFINE_ID' && op.detail && !op.detail.kind.endsWith('Category')
    ? op.detail.values.map((v) => v.id) : [];
}

const everSetCache = new WeakMap<object, Set<string>>();

// Every state any skill or summon in the game can put on a unit.
function everSet(data: CharacterData): Set<string> {
  let out = everSetCache.get(data.skills);
  if (!out) {
    const found = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const define = (v as { define?: unknown }).define;
        if (typeof define === 'string') found.add(define);
        Object.values(v).forEach(walk);
      }
    };
    walk(data.skills);
    walk(data.summons);
    out = found;
    everSetCache.set(data.skills, out);
  }
  return out;
}

export function kitFacts(kit: SkillEntry[], grade: SkillEntry[], data: CharacterData): KitFacts {
  type Setter = { skill: SkillEntry; op: SkillOp; trigger?: SkillTrigger };
  const setters = new Map<string, Setter[]>();
  const named = new Set<string>();
  const clears = new Set<string>();
  const watched = new Set<string>();
  for (const skill of kit) {
    if (skill.variant?.when.define) watched.add(skill.variant.when.define);
    for (const b of behavioursOf(skill)) {
      const see = (op: SkillOp, trigger?: SkillTrigger) => {
        for (const id of cleared(op)) clears.add(id);
        if (op.define && (op.nameEn || op.name)) named.add(op.define);
        if (op.op === 'MARKER' && op.define) setters.set(op.define, [...(setters.get(op.define) ?? []), { skill, op, trigger }]);
      };
      for (const hit of b.hits ?? []) for (const op of hit.ops) see(op);
      for (const t of b.triggers ?? []) {
        for (const v of t.value ?? []) watched.add(v);
        for (const op of t.ops) see(op, t);
      }
    }
  }
  const constants = new Map<string, number>();
  const scratch = new Set<string>();
  const set = everSet(data);
  for (const skill of kit) {
    for (const b of behavioursOf(skill)) {
      for (const op of [...(b.hits ?? []).flatMap((h) => h.ops), ...(b.triggers ?? []).flatMap((t) => t.ops)]) {
        for (const id of op.gate ? gateIds(op.gate) : []) if (id.startsWith('define_') && !set.has(id)) constants.set(id, 0);
      }
    }
  }
  for (const [id, rows] of setters) {
    if (named.has(id)) continue;
    const constant = !clears.has(id) && rows.every((r) => r.trigger?.on === 'TRIGGER_TYPE_BATTLE_START' && !r.op.when && !r.op.gate
      && (r.op.seconds?.base?.[0] ?? 0) >= LONG);
    if (constant) {
      constants.set(id, rows.some((r) => grade.includes(r.skill)) ? 1 : 0);
      continue;
    }
    if (!watched.has(id) && rows.every((r) => !r.trigger && (r.op.seconds?.base?.[0] ?? 0) <= 1)) scratch.add(id);
  }
  const useClears: UseClear[] = [];
  for (const skill of grade) {
    for (const b of behavioursOf(skill)) {
      for (const t of b.triggers ?? []) {
        if (t.on !== 'TRIGGER_TYPE_USE_SKILL') continue;
        for (const op of t.ops) for (const define of cleared(op)) useClears.push({ define, skillTypes: t.value ?? [], by: skill });
      }
    }
  }
  return { constants, scratch, useClears };
}

// The kit skill whose use trigger clears `define` when a skill of `skillType` is used.
export function clearedOnUse(facts: KitFacts | undefined, define: string | undefined, skillType: number): SkillEntry | null {
  if (!facts || !define) return null;
  return facts.useClears.find((c) => c.define === define
    && (!c.skillTypes.length || c.skillTypes.includes(String(skillType))))?.by ?? null;
}

type State = Map<string, number>;

const DURATION_GATES = new Set([
  'HAS_DURATIONS', 'HAS_ANY_DURATIONS', 'LACKS_DURATIONS', 'LACKS_ANY_DURATIONS',
  'HAS_DURATION_STACK_SAME', 'HAS_DURATION_STACK_NOT_SAME', 'HAS_DURATION_STACK_MORE',
]);

function gateIds(gate: SkillGate): string[] {
  if (!gate.condition || !DURATION_GATES.has(gate.condition)) return [];
  return gate.condition.startsWith('HAS_DURATION_STACK') ? [gate.values[0]?.id ?? ''] : gate.values.map((v) => v.id);
}

// Null when the gate reads something the state does not know.
function testGate(gate: SkillGate, state: State): boolean | null {
  const ids = gateIds(gate);
  if (!ids.length || ids.some((id) => !state.has(id))) return null;
  const n = (id: string) => state.get(id) ?? 0;
  const want = Number(gate.values[1]?.id ?? 0);
  switch (gate.condition) {
    case 'HAS_DURATIONS': return ids.every((id) => n(id) > 0);
    case 'HAS_ANY_DURATIONS': return ids.some((id) => n(id) > 0);
    case 'LACKS_DURATIONS': return ids.every((id) => n(id) === 0);
    case 'LACKS_ANY_DURATIONS': return ids.some((id) => n(id) === 0);
    case 'HAS_DURATION_STACK_SAME': return n(ids[0]) === want;
    case 'HAS_DURATION_STACK_NOT_SAME': return n(ids[0]) !== want;
    case 'HAS_DURATION_STACK_MORE': return n(ids[0]) >= want;
    default: return null;
  }
}

function testWhen(when: NonNullable<SkillOp['when']>, state: State): boolean | null {
  if (when.check !== 'CHECK_DURATION_DEFINE' || !when.state || !state.has(when.state)) return null;
  const n = state.get(when.state) ?? 0;
  const v = Number(when.value ?? 0);
  switch (when.op) {
    case 'COMPARISON_EQUAL_TO': return n === v;
    case 'COMPARISON_LESS_THAN': return n < v;
    case 'COMPARISON_GREATER_THAN': return n > v;
    case 'COMPARISON_GREATER_OR_EQUAL': return n >= v;
    case 'COMPARISON_LESS_OR_EQUAL': return n <= v;
    default: return null;
  }
}

// Decides what the constants decide and drops the steps that only set them.
function fold(op: SkillOp, facts: KitFacts): SkillOp | null {
  if (op.op === 'MARKER' && op.define && facts.constants.has(op.define)) return null;
  let out = op;
  if (op.gate) {
    const ok = testGate(op.gate, facts.constants);
    if (ok === false) return null;
    if (ok) out = { ...out, gate: undefined };
  }
  if (op.when) {
    const ok = testWhen(op.when, facts.constants);
    if (ok === false) return null;
    if (ok) out = { ...out, when: undefined };
  }
  return out;
}

function foldBehaviour(b: SkillBehaviour, facts: KitFacts): SkillBehaviour {
  const hits = b.hits?.flatMap((h) => {
    const ops = h.ops.flatMap((op) => fold(op, facts) ?? []);
    return h.ops.length && !ops.length ? [] : [{ ...h, ops }];
  });
  const triggers = b.triggers?.flatMap((t) => {
    const ops = t.ops.flatMap((op) => fold(op, facts) ?? []);
    return t.ops.length && !ops.length ? [] : [{ ...t, ops }];
  });
  return { ...b, hits, triggers };
}

// A counter op aimed at several units adds one stack per unit it lands on.
function spread(op: SkillOp): number {
  if (op.team === 'SELF' || op.team === 'CAST_TARGET' || !(op.pick === 'ALL' || op.count > 1)) return 0;
  const cap = op.maxStack || 99;
  return Math.min(cap, op.pick === 'ALL' ? cap : op.count);
}

// Plays one cast per assignment of the outside states its counters read, and per number of targets hit, keeping the ops that can fire.
function unrollScratch(b: SkillBehaviour, facts: KitFacts): SkillBehaviour | null {
  const hits = b.hits ?? [];
  const local = facts.scratch;
  const counters = hits.flatMap((h) => h.ops.filter((op) => op.op === 'MARKER' && op.define && local.has(op.define)));
  if (!counters.length) return null;
  const spreads = [...new Set(counters.map(spread).filter(Boolean))];
  if (spreads.length > 1) return null;
  const most = spreads[0] ?? 1;
  const inputs = new Set<string>();
  for (const hit of hits) {
    for (const op of hit.ops) {
      if (!op.gate) continue;
      const ids = gateIds(op.gate);
      if (!ids.some((id) => local.has(id)) && !(op.op === 'MARKER' && op.define && local.has(op.define))) continue;
      for (const id of ids) if (!local.has(id) && !facts.constants.has(id)) inputs.add(id);
    }
  }
  const outside = [...inputs];
  if (outside.length > MAX_INPUTS) return null;
  const fired = new Map<string, number[]>();
  const masks = 2 ** outside.length;
  const runs = masks * most;
  for (let run = 0; run < runs; run++) {
    const mask = Math.floor(run / most);
    const targets = (run % most) + 1;
    const state: State = new Map([...facts.constants, ...[...local].map((id) => [id, 0] as const)]);
    outside.forEach((id, i) => state.set(id, (mask >> i) & 1));
    for (const [h, hit] of hits.entries()) {
      for (const [o, op] of hit.ops.entries()) {
        const ok = op.gate ? testGate(op.gate, state) : true;
        if (op.op === 'MARKER' && op.define && local.has(op.define)) {
          if (ok === null) return null;
          const times = spread(op) ? targets : 1;
          if (ok) state.set(op.define, Math.min(op.maxStack || 99, (state.get(op.define) ?? 0) + times * (op.value?.base?.[0] || 1)));
          continue;
        }
        const ids = cleared(op);
        if (ids.length && ids.every((id) => local.has(id))) {
          for (const id of ids) state.set(id, 0);
          continue;
        }
        if (ok === false) continue;
        const key = `${h}:${o}`;
        fired.set(key, [...(fired.get(key) ?? []), ok === null ? -1 - run : run]);
      }
    }
  }
  const out: SkillHit[] = [];
  for (const [h, hit] of hits.entries()) {
    const ops: SkillOp[] = [];
    for (const [o, op] of hit.ops.entries()) {
      const fires = fired.get(`${h}:${o}`);
      if (!fires) continue;
      const unknown = fires.some((m) => m < 0);
      const set = new Set(fires.map((m) => (m < 0 ? -1 - m : m)));
      if (unknown) {
        if (op.gate && gateIds(op.gate).some((id) => local.has(id))) return null;
        ops.push(op);
        continue;
      }
      const gate = literal(set, outside, most, op.gate?.on ?? null);
      if (gate === undefined) return null;
      ops.push({ ...op, gate: gate ?? undefined });
    }
    if (ops.length || !hit.ops.length) out.push({ ...hit, ops });
  }
  return { ...b, hits: out };
}

// The runs an op fired under, as no gate, one state held or missing, or a number of targets hit.
function literal(set: Set<number>, outside: string[], most: number, on: string | null): SkillGate | null | undefined {
  const runs = 2 ** outside.length * most;
  if (set.size === runs) return null;
  const all = [...Array(runs).keys()];
  const same = (match: number[]) => match.length === set.size && match.every((r) => set.has(r));
  for (const [i, id] of outside.entries()) {
    for (const held of [1, 0]) {
      if (same(all.filter((r) => ((Math.floor(r / most) >> i) & 1) === held))) {
        return { condition: held ? 'HAS_DURATIONS' : 'LACKS_DURATIONS', on, values: [{ id, name: null, nameEn: null }] };
      }
    }
  }
  for (let n = 1; n <= most; n++) {
    if (same(all.filter((r) => (r % most) + 1 === n))) {
      return { condition: n === most ? 'HITS_AT_LEAST' : 'HITS_EXACTLY', on, values: [{ id: String(n), name: null, nameEn: null }] };
    }
    if (n > 1 && same(all.filter((r) => (r % most) + 1 >= n))) {
      return { condition: 'HITS_AT_LEAST', on, values: [{ id: String(n), name: null, nameEn: null }] };
    }
  }
  return undefined;
}

export function resolveBehaviour(b: SkillBehaviour, facts: KitFacts | undefined): SkillBehaviour {
  if (!facts) return b;
  const unrolled = unrollScratch(b, facts) ?? b;
  return foldBehaviour(unrolled, facts);
}
