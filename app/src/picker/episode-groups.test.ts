import { describe, expect, it } from 'vitest';

import {
  EPISODE_GROUP_SIZE,
  episodeGroupBounds,
  episodeGroupCount,
  episodeGroupIndex,
} from './episode-groups';

describe('episode groups', () => {
  it('is thirty, the size PNL-01 publishes for 80+ episode dramas', () => {
    expect(EPISODE_GROUP_SIZE).toBe(30);
  });

  it('puts episodes 1–30 in group 0 and 31 in group 1', () => {
    expect(episodeGroupIndex(1)).toBe(0);
    expect(episodeGroupIndex(30)).toBe(0);
    expect(episodeGroupIndex(31)).toBe(1);
    expect(episodeGroupIndex(80)).toBe(2);
  });

  it('does not produce a negative group for a number below 1', () => {
    expect(episodeGroupIndex(0)).toBe(0);
    expect(episodeGroupIndex(-4)).toBe(0);
  });

  it('counts three groups for the 80-episode seed floor', () => {
    expect(episodeGroupCount(80)).toBe(3);
    expect(episodeGroupCount(30)).toBe(1);
    expect(episodeGroupCount(31)).toBe(2);
    expect(episodeGroupCount(0)).toBe(0);
  });

  it('clips the last group to the highest episode rather than padding to thirty', () => {
    expect(episodeGroupBounds(0, 80)).toEqual({ start: 1, end: 30 });
    expect(episodeGroupBounds(1, 80)).toEqual({ start: 31, end: 60 });
    expect(episodeGroupBounds(2, 80)).toEqual({ start: 61, end: 80 });
  });
});
