/**
 * Scrub inference from VePlayer `timeupdate` (`docs/design/player-state-machine.md` §4.3).
 *
 * The progress bar is a kept plugin, so the user can seek through UI we do not own and may not
 * receive a dedicated seek event. A seek is inferred from a position discontinuity:
 *   - backward by more than 1 s, or
 *   - forward by more than 1.5 × the wall-clock interval.
 *
 * Same-tick updates have no measurable rate, so they are not a forward seek. The state's only
 * jobs are suppress the heartbeat and flush at the new position — never a second `PLAY_START`.
 */

export const SEEK_BACKWARD_SEC = 1;
export const SEEK_FORWARD_WALL_MULTIPLIER = 1.5;

export interface SeekObservation {
  readonly positionSec: number;
  readonly atMs: number;
}

export function isSeekDiscontinuity(previous: SeekObservation, next: SeekObservation): boolean {
  const delta = next.positionSec - previous.positionSec;
  if (delta < -SEEK_BACKWARD_SEC) {
    return true;
  }
  const wallSec = Math.max(0, (next.atMs - previous.atMs) / 1000);
  if (wallSec === 0) {
    return false;
  }
  return delta > SEEK_FORWARD_WALL_MULTIPLIER * wallSec;
}
