import { describe, expect, it } from 'vitest';

import type { DramaLastWatched, DramaProgressItem, DramaProgressView } from './progress.js';

describe('DramaProgressView', () => {
  it('can be an empty read, which is "never watched this drama" rather than a guessed list', () => {
    const view: DramaProgressView = { items: [], lastWatched: null };

    expect(view.items).toEqual([]);
    expect(view.lastWatched).toBeNull();
  });

  it('carries completed as a stored fact, not a position the client would re-derive', () => {
    const item: DramaProgressItem = {
      episodeId: 'ep_1',
      episodeNumber: 4,
      positionSec: 12,
      completed: false,
    };
    const lastWatched: DramaLastWatched = {
      episodeId: item.episodeId,
      episodeNumber: item.episodeNumber,
      positionSec: item.positionSec,
    };
    const view: DramaProgressView = { items: [item], lastWatched };

    expect(view.items[0]?.completed).toBe(false);
    expect(view.lastWatched?.episodeNumber).toBe(4);
  });
});
