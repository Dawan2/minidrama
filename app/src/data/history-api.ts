import type { DramaSummary, Page, Result } from '@minidrama/shared';

import { asRecord, narrowPage } from './narrow';
import { narrowDramaSummary } from './catalog-api';
import type { ApiFailure } from './failure';
import type { HttpReader } from './http';

/**
 * The watch-history read: "what was I watching", as a list.
 *
 * One endpoint, `GET /v1/users/me/watch-history`, sorted `watchedAt` descending and paged like
 * every other list (`docs/12-api-contracts.md` §4.7). It is the only read in the client that is
 * **not** anonymous-capable: history belongs to a session, so the honest answers are a list, an
 * empty list, or `401` — and those are three different screens, which is the whole point of
 * `presentHistoryFailure`.
 *
 * It is kept apart from `CatalogApi` rather than added to it because the two have different
 * authentication properties and different failure vocabularies. Folding a session-scoped read into
 * the interface every anonymous surface depends on would mean every catalogue screen's test double
 * grows a method about identity that no catalogue screen can produce.
 *
 * **The server does not implement this endpoint yet.** There is no progress module under `server/`,
 * so a request today answers `404 COMMON_RESOURCE_NOT_FOUND` from the not-found handler. That is
 * not a client bug and it must not render as one — see `presentHistoryFailure`.
 */

export const WATCH_HISTORY_PATH = '/v1/users/me/watch-history';

/**
 * One row of the history list.
 *
 * The contract defines four fields, and this type carries a fifth: `lastEpisodeId`. The reason is
 * that the contract's four cannot address the player. `#/play/:episodeId` takes an episode id and
 * an episode *number* is not one (`docs/02-information-architecture.md` §5) — so a history row that
 * has only `lastEpisodeNumber` cannot offer the one-tap resume that is the entire product purpose
 * of this screen (`docs/02-user-journeys.md` J3, J8). The field is read tolerantly: when the server
 * sends it the row resumes, and when it does not the row opens the drama instead. Registered as a
 * contract gap rather than invented as a requirement — see `docs/handoff/w3-work-m.md` §5.
 */
export interface WatchHistoryEntry {
  readonly drama: DramaSummary;
  /** Counted in `globalEpisodeNumber`, the number the client displays everywhere else. */
  readonly lastEpisodeNumber: number;
  /** The resume point in seconds, or `null` when the server did not report one. */
  readonly lastPositionSec: number | null;
  /** ISO-8601. The server's sort key; the client never reorders by it. */
  readonly watchedAt: string | null;
  /** Present only when the server sends it. `null` degrades the row to the drama screen. */
  readonly lastEpisodeId: string | null;
}

export interface WatchHistoryRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface HistoryApi {
  fetchWatchHistory(
    request: WatchHistoryRequest,
  ): Promise<Result<Page<WatchHistoryEntry>, ApiFailure>>;
}

export function createHistoryApi(http: HttpReader): HistoryApi {
  return {
    fetchWatchHistory: async (request) => {
      const body = await http.getJson(WATCH_HISTORY_PATH, {
        cursor: request.cursor,
        limit: request.limit,
      });
      return body.ok ? narrowPage(body.value, narrowWatchHistoryEntry) : body;
    },
  };
}

/**
 * Strict about the two fields the row cannot be rendered without, tolerant about the rest.
 *
 * `drama` and `lastEpisodeNumber` are the row: a cover, a title and "continue episode N". Without
 * either there is nothing to draw, so the entry — and with it the page, as everywhere else in the
 * client — is rejected as `MALFORMED`.
 *
 * The resume point and the timestamp are read tolerantly on purpose. Neither drives a decision:
 * the position is the server's to apply when playback starts (`resumePositionSec` in the playback
 * token, contract §4.4), and the ordering is the server's too. Throwing away a viewer's whole
 * history because one entry arrived without a timestamp would cost them the list to protect
 * nothing.
 */
export function narrowWatchHistoryEntry(value: unknown): WatchHistoryEntry | null {
  const record = asRecord(value);
  if (record === null) return null;

  const drama = narrowDramaSummary(record['drama']);
  if (drama === null) return null;

  const lastEpisodeNumber = record['lastEpisodeNumber'];
  if (typeof lastEpisodeNumber !== 'number' || !Number.isFinite(lastEpisodeNumber)) return null;

  const lastPositionSec = record['lastPositionSec'];
  const watchedAt = record['watchedAt'];
  const lastEpisodeId = record['lastEpisodeId'];

  return {
    drama,
    lastEpisodeNumber,
    lastPositionSec:
      typeof lastPositionSec === 'number' && Number.isFinite(lastPositionSec)
        ? lastPositionSec
        : null,
    watchedAt: typeof watchedAt === 'string' ? watchedAt : null,
    lastEpisodeId: typeof lastEpisodeId === 'string' && lastEpisodeId !== '' ? lastEpisodeId : null,
  };
}
