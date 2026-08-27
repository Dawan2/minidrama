import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DOUBLE_TAP_SLOP_PX,
  DOUBLE_TAP_WINDOW_MS,
  isDoubleTap,
  type TapPoint,
} from './episode-double-tap';

function tap(overrides: Partial<TapPoint> = {}): TapPoint {
  return { x: 40, y: 80, atMs: 1_000, ...overrides };
}

describe('isDoubleTap', () => {
  it('names two close taps as a like, including a same-millisecond pair', () => {
    expect(isDoubleTap(tap(), tap({ atMs: 1_000 }))).toBe(true);
    expect(isDoubleTap(tap(), tap({ x: 40 + DOUBLE_TAP_SLOP_PX, atMs: 1_200 }))).toBe(true);
  });

  it('rejects a second tap outside the window, so a pause then a later tap is not a like', () => {
    expect(isDoubleTap(tap(), tap({ atMs: 1_000 + DOUBLE_TAP_WINDOW_MS + 1 }))).toBe(false);
  });

  it('rejects a second tap that travelled farther than slop, so a flick is not a like', () => {
    expect(isDoubleTap(tap(), tap({ y: 80 + DOUBLE_TAP_SLOP_PX + 1, atMs: 1_100 }))).toBe(false);
  });

  it('rejects a second tap that arrived earlier, which is not a gesture', () => {
    expect(isDoubleTap(tap({ atMs: 1_200 }), tap({ atMs: 1_000 }))).toBe(false);
  });
});

describe('this slice does not open the forbidden leftovers', () => {
  it('does not invent 倍速, axe-core, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/episode-double-tap.ts'), 'utf8');
    expect(source).not.toMatch(/playbackRate|axe-core|#\/vip|postgres:/);
  });
});
