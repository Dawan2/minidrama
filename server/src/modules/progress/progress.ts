import { err, ok } from '@minidrama/shared';
import type { Result, WatchProgressReport } from '@minidrama/shared';

/**
 * The watch-progress rules, as pure functions.
 *
 * Everything that decides *what is stored* lives here rather than in the route or the store, for
 * one reason: these rules are the part that will be argued about. A resume position that is two
 * seconds behind, a heartbeat that arrives out of order, a device with a wrong clock and a report
 * claiming a position past the end of the episode are all ordinary traffic, and each of them has a
 * different correct answer. A route handler that decided them inline would be a place where those
 * answers are asserted only through HTTP.
 *
 * The shape of the decision is also the shape the durable implementation needs. The eventual write
 * path is Redis-then-batched-upsert with the last-write-wins comparison in the SQL `WHERE` clause
 * (`docs/design/domain-model.md` §4.5), so `mergeReport` returns "store this / ignore that" rather
 * than performing a write, and the predicate it applies is the predicate that clause has to encode.
 */

export interface WatchProgressRules {
  /**
   * A report is `completed` at or above this fraction of the duration
   * (`docs/12-domain-model.md` §7.1).
   */
  readonly completionRatio: number;
  /**
   * How far past `durationSec` a position may sit before the report is refused rather than clamped.
   *
   * Small overshoot is arithmetic: the player reports fractional seconds against a duration it
   * rounds, and the final `timeupdate` of an episode routinely lands a hair past the end. Large
   * overshoot cannot be true of the episode being described, and `docs/12-error-catalog.md` §8
   * gives it its own code — accepting it by clamping would let a caller mark any episode complete
   * with one call, which is a completion-rate metric and a `PRG-001` completion flag.
   */
  readonly overshootToleranceSec: number;
  /**
   * A newer report whose position moved *backwards* by no more than this many seconds does not move
   * the stored position.
   *
   * This is the "backward noise" rule and it is a deliberate, bounded loss. Out-of-order heartbeats
   * are already handled by the timestamp comparison; what is left is jitter — the player's position
   * quantisation, a seek-preview scrub, a re-buffer that reports the previous keyframe. None of
   * those is a viewer decision, and honouring them costs the viewer a rewind they did not ask for.
   *
   * The bound is what makes it safe. A real backward seek is never two seconds; a viewer who rewinds
   * moves by more than that and is honoured exactly. Worst case, a viewer resumes up to
   * `backwardJitterToleranceSec` later than their true position, which stays inside `PRG-002`'s
   * ±5 second acceptance criterion. Setting it to `0` disables the rule and honours every backward
   * move, which is the reversal and costs one number.
   *
   * The report is still *accepted*: the timestamp and the duration advance, so the next legitimate
   * backward seek is compared against the newer timestamp and not against a stale one.
   */
  readonly backwardJitterToleranceSec: number;
  /**
   * How far ahead of server time a `clientUpdatedAt` may sit before it is pulled back to server
   * time.
   *
   * A client clock is not a clock we control. Left alone, a device set a year into the future wins
   * every last-write-wins comparison it ever takes part in — it would pin that user's progress for
   * that episode permanently, and no later report from any device could displace it. Clamping
   * degrades that device to server-arrival ordering, which is the ordering it would have had without
   * a timestamp at all. Rejecting instead was considered and refused: it would silently stop
   * recording progress for a user whose only fault is a wrong clock.
   */
  readonly futureSkewToleranceSec: number;
}

export const DEFAULT_WATCH_PROGRESS_RULES: WatchProgressRules = {
  completionRatio: 0.9,
  overshootToleranceSec: 2,
  backwardJitterToleranceSec: 2,
  futureSkewToleranceSec: 300,
};

/**
 * Bounds the map key, so a caller cannot spend our memory on identifiers it invented.
 *
 * 64 is well clear of a prefixed ULID (`ep_` plus 26 characters) and deliberately below Fastify's
 * default `maxParamLength` of 100 — past that the router refuses the request itself, with a 414 and
 * no view of which parameter was at fault. Keeping our bound the tighter of the two means the same
 * defect always gets the same answer.
 */
export const MAX_EPISODE_ID_LENGTH = 64;

/** A stored row. `Ms` suffixes are epoch milliseconds; the wire carries ISO 8601 both ways. */
export interface WatchProgressRecord {
  readonly userId: string;
  readonly episodeId: string;
  readonly positionSec: number;
  readonly durationSec: number;
  readonly completed: boolean;
  readonly clientUpdatedAtMs: number;
  readonly updatedAtMs: number;
}

/** A report that passed validation. Positions are integers; the clamp has not been applied yet. */
export interface ValidatedProgressReport {
  readonly positionSec: number;
  readonly durationSec: number;
  readonly clientUpdatedAtMs: number;
}

export type ProgressFieldReason =
  'required' | 'not_an_integer' | 'out_of_range' | 'not_a_timestamp';

export interface ProgressValidationFailure {
  readonly kind: 'VALIDATION';
  readonly field: 'positionSec' | 'durationSec' | 'clientUpdatedAt' | 'episodeId';
  readonly reason: ProgressFieldReason;
}

export interface ProgressPositionFailure {
  readonly kind: 'INVALID_POSITION';
  readonly positionSec: number;
  readonly durationSec: number;
}

export type ProgressReportFailure = ProgressValidationFailure | ProgressPositionFailure;

function validationFailure(
  field: ProgressValidationFailure['field'],
  reason: ProgressFieldReason,
): ProgressValidationFailure {
  return { kind: 'VALIDATION', field, reason };
}

/** Whole seconds only. A float position is a rounding argument nobody wants in a database. */
function isWholeSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function validateEpisodeId(value: unknown): Result<string, ProgressValidationFailure> {
  if (typeof value !== 'string' || value.length === 0) {
    return err(validationFailure('episodeId', 'required'));
  }
  if (value.length > MAX_EPISODE_ID_LENGTH) {
    return err(validationFailure('episodeId', 'out_of_range'));
  }
  return ok(value);
}

/**
 * Validates the report body and decides the position question, which is the only one with two
 * possible answers: a small overshoot is clamped to the duration, a large one is refused.
 *
 * Shape problems answer `COMMON_VALIDATION_FAILED` at the route; a position that cannot be true of
 * the episode answers `PROGRESS_INVALID_POSITION`. The split is worth keeping: the first is a client
 * bug and names the field, the second is a claim about content and names the numbers.
 */
export function validateProgressReport(
  body: Partial<WatchProgressReport> | undefined,
  rules: WatchProgressRules = DEFAULT_WATCH_PROGRESS_RULES,
): Result<ValidatedProgressReport, ProgressReportFailure> {
  const positionSec = body?.positionSec;
  const durationSec = body?.durationSec;
  const clientUpdatedAt = body?.clientUpdatedAt;

  if (positionSec === undefined) return err(validationFailure('positionSec', 'required'));
  if (!isWholeSeconds(positionSec)) return err(validationFailure('positionSec', 'not_an_integer'));

  if (durationSec === undefined) return err(validationFailure('durationSec', 'required'));
  if (!isWholeSeconds(durationSec)) return err(validationFailure('durationSec', 'not_an_integer'));
  // A zero or negative duration makes every ratio in this module either undefined or absurd, so it
  // is refused at the edge rather than guarded against at each use.
  if (durationSec <= 0) return err(validationFailure('durationSec', 'out_of_range'));

  if (clientUpdatedAt === undefined) {
    // Required, not defaulted to server time. Defaulting would make a client that omits the field
    // win every conflict against one that sends it, which is the opposite of the intended rule and
    // would be invisible until two devices disagreed.
    return err(validationFailure('clientUpdatedAt', 'required'));
  }
  if (typeof clientUpdatedAt !== 'string') {
    return err(validationFailure('clientUpdatedAt', 'not_a_timestamp'));
  }
  const clientUpdatedAtMs = Date.parse(clientUpdatedAt);
  if (!Number.isFinite(clientUpdatedAtMs)) {
    return err(validationFailure('clientUpdatedAt', 'not_a_timestamp'));
  }

  if (positionSec < 0) {
    return err({ kind: 'INVALID_POSITION', positionSec, durationSec });
  }
  if (positionSec > durationSec + rules.overshootToleranceSec) {
    return err({ kind: 'INVALID_POSITION', positionSec, durationSec });
  }

  return ok({
    positionSec: Math.min(positionSec, durationSec),
    durationSec,
    clientUpdatedAtMs,
  });
}

export function isCompleted(
  positionSec: number,
  durationSec: number,
  rules: WatchProgressRules = DEFAULT_WATCH_PROGRESS_RULES,
): boolean {
  return durationSec > 0 && positionSec / durationSec >= rules.completionRatio;
}

/**
 * Why a merge did what it did. The route only needs to know that it answers 204 either way, but the
 * decision is logged and asserted on, and a counter per decision is the cheapest way to notice that
 * a client release started losing every conflict.
 */
export type ProgressMergeDecision =
  'STORED' | 'IGNORED_STALE' | 'IGNORED_DUPLICATE' | 'ADVANCED_TIMESTAMP_ONLY';

export interface ProgressMergeOutcome {
  readonly decision: ProgressMergeDecision;
  /** The row to persist. Equal to `existing` when nothing changed, so a caller may compare by value. */
  readonly record: WatchProgressRecord;
}

export interface MergeReportInput {
  readonly existing: WatchProgressRecord | undefined;
  readonly userId: string;
  readonly episodeId: string;
  readonly report: ValidatedProgressReport;
  readonly nowMs: number;
  readonly rules?: WatchProgressRules;
}

/**
 * Applies last-write-wins, then the backward-jitter rule, and computes `completed` server-side.
 *
 * `completed` is sticky. An episode that reached the completion threshold does not become
 * incomplete because the viewer went back to rewatch the last minute: completion is a fact about
 * the viewer's history, and un-setting it would let a rewatch subtract from a completion count.
 *
 * `durationSec` always takes the accepted report's value, including on a report that only advances
 * the timestamp. The duration belongs to the asset the player loaded, so the most recent report is
 * the best information we have about it — a re-encode that changes the duration must not leave the
 * stored ratio being computed against a length that no longer exists.
 */
export function mergeReport(input: MergeReportInput): ProgressMergeOutcome {
  const rules = input.rules ?? DEFAULT_WATCH_PROGRESS_RULES;
  const { existing, report, nowMs } = input;

  const clientUpdatedAtMs = Math.min(
    report.clientUpdatedAtMs,
    nowMs + rules.futureSkewToleranceSec * 1000,
  );

  const candidate: WatchProgressRecord = {
    userId: input.userId,
    episodeId: input.episodeId,
    positionSec: report.positionSec,
    durationSec: report.durationSec,
    completed: isCompleted(report.positionSec, report.durationSec, rules),
    clientUpdatedAtMs,
    updatedAtMs: nowMs,
  };

  if (existing === undefined) {
    return { decision: 'STORED', record: candidate };
  }

  if (clientUpdatedAtMs < existing.clientUpdatedAtMs) {
    // The stale-report case `PRG-001` names explicitly: an older device's report arriving late is
    // dropped, and the caller is not told, because it did nothing wrong and has nothing to fix.
    return { decision: 'IGNORED_STALE', record: existing };
  }

  if (clientUpdatedAtMs === existing.clientUpdatedAtMs) {
    // Equal timestamps are a retry of the same observation — the same heartbeat re-sent after a
    // network failure. Keeping the stored row makes the endpoint idempotent at the same instant,
    // and avoids letting two devices with synchronised clocks flip on arrival order.
    return { decision: 'IGNORED_DUPLICATE', record: existing };
  }

  const movedBackBy = existing.positionSec - candidate.positionSec;
  const sticky = existing.completed || candidate.completed;

  if (movedBackBy > 0 && movedBackBy <= rules.backwardJitterToleranceSec) {
    return {
      decision: 'ADVANCED_TIMESTAMP_ONLY',
      record: {
        ...existing,
        durationSec: candidate.durationSec,
        completed: sticky,
        clientUpdatedAtMs,
        updatedAtMs: nowMs,
      },
    };
  }

  return { decision: 'STORED', record: { ...candidate, completed: sticky } };
}
