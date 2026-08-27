import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from '../player/mock-veplayer';
import { PlayPage } from './PlayPage';
import { ROUTES } from './routes';
import { renderSurface } from '../testing/render';

beforeEach(() => {
  MockVePlayer.reset();
});

async function readyBridge(): Promise<MockBridge> {
  const bridge = new MockBridge();
  await bridge.init();
  return bridge;
}

function renderPlayer(bridge: MockBridge, episodeId = 'ep_demo_0001') {
  return renderSurface(
    <Routes>
      <Route path={ROUTES.play} element={<PlayPage bridge={bridge} />} />
    </Routes>,
    { path: `/play/${episodeId}` },
  );
}

async function player(): Promise<MockVePlayer> {
  await waitFor(() => {
    expect(MockVePlayer.instances).toHaveLength(1);
  });
  return MockVePlayer.instances[0]!;
}

describe('the player screen', () => {
  it('opens on the episode named in the route', async () => {
    renderPlayer(await readyBridge(), 'ep_demo_0003');

    expect((await player()).config.episodeId).toBe('ep_demo_0003');
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe('ep_demo_0003');
    expect(screen.getByTestId('player-episode-label').textContent).toBe('Episode 3');
  });

  it('carries no native media element, on a screen whose whole job is media', async () => {
    renderPlayer(await readyBridge());
    await player();

    expect(screen.getByTestId('play-page').querySelectorAll('video, audio, iframe')).toHaveLength(
      0,
    );
    expect(screen.getByTestId('player-container').querySelector('[data-mock-veplayer]')).not.toBe(
      null,
    );
  });

  it('advances the retained player when the viewer moves to the next episode', async () => {
    renderPlayer(await readyBridge(), 'ep_demo_0001');
    const first = await player();

    fireEvent.click(screen.getByTestId('player-next'));

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe('ep_demo_0002');
    });
    await waitFor(() => {
      expect(first.playNextCount).toBe(1);
    });
    // The point of the whole slot: the next episode is a call on the player that is already
    // running, not a second player.
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(first.destroyed).toBe(false);
    expect(first.currentEpisodeId).toBe('ep_demo_0002');
  });

  it('keeps one instance across a walk through several episodes', async () => {
    renderPlayer(await readyBridge(), 'ep_demo_0001');
    const first = await player();

    fireEvent.click(screen.getByTestId('player-next'));
    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe('ep_demo_0002');
    });
    fireEvent.click(screen.getByTestId('player-next'));
    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe('ep_demo_0003');
    });

    await waitFor(() => {
      expect(first.currentEpisodeId).toBe('ep_demo_0003');
    });
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(first.playNextCount).toBe(2);
  });

  it('offers no next episode at the end of the album', async () => {
    renderPlayer(await readyBridge(), 'ep_demo_0006');
    await player();

    expect(screen.queryByTestId('player-next')).toBe(null);
    expect(screen.getByTestId('player-queue-end')).toBeDefined();
  });

  it('opens an unknown episode at the start of the album rather than on an error', async () => {
    renderPlayer(await readyBridge(), 'ep_not_in_this_album');

    expect((await player()).config.episodeId).toBe('ep_demo_0001');
    expect(screen.queryByTestId('player-unavailable')).toBe(null);
  });

  it('destroys the player on the way out of the screen', async () => {
    const { unmount } = renderPlayer(await readyBridge());
    const first = await player();

    unmount();
    await waitFor(() => {
      expect(first.destroyed).toBe(true);
    });
  });
});
