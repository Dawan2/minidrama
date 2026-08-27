import type {
  DramaLastWatched,
  DramaProgressItem,
  DramaProgressView,
  Result,
  WatchProgressReport,
} from '@minidrama/shared';

import { asRecord, narrow } from './narrow';
import { apiFailure } from './failure';
import type { ApiFailure } from './failure';
import type { HttpReader, HttpWriter } from './http';

/**
 * The per-drama progress read: "which episodes of this drama has this viewer finished".
 *
 * One endpoint, `GET /v1/progress/dramas/{dramaId}` (`docs/12-api-contracts.md` §4.7). PNL-01
 * paints watched marks from it, and only from it. There is no client-side "everything before the
 * current cell is watched", and there is no loop of `GET /v1/progress/episodes/{episodeId}` —
 * that path is a resume read for one episode, and N of those for an 80-episode grid is not a
 * substitute for a batch the contract now has.
 *
 * Fail-closed: a missing `items` array, a non-boolean `completed`, or a body that is not an
 * object is `MALFORMED`. The picker treats that as "no marks", never as a guessed range. An
 * in-progress row (`completed: false`) is a stored fact and is not a watched mark.
 *
 * Auth is required on the server. An anonymous call answers `401`; this client does not invent
 * an empty view for that, because empty is "signed in, watched nothing".
 *
 * The write is `PUT /v1/progress/episodes/{episodeId}` (`docs/12-api-contracts.md` §4.7). It is
 * the heartbeat and the exit flush. The server computes `completed`; extra keys a caller stuffed
 * onto the report (`completed`, Beans, an unlock) are dropped rather than forwarded.
 */

export function dramaProgressEndpoint(dramaId: string): string {
  return `/v1/progress/dramas/${encodeURIComponent(dramaId)}`;
}

export function episodeProgressEndpoint(episodeId: string): string {
  return `/v1/progress/episodes/${encodeURIComponent(episodeId)}`;
}

export interface ProgressApi {
  fetchDramaProgress(dramaId: string): Promise<Result<DramaProgressView, ApiFailure>>;
  reportEpisodeProgress(
    episodeId: string,
    report: WatchProgressReport,
  ): Promise<Result<void, ApiFailure>>;
}

export function createProgressApi(http: HttpReader & HttpWriter): ProgressApi {
  return {
    fetchDramaProgress: async (dramaId) => {
      const body = await http.getJson(dramaProgressEndpoint(dramaId));
      return body.ok ? narrow(body.value, narrowDramaProgressView) : body;
    },

    reportEpisodeProgress: async (episodeId, report) => {
      const wire = toWireProgressReport(episodeId, report);
      if (wire === null) {
        return {
          ok: false,
          error: apiFailure({
            kind: 'MALFORMED',
            message: 'watch progress report is not a position the server can store',
          }),
        };
      }
      return http.send('PUT', episodeProgressEndpoint(episodeId), { body: wire });
    },
  };
}

/**
 * Episode ids the picker may paint as watched.
 *
 * `lastWatched` is ignored on purpose. Using it as a range — every `episodeNumber` at or below
 * it — is how a skip marks thirty cells the viewer never opened.
 */
export function watchedEpisodeIds(view: DramaProgressView): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const item of view.items) {
    if (item.completed) {
      ids.add(item.episodeId);
    }
  }
  return ids;
}

export function narrowDramaProgressView(value: unknown): DramaProgressView | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const rawItems = record['items'];
  if (!Array.isArray(rawItems)) {
    return null;
  }

  const items: DramaProgressItem[] = [];
  for (const raw of rawItems) {
    const item = narrowDramaProgressItem(raw);
    if (item === null) {
      return null;
    }
    items.push(item);
  }

  const lastWatched = narrowLastWatched(record['lastWatched']);
  if (lastWatched === undefined) {
    return null;
  }

  return { items, lastWatched };
}

function narrowDramaProgressItem(value: unknown): DramaProgressItem | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const episodeId = record['episodeId'];
  const episodeNumber = record['episodeNumber'];
  const positionSec = record['positionSec'];
  const completed = record['completed'];

  if (typeof episodeId !== 'string' || episodeId.length === 0) {
    return null;
  }
  if (!isPositiveInteger(episodeNumber) || !isNonNegativeInteger(positionSec)) {
    return null;
  }
  if (typeof completed !== 'boolean') {
    return null;
  }

  return { episodeId, episodeNumber, positionSec, completed };
}

/**
 * `null` is a value. `undefined` (the key missing, or a malformed object) is a narrowing failure.
 */
function narrowLastWatched(value: unknown): DramaLastWatched | null | undefined {
  if (value === null) {
    return null;
  }

  const record = asRecord(value);
  if (record === null) {
    return undefined;
  }

  const episodeId = record['episodeId'];
  const episodeNumber = record['episodeNumber'];
  const positionSec = record['positionSec'];

  if (typeof episodeId !== 'string' || episodeId.length === 0) {
    return undefined;
  }
  if (!isPositiveInteger(episodeNumber) || !isNonNegativeInteger(positionSec)) {
    return undefined;
  }

  return { episodeId, episodeNumber, positionSec };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * The three fields the contract names, and nothing else.
 *
 * `completed` is a server-computed metric (`packages/shared/src/progress.ts`). Copying a client
 * boolean, a Beans amount, or an unlock receipt into this body is how a heartbeat becomes a
 * grant. A malformed observation is `MALFORMED` here rather than a network call the server would
 * have to refuse.
 */
export function toWireProgressReport(
  episodeId: string,
  report: WatchProgressReport,
): WatchProgressReport | null {
  if (typeof episodeId !== 'string' || episodeId.length === 0) {
    return null;
  }
  if (!isNonNegativeInteger(report.positionSec)) {
    return null;
  }
  if (!isPositiveInteger(report.durationSec)) {
    return null;
  }
  if (typeof report.clientUpdatedAt !== 'string' || report.clientUpdatedAt.length === 0) {
    return null;
  }
  if (!Number.isFinite(Date.parse(report.clientUpdatedAt))) {
    return null;
  }

  return {
    positionSec: report.positionSec,
    durationSec: report.durationSec,
    clientUpdatedAt: report.clientUpdatedAt,
  };
}
