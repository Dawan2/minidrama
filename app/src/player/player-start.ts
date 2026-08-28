import type { VePlayerEventName } from './veplayer-types';

/**
 * Start / switch first-frame timeout (`docs/design/player-state-machine.md` CN-10,
 * J12-2 / J12-7).
 *
 * S7 stall (`player-stall.ts`) watches a *playing* episode whose position has
 * frozen. This module watches the other gap: construction or an episode switch
 * with no `PLAY` yet. Indicator after 300 ms (IA §8.1, no flash), retryable error at
 * 15 s. The last frame / cover stays. The episode is **never** skipped
 * (`CN-10`). Definition is plugin-owned (`AC-PL-6`) — this module never names
 * a speed control and never asks the kernel to drop a rung.
 *
 * A frozen WebView timer that wakes after 15 s lands on timeout rather than
 * restarting the 300 ms flash guard: the tick compares wall-clock.
 */

export const START_INDICATOR_MS = 300;
export const START_TIMEOUT_MS = 15_000;
export const START_TICK_MS = 1_000;

export type StartChrome = 'none' | 'indicator' | 'timeout';

export interface StartPacing {
  readonly now?: () => number;
  readonly schedule?: (tick: () => void, intervalMs: number) => () => void;
}

export interface StartWatchdogOptions extends StartPacing {
  readonly onChrome: (chrome: StartChrome) => void;
}

export interface StartWatchdog {
  /** Construction, an episode switch, or re-issue: wait for `PLAY`. */
  arm(): void;
  observe(event: VePlayerEventName, payload?: unknown): void;
  /** Drop chrome without treating the next tick as a wait (user retry, rebuild). */
  reset(): void;
  dispose(): void;
}

export function createStartWatchdog(options: StartWatchdogOptions): StartWatchdog {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? defaultSchedule;
  let mode: 'idle' | 'waiting' = 'idle';
  let armedAt = 0;
  let chrome: StartChrome = 'none';
  let stopTick: (() => void) | null = null;

  function publish(next: StartChrome): void {
    if (next === chrome) {
      return;
    }
    chrome = next;
    options.onChrome(next);
  }

  function evaluate(): void {
    if (mode !== 'waiting') {
      publish('none');
      return;
    }
    publish(chromeForWaitingMs(now() - armedAt));
  }

  function startTicker(): void {
    if (stopTick !== null) {
      return;
    }
    stopTick = schedule(evaluate, START_TICK_MS);
  }

  function stopTicker(): void {
    stopTick?.();
    stopTick = null;
  }

  function arm(): void {
    mode = 'waiting';
    armedAt = now();
    publish('none');
    startTicker();
    evaluate();
  }

  function enterIdle(): void {
    mode = 'idle';
    publish('none');
    stopTicker();
  }

  function observe(event: VePlayerEventName, _payload?: unknown): void {
    if (event === 'play') {
      enterIdle();
      return;
    }
    if (event === 'error') {
      // PLAYER_FATAL owns this frame. A start overlay on top of it would offer two retries.
      enterIdle();
    }
  }

  return { arm, observe, reset: enterIdle, dispose: enterIdle };
}

export function chromeForWaitingMs(waitingMs: number): StartChrome {
  if (waitingMs >= START_TIMEOUT_MS) {
    return 'timeout';
  }
  if (waitingMs >= START_INDICATOR_MS) {
    return 'indicator';
  }
  return 'none';
}

function defaultSchedule(tick: () => void, intervalMs: number): () => void {
  const id = setInterval(tick, intervalMs);
  return () => {
    clearInterval(id);
  };
}
