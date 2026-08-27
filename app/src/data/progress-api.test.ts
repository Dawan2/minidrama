import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';
import type { DramaProgressView } from '@minidrama/shared';

import {
  createProgressApi,
  dramaProgressEndpoint,
  narrowDramaProgressView,
  watchedEpisodeIds,
} from './progress-api';
import { apiFailure } from './failure';
import type { HttpReader } from './http';

function httpStub(body: unknown): HttpReader {
  return { getJson: () => Promise.resolve(ok(body)) };
}

const emptyView: DramaProgressView = { items: [], lastWatched: null };

describe('the drama progress endpoint', () => {
  it('publishes the path the contract defines, under the live /v1 prefix', () => {
    expect(dramaProgressEndpoint('drm_revenge_0001')).toBe(
      '/v1/progress/dramas/drm_revenge_0001',
    );
  });

  it('encodes the drama id rather than pasting it into the path', () => {
    expect(dramaProgressEndpoint('drm/a b')).toBe('/v1/progress/dramas/drm%2Fa%20b');
  });

  it('asks only for the drama-level read, never per-episode progress', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(emptyView)));
    await createProgressApi({ getJson }).fetchDramaProgress('drm_test_0001');

    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson).toHaveBeenCalledWith('/v1/progress/dramas/drm_test_0001');
    expect(JSON.stringify(getJson.mock.calls)).not.toMatch(/progress\/episodes/);
  });

  it('passes a transport failure through untouched, so the surface classifies it', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 401, message: 'no session' });
    const api = createProgressApi({
      getJson: () => Promise.resolve({ ok: false, error: failure }),
    });

    const result = await api.fetchDramaProgress('drm_test_0001');
    expect(result).toEqual({ ok: false, error: failure });
  });
});

describe('narrowDramaProgressView', () => {
  it('accepts an empty read', () => {
    expect(narrowDramaProgressView(emptyView)).toEqual(emptyView);
  });

  it('keeps completed as a stored flag, including false', () => {
    const body = {
      items: [
        { episodeId: 'ep_1', episodeNumber: 1, positionSec: 90, completed: false },
        { episodeId: 'ep_2', episodeNumber: 2, positionSec: 90, completed: true },
      ],
      lastWatched: { episodeId: 'ep_2', episodeNumber: 2, positionSec: 90 },
    };

    expect(narrowDramaProgressView(body)).toEqual(body);
  });

  it('rejects a body that is not the documented shape', () => {
    for (const body of [
      null,
      [],
      {},
      { items: {} },
      { items: [{ episodeId: 'ep_1', episodeNumber: 1, positionSec: 0 }] },
      { items: [], lastWatched: {} },
      { lastWatched: null },
    ]) {
      expect(narrowDramaProgressView(body), JSON.stringify(body)).toBeNull();
    }
  });

  it('does not invent completed from a missing flag', () => {
    expect(
      narrowDramaProgressView({
        items: [{ episodeId: 'ep_1', episodeNumber: 1, positionSec: 90 }],
        lastWatched: null,
      }),
    ).toBeNull();
  });
});

describe('watchedEpisodeIds', () => {
  it('marks only completed items, not a range up to lastWatched', () => {
    const ids = watchedEpisodeIds({
      items: [
        { episodeId: 'ep_1', episodeNumber: 1, positionSec: 10, completed: true },
        { episodeId: 'ep_2', episodeNumber: 2, positionSec: 10, completed: false },
      ],
      lastWatched: { episodeId: 'ep_12', episodeNumber: 12, positionSec: 40 },
    });

    expect([...ids]).toEqual(['ep_1']);
    expect(ids.has('ep_2')).toBe(false);
    expect(ids.has('ep_12')).toBe(false);
  });
});
