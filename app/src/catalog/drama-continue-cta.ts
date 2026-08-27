import type { DramaLastWatched } from '@minidrama/shared';

/**
 * The SCR-04 primary button: Watch now vs Continue watching.
 *
 * Continue is a pointer from `GET /v1/progress/dramas/{dramaId}` `lastWatched`, the same batch
 * read PNL-01 already uses. Catalogue `viewer.lastWatched` stays unused here because that field
 * is still always `null` on `GET /v1/dramas/{id}` (`server/src/modules/catalog/routes.ts`).
 * Guessing a resume from the episode list, from HOME's rail, or from watch-history would be a
 * second source, and a missing progress read is "Watch now" — not a invented continue.
 *
 * The href is the episode id only. Resume position is a playback-session fact
 * (`resumePositionSec` → VePlayer `startTime`). Putting `positionSec` on the URL would be a
 * client-side seek the player already refuses to take from the catalogue duration.
 */

export type DramaPrimaryCta =
  | { readonly kind: 'continue'; readonly episodeId: string; readonly episodeNumber: number }
  | { readonly kind: 'watch'; readonly episodeId: string };

export interface DramaPrimaryCtaInput {
  /**
   * `undefined` means the progress read has not produced a view (in flight, 401, network,
   * malformed). That is not "watched nothing". Fail closed: Watch now, or omit.
   */
  readonly lastWatched: DramaLastWatched | null | undefined;
  /** First episode on the loaded page the viewer may actually open. Absent → no Watch now. */
  readonly openableEpisodeId: string | undefined;
}

export function dramaPrimaryCta(input: DramaPrimaryCtaInput): DramaPrimaryCta | null {
  if (input.lastWatched !== null && input.lastWatched !== undefined) {
    return {
      kind: 'continue',
      episodeId: input.lastWatched.episodeId,
      episodeNumber: input.lastWatched.episodeNumber,
    };
  }

  if (input.openableEpisodeId === undefined) {
    return null;
  }

  return { kind: 'watch', episodeId: input.openableEpisodeId };
}
