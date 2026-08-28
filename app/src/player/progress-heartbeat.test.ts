import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';
import type { WatchProgressReport } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import {
  createProgressHeartbeat,
  isPreResumeObservation,
  observationFromPayload,
} from './progress-heartbeat';

function payload(position: number, duration: number): { currentTime: number; duration: number } {
  return { currentTime: position, duration };
}

describe('observationFromPayload', () => {
  it('accepts HTML-like currentTime/duration and floors them', () => {
    expect(observationFromPayload({ currentTime: 12.9, duration: 90.2 })).toEqual({
      positionSec: 12,
      durationSec: 90,
    });
  });

  it('accepts the contract names positionSec/durationSec', () => {
    expect(observationFromPayload({ positionSec: 8, durationSec: 40 })).toEqual({
      positionSec: 8,
      durationSec: 40,
    });
  });

  it('does not invent a duration for a timeupdate that only has currentTime', () => {
    expect(observationFromPayload({ currentTime: 1 })).toBeNull();
    expect(observationFromPayload(1)).toBeNull();
    expect(observationFromPayload(undefined)).toBeNull();
    expect(observationFromPayload({ duration: 90 })).toBeNull();
    expect(observationFromPayload({ currentTime: 3, duration: 0 })).toBeNull();
    expect(observationFromPayload({ currentTime: -1, duration: 90 })).toBeNull();
  });
});

describe('createProgressHeartbeat', () => {
  it('does not report timeupdate while paused, even with a valid payload', async () => {
    const report = vi.fn(async () => ok(undefined));
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 0,
      report,
    });

    heartbeat.observe('timeupdate', payload(5, 90));
    await Promise.resolve();
    expect(report).not.toHaveBeenCalled();
  });

  it('does not invent a position from a timeupdate that has no duration', async () => {
    const report = vi.fn(async () => ok(undefined));
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 0,
      report,
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', { currentTime: 1 });
    heartbeat.observe('pause');
    await Promise.resolve();
    expect(report).not.toHaveBeenCalled();
  });

  it('reports at the interval while playing, floored, without completed', async () => {
    const reports: WatchProgressReport[] = [];
    let nowMs = 0;
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => nowMs,
      report: async (_id, body) => {
        reports.push(body);
        return ok(undefined);
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(3.8, 100));
    await Promise.resolve();
    expect(reports).toEqual([]);

    nowMs = 10_000;
    heartbeat.observe('timeupdate', payload(13.2, 100));
    await vi.waitFor(() => {
      expect(reports).toHaveLength(1);
    });
    expect(reports[0]).toEqual({
      positionSec: 13,
      durationSec: 100,
      clientUpdatedAt: new Date(10_000).toISOString(),
    });
    expect(JSON.stringify(reports)).not.toMatch(/completed|beans|unlock/i);
  });

  it('flushes on pause so a short watch is not lost', async () => {
    const reports: Array<{ episodeId: string; positionSec: number }> = [];
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 3_000,
      report: async (episodeId, body) => {
        reports.push({ episodeId, positionSec: body.positionSec });
        return ok(undefined);
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(3, 90));
    heartbeat.observe('pause');
    await vi.waitFor(() => {
      expect(reports).toEqual([{ episodeId: 'ep_1', positionSec: 3 }]);
    });
  });

  it('flushes on dispose, then ignores further events', async () => {
    const report = vi.fn(async () => ok(undefined));
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 1_000,
      report,
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(4, 90));
    heartbeat.dispose();
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });

    heartbeat.observe('timeupdate', payload(20, 90));
    heartbeat.observe('pause');
    await Promise.resolve();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('stops after AUTH_REQUIRED rather than inventing an anonymous watch row', async () => {
    const report = vi.fn(async () => ({
      ok: false as const,
      error: apiFailure({ kind: 'HTTP', status: 401, code: 'AUTH_REQUIRED', message: 'sign in' }),
    }));
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 2_000,
      report,
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(2, 90));
    heartbeat.observe('pause');
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(8, 90));
    heartbeat.observe('pause');
    await Promise.resolve();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('flushes the previous episode before switching', async () => {
    const reports: string[] = [];
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 4_000,
      report: async (episodeId) => {
        reports.push(episodeId);
        return ok(undefined);
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(4, 90));
    heartbeat.setEpisode('ep_2');
    await vi.waitFor(() => {
      expect(reports).toEqual(['ep_1']);
    });

    heartbeat.observe('timeupdate', payload(1, 80));
    heartbeat.observe('pause');
    await vi.waitFor(() => {
      expect(reports).toEqual(['ep_1', 'ep_2']);
    });
  });

  it('flushes when subscribeHidden fires', async () => {
    const report = vi.fn(async () => ok(undefined));
    let hidden: (() => void) | undefined;
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => 5_000,
      report,
      subscribeHidden: (flush) => {
        hidden = flush;
        return () => {
          hidden = undefined;
        };
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(5, 90));
    hidden?.();
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });

    heartbeat.dispose();
    expect(hidden).toBeUndefined();
  });

  it('does not report a pre-seek tick behind session resume', async () => {
    const report = vi.fn(async () => ok(undefined));
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      resumePositionSec: 45,
      now: () => 6_000,
      report,
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(0, 90));
    heartbeat.observe('pause');
    await Promise.resolve();
    expect(report).not.toHaveBeenCalled();
  });

  it('reports once the player has landed at session resume, and honours a later rewind', async () => {
    const reports: number[] = [];
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      resumePositionSec: 45,
      now: () => 7_000,
      report: async (_id, body) => {
        reports.push(body.positionSec);
        return ok(undefined);
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(0, 90));
    heartbeat.observe('timeupdate', payload(45, 90));
    heartbeat.observe('pause');
    await vi.waitFor(() => {
      expect(reports).toEqual([45]);
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(0, 90));
    heartbeat.observe('pause');
    await vi.waitFor(() => {
      expect(reports[0]).toBe(45);
      expect(reports.slice(1).every((position) => position === 0)).toBe(true);
      expect(reports.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('flushes a plugin scrub immediately and does not wait for the interval', async () => {
    const reports: number[] = [];
    let nowMs = 0;
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      now: () => nowMs,
      report: async (_id, body) => {
        reports.push(body.positionSec);
        return ok(undefined);
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(5, 90));
    await Promise.resolve();
    expect(reports).toEqual([]);

    nowMs = 400;
    heartbeat.observe('timeupdate', payload(40, 90));
    await vi.waitFor(() => {
      expect(reports).toEqual([40]);
    });
  });

  it('does not hold back a new episode that resumes at 0 after a non-zero one', async () => {
    const reports: Array<{ episodeId: string; positionSec: number }> = [];
    const heartbeat = createProgressHeartbeat({
      episodeId: 'ep_1',
      intervalSec: 10,
      resumePositionSec: 45,
      now: () => 8_000,
      report: async (episodeId, body) => {
        reports.push({ episodeId, positionSec: body.positionSec });
        return ok(undefined);
      },
    });

    heartbeat.observe('play');
    heartbeat.observe('timeupdate', payload(45, 90));
    heartbeat.setEpisode('ep_2', 0);
    heartbeat.observe('timeupdate', payload(1, 80));
    heartbeat.observe('pause');
    await vi.waitFor(() => {
      expect(reports).toEqual([
        { episodeId: 'ep_1', positionSec: 45 },
        { episodeId: 'ep_2', positionSec: 1 },
      ]);
    });
  });
});

describe('isPreResumeObservation', () => {
  it('treats a tick more than two seconds behind resume as not yet landed', () => {
    expect(isPreResumeObservation(0, 45)).toBe(true);
    expect(isPreResumeObservation(42, 45)).toBe(true);
    expect(isPreResumeObservation(43, 45)).toBe(false);
    expect(isPreResumeObservation(45, 45)).toBe(false);
    expect(isPreResumeObservation(46, 45)).toBe(false);
    expect(isPreResumeObservation(0, 0)).toBe(false);
  });
});
