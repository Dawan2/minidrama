import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, type PlaybackDescriptor, type WatchProgressReport } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from './mock-veplayer';
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

  it('treats a double-tap as a like and a single tap as nothing', async () => {
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
});
