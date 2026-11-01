type Ease = (t: number) => number;

const BACK = 1.70158;

function bounceOut(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
  if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
  const u = t - 2.625 / 2.75;
  return 7.5625 * u * u + 0.984375;
}

const inOut = (fin: Ease): Ease => (t) => (t < 0.5 ? fin(t * 2) / 2 : 1 - fin((1 - t) * 2) / 2);
const out = (fin: Ease): Ease => (t) => 1 - fin(1 - t);
const pow = (n: number): Ease => (t) => t ** n;
const sine: Ease = (t) => 1 - Math.cos((t * Math.PI) / 2);
const expo: Ease = (t) => (t === 0 ? 0 : 2 ** (10 * t - 10));
const circ: Ease = (t) => 1 - Math.sqrt(1 - t * t);
const back: Ease = (t) => t * t * ((BACK + 1) * t - BACK);
const elastic: Ease = (t) => (t === 0 || t === 1 ? t : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)));
const bounceIn: Ease = (t) => 1 - bounceOut(1 - t);

// Naninovel `EasingType` names, Penner curves.
export const EASES: Record<string, Ease> = {
  Linear: (t) => t,
  SmoothStep: (t) => t * t * (3 - 2 * t),
  Spring: (t) => (Math.sin(t * Math.PI * (0.2 + 2.5 * t ** 3)) * (1 - t) ** 2.2 + t) * (1 + 1.2 * (1 - t)),
  EaseInQuad: pow(2), EaseOutQuad: out(pow(2)), EaseInOutQuad: inOut(pow(2)),
  EaseInCubic: pow(3), EaseOutCubic: out(pow(3)), EaseInOutCubic: inOut(pow(3)),
  EaseInQuart: pow(4), EaseOutQuart: out(pow(4)), EaseInOutQuart: inOut(pow(4)),
  EaseInQuint: pow(5), EaseOutQuint: out(pow(5)), EaseInOutQuint: inOut(pow(5)),
  EaseInSine: sine, EaseOutSine: out(sine), EaseInOutSine: inOut(sine),
  EaseInExpo: expo, EaseOutExpo: out(expo), EaseInOutExpo: inOut(expo),
  EaseInCirc: circ, EaseOutCirc: out(circ), EaseInOutCirc: inOut(circ),
  EaseInBounce: bounceIn, EaseOutBounce: bounceOut, EaseInOutBounce: inOut(bounceIn),
  EaseInBack: back, EaseOutBack: out(back), EaseInOutBack: inOut(back),
  EaseInElastic: elastic, EaseOutElastic: out(elastic), EaseInOutElastic: inOut(elastic),
};

export function easeOf(name: string | undefined): Ease {
  return (name && EASES[name]) || EASES.Linear;
}
