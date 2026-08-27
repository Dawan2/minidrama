import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';
import type { DramaProgressView, WatchProgressReport } from '@minidrama/shared';

import {
  createProgressApi,
  dramaProgressEndpoint,
  episodeProgressEndpoint,
  narrowDramaProgressView,
  toWireProgressReport,
  watchedEpisodeIds,
} from './progress-api';
import { apiFailure } from './failure';
import type { HttpReader, HttpWriter } from './http';

function httpStub(body: unknown): HttpReader & HttpWriter {
  return {
    getJson: () => Promise.resolve(ok(body)),
    send: () => Promise.resolve(ok(undefined)),
  };
}

const report: WatchProgressReport = {
  positionSec: 12,
  durationSec: 90,
  clientUpdatedAt: '2026-08-27T22:00:00.000Z',
};

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
    await createProgressApi({
      getJson,
      send: () => Promise.resolve(ok(undefined)),
    }).fetchDramaProgress('drm_test_0001');

    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson).toHaveBeenCalledWith('/v1/progress/dramas/drm_test_0001');
    expect(JSON.stringify(getJson.mock.calls)).not.toMatch(/progress\/episodes/);
  });

  it('narrows a successful body rather than passing the raw JSON through', async () => {
    const result = await createProgressApi(httpStub(emptyView)).fetchDramaProgress('drm_test_0001');
    expect(result).toEqual({ ok: true, value: emptyView });
  });

  it('passes a transport failure through untouched, so the surface classifies it', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 401, message: 'no session' });
    const api = createProgressApi({
      getJson: () => Promise.resolve({ ok: false, error: failure }),
      send: () => Promise.resolve(ok(undefined)),
    });

    const result = await api.fetchDramaProgress('drm_test_0001');
    expect(result).toEqual({ ok: false, error: failure });
  });
});

describe('the episode progress write', () => {
  it('publishes the path the contract defines, under the live /v1 prefix', () => {
    expect(episodeProgressEndpoint('ep_test_0001')).toBe('/v1/progress/episodes/ep_test_0001');
  });

  it('encodes the episode id rather than pasting it into the path', () => {
    expect(episodeProgressEndpoint('ep/a b')).toBe('/v1/progress/episodes/ep%2Fa%20b');
  });

  it('puts the three contract fields and no completed flag', async () => {
    const send = vi.fn<HttpWriter['send']>(() => Promise.resolve(ok(undefined)));
    const result = await createProgressApi({
      getJson: () => Promise.resolve(ok(emptyView)),
      send,
    }).reportEpisodeProgress('ep_test_0001', report);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('PUT', '/v1/progress/episodes/ep_test_0001', { body: report });
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/completed|beans|unlock|VIP/i);
  });

  it('drops extra keys so a client completed flag never leaves the device', async () => {
    const send = vi.fn<HttpWriter['send']>(() => Promise.resolve(ok(undefined)));
    const stuffed = {
      ...report,
      completed: true,
      beans: 50,
      unlocked: true,
    } as WatchProgressReport;

    await createProgressApi({
      getJson: () => Promise.resolve(ok(emptyView)),
      send,
    }).reportEpisodeProgress('ep_test_0001', stuffed);

    expect(send.mock.calls[0]?.[2]).toEqual({ body: report });
  });

  it('does not hit the network with a float position, a zero duration, or no timestamp', async () => {
    const send = vi.fn<HttpWriter['send']>(() => Promise.resolve(ok(undefined)));
    const api = createProgressApi({
      getJson: () => Promise.resolve(ok(emptyView)),
      send,
    });

    for (const bad of [
      { ...report, positionSec: 1.5 },
      { ...report, positionSec: -1 },
      { ...report, durationSec: 0 },
      { ...report, durationSec: 12.4 },
      { ...report, clientUpdatedAt: 'not-a-date' },
      { ...report, clientUpdatedAt: '' },
    ]) {
      const result = await api.reportEpisodeProgress('ep_test_0001', bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }

    expect(send).not.toHaveBeenCalled();
  });

  it('does not invent a report for an empty episode id', async () => {
    const send = vi.fn<HttpWriter['send']>(() => Promise.resolve(ok(undefined)));
    const result = await createProgressApi({
      getJson: () => Promise.resolve(ok(emptyView)),
      send,
    }).reportEpisodeProgress('', report);

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('passes a 401 through rather than inventing an anonymous watch', async () => {
    const failure = apiFailure({
      kind: 'HTTP',
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'no session',
    });
    const result = await createProgressApi({
      getJson: () => Promise.resolve(ok(emptyView)),
      send: () => Promise.resolve({ ok: false, error: failure }),
    }).reportEpisodeProgress('ep_test_0001', report);

    expect(result).toEqual({ ok: false, error: failure });
  });
});

describe('toWireProgressReport', () => {
  it('keeps only the three wire fields', () => {
    expect(toWireProgressReport('ep_1', report)).toEqual(report);
  });

  it('refuses a position the server would have to invent a clamp for', () => {
    expect(toWireProgressReport('ep_1', { ...report, positionSec: 1.2 })).toBeNull();
    expect(toWireProgressReport('', report)).toBeNull();
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
