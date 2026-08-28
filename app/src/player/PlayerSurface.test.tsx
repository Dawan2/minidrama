import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, type PlaybackDescriptor, type WatchProgressReport } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from './mock-veplayer';
import type { PlayerSurfaceHandle } from './PlayerSurface';
import { PlayerSurface } from './PlayerSurface';

function episode(episodeNumber: number): PlaybackDescriptor {
  return {
    albumId: 'album_1',
    episodeId: `ep_${String(episodeNumber)}`,
    vid: `vid_${String(episodeNumber)}`,
    resumePositionSec: 0,
  };
}

const playlist = [episode(1), episode(2), episode(3)];
const descriptor = playlist[0]!;

beforeEach(() => {
  MockVePlayer.reset();
});

async function readyBridge(...args: ConstructorParameters<typeof MockBridge>) {
  const bridge = new MockBridge(...args);
  await bridge.init();
  return bridge;
}

/** The constraint the whole playback design rests on, asserted over the live DOM. */
function forbiddenElements(): readonly Element[] {
  return [...screen.getByTestId('player-container').querySelectorAll('video, audio, iframe')];
}

describe('PlayerSurface', () => {
  it('mounts a player into its container', async () => {
    const bridge = await readyBridge();
    render(<PlayerSurface bridge={bridge} playlist={playlist} episodeId={descriptor.episodeId} />);

    await waitFor(() => {
      expect(screen.getByTestId('player-surface').dataset['state']).toBe('playing');
    });
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(forbiddenElements()).toEqual([]);
  });

  it('starts on the episode it was asked for, not on the first of the album', async () => {
    const bridge = await readyBridge();
    render(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_2" />);

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    expect(MockVePlayer.instances[0]?.config.episodeId).toBe('ep_2');
    // The queue behind it is the rest of the album, so "next" from here is ep_3.
    expect(MockVePlayer.instances[0]?.preloadList.map((item) => item.episodeId)).toEqual([
      'ep_2',
      'ep_3',
    ]);
  });

  it('destroys the player when it unmounts', async () => {
    const bridge = await readyBridge();
    const { unmount } = render(
      <PlayerSurface bridge={bridge} playlist={playlist} episodeId={descriptor.episodeId} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });

    unmount();
    await waitFor(() => {
      expect(MockVePlayer.instances.every((instance) => instance.destroyed)).toBe(true);
    });
  });

  it('switches episode on the retained instance rather than building a second one', async () => {
    const bridge = await readyBridge();
    const { rerender } = render(
      <PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_1" />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const first = MockVePlayer.instances[0]!;

    rerender(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_2" />);

    await waitFor(() => {
      expect(first.playNextCount).toBe(1);
    });
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]).toBe(first);
    expect(first.destroyed).toBe(false);
    expect(first.currentEpisodeId).toBe('ep_2');
    expect(screen.getByTestId('player-surface').dataset['episodeId']).toBe('ep_2');
    expect(forbiddenElements()).toEqual([]);
  });

  it('notifies the page when the current episode ends, without building a second player', async () => {
    const onEnded = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface bridge={bridge} episodeId="ep_1" onEnded={onEnded} playlist={playlist} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    MockVePlayer.instances[0]!.emitForTest('ended');

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(MockVePlayer.instances).toHaveLength(1);
  });

  it('notifies PLAYER_FATAL without tearing the instance down or inspecting the payload', async () => {
    const onPlayerFatal = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onPlayerFatal={onPlayerFatal}
        playlist={playlist}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    MockVePlayer.instances[0]!.emitForTest('error', { playAuthToken: 'token-must-not-decide' });

    expect(onPlayerFatal).toHaveBeenCalledTimes(1);
    expect(onPlayerFatal.mock.calls[0]).toEqual([]);
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.destroyed).toBe(false);
    expect(screen.getByTestId('player-surface').dataset['state']).toBe('playing');
    expect(screen.queryByTestId('player-unavailable')).toBeNull();
  });

  it('applies a reissued descriptor on the live instance', async () => {
    const bridge = await readyBridge();
    const surfaceRef = { current: null as PlayerSurfaceHandle | null };
    render(
      <PlayerSurface
        ref={surfaceRef}
        bridge={bridge}
        episodeId="ep_1"
        playlist={[{ ...descriptor, playAuthToken: 'token-old' }]}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    surfaceRef.current?.reissue({
      ...descriptor,
      playAuthToken: 'token-new',
      resumePositionSec: 9,
    });

    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
    expect(MockVePlayer.instances[0]?.currentPlayAuthToken).toBe('token-new');
    expect(MockVePlayer.instances[0]?.config.startTime).toBe(0);
  });

  it('treats an upward flick as next and a tap as nothing', async () => {
    const onSwipeNext = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onSwipeNext={onSwipeNext}
        playlist={playlist}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const surface = screen.getByTestId('player-surface');
    fireEvent.touchStart(surface, {
      changedTouches: [{ clientY: 280 }],
      touches: [{ clientY: 280 }],
    });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientY: 270 }] });
    expect(onSwipeNext).not.toHaveBeenCalled();

    fireEvent.touchStart(surface, {
      changedTouches: [{ clientY: 280 }],
      touches: [{ clientY: 280 }],
    });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientY: 200 }] });
    expect(onSwipeNext).toHaveBeenCalledTimes(1);
  });

  it('does not treat a horizontal scrub as 切集, so the progress plugin keeps the drag', async () => {
    const onSwipeNext = vi.fn();
    const onSwipePrevious = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onSwipeNext={onSwipeNext}
        onSwipePrevious={onSwipePrevious}
        playlist={playlist}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    expect(MockVePlayer.instances[0]?.config.ignores.join(',')).not.toMatch(/progress/i);
    expect(
      screen.getByTestId('player-container').querySelector('[data-veplayer-progress="kept"]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId('player-container').querySelector('input, video, [role="slider"]'),
    ).toBeNull();

    const surface = screen.getByTestId('player-surface');
    fireEvent.touchStart(surface, {
      changedTouches: [{ clientX: 40, clientY: 400 }],
      touches: [{ clientX: 40, clientY: 400 }],
    });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 220, clientY: 388 }] });
    expect(onSwipeNext).not.toHaveBeenCalled();
    expect(onSwipePrevious).not.toHaveBeenCalled();
  });

  it('treats a double-tap as a like and a single tap as not a like', async () => {
    const onDoubleTap = vi.fn();
    const onSwipeNext = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onDoubleTap={onDoubleTap}
        onSwipeNext={onSwipeNext}
        playlist={playlist}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const surface = screen.getByTestId('player-surface');
    fireEvent.touchStart(surface, {
      changedTouches: [{ clientX: 40, clientY: 80 }],
      touches: [{ clientX: 40, clientY: 80 }],
    });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 40, clientY: 80 }] });
    expect(onDoubleTap).not.toHaveBeenCalled();

    fireEvent.touchStart(surface, {
      changedTouches: [{ clientX: 42, clientY: 81 }],
      touches: [{ clientX: 42, clientY: 81 }],
    });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 42, clientY: 81 }] });
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onSwipeNext).not.toHaveBeenCalled();
    expect(MockVePlayer.instances).toHaveLength(1);
  });

  it('pauses and resumes on a single tap of the retained VePlayer, not a like', async () => {
    const onDoubleTap = vi.fn();
    const onSwipeNext = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onDoubleTap={onDoubleTap}
        onSwipeNext={onSwipeNext}
        playlist={playlist}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const instance = MockVePlayer.instances[0]!;
    await waitFor(() => {
      expect(instance.playing).toBe(true);
    });
    expect(instance.config.closeVideoClick).toBe(false);
    expect(
      screen.getByTestId('player-container').querySelector('[data-veplayer-tap-pause="kept"]'),
    ).not.toBeNull();
    expect(screen.queryByTestId('player-pause')).toBeNull();
    expect(screen.queryByRole('button', { name: /pause|play|resume/i })).toBeNull();

    fireEvent.click(screen.getByTestId('player-container'));
    expect(instance.playing).toBe(false);
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(onSwipeNext).not.toHaveBeenCalled();
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(instance.destroyed).toBe(false);
    expect(instance.currentEpisodeId).toBe('ep_1');

    fireEvent.click(screen.getByTestId('player-container'));
    expect(instance.playing).toBe(true);
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(instance).toBe(MockVePlayer.instances[0]);
    expect(forbiddenElements()).toEqual([]);
  });

  it('does not treat a swipe as a like', async () => {
    const onDoubleTap = vi.fn();
    const onSwipeNext = vi.fn();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onDoubleTap={onDoubleTap}
        onSwipeNext={onSwipeNext}
        playlist={playlist}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const surface = screen.getByTestId('player-surface');
    fireEvent.touchStart(surface, {
      changedTouches: [{ clientX: 40, clientY: 280 }],
      touches: [{ clientX: 40, clientY: 280 }],
    });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 40, clientY: 200 }] });
    expect(onSwipeNext).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('walks the whole album on one instance', async () => {
    const bridge = await readyBridge();
    const { rerender } = render(
      <PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_1" />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });

    rerender(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_2" />);
    rerender(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_3" />);

    await waitFor(() => {
      expect(MockVePlayer.instances[0]?.currentEpisodeId).toBe('ep_3');
    });
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(2);
  });

  // A re-render is not an episode change. This is the regression the descriptor dependency caused:
  // a fresh object of the same shape rebuilt the player and threw away the preloaded next episode.
  it('does not rebuild the player when it re-renders with the same episode', async () => {
    const bridge = await readyBridge();
    const { rerender } = render(
      <PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_1" />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const first = MockVePlayer.instances[0]!;

    rerender(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_1" />);
    rerender(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_1" />);

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    expect(first.destroyed).toBe(false);
    expect(first.playNextCount).toBe(0);
  });

  /**
   * The other half of the rule. `playNext()` cannot go backwards, so this one *must* rebuild — and
   * the old instance must be destroyed, or the album ends up with two live players in one
   * container, both holding the network.
   */
  it('rebuilds, and destroys the old instance, when the episode is not reachable by advancing', async () => {
    const bridge = await readyBridge();
    const { rerender } = render(
      <PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_2" />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const first = MockVePlayer.instances[0]!;

    rerender(<PlayerSurface bridge={bridge} playlist={playlist} episodeId="ep_1" />);

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(2);
    });
    expect(first.destroyed).toBe(true);
    expect(first.playNextCount).toBe(0);
    expect(MockVePlayer.instances[1]?.config.episodeId).toBe('ep_1');
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
    // One player, one placeholder: the rebuilt player did not stack a second surface on the first.
    expect(screen.getByTestId('player-container').children).toHaveLength(1);
  });

  it('shows a retryable message instead of an empty frame when the player is unavailable', async () => {
    const bridge = await readyBridge({ unavailable: ['getPlayer'] });
    render(<PlayerSurface bridge={bridge} playlist={playlist} episodeId={descriptor.episodeId} />);

    expect(await screen.findByTestId('player-unavailable')).toBeDefined();
    expect(screen.getByTestId('player-surface').dataset['state']).toBe('unavailable');
    expect(MockVePlayer.instances).toHaveLength(0);
  });

  it('degrades rather than building a player with nothing to play', async () => {
    const bridge = await readyBridge();
    render(<PlayerSurface bridge={bridge} playlist={[]} episodeId="ep_1" />);

    expect(await screen.findByTestId('player-unavailable')).toBeDefined();
    expect(MockVePlayer.instances).toHaveLength(0);
  });

  it('flushes watch progress on pause, without inventing completed', async () => {
    const reports: Array<{ episodeId: string } & WatchProgressReport> = [];
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        playlist={playlist}
        progress={{
          intervalSec: 10,
          report: async (episodeId, report) => {
            reports.push({ episodeId, ...report });
            return ok(undefined);
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    MockVePlayer.instances[0]!.tick(7.8, 90);
    MockVePlayer.instances[0]!.pause();

    await waitFor(() => {
      expect(reports).toHaveLength(1);
    });
    expect(reports[0]).toMatchObject({
      episodeId: 'ep_1',
      positionSec: 7,
      durationSec: 90,
    });
    expect(JSON.stringify(reports)).not.toMatch(/completed|beans/i);
  });

  it('does not invent a duration for a timeupdate that only has currentTime', async () => {
    const report = vi.fn(async () => ok(undefined));
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        playlist={playlist}
        progress={{ intervalSec: 10, report }}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    MockVePlayer.instances[0]!.emitForTest('timeupdate', { currentTime: 4 });
    MockVePlayer.instances[0]!.pause();
    await waitFor(() => {
      expect(MockVePlayer.instances[0]?.playing).toBe(false);
    });
    expect(report).not.toHaveBeenCalled();
  });

  it('does not flush a pre-seek 0 after a non-zero session resume', async () => {
    const report = vi.fn(async () => ok(undefined));
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        playlist={[{ ...descriptor, resumePositionSec: 45 }]}
        progress={{ intervalSec: 10, report }}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    expect(MockVePlayer.instances[0]?.config.startTime).toBe(45);
    MockVePlayer.instances[0]!.tick(0, 90);
    MockVePlayer.instances[0]!.pause();
    await waitFor(() => {
      expect(MockVePlayer.instances[0]?.playing).toBe(false);
    });
    expect(report).not.toHaveBeenCalled();
  });

  it('keeps the playbackrate plugin and does not render a competing 倍速 panel', async () => {
    const bridge = await readyBridge();
    render(<PlayerSurface bridge={bridge} episodeId="ep_1" playlist={playlist} />);

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const instance = MockVePlayer.instances[0]!;
    expect(instance.config.ignores).not.toContain('playbackrate');
    expect(instance.config.ignores.join(',')).not.toMatch(/playbackrate/i);
    expect('playbackRate' in instance.config).toBe(false);
    expect(
      screen.getByTestId('player-container').querySelector('[data-veplayer-playbackrate="kept"]'),
    ).not.toBeNull();
    expect(screen.queryByTestId('playback-rate')).toBeNull();
    expect(screen.queryByTestId('pnl-05')).toBeNull();
    expect(
      screen.getByTestId('player-container').querySelector('input, video, select, [role="slider"]'),
    ).toBeNull();
    expect(forbiddenElements()).toEqual([]);
    expect(instance.config.vid).not.toMatch(/vid_demo_/);
  });

  it('flushes a plugin scrub without building a second instance or a native video', async () => {
    const reports: WatchProgressReport[] = [];
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        playlist={playlist}
        progress={{
          intervalSec: 10,
          report: async (_id, body) => {
            reports.push(body);
            return ok(undefined);
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const player = MockVePlayer.instances[0]!;
    player.tick(5, 90);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    player.scrub(40, 90);
    await waitFor(() => {
      expect(reports).toHaveLength(1);
    });
    expect(reports[0]).toMatchObject({ positionSec: 40, durationSec: 90 });
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(forbiddenElements()).toEqual([]);
    expect(player.config.ignores).not.toContain('playbackrate');
    expect(player.config.vid).not.toMatch(/vid_demo_/);
  });
});

function stallClock() {
  let nowMs = 0;
  let tick: () => void = () => {};
  return {
    pacing: {
      now: () => nowMs,
      schedule: (fn: () => void) => {
        tick = fn;
        return () => {
          tick = () => {};
        };
      },
    },
    advance(ms: number) {
      nowMs += ms;
      act(() => {
        tick();
      });
    },
  };
}

describe('S7 stall chrome (AC-PL-7)', () => {
  it('keeps the last frame and shows the indicator after the watchdog plus 1.5 s', async () => {
    const pacing = stallClock();
    const bridge = await readyBridge();
    render(
      <PlayerSurface bridge={bridge} episodeId="ep_1" playlist={playlist} stall={pacing.pacing} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    act(() => {
      MockVePlayer.instances[0]!.emitForTest('play');
    });
    expect(screen.queryByTestId('player-stall')).toBeNull();
    pacing.advance(2_000);
    expect(screen.queryByTestId('player-stall')).toBeNull();
    pacing.advance(1_500);

    expect(screen.getByTestId('player-stall').getAttribute('data-phase')).toBe('indicator');
    expect(screen.getByTestId('player-stall-indicator')).toBeDefined();
    expect(screen.queryByTestId('player-stall-retry')).toBeNull();
    expect(MockVePlayer.instances[0]?.destroyed).toBe(false);
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(forbiddenElements()).toEqual([]);
  });

  it('offers retry at 8 s without changing definition, and retry keeps the instance', async () => {
    const onStallRetry = vi.fn();
    const pacing = stallClock();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onStallRetry={onStallRetry}
        playlist={playlist}
        stall={pacing.pacing}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    act(() => {
      MockVePlayer.instances[0]!.emitForTest('play');
    });
    pacing.advance(2_000 + 8_000);

    expect(screen.getByTestId('player-stall').getAttribute('data-phase')).toBe('retry');
    fireEvent.click(screen.getByTestId('player-stall-retry'));
    expect(onStallRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('player-stall')).toBeNull();
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.destroyed).toBe(false);
    expect(screen.getByTestId('player-container')).toBeDefined();
  });

  it('clears the overlay when position advances and does not stall a pause', async () => {
    const pacing = stallClock();
    const bridge = await readyBridge();
    render(
      <PlayerSurface bridge={bridge} episodeId="ep_1" playlist={playlist} stall={pacing.pacing} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const instance = MockVePlayer.instances[0]!;
    act(() => {
      instance.emitForTest('play');
    });
    pacing.advance(2_000 + 1_500);
    expect(screen.getByTestId('player-stall')).toBeDefined();
    act(() => {
      instance.tick(3, 90);
    });
    expect(screen.queryByTestId('player-stall')).toBeNull();

    act(() => {
      instance.pause();
    });
    pacing.advance(2_000 + 8_000);
    expect(screen.queryByTestId('player-stall')).toBeNull();
    expect(instance.destroyed).toBe(false);
  });

  it('does not invent 倍速, axe-core, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/PlayerSurface.tsx'), 'utf8');
    expect(source).not.toMatch(/playbackRate|axe-core|#\/vip|postgres:/);
    expect(source).not.toMatch(/preventDefault\(/);
    expect(source).not.toMatch(/facadeRef\.current\?\.pause|facadeRef\.current\?\.play\(/);
  });
});

function startClock() {
  let nowMs = 0;
  let tick: () => void = () => {};
  return {
    pacing: {
      now: () => nowMs,
      schedule: (fn: () => void) => {
        tick = fn;
        return () => {
          tick = () => {};
        };
      },
    },
    advance(ms: number) {
      nowMs += ms;
      act(() => {
        tick();
      });
    },
  };
}

describe('CN-10 start / switch first-frame timeout', () => {
  it('keeps the last frame and shows the indicator after 300 ms without PLAY', async () => {
    MockVePlayer.holdPlay = true;
    const pacing = startClock();
    const bridge = await readyBridge();
    render(
      <PlayerSurface bridge={bridge} episodeId="ep_1" playlist={playlist} start={pacing.pacing} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    expect(screen.queryByTestId('player-start')).toBeNull();
    pacing.advance(300);
    expect(screen.getByTestId('player-start').getAttribute('data-phase')).toBe('indicator');
    expect(screen.getByTestId('player-start-indicator')).toBeDefined();
    expect(screen.queryByTestId('player-start-retry')).toBeNull();
    expect(MockVePlayer.instances[0]?.destroyed).toBe(false);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(forbiddenElements()).toEqual([]);
  });

  it('offers retry at 15 s without skipping or changing definition', async () => {
    MockVePlayer.holdPlay = true;
    const onStartTimeout = vi.fn();
    const pacing = startClock();
    const bridge = await readyBridge();
    render(
      <PlayerSurface
        bridge={bridge}
        episodeId="ep_1"
        onStartTimeout={onStartTimeout}
        playlist={playlist}
        start={pacing.pacing}
      />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    pacing.advance(15_000);

    expect(screen.getByTestId('player-start').getAttribute('data-phase')).toBe('timeout');
    fireEvent.click(screen.getByTestId('player-start-retry'));
    expect(onStartTimeout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('player-start')).toBeNull();
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.destroyed).toBe(false);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
    expect(MockVePlayer.instances[0]?.currentEpisodeId).toBe('ep_1');
    expect(screen.getByTestId('player-container')).toBeDefined();
  });

  it('clears the overlay when PLAY arrives and does not time out a started episode', async () => {
    MockVePlayer.holdPlay = true;
    const pacing = startClock();
    const bridge = await readyBridge();
    render(
      <PlayerSurface bridge={bridge} episodeId="ep_1" playlist={playlist} start={pacing.pacing} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const instance = MockVePlayer.instances[0]!;
    pacing.advance(300);
    expect(screen.getByTestId('player-start')).toBeDefined();
    act(() => {
      instance.play();
    });
    expect(screen.queryByTestId('player-start')).toBeNull();
    pacing.advance(15_000);
    expect(screen.queryByTestId('player-start')).toBeNull();
    expect(instance.destroyed).toBe(false);
    expect(instance.playNextCount).toBe(0);
  });

  it('re-arms on an entitled switch and does not skip when that PLAY never arrives', async () => {
    const pacing = startClock();
    const bridge = await readyBridge();
    const { rerender } = render(
      <PlayerSurface bridge={bridge} episodeId="ep_1" playlist={playlist} start={pacing.pacing} />,
    );

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });
    const instance = MockVePlayer.instances[0]!;
    expect(screen.queryByTestId('player-start')).toBeNull();

    MockVePlayer.holdPlay = true;
    rerender(
      <PlayerSurface bridge={bridge} episodeId="ep_2" playlist={playlist} start={pacing.pacing} />,
    );
    await waitFor(() => {
      expect(instance.playNextCount).toBe(1);
    });
    pacing.advance(15_000);
    expect(screen.getByTestId('player-start').getAttribute('data-phase')).toBe('timeout');
    expect(instance.playNextCount).toBe(1);
    expect(instance.currentEpisodeId).toBe('ep_2');
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(instance.destroyed).toBe(false);
  });
});
