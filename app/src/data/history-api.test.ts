import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import { WATCH_HISTORY_PATH, createHistoryApi, narrowWatchHistoryEntry } from './history-api';
import { apiFailure } from './failure';
import { dramaSummary, page } from '../testing/catalog-fixtures';
import { watchHistoryEntry } from '../testing/history-fixtures';
import type { HttpClient } from './http';

function httpStub(body: unknown): HttpClient {
  return { getJson: () => Promise.resolve(ok(body)) };
}

describe('the watch-history endpoint', () => {
  it('publishes the path the contract defines', () => {
    expect(WATCH_HISTORY_PATH).toBe('/v1/users/me/watch-history');
  });

  it('pages on an opaque cursor and never invents a limit', async () => {
    const getJson = vi.fn<HttpClient['getJson']>(() => Promise.resolve(ok(page([]))));
    await createHistoryApi({ getJson }).fetchWatchHistory({ cursor: 'cur_2' });

    expect(getJson).toHaveBeenCalledWith(WATCH_HISTORY_PATH, {
      cursor: 'cur_2',
      limit: undefined,
    });
  });

  it('passes a transport failure through untouched, so the surface classifies it', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 401, message: 'no session' });
    const api = createHistoryApi({ getJson: () => Promise.resolve({ ok: false, error: failure }) });

    const result = await api.fetchWatchHistory({});
    expect(result).toEqual({ ok: false, error: failure });
  });

  it('returns the entries and the cursor from a documented page', async () => {
    const api = createHistoryApi(httpStub(page([watchHistoryEntry()], 'cur_next')));
    const result = await api.fetchWatchHistory({});

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.items.length : null).toBe(1);
    expect(result.ok ? result.value.pageInfo.nextCursor : null).toBe('cur_next');
  });

  // An empty history is a successful read, not a failure. It is the state the screen must be able
  // to tell apart from a 401, and it starts here: `items: []` is a value.
  it('treats an empty history as a value', async () => {
    const result = await createHistoryApi(httpStub(page([]))).fetchWatchHistory({});

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.items : null).toEqual([]);
  });

  it('rejects a body that is not a page', async () => {
    for (const body of [null, [], {}, { items: {} }, { items: [], pageInfo: {} }]) {
      const result = await createHistoryApi(httpStub(body)).fetchWatchHistory({});
      expect(result.ok, JSON.stringify(body)).toBe(false);
      expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
    }
  });
});

/**
 * Strict about what the row is made of, tolerant about the rest. The two required fields are the
 * ones without which there is nothing to draw; rejecting a whole history because one entry lacks a
 * timestamp would cost the viewer their list to protect nothing.
 */
describe('a watch-history entry', () => {
  it('is rejected without a valid drama summary', () => {
    const { drama: _drama, ...withoutDrama } = watchHistoryEntry();

    expect(narrowWatchHistoryEntry(withoutDrama)).toBeNull();
    expect(narrowWatchHistoryEntry({ ...watchHistoryEntry(), drama: { id: 'drm_1' } })).toBeNull();
    expect(narrowWatchHistoryEntry(null)).toBeNull();
    expect(narrowWatchHistoryEntry([watchHistoryEntry()])).toBeNull();
  });

  it('is rejected without the episode number the row displays', () => {
    const { lastEpisodeNumber: _number, ...withoutNumber } = watchHistoryEntry();

    expect(narrowWatchHistoryEntry(withoutNumber)).toBeNull();
    expect(narrowWatchHistoryEntry({ ...watchHistoryEntry(), lastEpisodeNumber: '7' })).toBeNull();
    expect(
      narrowWatchHistoryEntry({ ...watchHistoryEntry(), lastEpisodeNumber: Number.NaN }),
    ).toBeNull();
  });

  it('survives a missing resume point and a missing timestamp', () => {
    const entry = narrowWatchHistoryEntry({
      drama: dramaSummary(),
      lastEpisodeNumber: 4,
    });

    expect(entry).not.toBeNull();
    expect(entry?.lastPositionSec).toBeNull();
    expect(entry?.watchedAt).toBeNull();
  });

  /**
   * The contract publishes `lastEpisodeNumber` and no episode id (`docs/12-api-contracts.md` §4.7),
   * while the player route is addressed by id. So the id is read when it is there and its absence
   * is a destination decision rather than a rejected entry — see `HistoryRow`.
   */
  it('reports no episode id rather than guessing one from the episode number', () => {
    const { lastEpisodeId: _id, ...contractShape } = watchHistoryEntry();
    const entry = narrowWatchHistoryEntry(contractShape);

    expect(entry?.lastEpisodeId).toBeNull();
    expect(entry?.lastEpisodeNumber).toBe(7);
  });

  it('ignores an empty episode id, which addresses nothing', () => {
    expect(narrowWatchHistoryEntry(watchHistoryEntry({ lastEpisodeId: '' }))?.lastEpisodeId).toBe(
      null,
    );
  });

  it('keeps the fields the row renders', () => {
    const entry = narrowWatchHistoryEntry(
      watchHistoryEntry({
        drama: dramaSummary({ id: 'drm_9', title: 'Nine' }),
        lastEpisodeNumber: 12,
        lastPositionSec: 90,
        lastEpisodeId: 'ep_9_0012',
      }),
    );

    expect(entry).toEqual({
      drama: expect.objectContaining({ id: 'drm_9', title: 'Nine' }),
      lastEpisodeNumber: 12,
      lastPositionSec: 90,
      watchedAt: '2026-08-27T10:00:00.000Z',
      lastEpisodeId: 'ep_9_0012',
    });
  });
});
