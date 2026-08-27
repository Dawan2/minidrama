import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WATCH_PROGRESS_RULES,
  isCompleted,
  mergeReport,
  validateEpisodeId,
  validateProgressReport,
} from './progress.js';
import type { ValidatedProgressReport, WatchProgressRecord } from './progress.js';

/**
 * The rules, tested where they are decided rather than through HTTP.
 *
 * Each group below is a case that ordinary traffic produces, and the assertion is the answer chosen
 * in `progress.ts` — so a future change to any of these answers has to change a test that states
 * what the old answer was and why it existed.
 */

const NOW_MS = Date.parse('2026-08-27T12:00:00.000Z');

function report(overrides: Partial<ValidatedProgressReport> = {}): ValidatedProgressReport {
  return { positionSec: 45, durationSec: 95, clientUpdatedAtMs: NOW_MS, ...overrides };
}

function stored(overrides: Partial<WatchProgressRecord> = {}): WatchProgressRecord {
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

function merge(
  existing: WatchProgressRecord | undefined,
  incoming: ValidatedProgressReport,
  nowMs = NOW_MS,
) {
  return mergeReport({
    existing,
    userId: 'user_a',
    episodeId: 'ep_1',
    report: incoming,
    nowMs,
  });
}

describe('validateProgressReport — shape', () => {
  it('accepts a well-formed report', () => {
    const result = validateProgressReport({
      positionSec: 45,
      durationSec: 95,
      clientUpdatedAt: '2026-08-27T12:00:00.000Z',
    });

    expect(result).toEqual({
      ok: true,
      value: { positionSec: 45, durationSec: 95, clientUpdatedAtMs: NOW_MS },
    });
  });

  it.each([
    ['positionSec', {}, 'required'],
    ['positionSec', { positionSec: 12.5 }, 'not_an_integer'],
    ['positionSec', { positionSec: '12' }, 'not_an_integer'],
    ['positionSec', { positionSec: Number.NaN }, 'not_an_integer'],
    ['durationSec', { positionSec: 1 }, 'required'],
    ['durationSec', { positionSec: 1, durationSec: 0 }, 'out_of_range'],
    ['durationSec', { positionSec: 1, durationSec: -95 }, 'out_of_range'],
    ['durationSec', { positionSec: 1, durationSec: 95.5 }, 'not_an_integer'],
  ])('rejects %s in %j as %s', (field, body, reason) => {
    const result = validateProgressReport(body as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'VALIDATION', field, reason });
    }
  });

  // Defaulting it to server time would let a client that omits the field win every conflict against
  // one that sends it, which is the inverse of the intended rule.
  it('requires clientUpdatedAt rather than defaulting it', () => {
    const result = validateProgressReport({ positionSec: 45, durationSec: 95 });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'VALIDATION', field: 'clientUpdatedAt', reason: 'required' },
    });
  });

  it.each(['not-a-date', '', '2026-13-45T99:99:99Z'])(
    'rejects the unparseable clientUpdatedAt %j',
    (clientUpdatedAt) => {
      const result = validateProgressReport({ positionSec: 45, durationSec: 95, clientUpdatedAt });

      expect(result).toEqual({
        ok: false,
        error: { kind: 'VALIDATION', field: 'clientUpdatedAt', reason: 'not_a_timestamp' },
      });
    },
  );
});

describe('validateProgressReport — the position, clamped or refused', () => {
  it('clamps a position a whisker past the end to the duration', () => {
    const result = validateProgressReport({
      positionSec: 96,
      durationSec: 95,
      clientUpdatedAt: '2026-08-27T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.positionSec).toBe(95);
  });

  it('clamps exactly at the overshoot tolerance and refuses one second beyond it', () => {
    const clientUpdatedAt = '2026-08-27T12:00:00.000Z';
    const atTolerance = validateProgressReport({
      positionSec: 95 + DEFAULT_WATCH_PROGRESS_RULES.overshootToleranceSec,
      durationSec: 95,
      clientUpdatedAt,
    });
    const pastTolerance = validateProgressReport({
      positionSec: 95 + DEFAULT_WATCH_PROGRESS_RULES.overshootToleranceSec + 1,
      durationSec: 95,
      clientUpdatedAt,
    });

    expect(atTolerance.ok).toBe(true);
    if (atTolerance.ok) expect(atTolerance.value.positionSec).toBe(95);
    expect(pastTolerance).toEqual({
      ok: false,
      error: { kind: 'INVALID_POSITION', positionSec: 98, durationSec: 95 },
    });
  });

  // Refusing rather than clamping is what stops one call marking any episode complete.
  it('refuses a position far past the end instead of clamping it', () => {
    const result = validateProgressReport({
      positionSec: 100_000,
      durationSec: 95,
      clientUpdatedAt: '2026-08-27T12:00:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'INVALID_POSITION', positionSec: 100_000, durationSec: 95 },
    });
  });

  it('refuses a negative position', () => {
    const result = validateProgressReport({
      positionSec: -1,
      durationSec: 95,
      clientUpdatedAt: '2026-08-27T12:00:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'INVALID_POSITION', positionSec: -1, durationSec: 95 },
    });
  });

  it('accepts the boundary positions 0 and durationSec', () => {
    for (const positionSec of [0, 95]) {
      const result = validateProgressReport({
        positionSec,
        durationSec: 95,
        clientUpdatedAt: '2026-08-27T12:00:00.000Z',
      });
      expect(result.ok).toBe(true);
    }
  });
});

describe('validateEpisodeId', () => {
  it('accepts a plausible identifier', () => {
    expect(validateEpisodeId('ep_01J6')).toEqual({ ok: true, value: 'ep_01J6' });
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    [42, 'required'],
    ['e'.repeat(65), 'out_of_range'],
  ])('rejects %j as %s', (value, reason) => {
    expect(validateEpisodeId(value)).toEqual({
      ok: false,
      error: { kind: 'VALIDATION', field: 'episodeId', reason },
    });
  });
});

describe('isCompleted', () => {
  it('is true from 90% of the duration', () => {
    expect(isCompleted(85, 95)).toBe(false);
    expect(isCompleted(86, 95)).toBe(true);
    expect(isCompleted(95, 95)).toBe(true);
    expect(isCompleted(0, 95)).toBe(false);
  });
});

describe('mergeReport — last write wins on the client clock', () => {
  it('stores the first report for an episode', () => {
    const outcome = merge(undefined, report({ positionSec: 30 }));

    expect(outcome.decision).toBe('STORED');
    expect(outcome.record).toMatchObject({
      userId: 'user_a',
      episodeId: 'ep_1',
      positionSec: 30,
      completed: false,
      updatedAtMs: NOW_MS,
    });
  });

  // The cross-device case `PRG-001` names: the older device's report arrives second and loses.
  it('ignores a report older than the stored one', () => {
    const existing = stored({ positionSec: 70, clientUpdatedAtMs: NOW_MS });

    const outcome = merge(
      existing,
      report({ positionSec: 12, clientUpdatedAtMs: NOW_MS - 60_000 }),
    );

    expect(outcome.decision).toBe('IGNORED_STALE');
    expect(outcome.record).toBe(existing);
  });

  it('ignores a re-sent report carrying the same timestamp', () => {
    const existing = stored({ positionSec: 70 });

    const outcome = merge(existing, report({ positionSec: 12, clientUpdatedAtMs: NOW_MS }));

    expect(outcome.decision).toBe('IGNORED_DUPLICATE');
    expect(outcome.record).toBe(existing);
  });

  it('accepts a newer report that moves forward', () => {
    const existing = stored({ positionSec: 45 });

    const outcome = merge(
      existing,
      report({ positionSec: 60, clientUpdatedAtMs: NOW_MS + 10_000 }),
    );

    expect(outcome.decision).toBe('STORED');
    expect(outcome.record.positionSec).toBe(60);
  });
});

describe('mergeReport — backward noise', () => {
  it('does not rewind the stored position for jitter inside the tolerance', () => {
    const existing = stored({ positionSec: 45 });

    const outcome = merge(
      existing,
      report({ positionSec: 43, clientUpdatedAtMs: NOW_MS + 10_000 }),
    );

    expect(outcome.decision).toBe('ADVANCED_TIMESTAMP_ONLY');
    expect(outcome.record.positionSec).toBe(45);
  });

  // The timestamp must still advance, or the next real seek is compared against a stale one and the
  // viewer's rewind is dropped as "older than what we hold".
  it('still advances the timestamp, so the next real seek is not judged stale', () => {
    const existing = stored({ positionSec: 45 });

    const jitter = merge(existing, report({ positionSec: 44, clientUpdatedAtMs: NOW_MS + 10_000 }));
    const seek = merge(
      jitter.record,
      report({ positionSec: 5, clientUpdatedAtMs: NOW_MS + 20_000 }),
    );

    expect(jitter.record.clientUpdatedAtMs).toBe(NOW_MS + 10_000);
    expect(seek.decision).toBe('STORED');
    expect(seek.record.positionSec).toBe(5);
  });

  it('honours a deliberate rewind past the tolerance', () => {
    const existing = stored({ positionSec: 45 });

    const outcome = merge(
      existing,
      report({ positionSec: 42, clientUpdatedAtMs: NOW_MS + 10_000 }),
    );

    expect(outcome.decision).toBe('STORED');
    expect(outcome.record.positionSec).toBe(42);
  });

  it('honours every backward move when the tolerance is set to zero', () => {
    const outcome = mergeReport({
      existing: stored({ positionSec: 45 }),
      userId: 'user_a',
      episodeId: 'ep_1',
      report: report({ positionSec: 44, clientUpdatedAtMs: NOW_MS + 10_000 }),
      nowMs: NOW_MS,
      rules: { ...DEFAULT_WATCH_PROGRESS_RULES, backwardJitterToleranceSec: 0 },
    });

    expect(outcome.decision).toBe('STORED');
    expect(outcome.record.positionSec).toBe(44);
  });

  it('takes the newest duration even when it only advances the timestamp', () => {
    const existing = stored({ positionSec: 45, durationSec: 95 });

    const outcome = merge(
      existing,
      report({ positionSec: 44, durationSec: 97, clientUpdatedAtMs: NOW_MS + 10_000 }),
    );

    expect(outcome.record.durationSec).toBe(97);
  });
});

describe('mergeReport — completion', () => {
  it('computes completed server-side from the ratio', () => {
    const outcome = merge(undefined, report({ positionSec: 90, durationSec: 95 }));

    expect(outcome.record.completed).toBe(true);
  });

  // A rewatch must not subtract from a completion count.
  it('keeps completed set when the viewer rewinds to rewatch', () => {
    const existing = stored({ positionSec: 95, completed: true });

    const outcome = merge(existing, report({ positionSec: 5, clientUpdatedAtMs: NOW_MS + 10_000 }));

    expect(outcome.record.positionSec).toBe(5);
    expect(outcome.record.completed).toBe(true);
  });
});

describe('mergeReport — a client clock we do not control', () => {
  it('pulls a wildly future timestamp back to server time plus the tolerance', () => {
    const yearAhead = NOW_MS + 365 * 24 * 3600 * 1000;

    const outcome = merge(undefined, report({ clientUpdatedAtMs: yearAhead }));

    expect(outcome.record.clientUpdatedAtMs).toBe(
      NOW_MS + DEFAULT_WATCH_PROGRESS_RULES.futureSkewToleranceSec * 1000,
    );
  });

  // Without the clamp, one skewed device would pin this row forever: no later report from any
  // device could ever be newer than a timestamp a year into the future.
  it('lets a later honest report displace one from a skewed device', () => {
    const skewed = merge(undefined, report({ positionSec: 10, clientUpdatedAtMs: NOW_MS * 2 }));

    const honest = merge(
      skewed.record,
      report({ positionSec: 60, clientUpdatedAtMs: NOW_MS + 3600_000 }),
      NOW_MS + 3600_000,
    );

    expect(honest.decision).toBe('STORED');
    expect(honest.record.positionSec).toBe(60);
  });

  it('leaves a timestamp inside the tolerance alone', () => {
    const outcome = merge(undefined, report({ clientUpdatedAtMs: NOW_MS + 30_000 }));

    expect(outcome.record.clientUpdatedAtMs).toBe(NOW_MS + 30_000);
  });
});
