// Script-driven desire-scene playback.
//
// The full-screen desire scene is a Naninovel scenario script, not prefab or
// master data. One decoded table is supplied per desire rig; this module is the
// runtime that replays it.
//
// The model read from the authored scripts:
//   * a section is one interaction phase: an idle clip, an idle-timeout clip,
//     and a set of touch triggers;
//   * every trigger in a section is ARMED at once, not consumed in order. A
//     trigger carries an optional condition over custom variables, which is
//     what makes touch ORDER matter without any counter constant existing;
//   * a touch runs the first armed trigger for that box whose condition holds,
//     plays its clip and applies its assignments;
//   * the phase advances either from a `goto` on the trigger that fired, or
//     from the section's trailing gate once its condition holds.

export type Trigger = {
  box: string;
  clip: string | null;
  /** Naninovel condition; null = always armed. */
  when: string | null;
  set: Record<string, string>;
  goto?: string | null;
  /** Condition on the `goto` (`@goto <label> if:<cond>`); null = unconditional. */
  gotoWhen?: string | null;
  /** Subroutine run for this touch (`@gosub`). */
  gosub?: string | null;
  /** True when the subroutine runs after the clip chain rather than before. */
  gosubAfter?: boolean;
  /**
   * The rest of the trigger's reaction: conditional chain entries picked by a
   * counter (ds_ch0042's pen steps through `overlay/A4_01`..`_11` as its
   * counter climbs) and unconditional layered/sequential clips (ds_ch0009's
   * glass_on overlay, ds_ch0015's tail_1 follow-up). Every entry whose
   * condition holds plays, in script order.
   */
  clips?: { when: string | null; clip: string }[];
  /** A drag mini-game box (ds_ch0010's bottle); a tap stands in for the drag. */
  drag?: boolean;
};

/** One `@if` block in an onlook body: applied when its condition holds. */
export type OnlookBranch = {
  when: string | null;
  set: Record<string, string>;
  clips: { when: string | null; clip: string }[];
};

// A `@gosub` target: the first branch whose condition holds is applied, then
// the first matching clip plays. `ds_ch0010`'s `bottle` counts beers and shows
// the matching bottle; the phase gate reads the counter it maintains.
export type Subroutine = {
  branches: { when: string | null; set: Record<string, string> }[];
  clips: { when: string | null; clip: string }[];
};

export type Gate = {
  when: string;
  set: Record<string, string>;
  goto: string | null;
};

export type Section = {
  label: string | null;
  /** Every label folded into this section; all are valid `goto` targets. */
  labels: (string | null)[];
  set: Record<string, string>;
  /** One-shot played on entering the phase, before the idle loop starts —
   *  the transition INTO this phase (`ds_ch0035` opens phase 2 on
   *  `10_idle1_1`, then loops `10_idle2`). Null when the phase just idles. */
  enter: string | null;
  idle: string | null;
  /** Idle-timeout trigger. Its body (`branches`) runs on each timeout: every
   *  branch whose condition holds applies its assignments and plays its clips
   *  — ds_ch0057 arms its whole H line this way (`sum.x>=3` shows the toy
   *  overlay AND sets `h1=true`). */
  onlook: {
    clip: string; delay: number | null; branches?: OnlookBranch[];
  } | null;
  /** Ambience played on entering the section (ds_ch0035's `00_loop`,
   *  ds_ch0057 phase 2's carried-over toy overlays), condition-gated. */
  extras?: { when: string | null; clip: string }[];
  triggers: Trigger[];
  gate: Gate | null;
  /** Label the in-game reset button jumps to. */
  reset: string | null;
};

export type RigScript = {
  script: string;
  actor: string | null;
  entry: string | null;
  /** False when script-line recovery was approximate; sections may be coarse. */
  aligned: boolean;
  sections: Section[];
  subroutines?: Record<string, Subroutine>;
};

export type InteractionData = {
  generated: string;
  source: string;
  rigs: Record<string, RigScript>;
};

export type Vars = Record<string, number>;

// --- expression evaluation --------------------------------------------------
//
// Naninovel condition syntax, as used by these scripts: `=` and `==` equality,
// `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, and arithmetic `+ - * /`. Booleans are
// carried as 0/1 so `x1=false` and `y=0` compare the same way.
//
// Hand-rolled rather than `new Function` so published data never reaches eval.

type Token = { kind: 'num' | 'name' | 'op'; text: string };

// Longest match wins, so '&&' must precede '&' and '!=' precede '!'.
// ds_ch0011 writes its three-flag gate with single '&'.
const OPERATOR_TEXT = ['&&', '||', '&', '|', '==', '!=', '<=', '>=', '<', '>', '=',
  '+', '-', '*', '/', '(', ')', '!'];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ kind: 'num', text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      // Dots are part of the name: ds_ch0057 counts touches in `sum.x`.
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ kind: 'name', text: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPERATOR_TEXT.find((o) => src.startsWith(o, i));
    if (!op) return [];           // unknown character: refuse the expression
    out.push({ kind: 'op', text: op });
    i += op.length;
  }
  return out;
}

// Precedence climbing. Lower binds looser.
const PRECEDENCE: Record<string, number> = {
  '||': 1, '|': 1, '&&': 2, '&': 2,
  '=': 3, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6,
};

function apply(op: string, a: number, b: number): number {
  switch (op) {
    case '||': case '|': return a || b ? 1 : 0;
    case '&&': case '&': return a && b ? 1 : 0;
    case '=': case '==': return a === b ? 1 : 0;
    case '!=': return a !== b ? 1 : 0;
    case '<': return a < b ? 1 : 0;
    case '<=': return a <= b ? 1 : 0;
    case '>': return a > b ? 1 : 0;
    case '>=': return a >= b ? 1 : 0;
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? 0 : a / b;
    default: return NaN;
  }
}

export function evaluate(expr: string, vars: Vars): number | null {
  const tokens = tokenize(expr);
  if (!tokens.length) return null;
  let pos = 0;

  const primary = (): number | null => {
    const t = tokens[pos];
    if (!t) return null;
    if (t.kind === 'op' && t.text === '-') { pos++; const v = primary(); return v === null ? null : -v; }
    if (t.kind === 'op' && t.text === '(') {
      pos++;
      const v = expression(0);
      if (tokens[pos]?.text !== ')') return null;
      pos++;
      return v;
    }
    if (t.kind === 'num') { pos++; return Number(t.text); }
    if (t.kind === 'name') {
      pos++;
      if (t.text === 'true') return 1;
      if (t.text === 'false') return 0;
      return vars[t.text] ?? 0;   // an unset Naninovel variable reads as 0
    }
    return null;
  };

  const expression = (minPrec: number): number | null => {
    let left = primary();
    if (left === null) return null;
    // Postfix `!` asserts truthiness (`x1!` = "x1 is set"), not negation: the
    // scripts pair an unconditional trigger that sets `x1=true` with an `x1!`
    // trigger that sets it back, to alternate two clips on one box.
    while (tokens[pos]?.kind === 'op' && tokens[pos].text === '!') {
      pos++;
      left = left !== 0 ? 1 : 0;
    }
    for (;;) {
      const t = tokens[pos];
      if (!t || t.kind !== 'op') break;
      const prec = PRECEDENCE[t.text];
      if (prec === undefined || prec < minPrec) break;
      pos++;
      const right = expression(prec + 1);
      if (right === null) return null;
      left = apply(t.text, left, right);
    }
    return left;
  };

  const value = expression(0);
  return pos === tokens.length ? value : null;
}

/** A condition holds when it evaluates truthy. An unparseable one never arms. */
export function holds(when: string | null | undefined, vars: Vars): boolean {
  if (!when) return true;
  const v = evaluate(when, vars);
  return v !== null && v !== 0;
}

export function applyAssignments(set: Record<string, string>, vars: Vars): Vars {
  const next = { ...vars };
  for (const [name, expr] of Object.entries(set ?? {})) {
    const v = evaluate(expr, next);
    if (v !== null) next[name] = v;
  }
  return next;
}

// --- section machine --------------------------------------------------------

export function sectionIndexByLabel(rig: RigScript, label: string | null): number {
  if (!label) return -1;
  return rig.sections.findIndex((s) => s.labels.includes(label));
}

/** Variables as they stand on entering a section, before any touch. */
export function enterSection(section: Section, vars: Vars): Vars {
  return applyAssignments(section.set, vars);
}

export type FiredTouch = {
  trigger: Trigger;
  vars: Vars;
  /** Section label to move to, or null to stay. */
  goto: string | null;
  /** Whether the section's trailing gate is what advanced it. */
  viaGate: boolean;
  /** Clip the trigger's subroutine selected, played alongside its own. */
  subClip: string | null;
  /** Every chain entry whose condition holds, in script order. */
  chainClips: string[];
};

/**
 * Resolve a touch on `box` within `section`. Returns null when no armed trigger
 * matches — the box is inert in this phase, which is a real in-game state and
 * the reason a scene can stall.
 */
export function fireTouch(
  section: Section,
  box: string,
  vars: Vars,
  subroutines?: Record<string, Subroutine>,
): FiredTouch | null {
  const armed = section.triggers.filter((t) => t.box === box && holds(t.when, vars));
  // Most specific wins: a conditional trigger outranks an unconditional one on
  // the same box. Several rigs register a catch-all first and a conditional
  // variant after it, so taking the first match would make the variant
  // unreachable.
  const trigger = armed.find((t) => t.when) ?? armed[0];
  if (!trigger) return null;
  let next = vars;
  let subClip: string | null = null;
  const sub = trigger.gosub ? subroutines?.[trigger.gosub] : undefined;
  const runSubroutine = () => {
    if (!sub) return;
    const branch = sub.branches.find((b) => holds(b.when, next));
    if (branch) next = applyAssignments(branch.set, next);
    subClip = sub.clips.find((c) => holds(c.when, next))?.clip ?? null;
  };
  // Script order decides which counter value the chain sees: ds_ch0010 calls
  // its subroutine before the reaction, ds_ch0042 after the chain that reads
  // the very counter the subroutine bumps.
  if (!trigger.gosubAfter) runSubroutine();
  // Conditional entries are mutually exclusive counter steps; unconditional
  // ones are layered/sequential parts of the same reaction. Play all that hold.
  const chainClips = (trigger.clips ?? [])
    .filter((c) => holds(c.when, next)).map((c) => c.clip);
  if (trigger.gosubAfter) runSubroutine();
  next = applyAssignments(trigger.set, next);
  // A conditional `@goto` only fires once its flags are all set, so the same
  // trigger can be touched repeatedly without advancing.
  let target = holds(trigger.gotoWhen, next) ? (trigger.goto ?? null) : null;
  let viaGate = false;
  if (!target && section.gate && holds(section.gate.when, next)) {
    next = applyAssignments(section.gate.set, next);
    target = section.gate.goto;
    viaGate = true;
  }
  return { trigger, vars: next, goto: target, viaGate, subClip, chainClips };
}

/**
 * Run a section's onlook (idle-timeout) body: every branch whose condition
 * holds applies its assignments and contributes its clips, in script order.
 */
export function fireOnlook(
  section: Section,
  vars: Vars,
): { vars: Vars; clips: string[] } | null {
  const onlook = section.onlook;
  if (!onlook) return null;
  let next = vars;
  const clips: string[] = [];
  for (const branch of onlook.branches ?? []) {
    if (!holds(branch.when, next)) continue;
    next = applyAssignments(branch.set, next);
    for (const c of branch.clips) {
      if (holds(c.when, next)) clips.push(c.clip);
    }
  }
  return { vars: next, clips };
}

/** Section-entry ambience clips whose conditions hold. */
export function entryExtras(section: Section, vars: Vars): string[] {
  return [...new Set((section.extras ?? [])
    .filter((e) => holds(e.when, vars)).map((e) => e.clip))];
}

/** Boxes that can currently do something — for the overlay's live/inert tint. */
export function armedBoxes(section: Section, vars: Vars): Set<string> {
  const out = new Set<string>();
  for (const t of section.triggers) if (holds(t.when, vars)) out.add(t.box);
  return out;
}
