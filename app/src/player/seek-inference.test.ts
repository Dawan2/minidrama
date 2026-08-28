import { describe, expect, it } from 'vitest';

import {
  isSeekDiscontinuity,
  SEEK_BACKWARD_SEC,
  SEEK_FORWARD_WALL_MULTIPLIER,
} from './seek-inference';

describe('isSeekDiscontinuity', () => {
  it('names a backward jump larger than one second as a scrub', () => {
    expect(
      isSeekDiscontinuity({ positionSec: 45, atMs: 1_000 }, { positionSec: 43, atMs: 1_100 }),
    ).toBe(true);
    expect(
      isSeekDiscontinuity(
        { positionSec: 45, atMs: 1_000 },
        { positionSec: 45 - SEEK_BACKWARD_SEC, atMs: 1_100 },
      ),
    ).toBe(false);
  });

  it('names a forward jump larger than 1.5 × wall-clock as a scrub', () => {
    expect(isSeekDiscontinuity({ positionSec: 5, atMs: 0 }, { positionSec: 40, atMs: 1_000 })).toBe(
      true,
    );
    expect(
      isSeekDiscontinuity(
        { positionSec: 5, atMs: 0 },
        {
          positionSec: 5 + SEEK_FORWARD_WALL_MULTIPLIER * 10,
          atMs: 10_000,
        },
      ),
    ).toBe(false);
  });

  it('does not treat ordinary playback over the heartbeat interval as a scrub', () => {
    expect(
      isSeekDiscontinuity({ positionSec: 3, atMs: 0 }, { positionSec: 13, atMs: 10_000 }),
    ).toBe(false);
  });

  it('does not invent a forward scrub on two updates in the same millisecond', () => {
    expect(
      isSeekDiscontinuity({ positionSec: 5, atMs: 1_000 }, { positionSec: 40, atMs: 1_000 }),
    ).toBe(false);
  });
});
