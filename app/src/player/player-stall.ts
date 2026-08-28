import { asRecord } from '../data/narrow';
import type { VePlayerEventName } from './veplayer-types';

/**
 * S7 stall chrome (`docs/design/player-state-machine.md` §4.3, `AC-PL-7`).
 *
 * VePlayer has no waiting/buffering event (`CN-17`). While the surface is in `playing`, a
 * watchdog expects a `timeupdate` whose position has *advanced* at least every
 * {@link STALL_WATCHDOG_MS}. If none arrives, the episode is stalled: spinner at 1.5 s,
 * retry at 8 s (`CN-6` budget). Definition is plugin-owned (`AC-PL-6`) — this module
 * never names a speed control and never asks the kernel to drop a rung.
 *
 * Pause, ended, and error are not stalls. A frozen WebView timer is not a stall budget
 * either: the tick compares wall-clock, so a 10 s freeze that wakes on one tick lands
 * on retry rather than restarting the 1.5 s flash guard.
 */

export const STALL_WATCHDOG_MS = 2_000;
export const STALL_INDICATOR_MS = 1_500;
export const STALL_RETRY_MS = 8_000;
export const STALL_TICK_MS = 1_000;

export type StallChrome = 'none' | 'indicator' | 'retry';

export interface StallPacing {
  readonly now?: () => number;
  readonly schedule?: (tick: () => void, intervalMs: number) => () => void;
}

export interface StallWatchdogOptions extends StallPacing {
  readonly onChrome: (chrome: StallChrome) => void;
}

export interface StallWatchdog {
  observe(event: VePlayerEventName, payload?: unknown): void;
  /** Drop chrome without treating the next tick as a stall (user retry, route change). */
  reset(): void;
  dispose(): void;
}

export function createStallWatchdog(options: StallWatchdogOptions): StallWatchdog {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? defaultSchedule;
  let mode: 'idle' | 'playing' = 'idle';
  let lastAdvanceAt = 0;
  let lastPositionSec: number | null = null;
  let chrome: StallChrome = 'none';
  let stopTick: (() => void) | null = null;

  function publish(next: StallChrome): void {
    if (next === chrome) {
      return;
    }
    chrome = next;
    options.onChrome(next);
  }

  function evaluate(): void {
    if (mode !== 'playing') {
      publish('none');
      return;
    }
    publish(chromeForSilentMs(now() - lastAdvanceAt));
  }

  function startTicker(): void {
    if (stopTick !== null) {
      return;
    }
    stopTick = schedule(evaluate, STALL_TICK_MS);
  }

  function stopTicker(): void {
    stopTick?.();
    stopTick = null;
  }

  function enterPlaying(): void {
    mode = 'playing';
    lastAdvanceAt = now();
    lastPositionSec = null;
    publish('none');
    startTicker();
  }

  function enterIdle(): void {
    mode = 'idle';
    lastPositionSec = null;
    publish('none');
    stopTicker();
  }

  function observe(event: VePlayerEventName, payload?: unknown): void {
    if (event === 'play') {
      enterPlaying();
      return;
    }
    if (event === 'pause' || event === 'ended' || event === 'error') {
      enterIdle();
      return;
    }
    if (event !== 'timeupdate' || mode !== 'playing') {
      return;
    }
    const positionSec = positionSecFromPayload(payload);
    if (positionSec === null) {
      return;
    }
    if (lastPositionSec !== null && positionSec === lastPositionSec) {
      evaluate();
      return;
    }
    lastPositionSec = positionSec;
    lastAdvanceAt = now();
    evaluate();
  }

  function reset(): void {
    enterIdle();
  }

  function dispose(): void {
    enterIdle();
  }

  return { observe, reset, dispose };
}

export function chromeForSilentMs(silentMs: number): StallChrome {
  if (silentMs < STALL_WATCHDOG_MS) {
    return 'none';
  }
  const stalledFor = silentMs - STALL_WATCHDOG_MS;
  if (stalledFor >= STALL_RETRY_MS) {
    return 'retry';
  }
  if (stalledFor >= STALL_INDICATOR_MS) {
    return 'indicator';
  }
  return 'none';
}

/**
 * Stall only needs a position. Duration is a heartbeat concern; inventing one here
 * would make a `timeupdate` without `duration` look like movement it is not.
 */
export function positionSecFromPayload(payload: unknown): number | null {
  const record = asRecord(payload);
  if (record === null) {
    return null;
  }
  const raw = firstNumber(record['positionSec'], record['currentTime']);
  if (raw === null || !Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return Math.floor(raw);
}

function firstNumber(...values: readonly unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number') {
      return value;
    }
  }
  return null;
}

function defaultSchedule(tick: () => void, intervalMs: number): () => void {
  const id = setInterval(tick, intervalMs);
  return () => {
    clearInterval(id);
  };
}
