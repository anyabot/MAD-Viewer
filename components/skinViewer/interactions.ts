// Naninovel custom-variable expressions, which the scripts gate everything on.
// The control flow itself belongs to the interpreter.

export type Vec = readonly [number, number];
export type Value = number | Vec;
export type Vars = Record<string, Value>;

const isVec = (v: Value): v is Vec => typeof v !== 'number';
const scalar = (v: Value): number => (isVec(v) ? NaN : v);

const RAD_TO_DEG = 57.29578;

// Case-insensitive: the scripts write `length` for the client's `Length`.
const FUNCTIONS: Record<string, (args: Value[]) => Value | null> = {
  length: ([v]) => (v !== undefined && isVec(v) ? Math.hypot(v[0], v[1]) : null),
  // Wrapped into [0, 360) from atan2, then clamped, exactly as the client does.
  angle: ([v]) => {
    if (v === undefined || !isVec(v)) return null;
    let a = Math.atan2(v[1], v[0]) * RAD_TO_DEG;
    a -= Math.floor(a / 360) * 360;
    return a > 360 ? 360 : a < 0 ? 0 : a;
  },
  sin: ([v]) => (v !== undefined && !isVec(v) ? Math.sin(v) : null),
  cos: ([v]) => (v !== undefined && !isVec(v) ? Math.cos(v) : null),
};

// `=` and `==` are both equality, and booleans are carried as 0/1 so `x1=false`
// and `y=0` compare the same way.
//
// Hand-rolled rather than `new Function` so published data never reaches eval.

type Token = { kind: 'num' | 'name' | 'op'; text: string };

// Longest match wins, so '&&' must precede '&' and '!=' precede '!'. Some
// scripts write a multi-flag gate with a single '&'.
const OPERATOR_TEXT = ['&&', '||', '&', '|', '==', '!=', '<=', '>=', '<', '>', '=',
  '+', '-', '*', '/', '(', ')', '!', ','];

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
      // Dots are part of a name — a script counts touches in `sum.x`.
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

const COMPARISON = new Set(['<', '<=', '>', '>=']);

function applyValue(op: string, a: Value, b: Value): Value {
  if (!isVec(a) && !isVec(b)) return apply(op, a, b);
  if (isVec(a) && isVec(b)) {
    if (op === '+') return [a[0] + b[0], a[1] + b[1]];
    if (op === '-') return [a[0] - b[0], a[1] - b[1]];
    return NaN;
  }
  const [v, k] = isVec(a) ? [a, b as number] : [b as Vec, a];
  if (op === '*') return [v[0] * k, v[1] * k];
  if (op === '/' && isVec(a)) return k === 0 ? [0, 0] : [v[0] / k, v[1] / k];
  return NaN;
}

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

export function evaluateValue(expr: string, vars: Vars): Value | null {
  const tokens = tokenize(expr);
  if (!tokens.length) return null;
  let pos = 0;

  const call = (name: string): Value | null => {
    const fn = FUNCTIONS[name.toLowerCase()];
    if (!fn) return null;
    pos++;
    const args: Value[] = [];
    if (tokens[pos]?.text !== ')') {
      for (;;) {
        const arg = expression(0);
        if (arg === null) return null;
        args.push(arg);
        if (tokens[pos]?.text !== ',') break;
        pos++;
      }
    }
    if (tokens[pos]?.text !== ')') return null;
    pos++;
    return fn(args);
  };

  const primary = (): Value | null => {
    const t = tokens[pos];
    if (!t) return null;
    if (t.kind === 'op' && t.text === '-') {
      pos++;
      const v = primary();
      if (v === null) return null;
      return isVec(v) ? [-v[0], -v[1]] : -v;
    }
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
      if (tokens[pos]?.text === '(') return call(t.text);
      if (t.text === 'true') return 1;
      if (t.text === 'false') return 0;
      return vars[t.text] ?? 0;   // an unset Naninovel variable reads as 0
    }
    return null;
  };

  const expression = (minPrec: number): Value | null => {
    let left = primary();
    if (left === null) return null;
    // Postfix `!` asserts truthiness (`x1!` is "x1 is set"), not negation:
    // scripts pair a trigger that sets `x1=true` with an `x1!` one that sets it
    // back, to alternate two clips on one box.
    while (tokens[pos]?.kind === 'op' && tokens[pos].text === '!') {
      pos++;
      left = scalar(left) !== 0 ? 1 : 0;
    }
    for (;;) {
      const t = tokens[pos];
      if (!t || t.kind !== 'op') break;
      const prec = PRECEDENCE[t.text];
      if (prec === undefined || prec < minPrec) break;
      pos++;
      const right = expression(prec + 1);
      if (right === null) return null;
      if (COMPARISON.has(t.text)) {
        let ok: boolean = apply(t.text, scalar(left), scalar(right)) !== 0;
        let previous: number = scalar(right);
        while (tokens[pos]?.kind === 'op' && COMPARISON.has(tokens[pos].text)) {
          const nextOp = tokens[pos++].text;
          const next = expression(prec + 1);
          if (next === null) return null;
          ok = ok && apply(nextOp, previous, scalar(next)) !== 0;
          previous = scalar(next);
        }
        left = ok ? 1 : 0;
      } else if (prec <= 3) {
        left = apply(t.text, scalar(left), scalar(right));
      } else {
        left = applyValue(t.text, left, right);
      }
    }
    return left;
  };

  const value = expression(0);
  return pos === tokens.length ? value : null;
}

/** A scalar result; a vector or a malformed expression is null. */
export function evaluate(expr: string, vars: Vars): number | null {
  const value = evaluateValue(expr, vars);
  if (value === null || isVec(value)) return null;
  return Number.isNaN(value) ? null : value;
}

/** An unparseable condition never arms. */
export function holds(when: string | null | undefined, vars: Vars): boolean {
  if (!when) return true;
  const v = evaluate(when, vars);
  return v !== null && v !== 0;
}
