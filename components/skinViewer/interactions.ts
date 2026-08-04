// Naninovel custom-variable expressions.
//
// The scenario scripts gate everything on custom variables: a trigger arms on a
// condition, a `@goto` carries one, `@set` assigns one, and a `Track:` may be a
// variable rather than a literal. This module is that expression language and
// nothing else — the script interpreter owns the control flow.

export type Vars = Record<string, number>;

// The syntax these scripts use: `=` and `==` equality, `!=`, `<`, `<=`, `>`,
// `>=`, `&&`, `||`, and arithmetic `+ - * /`. Booleans are carried as 0/1 so
// `x1=false` and `y=0` compare the same way.
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
    // trigger that sets it back, to alternate two clips on one box. Read from
    // the ch0009 pattern, not from Naninovel's parser.
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
