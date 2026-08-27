import type { Result, WatchProgressReport } from '@minidrama/shared';

import { asRecord } from '../data/narrow';
import type { ApiFailure } from '../data/failure';
import type { VePlayerEventName } from './veplayer-types';

/**
 * The progress heartbeat (`docs/design/player-state-machine.md` §5.3, `AC-PL-8`).
 *
 * Position comes from `timeupdate`. The player emits far more often than we report; throttling
 * here keeps the wire at `playback.progressHeartbeatSec`. The beat runs **only while playing**.
 * Pause, ended, error, unmount, and `visibility: hidden` flush the latest observation so
 * worst-case loss is one interval, not a missing row.
 *
 * Fail-closed:
 *   - a payload without both a position and a duration is dropped, never filled in;
 *   - fractional seconds are floored, never rounded up into a second the viewer has not reached;
 *   - `completed` is not a client field;
 *   - `401 AUTH_REQUIRED` stops further writes for this instance (no anonymous watch row);
 *   - a failed send keeps only the latest observation per episode (`queued`).
 */

export interface ProgressHeartbeatReport {
  (episodeId: string, report: WatchProgressReport): Promise<Result<void, ApiFailure>>;
}

export interface ProgressHeartbeatOptions {
  readonly episodeId: string;
  /** Positive integer seconds. Callers pass `config.playback.progressHeartbeatSec`. */
  readonly intervalSec: number;
  readonly report: ProgressHeartbeatReport;
  readonly now?: () => number;
  /** Optional. PlayerSurface wires `visibilitychange` / `pagehide` so a backgrounded app flushes. */
  readonly subscribeHidden?: (flush: () => void) => () => void;
}

export interface ProgressHeartbeat {
  observe(event: VePlayerEventName, payload?: unknown): void;
  /** Flushes the previous episode, then starts observing the new one. */
  setEpisode(episodeId: string): void;
  dispose(): void;
}

interface Observation {
  readonly positionSec: number;
  readonly durationSec: number;
}

export function createProgressHeartbeat(options: ProgressHeartbeatOptions): ProgressHeartbeat {
  const intervalMs = Math.max(1, Math.floor(options.intervalSec)) * 1000;
  const now = options.now ?? Date.now;
  let episodeId = options.episodeId;
  let playing = false;
  let disposed = false;
  let halted = false;
  let inFlight = false;
  let pendingFlush = false;
  let latest: Observation | null = null;
  let lastBeatAt: number | null = null;
  let playStartedAt: number | null = null;

  const unsubscribeHidden = options.subscribeHidden?.(() => {
    flush();
  });

  function observe(event: VePlayerEventName, payload?: unknown): void {
    if (disposed || halted) {
      return;
    }

    if (event === 'play') {
      playing = true;
      playStartedAt = now();
      return;
    }

    if (event === 'pause' || event === 'ended' || event === 'error') {
      playing = false;
      const fromPayload = observationFromPayload(payload);
      if (fromPayload !== null) {
        latest = fromPayload;
      }
      flush();
      return;
    }

    if (event !== 'timeupdate') {
      return;
    }

    const observation = observationFromPayload(payload);
    if (observation === null) {
      return;
    }
    latest = observation;
    if (!playing || playStartedAt === null) {
      return;
    }

    const t = now();
    const elapsed = t - (lastBeatAt ?? playStartedAt);
    if (elapsed >= intervalMs) {
      void send();
    }
  }

  function setEpisode(nextId: string): void {
    if (disposed || nextId === episodeId) {
      return;
    }
    flush();
    episodeId = nextId;
    latest = null;
    lastBeatAt = null;
    playStartedAt = playing ? now() : null;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    playing = false;
    unsubscribeHidden?.();
    flush();
    disposed = true;
  }

  function flush(): void {
    if (disposed || halted || latest === null) {
      return;
    }
    void send();
  }

  async function send(): Promise<void> {
    if (halted || latest === null || episodeId.length === 0) {
      return;
    }
    if (inFlight) {
      pendingFlush = true;
      return;
    }

    const observation = latest;
    const at = now();
    inFlight = true;
    const result = await options.report(episodeId, {
      positionSec: observation.positionSec,
      durationSec: observation.durationSec,
      clientUpdatedAt: new Date(at).toISOString(),
    });
    inFlight = false;

    if (disposed) {
      return;
    }

    if (!result.ok && isAuthRequired(result.error)) {
      halted = true;
      pendingFlush = false;
      return;
    }

    if (result.ok) {
      lastBeatAt = at;
      if (latest === observation) {
        // Keep the observation: a later flush of the same position is an idempotent retry the
        // server already treats as a duplicate. Clearing it would lose a pause that races the
        // in-flight send.
      }
    }

    if (pendingFlush) {
      pendingFlush = false;
      await send();
    }
  }

  return { observe, setEpisode, dispose };
}

export function observationFromPayload(payload: unknown): Observation | null {
  const record = asRecord(payload);
  if (record === null) {
    return null;
  }

  const positionRaw = firstNumber(record['positionSec'], record['currentTime']);
  const durationRaw = firstNumber(record['durationSec'], record['duration']);
  if (positionRaw === null || durationRaw === null) {
    return null;
  }
  if (!Number.isFinite(positionRaw) || !Number.isFinite(durationRaw)) {
    return null;
  }

  const positionSec = Math.floor(positionRaw);
  const durationSec = Math.floor(durationRaw);
  if (positionSec < 0 || durationSec <= 0) {
    return null;
  }

  return { positionSec, durationSec };
}

function firstNumber(...values: readonly unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number') {
      return value;
    }
  }
  return null;
}

function isAuthRequired(failure: ApiFailure): boolean {
  return failure.kind === 'HTTP' && failure.status === 401 && failure.code === 'AUTH_REQUIRED';
}
