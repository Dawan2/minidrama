import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  START_INDICATOR_MS,
  START_TIMEOUT_MS,
  chromeForWaitingMs,
  createStartWatchdog,
} from './player-start';

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

describe('chromeForWaitingMs', () => {
  it('does not flash an indicator inside the IA 300 ms guard', () => {
    expect(chromeForWaitingMs(0)).toBe('none');
    expect(chromeForWaitingMs(START_INDICATOR_MS - 1)).toBe('none');
  });

  it('shows the spinner at 300 ms and timeout at the CN-10 15 s budget', () => {
    expect(chromeForWaitingMs(START_INDICATOR_MS)).toBe('indicator');
    expect(chromeForWaitingMs(START_TIMEOUT_MS - 1)).toBe('indicator');
    expect(chromeForWaitingMs(START_TIMEOUT_MS)).toBe('timeout');
  });
});

describe('createStartWatchdog', () => {
  it('does not time out an episode that reached PLAY', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const start = createStartWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    start.arm();
    start.observe('play');
    pacing.advance(START_TIMEOUT_MS);
    expect(onChrome).not.toHaveBeenCalledWith('indicator');
    expect(onChrome).not.toHaveBeenCalledWith('timeout');
    start.dispose();
  });

  it('shows the indicator after 300 ms of silence, then timeout at 15 s', () => {
    const seen: string[] = [];
    const pacing = clock();
    const start = createStartWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome: (chrome) => {
        seen.push(chrome);
      },
    });

    start.arm();
    pacing.advance(START_INDICATOR_MS - 1);
    expect(seen).toEqual([]);
    pacing.advance(1);
    expect(seen).toEqual(['indicator']);
    pacing.advance(START_TIMEOUT_MS - START_INDICATOR_MS);
    expect(seen).toEqual(['indicator', 'timeout']);
    start.dispose();
  });

  it('lands on timeout after a frozen-timer wake rather than restarting the flash guard', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const start = createStartWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    start.arm();
    pacing.advance(START_TIMEOUT_MS);
    expect(onChrome).toHaveBeenCalledWith('timeout');
    expect(onChrome).not.toHaveBeenCalledWith('indicator');
    start.dispose();
  });

  it('re-arms on a later switch so a second wait is not the first PLAY', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const start = createStartWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    start.arm();
    start.observe('play');
    start.arm();
    pacing.advance(START_INDICATOR_MS);
    expect(onChrome).toHaveBeenLastCalledWith('indicator');
    start.observe('play');
    expect(onChrome).toHaveBeenLastCalledWith('none');
    start.dispose();
  });

  it('error clears the wait so PLAYER_FATAL is not a second overlay', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const start = createStartWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    start.arm();
    start.observe('error');
    pacing.advance(START_TIMEOUT_MS);
    expect(onChrome).not.toHaveBeenCalledWith('timeout');
    start.dispose();
  });

  it('reset drops chrome so a user retry is not a second spinner on the last frame', () => {
    const onChrome = vi.fn();
    const pacing = clock();
    const start = createStartWatchdog({
      now: pacing.now,
      schedule: pacing.schedule,
      onChrome,
    });

    start.arm();
    pacing.advance(START_TIMEOUT_MS);
    expect(onChrome).toHaveBeenCalledWith('timeout');
    start.reset();
    expect(onChrome).toHaveBeenLastCalledWith('none');
    pacing.advance(START_TIMEOUT_MS);
    expect(onChrome.mock.calls.filter((call) => call[0] === 'timeout')).toHaveLength(1);
    start.dispose();
  });

  it('does not skip, change definition, or invent a rate ladder', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/player-start.ts'), 'utf8');
    expect(source).not.toMatch(/playNext|playbackRate|axe-core|#\/vip|postgres:/);
  });
});
