import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from './mock-veplayer';
import { PlayerSurface } from './PlayerSurface';

const descriptor: PlaybackDescriptor = {
  albumId: 'album_1',
  episodeId: 'ep_1',
  vid: 'vid_1',
  resumePositionSec: 0,
};

beforeEach(() => {
  MockVePlayer.reset();
});

async function readyBridge(...args: ConstructorParameters<typeof MockBridge>) {
  const bridge = new MockBridge(...args);
  await bridge.init();
  return bridge;
}

describe('PlayerSurface', () => {
  it('mounts a player into its container', async () => {
    const bridge = await readyBridge();
    render(<PlayerSurface bridge={bridge} descriptor={descriptor} />);

    await waitFor(() => {
      expect(screen.getByTestId('player-surface').dataset['state']).toBe('playing');
    });
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(screen.getByTestId('player-container').querySelector('video')).toBeNull();
  });

  it('destroys the player when it unmounts', async () => {
    const bridge = await readyBridge();
    const { unmount } = render(<PlayerSurface bridge={bridge} descriptor={descriptor} />);

    await waitFor(() => {
      expect(MockVePlayer.instances).toHaveLength(1);
    });

    unmount();
    await waitFor(() => {
      expect(MockVePlayer.instances.every((instance) => instance.destroyed)).toBe(true);
    });
  });

  it('shows a retryable message instead of an empty frame when the player is unavailable', async () => {
    const bridge = await readyBridge({ unavailable: ['getPlayer'] });
    render(<PlayerSurface bridge={bridge} descriptor={descriptor} />);

    expect(await screen.findByTestId('player-unavailable')).toBeDefined();
    expect(screen.getByTestId('player-surface').dataset['state']).toBe('unavailable');
    expect(MockVePlayer.instances).toHaveLength(0);
  });
});
