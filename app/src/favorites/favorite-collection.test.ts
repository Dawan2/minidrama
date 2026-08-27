import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { DramaSummary, Result } from '@minidrama/shared';

import { collectFavorites, orderFavorites } from './favorite-collection';
import { dramaSummary, offlineFailure } from '../testing/catalog-fixtures';
import {
  favoritesHttpFailure,
  followedState,
  unfollowedState,
} from '../testing/favorites-fixtures';
import type { ApiFailure } from '../data/failure';
import type { FavoriteEntry } from './favorite-collection';
import type { FavoriteState } from '../data/favorites-api';

function candidates(...ids: readonly string[]): () => Promise<Result<DramaSummary[], ApiFailure>> {
  return () => Promise.resolve(ok(ids.map((id) => dramaSummary({ id }))));
}

function followedAt(id: string, at: string): Result<FavoriteState, ApiFailure> {
  return ok(followedState(id, at));
}

const AUGUST_1 = '2026-08-01T00:00:00.000Z';
const AUGUST_2 = '2026-08-02T00:00:00.000Z';
const AUGUST_3 = '2026-08-03T00:00:00.000Z';

describe('collecting the viewer’s favourites', () => {
  it('asks about every candidate the source offered', async () => {
    const readFavorite = vi.fn((dramaId: string) => Promise.resolve(ok(unfollowedState(dramaId))));

    await collectFavorites({ candidates: candidates('drm_1', 'drm_2', 'drm_3'), readFavorite });

    expect(readFavorite.mock.calls.map(([id]) => id)).toEqual(['drm_1', 'drm_2', 'drm_3']);
  });

  it('keeps only the dramas the server said this viewer follows', async () => {
    const result = await collectFavorites({
      candidates: candidates('drm_1', 'drm_2'),
      readFavorite: (dramaId) =>
        Promise.resolve(
          dramaId === 'drm_1' ? followedAt('drm_1', AUGUST_1) : ok(unfollowedState(dramaId)),
        ),
    });

    expect(result.ok ? result.value.entries.map((entry) => entry.drama.id) : null).toEqual([
      'drm_1',
    ]);
  });

  it('reports an empty list when the viewer follows none of the candidates', async () => {
    const result = await collectFavorites({
      candidates: candidates('drm_1', 'drm_2'),
      readFavorite: (dramaId) => Promise.resolve(ok(unfollowedState(dramaId))),
    });

    expect(result.ok ? result.value : null).toMatchObject({
      entries: [],
      candidates: 2,
      answered: 2,
      unresolved: null,
    });
  });

  it('reports an empty list without a single request when there are no candidates', async () => {
    const readFavorite = vi.fn((dramaId: string) => Promise.resolve(ok(unfollowedState(dramaId))));

    const result = await collectFavorites({ candidates: candidates(), readFavorite });

    expect(result.ok ? result.value.entries : null).toEqual([]);
    expect(readFavorite).not.toHaveBeenCalled();
  });

  it('carries the candidate source’s failure rather than reporting no favourites', async () => {
    const failure = offlineFailure();
    const result = await collectFavorites({
      candidates: () => Promise.resolve(err(failure)),
      readFavorite: (dramaId) => Promise.resolve(ok(unfollowedState(dramaId))),
    });

    expect(result).toEqual({ ok: false, error: failure });
  });

  it('bounds the number of probes in flight', async () => {
    let inFlight = 0;
    let peak = 0;

    const result = await collectFavorites({
      candidates: candidates('a', 'b', 'c', 'd', 'e', 'f', 'g'),
      concurrency: 3,
      readFavorite: async (dramaId) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return ok(unfollowedState(dramaId));
      },
    });

    expect(peak).toBe(3);
    expect(result.ok ? result.value.answered : null).toBe(7);
  });
});

/**
 * The two failures that mean the same thing for every candidate. Asking nineteen more times
 * produces nineteen more of the same answer and a slower screen.
 */
describe('a failure that ends the whole read', () => {
  it('stops at the first 401 instead of probing the rest', async () => {
    const readFavorite = vi.fn((dramaId: string) =>
      Promise.resolve(
        dramaId === 'drm_1'
          ? err(favoritesHttpFailure(401))
          : (ok(unfollowedState(dramaId)) as Result<FavoriteState, ApiFailure>),
      ),
    );

    const result = await collectFavorites({
      candidates: candidates('drm_1', 'drm_2', 'drm_3'),
      concurrency: 1,
      readFavorite,
    });

    expect(result.ok ? null : result.error.status).toBe(401);
    expect(readFavorite).toHaveBeenCalledTimes(1);
  });

  // On this branch there is no discovery module on the server, so every probe answers 404 from the
  // not-found handler. The screen should reach its empty state in one request, not twenty.
  it('stops at the first missing-endpoint status', async () => {
    for (const status of [404, 405, 501]) {
      const readFavorite = vi.fn(() => Promise.resolve(err(favoritesHttpFailure(status))));

      const result = await collectFavorites({
        candidates: candidates('drm_1', 'drm_2', 'drm_3'),
        concurrency: 1,
        readFavorite,
      });

      expect(result.ok, String(status)).toBe(false);
      expect(readFavorite, String(status)).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * A session that expires mid-fan-out ends the read even though earlier probes succeeded. Showing
   * the rows collected so far under a sign-in prompt would present a fragment of the list as the
   * list, on the screen whose one job is to keep those two apart.
   */
  it('ends the read even when rows were already found', async () => {
    const result = await collectFavorites({
      candidates: candidates('drm_1', 'drm_2'),
      concurrency: 1,
      readFavorite: (dramaId) =>
        dramaId === 'drm_1'
          ? Promise.resolve(followedAt('drm_1', AUGUST_1))
          : Promise.resolve(err(favoritesHttpFailure(401))),
    });

    expect(result.ok).toBe(false);
  });
});

/**
 * A probe that timed out is neither. The read goes on, and the answer says it is incomplete — a hole
 * in this list is indistinguishable from a drama the viewer never followed, which reads as the
 * product having silently un-followed something.
 */
describe('a probe failure that is neither', () => {
  it('keeps the rows it did resolve and reports the read as incomplete', async () => {
    const result = await collectFavorites({
      candidates: candidates('drm_1', 'drm_2', 'drm_3'),
      concurrency: 1,
      readFavorite: (dramaId) =>
        dramaId === 'drm_2'
          ? Promise.resolve(err(offlineFailure()))
          : Promise.resolve(followedAt(dramaId, AUGUST_1)),
    });

    expect(result.ok ? result.value.entries.map((entry) => entry.drama.id) : null).toEqual([
      'drm_1',
      'drm_3',
    ]);
    expect(result.ok ? result.value.unresolved?.kind : null).toBe('OFFLINE');
    expect(result.ok ? result.value.answered : null).toBe(2);
  });

  it('goes on probing rather than giving up on the remaining candidates', async () => {
    const readFavorite = vi.fn((dramaId: string) =>
      dramaId === 'drm_1'
        ? Promise.resolve(err(offlineFailure()) as Result<FavoriteState, ApiFailure>)
        : Promise.resolve(ok(unfollowedState(dramaId))),
    );

    await collectFavorites({
      candidates: candidates('drm_1', 'drm_2', 'drm_3'),
      concurrency: 1,
      readFavorite,
    });

    expect(readFavorite).toHaveBeenCalledTimes(3);
  });

  // The first one, so the reported failure is the one whose trace id is oldest and most likely to
  // still be findable in a log.
  it('reports the first unresolved failure and not the last', async () => {
    const result = await collectFavorites({
      candidates: candidates('drm_1', 'drm_2'),
      concurrency: 1,
      readFavorite: (dramaId) =>
        Promise.resolve(
          err(
            dramaId === 'drm_1'
              ? favoritesHttpFailure(500, { traceId: 'trace_first' })
              : favoritesHttpFailure(503, { traceId: 'trace_second' }),
          ),
        ),
    });

    expect(result.ok ? result.value.unresolved?.traceId : null).toBe('trace_first');
  });

  it('reports a malformed row as unresolved rather than as an un-followed drama', async () => {
    const result = await collectFavorites({
      candidates: candidates('drm_1'),
      readFavorite: () =>
        Promise.resolve(err({ ...offlineFailure(), kind: 'MALFORMED' } as ApiFailure)),
    });

    expect(result.ok ? result.value : null).toMatchObject({ entries: [], answered: 0 });
    expect(result.ok ? result.value.unresolved?.kind : null).toBe('MALFORMED');
  });
});

describe('the order of the list', () => {
  function entry(id: string, favoritedAt: string | null): FavoriteEntry {
    return { drama: dramaSummary({ id }), favoritedAt };
  }

  it('puts the most recently followed first, which is the order SCR-08 reads in', () => {
    const ordered = orderFavorites([
      entry('drm_1', AUGUST_1),
      entry('drm_3', AUGUST_3),
      entry('drm_2', AUGUST_2),
    ]);

    expect(ordered.map((row) => row.drama.id)).toEqual(['drm_3', 'drm_2', 'drm_1']);
  });

  /**
   * Without the tiebreak the order of two rows followed in the same millisecond is the order the
   * probes happened to resolve in, which changes between renders and moves a row out from under the
   * viewer's finger.
   */
  it('breaks a tie by drama id so the order is stable across renders', () => {
    const ordered = orderFavorites([entry('drm_b', AUGUST_1), entry('drm_a', AUGUST_1)]);
    expect(ordered.map((row) => row.drama.id)).toEqual(['drm_a', 'drm_b']);
  });

  // Promoting the rows we know least about to the top of the screen would be the alternative.
  it('sorts a row with no usable timestamp last', () => {
    const ordered = orderFavorites([
      entry('drm_1', null),
      entry('drm_2', AUGUST_1),
      entry('drm_3', 'not a date'),
    ]);

    expect(ordered.map((row) => row.drama.id)).toEqual(['drm_2', 'drm_1', 'drm_3']);
  });

  // Text order agrees with time order for the server's own format and disagrees for an offset one.
  it('compares timestamps as instants rather than as text', () => {
    const ordered = orderFavorites([
      entry('drm_early', '2026-08-02T01:00:00.000Z'),
      entry('drm_late', '2026-08-02T05:00:00.000+03:00'),
    ]);

    expect(ordered.map((row) => row.drama.id)).toEqual(['drm_late', 'drm_early']);
  });

  it('leaves the input alone', () => {
    const input = [entry('drm_1', AUGUST_1), entry('drm_2', AUGUST_2)];
    orderFavorites(input);

    expect(input.map((row) => row.drama.id)).toEqual(['drm_1', 'drm_2']);
  });
});
