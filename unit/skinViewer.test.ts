import { describe, it, expect } from 'vitest';
import { evaluate } from '@/components/skinViewer/interactions';
import { constrainOffset, stepMotion, isSettled, boneSettings } from '@/components/skinViewer/dragBone';

describe('scene expression evaluator', () => {
  it.each<[string, Record<string, number>, number | null]>([
    ['y=0', { y: 0 }, 1],
    ['x*y=1', { x: 1, y: 1 }, 1],
    ['x*y=1', { x: 1, y: 0 }, 0],
    ['a>=4', { a: 4 }, 1],
    ['a<4', { a: 4 }, 0],
    ['25<x<75', { x: 10 }, 0],
    ['25<x<75', { x: 40 }, 1],
    ['25<x<75', { x: 90 }, 0],
    ['x1=false', { x1: 0 }, 1],
    ['s1 && s2 && s3 && s4==true', { s1: 1, s2: 1, s3: 1, s4: 1 }, 1],
    ['s1 && s2', { s1: 1 }, 0],
    ['nope=0', {}, 1],
    ['a+1', { a: 3 }, 4],
    ['a $$ b', {}, null],
    ['x1!', { x1: 1 }, 1],
    ['x1!', { x1: 0 }, 0],
    ['a&b', { a: 1, b: 1 }, 1],
    ['a&b', { a: 1, b: 0 }, 0],
    ['a|b', { a: 0, b: 1 }, 1],
    ['a&&b', { a: 1, b: 1 }, 1],
    ['a!=1', { a: 2 }, 1],
    ['sum.x>=3', { 'sum.x': 3 }, 1],
  ])('%s with %j is %s', (expr, vars, out) => {
    expect(evaluate(expr, vars)).toBe(out);
  });
});

describe('drag bone', () => {
  const tail = boneSettings({ Range: '7.118', Center: '0.015,-0.024', Direction: '334.087', Angle: '181.963', Spring: '2500', Damping: '0.3' });

  it('leaves a point inside range and sector unchanged', () => {
    const [x, y] = constrainOffset(2, -2, tail.constraint);
    expect(x).toBeCloseTo(2, 9);
    expect(y).toBeCloseTo(-2, 9);
  });

  it('pulls a far point back inside the range', () => {
    const far = constrainOffset(20, -10, tail.constraint);
    expect(Math.hypot(far[0] - 0.015, far[1] + 0.024)).toBeLessThanOrEqual(7.118 + 1e-6);
  });

  it('puts a point behind the sector on its edge', () => {
    const behind = constrainOffset(-3, 3, tail.constraint);
    const dir = Math.atan2(behind[1], behind[0]) * 57.29578;
    const off = ((dir - 334.087) % 360 + 540) % 360 - 180;
    expect(Math.hypot(behind[0], behind[1]) < 1e-6 || Math.abs(off) <= 181.963 / 2 + 1e-3).toBe(true);
  });

  it('settles the spring on its target', () => {
    const motion = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < 240; i++) stepMotion(motion, 3, -2, tail, 1 / 60);
    expect(isSettled(motion, 3, -2)).toBe(true);
  });

  it('moves toward the target in one frame', () => {
    const fast = { x: 0, y: 0, vx: 0, vy: 0 };
    stepMotion(fast, 3, -2, tail, 1 / 60);
    expect(Math.hypot(fast.x, fast.y)).toBeGreaterThan(0);
    expect(Math.hypot(fast.x - 3, fast.y + 2)).toBeLessThan(Math.hypot(3, 2));
  });
});
