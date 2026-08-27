import { describe, expect, it } from 'vitest';
import type { DramaSummary, Page, WatchHistoryEntry } from '@minidrama/shared';

import {
  WATCH_HISTORY_DEFAULT_LIMIT,
  WATCH_HISTORY_MAX_LIMIT,
  decodeWatchHistoryCursor,
  encodeWatchHistoryCursor,
  parseWatchHistoryQuery,
  projectWatchHistory,
} from './history.js';
import type { WatchProgressRecord } from './progress.js';
import type { WatchedEpisodeFacts } from './catalog-port.js';

const NOW_MS = Date.parse('2026-08-27T12:00:00.000Z');
const MINUTE_MS = 60_000;

function drama(id: string): DramaSummary {
  return {
    id,
    title: `Drama ${id}`,
    coverUrl: `https://cdn.example.invalid/${id}.jpg`,
    category: 'ROMANCE',
    tags: [],
    totalEpisodes: 20,
    freeEpisodes: 3,
    isCompleted: false,
    stat: { playCount: 0, favoriteCount: 0, score: 0 },
  };
}

function row(overrides: Partial<WatchProgressRecord> = {}): WatchProgressRecord {
  return {
    userId: 'user_a',
    episodeId: 'ep_1',
    positionSec: 45,
    durationSec: 95,
    completed: false,
    clientUpdatedAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
    ...overrides,
  };
}

/** `[episodeId, dramaId, globalEpisodeNumber]`, the shape the catalogue port answers with. */
function factsFor(
  ...entries: readonly (readonly [string, string, number])[]
): ReadonlyMap<string, WatchedEpisodeFacts> {
  const summaries = new Map<string, DramaSummary>();
  const facts = new Map<string, WatchedEpisodeFacts>();

  for (const [episodeId, dramaId, globalEpisodeNumber] of entries) {
    const summary = summaries.get(dramaId) ?? drama(dramaId);
    summaries.set(dramaId, summary);
    facts.set(episodeId, { drama: summary, globalEpisodeNumber });
  }

  return facts;
}

function project(
  rows: readonly WatchProgressRecord[],
  facts: ReadonlyMap<string, WatchedEpisodeFacts>,
  limit = WATCH_HISTORY_DEFAULT_LIMIT,
  cursor: string | null = null,
): Page<WatchHistoryEntry> {
  const query = parseWatchHistoryQuery({
    limit,
    ...(cursor === null ? {} : { cursor }),
  });
  if (!query.ok) throw new Error(`the test built an invalid query: ${query.error.field}`);

  return projectWatchHistory({ rows, facts, query: query.value });
}

describe('parseWatchHistoryQuery', () => {
  it('defaults to one screen and no cursor', () => {
    expect(parseWatchHistoryQuery({})).toEqual({
      ok: true,
      value: { limit: WATCH_HISTORY_DEFAULT_LIMIT, after: null },
    });
  });

  it('reads a limit sent as a query string', () => {
    expect(parseWatchHistoryQuery({ limit: '5' })).toMatchObject({ value: { limit: 5 } });
  });

  it('treats an empty parameter as absent, because that is how a client builds a URL', () => {
    expect(parseWatchHistoryQuery({ limit: '', cursor: '' })).toEqual({
      ok: true,
      value: { limit: WATCH_HISTORY_DEFAULT_LIMIT, after: null },
    });
  });

  // A page size we do not serve is a number we can answer; refusing would break a screen over it.
  it('clamps a limit above the ceiling rather than refusing it', () => {
    expect(parseWatchHistoryQuery({ limit: '5000' })).toMatchObject({
      value: { limit: WATCH_HISTORY_MAX_LIMIT },
    });
  });

  // `limit=abc` is a client bug, and a silent default would hide it until someone wondered why
  // paging never worked.
  it.each(['abc', '3x', '1.5', 'NaN', 'Infinity'])('refuses the limit %s', (limit) => {
    expect(parseWatchHistoryQuery({ limit })).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'not_an_integer' },
    });
  });

  it.each(['0', '-1'])('refuses the limit %s as out of range', (limit) => {
    expect(parseWatchHistoryQuery({ limit })).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'out_of_range' },
    });
  });

  it('accepts a cursor it minted', () => {
    const cursor = encodeWatchHistoryCursor({ watchedAtMs: NOW_MS, dramaId: 'drm_a' });

    expect(parseWatchHistoryQuery({ cursor })).toEqual({
      ok: true,
      value: {
        limit: WATCH_HISTORY_DEFAULT_LIMIT,
        after: { watchedAtMs: NOW_MS, dramaId: 'drm_a' },
      },
    });
  });

  // Restarting the list silently is an infinite scroll that never ends and never visibly repeats.
  it.each(['not-base64!!', 'Zm9v', 'v2:1:drm_a'])(
    'refuses the unreadable cursor %s rather than starting over',
    (cursor) => {
      expect(parseWatchHistoryQuery({ cursor })).toEqual({
        ok: false,
        error: { field: 'cursor', reason: 'malformed' },
      });
    },
  );

  it('refuses a cursor that is not a string', () => {
    expect(parseWatchHistoryQuery({ cursor: 42 })).toEqual({
      ok: false,
      error: { field: 'cursor', reason: 'malformed' },
    });
  });
});

describe('watch-history cursors', () => {
  it('round-trips a position', () => {
    const cursor = { watchedAtMs: NOW_MS, dramaId: 'drm_01J6ABC' };

    expect(decodeWatchHistoryCursor(encodeWatchHistoryCursor(cursor))).toEqual(cursor);
  });

  // The identifier is opaque to us as well: a separator inside it must not truncate it.
  it('round-trips a drama id containing the separator', () => {
    const cursor = { watchedAtMs: NOW_MS, dramaId: 'drm:with:colons' };

    expect(decodeWatchHistoryCursor(encodeWatchHistoryCursor(cursor))).toEqual(cursor);
  });

  it('is opaque: the encoded form is not the position', () => {
    const encoded = encodeWatchHistoryCursor({ watchedAtMs: NOW_MS, dramaId: 'drm_a' });

    expect(encoded).not.toContain('drm_a');
    expect(encoded).not.toContain(String(NOW_MS));
  });

  // A cursor is a promise about an ordering. A version means changing the ordering cannot silently
  // reinterpret cursors minted under the old one.
  it('refuses a cursor from another version of the ordering', () => {
    const foreign = Buffer.from(`v2:${NOW_MS}:drm_a`, 'utf8').toString('base64url');

    expect(decodeWatchHistoryCursor(foreign)).toBeNull();
  });

  it.each([
    ['a missing drama id', `v1:${NOW_MS}:`],
    ['a non-numeric timestamp', 'v1:yesterday:drm_a'],
    ['a fractional timestamp', 'v1:1.5:drm_a'],
    ['no separators at all', 'v1'],
  ])('refuses %s', (_case, decoded) => {
    expect(decodeWatchHistoryCursor(Buffer.from(decoded, 'utf8').toString('base64url'))).toBeNull();
  });
});

describe('projectWatchHistory', () => {
  it('answers an empty page for a viewer with no rows', () => {
    expect(project([], factsFor())).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });

  it('carries the five fields the history screen renders', () => {
    const page = project(
      [row({ episodeId: 'ep_11', positionSec: 63, updatedAtMs: NOW_MS })],
      factsFor(['ep_11', 'drm_a', 11]),
    );

    expect(page.items).toEqual([
      {
        drama: drama('drm_a'),
        lastEpisodeNumber: 11,
        lastPositionSec: 63,
        watchedAt: '2026-08-27T12:00:00.000Z',
        lastEpisodeId: 'ep_11',
      },
    ]);
  });

  // The field the client registered as a contract gap: `#/play/:episodeId` needs an id, and an
  // episode number is not one. Without it the row can only open the drama.
  it('names the episode to resume, not just its number', () => {
    const page = project(
      [row({ episodeId: 'ep_fx_s2e01' })],
      factsFor(['ep_fx_s2e01', 'drm_a', 11]),
    );

    expect(page.items[0]?.lastEpisodeId).toBe('ep_fx_s2e01');
    expect(page.items[0]?.lastEpisodeNumber).toBe(11);
  });

  // Eleven episodes of one drama is one history row. Serving eleven would bury every other drama
  // behind the one the viewer is already deep into.
  it('keeps one row per drama, the newest', () => {
    const page = project(
      [
        row({ episodeId: 'ep_1', updatedAtMs: NOW_MS - 3 * MINUTE_MS, positionSec: 10 }),
        row({ episodeId: 'ep_2', updatedAtMs: NOW_MS, positionSec: 20 }),
        row({ episodeId: 'ep_3', updatedAtMs: NOW_MS - MINUTE_MS, positionSec: 30 }),
      ],
      factsFor(['ep_1', 'drm_a', 1], ['ep_2', 'drm_a', 2], ['ep_3', 'drm_a', 3]),
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ lastEpisodeId: 'ep_2', lastEpisodeNumber: 2 });
  });

  it('orders dramas by the newest report, newest first', () => {
    const page = project(
      [
        row({ episodeId: 'ep_a', updatedAtMs: NOW_MS - 2 * MINUTE_MS }),
        row({ episodeId: 'ep_b', updatedAtMs: NOW_MS }),
        row({ episodeId: 'ep_c', updatedAtMs: NOW_MS - MINUTE_MS }),
      ],
      factsFor(['ep_a', 'drm_a', 1], ['ep_b', 'drm_b', 1], ['ep_c', 'drm_c', 1]),
    );

    expect(page.items.map((entry) => entry.drama.id)).toEqual(['drm_b', 'drm_c', 'drm_a']);
  });

  // A device with a clock a year ahead would otherwise pin itself to the top of this list.
  it('ignores the client’s clock when ordering', () => {
    const page = project(
      [
        row({
          episodeId: 'ep_a',
          updatedAtMs: NOW_MS - MINUTE_MS,
          clientUpdatedAtMs: NOW_MS + 365 * 24 * 60 * MINUTE_MS,
        }),
        row({ episodeId: 'ep_b', updatedAtMs: NOW_MS, clientUpdatedAtMs: NOW_MS }),
      ],
      factsFor(['ep_a', 'drm_a', 1], ['ep_b', 'drm_b', 1]),
    );

    expect(page.items.map((entry) => entry.drama.id)).toEqual(['drm_b', 'drm_a']);
  });

  // A row with an invented title and no cover is a tappable dead end.
  it('drops an episode the catalogue could not describe', () => {
    const page = project(
      [row({ episodeId: 'ep_known' }), row({ episodeId: 'ep_deleted' })],
      factsFor(['ep_known', 'drm_a', 1]),
    );

    expect(page.items.map((entry) => entry.lastEpisodeId)).toEqual(['ep_known']);
  });

  // The dropped row must not take its drama's other rows with it, or a withdrawn episode would
  // remove a drama the viewer is still watching.
  it('falls back to the newest describable episode of the same drama', () => {
    const page = project(
      [
        row({ episodeId: 'ep_withdrawn', updatedAtMs: NOW_MS }),
        row({ episodeId: 'ep_fine', updatedAtMs: NOW_MS - MINUTE_MS }),
      ],
      factsFor(['ep_fine', 'drm_a', 4]),
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ lastEpisodeId: 'ep_fine', lastEpisodeNumber: 4 });
  });

  it('reports the timestamp as ISO-8601 in UTC', () => {
    const page = project(
      [row({ updatedAtMs: Date.parse('2026-01-02T03:04:05.678Z') })],
      factsFor(['ep_1', 'drm_a', 1]),
    );

    expect(page.items[0]?.watchedAt).toBe('2026-01-02T03:04:05.678Z');
  });
});

describe('projectWatchHistory — paging', () => {
  /** Twenty-five dramas, one row each, one minute apart. `drm_00` is the newest. */
  const rows = Array.from({ length: 25 }, (_unused, index) =>
    row({ episodeId: `ep_${index}`, updatedAtMs: NOW_MS - index * MINUTE_MS }),
  );
  const facts = factsFor(
    ...rows.map(
      (record, index) => [record.episodeId, `drm_${String(index).padStart(2, '0')}`, 1] as const,
    ),
  );

  it('hands out a cursor exactly when there is more to read', () => {
    const page = project(rows, facts, 10);

    expect(page.items).toHaveLength(10);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo.nextCursor).not.toBeNull();
  });

  it('hands out no cursor on the last page', () => {
    const page = project(rows, facts, WATCH_HISTORY_MAX_LIMIT);

    expect(page.items).toHaveLength(25);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  // The property that makes a cursor worth having: walking the pages visits every row once.
  it('walks the whole list without repeating or skipping a row', () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 20; guard += 1) {
      const page: Page<WatchHistoryEntry> = project(rows, facts, 7, cursor);
      seen.push(...page.items.map((entry) => entry.drama.id));
      cursor = page.pageInfo.nextCursor;
      if (cursor === null) break;
    }

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe('drm_00');
    expect(seen.at(-1)).toBe('drm_24');
  });

  // Rows sharing a millisecond are the case a timestamp-only cursor gets wrong: the boundary either
  // repeats one or skips one, and it does so only under a tie, which is why it survives review.
  it('does not repeat or skip rows that share a timestamp', () => {
    const tied = Array.from({ length: 6 }, (_unused, index) =>
      row({ episodeId: `ep_tied_${index}`, updatedAtMs: NOW_MS }),
    );
    const tiedFacts = factsFor(
      ...tied.map((record, index) => [record.episodeId, `drm_tied_${index}`, 1] as const),
    );

    const first = project(tied, tiedFacts, 2);
    const second = project(tied, tiedFacts, 2, first.pageInfo.nextCursor);
    const third = project(tied, tiedFacts, 2, second.pageInfo.nextCursor);

    const seen = [...first.items, ...second.items, ...third.items].map((entry) => entry.drama.id);

    expect(seen).toEqual([
      'drm_tied_0',
      'drm_tied_1',
      'drm_tied_2',
      'drm_tied_3',
      'drm_tied_4',
      'drm_tied_5',
    ]);
    expect(third.pageInfo.hasMore).toBe(false);
  });
});
