import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  STALL_INDICATOR_MS,
  STALL_RETRY_MS,
  STALL_WATCHDOG_MS,
  chromeForSilentMs,
  createStallWatchdog,
  positionSecFromPayload,
} from './player-stall';

function clock() {
  let nowMs = 0;
  let tick: () => void = () => {};
  return {
    now: () => nowMs,
    schedule: (fn: () => void) => {
      tick = fn;
      return () => {
        tick = () => {};
      };
    },
    advance(ms: number) {
      nowMs += ms;
      tick();
    },
  };
}

describe('positionSecFromPayload', () => {
  it('accepts HTML-like currentTime and the contract name, and floors', () => {
    expect(positionSecFromPayload({ currentTime: 12.9 })).toBe(12);
    expect(positionSecFromPayload({ positionSec: 8.2 })).toBe(8);
  });

  it('does not invent a position from duration-only or garbage payloads', () => {
    expect(positionSecFromPayload({ duration: 90 })).toBeNull();
    expect(positionSecFromPayload(1)).toBeNull();
    expect(positionSecFromPayload(undefined)).toBeNull();
    expect(positionSecFromPayload({ currentTime: -1 })).toBeNull();
    expect(positionSecFromPayload({ currentTime: Number.NaN })).toBeNull();
  });
});

describe('chromeForSilentMs', () => {
  it('does not flash an indicator for a hiccup inside the watchdog', () => {
    expect(chromeForSilentMs(0)).toBe('none');
    expect(chromeForSilentMs(STALL_WATCHDOG_MS - 1)).toBe('none');
    expect(chromeForSilentMs(STALL_WATCHDOG_MS)).toBe('none');
  });

  it('shows the spinner at 1.5 s of stall and retry at the CN-6 budget', () => {
    expect(chromeForSilentMs(STALL_WATCHDOG_MS + STALL_INDICATOR_MS - 1)).toBe('none');
    expect(chromeForSilentMs(STALL_WATCHDOG_MS + STALL_INDICATOR_MS)).toBe('indicator');
    expect(chromeForSilentMs(STALL_WATCHDOG_MS + STALL_RETRY_MS - 1)).toBe('indicator');
    expect(chromeForSilentMs(STALL_WATCHDOG_MS + STALL_RETRY_MS)).toBe('retry');
  });
});

describe('createStallWatchdog', () => {
  it('does not stall a paused or ended episode', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    stall.observe('play');
    stall.observe('pause');
    pacing.advance(STALL_WATCHDOG_MS + STALL_RETRY_MS);
    expect(onChrome).not.toHaveBeenCalledWith('indicator');
    expect(onChrome).not.toHaveBeenCalledWith('retry');

    stall.observe('play');
    stall.observe('ended');
    pacing.advance(STALL_WATCHDOG_MS + STALL_RETRY_MS);
    expect(onChrome).not.toHaveBeenCalledWith('retry');
    stall.dispose();
  });

  it('shows the indicator after the watchdog plus 1.5 s of silence, then retry at 8 s', () => {
    const seen: string[] = [];
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome: (chrome) => {
        seen.push(chrome);
      },
    });

    stall.observe('play');
    pacing.advance(STALL_WATCHDOG_MS);
    expect(seen).toEqual([]);
    pacing.advance(STALL_INDICATOR_MS);
    expect(seen).toEqual(['indicator']);
    pacing.advance(STALL_RETRY_MS - STALL_INDICATOR_MS);
    expect(seen).toEqual(['indicator', 'retry']);
    stall.dispose();
  });

  it('lands on retry after a frozen-timer wake rather than restarting the flash guard', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    stall.observe('play');
    pacing.advance(STALL_WATCHDOG_MS + STALL_RETRY_MS);
    expect(onChrome).toHaveBeenCalledWith('retry');
    expect(onChrome).not.toHaveBeenCalledWith('indicator');
    stall.dispose();
  });

  it('clears chrome when position advances, including a backward seek', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    stall.observe('play');
    stall.observe('timeupdate', { currentTime: 5 });
    pacing.advance(STALL_WATCHDOG_MS + STALL_INDICATOR_MS);
    expect(onChrome).toHaveBeenCalledWith('indicator');
    stall.observe('timeupdate', { currentTime: 6 });
    expect(onChrome).toHaveBeenLastCalledWith('none');

    pacing.advance(STALL_WATCHDOG_MS + STALL_INDICATOR_MS);
    expect(onChrome).toHaveBeenLastCalledWith('indicator');
    stall.observe('timeupdate', { currentTime: 1 });
    expect(onChrome).toHaveBeenLastCalledWith('none');
    stall.dispose();
  });

  it('does not treat a same-position tick as advancement', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    stall.observe('play');
    stall.observe('timeupdate', { currentTime: 4 });
    pacing.advance(STALL_WATCHDOG_MS);
    stall.observe('timeupdate', { currentTime: 4.4 });
    pacing.advance(STALL_INDICATOR_MS);
    expect(onChrome).toHaveBeenCalledWith('indicator');
    stall.dispose();
  });

  it('does not invent movement from a duration-only timeupdate', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    stall.observe('play');
    stall.observe('timeupdate', { duration: 90 });
    pacing.advance(STALL_WATCHDOG_MS + STALL_INDICATOR_MS);
    expect(onChrome).toHaveBeenCalledWith('indicator');
    stall.dispose();
  });

  it('reset drops chrome so a user retry is not a second spinner on the last frame', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const stall = createStallWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    stall.observe('play');
    pacing.advance(STALL_WATCHDOG_MS + STALL_RETRY_MS);
    expect(onChrome).toHaveBeenCalledWith('retry');
    stall.reset();
    expect(onChrome).toHaveBeenLastCalledWith('none');
    pacing.advance(STALL_WATCHDOG_MS + STALL_RETRY_MS);
    expect(onChrome.mock.calls.filter((call) => call[0] === 'retry')).toHaveLength(1);
    stall.dispose();
  });
});

describe('this slice does not open the forbidden leftovers', () => {
  it('does not invent 倍速, axe-core, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/player-stall.ts'), 'utf8');
    expect(source).not.toMatch(/playbackRate|axe-core|#\/vip|postgres:/);
  });
});
