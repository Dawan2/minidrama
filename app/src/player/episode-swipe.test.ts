import { describe, expect, it } from 'vitest';

import { EPISODE_SWIPE_THRESHOLD_PX, verticalSwipe } from './episode-swipe';

describe('verticalSwipe', () => {
  it('names an upward flick as next, not as a tap', () => {
    expect(verticalSwipe(200, 200 - EPISODE_SWIPE_THRESHOLD_PX)).toBe('up');
    expect(verticalSwipe(200, 200 - EPISODE_SWIPE_THRESHOLD_PX - 1)).toBe('up');
  });

  it('names a downward flick as previous', () => {
    expect(verticalSwipe(200, 200 + EPISODE_SWIPE_THRESHOLD_PX)).toBe('down');
  });

  it('ignores a move shorter than the threshold, so a tap stays VePlayer’s', () => {
    expect(verticalSwipe(200, 200)).toBeNull();
    expect(verticalSwipe(200, 200 - (EPISODE_SWIPE_THRESHOLD_PX - 1))).toBeNull();
    expect(verticalSwipe(200, 200 + (EPISODE_SWIPE_THRESHOLD_PX - 1))).toBeNull();
  });
});
