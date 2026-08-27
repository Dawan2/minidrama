import { err, ok } from '@minidrama/shared';
import type { Page, Result, WatchHistoryEntry } from '@minidrama/shared';

import type { WatchProgressRecord } from './progress.js';
import type { WatchedEpisodeFacts } from './catalog-port.js';

/**
 * The watch-history list, as pure functions.
 *
 * Everything that decides *what the list contains and in what order* lives here rather than in the
 * route, for the same reason the merge rules live in `progress.ts`: these are the parts that will be
 * argued about, and a handler that decided them inline would be a place where the answers are only
 * ever asserted through HTTP.
 *
 * Three decisions are worth reading before changing anything:
 *
 *   - **the list is per drama, not per episode.** Storage is keyed `(userId, episodeId)`, so a
 *     viewer eleven episodes into one drama has eleven rows. Serving those as eleven history entries
 *     would bury every other drama they watch behind one they are already deep into. The newest row
 *     per drama survives; the rest are the *reason* the newest one is interesting;
 *   - **the sort key is the server's `updatedAtMs`, never the client's `clientUpdatedAtMs`.** The
 *     second is a value a device chooses, and a device with a clock a year ahead would pin itself to
 *     the top of that viewer's history until the row was evicted;
 *   - **an episode the catalogue cannot describe is dropped, not defaulted.** A row with an invented
 *     title and no cover is a tappable dead end. Dropping it costs the viewer one entry; rendering
 *     it costs them a broken screen and us the bug report.
 */

/** What the client gets when it does not ask. One screen of a phone-sized list. */
export const WATCH_HISTORY_DEFAULT_LIMIT = 20;

/**
 * The most rows one response will carry. A ceiling rather than an error: a client asking for 200 is
 * asking for a page size we do not serve, and refusing the request would break a screen over a
 * number we are happy to clamp (`docs/12-api-contracts.md` §2.3).
 */
export const WATCH_HISTORY_MAX_LIMIT = 50;

/**
 * How many progress rows are read to build one page.
 *
 * The two counts differ because grouping happens *after* the read: a page of 20 dramas can need any
 * number of episode rows, and there is no bound on how many episodes of one drama a viewer has
 * watched. This number is the compromise, and it is a real limit rather than a formality — a viewer
 * whose newest 500 rows all belong to a handful of dramas will not see their older dramas on the
 * list. That is a bounded scan, which the durable implementation replaces with `DISTINCT ON
 * (drama_id)` in SQL, where the grouping happens in the index and this constant disappears.
 */
export const WATCH_HISTORY_SCAN_LIMIT = 500;

/**
 * The position of the last row a page emitted.
 *
 * `updatedAtMs` alone is not a stable key: two rows can share a millisecond, and a page boundary
 * that falls between them would either repeat one or skip one. The drama id is the tie-break, and
 * ordering by `(updatedAtMs desc, dramaId asc)` makes the sequence total.
 */
export interface WatchHistoryCursor {
  readonly watchedAtMs: number;
  readonly dramaId: string;
}

export interface WatchHistoryQuery {
  readonly limit: number;
  /** `null` for the first page. */
  readonly after: WatchHistoryCursor | null;
}

export interface WatchHistoryQueryFailure {
  readonly field: 'limit' | 'cursor';
  readonly reason: 'not_an_integer' | 'out_of_range' | 'malformed';
}

const CURSOR_VERSION = 'v1';

/**
 * Cursors are opaque to clients (`docs/12-api-contracts.md` §2.3): they echo what they were given
 * and never parse it. The encoding is base64url of a versioned triple — readable by us in a log,
 * unattractive to parse by anyone else, and versioned so that changing the sort order does not
 * silently reinterpret a cursor minted under the old one.
 *
 * A cursor carries no identity and is never used to look anything up: it is compared against rows
 * that were already fetched for the requesting viewer. So a cursor from another viewer's page is not
 * a way to read their history — it is a way to skip part of your own.
 */
export function encodeWatchHistoryCursor(cursor: WatchHistoryCursor): string {
  return Buffer.from(`${CURSOR_VERSION}:${cursor.watchedAtMs}:${cursor.dramaId}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeWatchHistoryCursor(value: string): WatchHistoryCursor | null {
  // `split` with a limit of 3 would truncate a drama id containing a colon; taking the head twice
  // and keeping the remainder verbatim means the id round-trips whatever it contains.
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  const firstColon = decoded.indexOf(':');
  const secondColon = decoded.indexOf(':', firstColon + 1);
  if (firstColon === -1 || secondColon === -1) return null;

  if (decoded.slice(0, firstColon) !== CURSOR_VERSION) return null;

  const watchedAtMs = Number(decoded.slice(firstColon + 1, secondColon));
  const dramaId = decoded.slice(secondColon + 1);
  if (!Number.isSafeInteger(watchedAtMs) || dramaId.length === 0) return null;

  return { watchedAtMs, dramaId };
}

/** The raw query string, as Fastify hands it over: present or absent, string or not. */
export interface RawWatchHistoryQuery {
  readonly limit?: unknown;
  readonly cursor?: unknown;
}

/**
 * Validates the two query parameters.
 *
 * `limit` is clamped rather than refused at the top end and refused rather than clamped when it is
 * not a number at all. The difference is deliberate: `limit=200` is a client asking for more than we
 * serve, which we can answer, while `limit=abc` is a client bug that a silent default would hide
 * until someone wondered why paging never worked.
 */
export function parseWatchHistoryQuery(
  raw: RawWatchHistoryQuery,
): Result<WatchHistoryQuery, WatchHistoryQueryFailure> {
  let limit = WATCH_HISTORY_DEFAULT_LIMIT;

  if (raw.limit !== undefined && raw.limit !== '') {
    // Query strings are strings. `Number` is used rather than `parseInt` because `parseInt('3x')` is
    // 3, and a request for `3x` episodes is a request we do not understand.
    const asNumber = typeof raw.limit === 'number' ? raw.limit : Number(raw.limit);
    if (!Number.isSafeInteger(asNumber)) {
      return err({ field: 'limit', reason: 'not_an_integer' });
    }
    if (asNumber < 1) {
      return err({ field: 'limit', reason: 'out_of_range' });
    }
    limit = Math.min(asNumber, WATCH_HISTORY_MAX_LIMIT);
  }

  let after: WatchHistoryCursor | null = null;

  if (raw.cursor !== undefined && raw.cursor !== '') {
    if (typeof raw.cursor !== 'string') {
      return err({ field: 'cursor', reason: 'malformed' });
    }
    after = decodeWatchHistoryCursor(raw.cursor);
    // A cursor we cannot read is refused rather than treated as "start from the beginning".
    // Silently restarting the list is an infinite scroll that never ends and never repeats visibly.
    if (after === null) {
      return err({ field: 'cursor', reason: 'malformed' });
    }
  }

  return ok({ limit, after });
}

export interface WatchHistoryProjectionInput {
  /** The viewer's progress rows, in any order. */
  readonly rows: readonly WatchProgressRecord[];
  /** What the catalogue could say about the episodes in `rows`. Missing keys drop their row. */
  readonly facts: ReadonlyMap<string, WatchedEpisodeFacts>;
  readonly query: WatchHistoryQuery;
}

interface RankedEntry {
  readonly entry: WatchHistoryEntry;
  readonly watchedAtMs: number;
  readonly dramaId: string;
}

/**
 * `(updatedAtMs desc, dramaId asc)`. Total, so a page boundary can never repeat or skip a row.
 *
 * The tie-break compares code units rather than calling `localeCompare`, whose result depends on the
 * host's locale. A cursor is a promise about an ordering, and an ordering that differs between two
 * instances of the same service is a promise it cannot keep.
 */
function comparePosition(left: WatchHistoryCursor, right: WatchHistoryCursor): number {
  if (left.watchedAtMs !== right.watchedAtMs) return right.watchedAtMs - left.watchedAtMs;
  if (left.dramaId === right.dramaId) return 0;

  return left.dramaId < right.dramaId ? -1 : 1;
}

/**
 * Turns progress rows plus catalogue facts into one page of history.
 *
 * Pure, and given the rows rather than the store, so the grouping, the ordering and the page
 * boundary are all testable without an HTTP request or a clock.
 */
export function projectWatchHistory(input: WatchHistoryProjectionInput): Page<WatchHistoryEntry> {
  const newestPerDrama = new Map<
    string,
    { readonly row: WatchProgressRecord; readonly facts: WatchedEpisodeFacts }
  >();

  for (const row of input.rows) {
    const facts = input.facts.get(row.episodeId);
    // The catalogue could not describe this episode: deleted, unpublished, or withdrawn. There is no
    // row to draw for it, so it does not become one.
    if (facts === undefined) continue;

    const held = newestPerDrama.get(facts.drama.id);
    // Strictly newer, so rows sharing a millisecond keep the first one seen. The store hands rows
    // over newest-first, which makes that the newer of the two under any stable read.
    if (held === undefined || row.updatedAtMs > held.row.updatedAtMs) {
      newestPerDrama.set(facts.drama.id, { row, facts });
    }
  }

  const ranked: RankedEntry[] = [...newestPerDrama.values()].map(({ row, facts }) => ({
    watchedAtMs: row.updatedAtMs,
    dramaId: facts.drama.id,
    entry: {
      drama: facts.drama,
      lastEpisodeNumber: facts.globalEpisodeNumber,
      lastPositionSec: row.positionSec,
      watchedAt: new Date(row.updatedAtMs).toISOString(),
      lastEpisodeId: row.episodeId,
    },
  }));

  ranked.sort(comparePosition);

  const after = input.query.after;
  const remaining =
    after === null ? ranked : ranked.filter((candidate) => comparePosition(candidate, after) > 0);

  const page = remaining.slice(0, input.query.limit);
  const hasMore = remaining.length > page.length;
  const last = page.at(-1);

  return {
    items: page.map((position) => position.entry),
    pageInfo: {
      // `nextCursor` is non-null exactly when `hasMore` is true, which is the invariant the client's
      // page narrowing checks. A cursor handed out alongside `hasMore: false` would be a cursor the
      // client is entitled to follow into an empty page.
      nextCursor:
        hasMore && last !== undefined
          ? encodeWatchHistoryCursor({ watchedAtMs: last.watchedAtMs, dramaId: last.dramaId })
          : null,
      hasMore,
    },
  };
}
