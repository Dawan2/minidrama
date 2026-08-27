import { describe, expect, it } from 'vitest';

import { MAX_DRAMA_ID_LENGTH, projectDramaProgress, validateDramaId } from './drama.js';
import type { WatchProgressRecord } from './progress.js';

function record(
  overrides: Partial<WatchProgressRecord> & Pick<WatchProgressRecord, 'episodeId'>,
): WatchProgressRecord {
  return {
    userId: 'user_a',
    positionSec: 10,
    durationSec: 95,
    completed: false,
    clientUpdatedAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

describe('validateDramaId', () => {
  it('accepts a seed id', () => {
    expect(validateDramaId('drm_revenge_0001')).toEqual({ ok: true, value: 'drm_revenge_0001' });
  });

  it('accepts an id at the length bound', () => {
    expect(validateDramaId('d'.repeat(MAX_DRAMA_ID_LENGTH)).ok).toBe(true);
  });

  it('refuses an empty or missing value', () => {
    for (const value of [undefined, '', 0]) {
      expect(validateDramaId(value)).toEqual({
        ok: false,
        error: { field: 'dramaId', reason: 'required' },
      });
    }
  });

  it('refuses an id past the bound rather than truncating it', () => {
    expect(validateDramaId('d'.repeat(MAX_DRAMA_ID_LENGTH + 1))).toEqual({
      ok: false,
      error: { field: 'dramaId', reason: 'out_of_range' },
    });
  });
});

describe('projectDramaProgress', () => {
  it('answers empty when nothing in the store matches the listed episodes', () => {
    expect(
      projectDramaProgress({
        episodes: [{ episodeId: 'ep_listed', globalEpisodeNumber: 1 }],
        recordsByEpisodeId: new Map(),
      }),
    ).toEqual({ items: [], lastWatched: null });
  });

  it('numbers from the catalogue ref, not from a suffix on the episode id', () => {
    const view = projectDramaProgress({
      episodes: [{ episodeId: 'ep_dynasty_s2e01', globalEpisodeNumber: 4 }],
      recordsByEpisodeId: new Map([
        ['ep_dynasty_s2e01', record({ episodeId: 'ep_dynasty_s2e01', positionSec: 40 })],
      ]),
    });

    expect(view.items).toEqual([
      {
        episodeId: 'ep_dynasty_s2e01',
        episodeNumber: 4,
        positionSec: 40,
        completed: false,
      },
    ]);
    expect(view.lastWatched).toEqual({
      episodeId: 'ep_dynasty_s2e01',
      episodeNumber: 4,
      positionSec: 40,
    });
  });

  it('forwards the stored completed flag rather than re-deriving it from the position', () => {
    const view = projectDramaProgress({
      episodes: [{ episodeId: 'ep_1', globalEpisodeNumber: 1 }],
      recordsByEpisodeId: new Map([
        [
          'ep_1',
          record({
            episodeId: 'ep_1',
            positionSec: 94,
            durationSec: 95,
            completed: false,
          }),
        ],
      ]),
    });

    expect(view.items[0]?.completed).toBe(false);
  });

  it('drops a stored row whose episode is not in the listed set', () => {
    const view = projectDramaProgress({
      episodes: [{ episodeId: 'ep_listed', globalEpisodeNumber: 1 }],
      recordsByEpisodeId: new Map([
        ['ep_listed', record({ episodeId: 'ep_listed' })],
        ['ep_other_drama', record({ episodeId: 'ep_other_drama', positionSec: 50 })],
      ]),
    });

    expect(view.items.map((item) => item.episodeId)).toEqual(['ep_listed']);
  });

  it('orders items by the catalogue running order, not by recency', () => {
    const view = projectDramaProgress({
      episodes: [
        { episodeId: 'ep_1', globalEpisodeNumber: 1 },
        { episodeId: 'ep_2', globalEpisodeNumber: 2 },
      ],
      recordsByEpisodeId: new Map([
        ['ep_2', record({ episodeId: 'ep_2', updatedAtMs: 20, positionSec: 20 })],
        ['ep_1', record({ episodeId: 'ep_1', updatedAtMs: 10, positionSec: 10 })],
      ]),
    });

    expect(view.items.map((item) => item.episodeId)).toEqual(['ep_1', 'ep_2']);
    expect(view.lastWatched?.episodeId).toBe('ep_2');
  });

  it('picks lastWatched by server time, including when two rows share a millisecond', () => {
    const view = projectDramaProgress({
      episodes: [
        { episodeId: 'ep_1', globalEpisodeNumber: 1 },
        { episodeId: 'ep_2', globalEpisodeNumber: 2 },
      ],
      recordsByEpisodeId: new Map([
        ['ep_1', record({ episodeId: 'ep_1', updatedAtMs: 5, positionSec: 1 })],
        ['ep_2', record({ episodeId: 'ep_2', updatedAtMs: 5, positionSec: 2 })],
      ]),
    });

    // Stable under a tie: later in running order wins because `>=` walks the list in that order.
    expect(view.lastWatched?.episodeId).toBe('ep_2');
  });
});
