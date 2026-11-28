import { describe, it, expect } from 'vitest';
import { frameBounds, shakeOffset } from '@/components/sdViewer/timeline';

describe('SD cut-in timeline', () => {
  const screen = { width: 900, height: 600 };

  it.each([
    { x: -829, y: 1707, width: 335, height: 277 },
    { x: -1076, y: -1356, width: 2070, height: 1621 },
    { x: -1937, y: -2516, width: 4233, height: 5862 },
  ])('frames %j inside the viewport', (bounds) => {
    const view = frameBounds(screen, bounds);
    expect(bounds.x * view.scale + view.x).toBeGreaterThanOrEqual(0);
    expect((bounds.x + bounds.width) * view.scale + view.x).toBeLessThanOrEqual(screen.width);
    expect(bounds.y * view.scale + view.y).toBeGreaterThanOrEqual(0);
    expect((bounds.y + bounds.height) * view.scale + view.y).toBeLessThanOrEqual(screen.height);
  });

  it('shakes only inside its window', () => {
    const shake = {
      name: null, timeScale: 1, start: 2, duration: 1, minAmplitude: 2, maxAmplitude: 6, frequency: 20, useCurve: true,
      curve: [{ time: 0, value: 0, inSlope: 0, outSlope: 0 }, { time: 1, value: 1, inSlope: 0, outSlope: 0 }],
    };
    expect(shakeOffset([shake], 1.9)).toEqual({ x: 0, y: 0 });
    const active = shakeOffset([shake], 2.5);
    expect(Number.isFinite(active.x) && Number.isFinite(active.y)).toBe(true);
  });
});
