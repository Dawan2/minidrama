import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from './mock-veplayer';
import { createPlayerFacade } from './player-facade';

const descriptor: PlaybackDescriptor = {
  albumId: 'album_1',
  episodeId: 'ep_1',
  vid: 'vid_1',
  resumePositionSec: 42,
};

async function readyBridge(...args: ConstructorParameters<typeof MockBridge>) {
  const bridge = new MockBridge(...args);
  await bridge.init();
  return bridge;
}

let container: HTMLElement;

beforeEach(() => {
  MockVePlayer.reset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe('createPlayerFacade', () => {
  it('constructs exactly one player through the bridge', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });

    expect(result.ok).toBe(true);
    expect(MockVePlayer.instances).toHaveLength(1);
  });

  it('always enables MP4 + MSE, which the preload module requires', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, { container, descriptor });

    expect(MockVePlayer.instances[0]?.config.enableMp4MSE).toBe(true);
  });

  it('resumes from the descriptor position and defaults the player language to English', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, { container, descriptor });

    expect(MockVePlayer.instances[0]?.config.startTime).toBe(42);
    expect(MockVePlayer.instances[0]?.config.lang).toBe('en');
  });

  it('omits playAuthToken entirely when the descriptor has none', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, { container, descriptor });

    // Newer TikTok clients play from the identifiers alone. Passing an explicit `undefined` is
    // not the same as omitting the field, and the player is the one that decides.
    expect('playAuthToken' in (MockVePlayer.instances[0]?.config ?? {})).toBe(false);
  });

  it('forwards playAuthToken when the descriptor carries one', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, {
      container,
      descriptor: { ...descriptor, playAuthToken: 'token-1' },
    });

    expect(MockVePlayer.instances[0]?.config.playAuthToken).toBe('token-1');
  });

  // The constraint the whole playback design rests on: no native HTML video, anywhere.
  it('creates no video or iframe element in the container', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, { container, descriptor });

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[data-mock-veplayer]')).not.toBeNull();
  });

  it('subscribes to player events and unsubscribes on destroy', async () => {
    const bridge = await readyBridge();
    const onEvent = vi.fn();
    const result = await createPlayerFacade(bridge, { container, descriptor, onEvent });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    MockVePlayer.instances[0]?.emitForTest('timeupdate', { currentTime: 1 });
    expect(onEvent).toHaveBeenCalledWith('timeupdate', { currentTime: 1 });

    onEvent.mockClear();
    result.value.destroy();
    MockVePlayer.instances[0]?.emitForTest('timeupdate', { currentTime: 2 });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('destroys the instance and clears the container', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    result.value.destroy();
    expect(MockVePlayer.instances[0]?.destroyed).toBe(true);
    expect(container.children).toHaveLength(0);
  });

  it('is idempotent on destroy, because a StrictMode cleanup can run twice', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const destroySpy = vi.spyOn(MockVePlayer.instances[0]!, 'destroy');
    result.value.destroy();
    result.value.destroy();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('switches episodes on the retained instance instead of building a new one', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    result.value.playNext();
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(1);
  });

  // §3.1: a player failure degrades, it does not become an exception the caller must catch.
  it('returns a typed error when the player capability is missing', async () => {
    const bridge = await readyBridge({ unavailable: ['getPlayer'] });
    const result = await createPlayerFacade(bridge, { container, descriptor });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNSUPPORTED');
    expect(MockVePlayer.instances).toHaveLength(0);
  });

  it('returns a typed error when the player constructor throws', async () => {
    const bridge = await readyBridge();
    vi.spyOn(bridge, 'getPlayerCtor').mockResolvedValue({
      ok: true,
      value: class {
        constructor() {
          throw new Error('kernel init failed');
        }
      } as never,
    });

    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNKNOWN');
  });
});
