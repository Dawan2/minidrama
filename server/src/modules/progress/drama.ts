import { err, ok } from '@minidrama/shared';
import type {
  DramaLastWatched,
  DramaProgressItem,
  DramaProgressView,
  Result,
} from '@minidrama/shared';

import type { DramaEpisodeRef } from './drama-catalog-port.js';
import type { WatchProgressRecord } from './progress.js';

/**
 * The per-drama progress view, as pure functions.
 *
 * The route reads the store and the catalogue port; this file decides what leaves. Two properties
 * are load-bearing:
 *
 *   - **`episodeNumber` comes from the catalogue ref, never from the episode id.** A suffix parse
 *     would mark season 2 episode 1 as episode 1. There is a test against `ep_dynasty_s2e01`.
 *   - **`completed` is the stored flag.** Re-deriving it from `positionSec` / `durationSec` here
 *     would be a second completion rule, and a row the write left incomplete would become a
 *     watched mark on the next read.
 *
 * Unreferenced store rows — another drama, a draft, an offline season — do not appear. The listed
 * set is the allowlist; anything else would be a guessed membership.
 */

/**
 * Bounds the map key, matching `catalog` / search. 64 is clear of a prefixed ULID and below
 * Fastify's default `maxParamLength` of 100.
 */
export const MAX_DRAMA_ID_LENGTH = 64;

export interface DramaIdFailure {
  readonly field: 'dramaId';
  readonly reason: 'required' | 'out_of_range';
}

export function validateDramaId(value: unknown): Result<string, DramaIdFailure> {
  if (typeof value !== 'string' || value.length === 0) {
    return err({ field: 'dramaId', reason: 'required' });
  }
  if (value.length > MAX_DRAMA_ID_LENGTH) {
    return err({ field: 'dramaId', reason: 'out_of_range' });
  }
  return ok(value);
}

export interface ProjectDramaProgressInput {
  readonly episodes: readonly DramaEpisodeRef[];
  readonly recordsByEpisodeId: ReadonlyMap<string, WatchProgressRecord>;
}

/**
 * Join listed episodes to stored rows. Order is the catalogue's global order, not recency:
 * the picker walks the same order, and a recency sort would paint cell 1 as cell 12.
 */
export function projectDramaProgress(input: ProjectDramaProgressInput): DramaProgressView {
  const items: DramaProgressItem[] = [];
  let lastWatched: DramaLastWatched | null = null;
  let lastWatchedAtMs = Number.NEGATIVE_INFINITY;

  for (const episode of input.episodes) {
    const record = input.recordsByEpisodeId.get(episode.episodeId);
    if (record === undefined) continue;

    items.push({
      episodeId: episode.episodeId,
      episodeNumber: episode.globalEpisodeNumber,
      positionSec: record.positionSec,
      completed: record.completed,
    });

    if (record.updatedAtMs >= lastWatchedAtMs) {
      lastWatchedAtMs = record.updatedAtMs;
      lastWatched = {
        episodeId: episode.episodeId,
        episodeNumber: episode.globalEpisodeNumber,
        positionSec: record.positionSec,
      };
    }
  }

  return { items, lastWatched };
}
