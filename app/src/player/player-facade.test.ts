import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from './mock-veplayer';
import { createPlayerFacade } from './player-facade';
import type { VePlayerInstance } from './veplayer-types';

const descriptor: PlaybackDescriptor = {
  albumId: 'album_1',
  episodeId: 'ep_1',
  vid: 'vid_1',
  resumePositionSec: 42,
};

function episode(episodeNumber: number): PlaybackDescriptor {
  return {
    albumId: 'album_1',
    episodeId: `ep_${String(episodeNumber)}`,
    vid: `vid_${String(episodeNumber)}`,
    resumePositionSec: 0,
  };
}

const upNext = [episode(2), episode(3)];

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

  it('keeps the progress plugin and does not invent a playbackRate ladder', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, { container, descriptor });

    const config = MockVePlayer.instances[0]?.config;
    expect(config?.ignores).toEqual([
      'moreButtonPlugin',
      'enter',
      'fullscreen',
      'volume',
      'play',
      'pip',
      'replay',
      'sdkDefinitionPlugin',
    ]);
    expect(config?.ignores.join(',')).not.toMatch(/progress/i);
    expect(config?.closeVideoClick).toBe(false);
    expect(config?.closeVideoDblclick).toBe(true);
    expect(config?.ignores).not.toContain('playbackrate');
    expect('playbackRate' in (config ?? {})).toBe(false);
    expect(container.querySelector('input, video, select, [role="slider"]')).toBeNull();
    expect(container.querySelector('[data-veplayer-progress="kept"]')).not.toBeNull();
    expect(container.querySelector('[data-veplayer-playbackrate="kept"]')).not.toBeNull();
    expect(container.querySelector('[data-veplayer-tap-pause="kept"]')).not.toBeNull();
  });

  it('starts at 0 when the session resume is 0, not at a guessed duration', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, {
      container,
      descriptor: { ...descriptor, resumePositionSec: 0 },
    });

    expect(MockVePlayer.instances[0]?.config.startTime).toBe(0);
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
    const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.playNext()).toBe(true);
    expect(MockVePlayer.instances).toHaveLength(1);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(1);
    expect(result.value.currentEpisode().episodeId).toBe('ep_2');
    // The same instance object, not merely the same count: an instance swapped for an identical
    // one would keep the count at one and lose the preloaded next episode all the same.
    expect(result.value.instance).toBe(MockVePlayer.instances[0]);
  });

  it('gives the player the album in order, which is what makes playNext mean anything', async () => {
    const bridge = await readyBridge();
    await createPlayerFacade(bridge, { container, descriptor, upNext });

    expect(MockVePlayer.instances[0]?.preloadList.map((item) => item.episodeId)).toEqual([
      'ep_1',
      'ep_2',
      'ep_3',
    ]);
    // Identifiers only. A URL in a preload list would be the media plane leaking back into the
    // client, which is the whole of correction A4.
    expect(MockVePlayer.instances[0]?.preloadList[1]).toEqual({
      albumId: 'album_1',
      episodeId: 'ep_2',
      vid: 'vid_2',
    });
  });

  it('plays without preload on a client whose player has no preload module', async () => {
    const bridge = await readyBridge();
    // Below the MP4 + MSE bar the preload module is absent (risk M-3). The facade feature-detects
    // it, so this is a player that starts each episode cold — not a player that fails to build.
    class NoPreloadPlayer implements VePlayerInstance {
      static playNextCount = 0;

      play(): void {}
      pause(): void {}
      playNext(): void {
        NoPreloadPlayer.playNextCount += 1;
      }
      destroy(): void {}
      on(): void {}
      off(): void {}
    }

    vi.spyOn(bridge, 'getPlayerCtor').mockResolvedValue({ ok: true, value: NoPreloadPlayer });

    const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.playNext()).toBe(true);
    expect(result.value.currentEpisode().episodeId).toBe('ep_2');
    expect(NoPreloadPlayer.playNextCount).toBe(1);
  });

  it('refuses to advance past the end of the queue rather than asking the player to guess', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // The end of a drama is a screen, not a playback command: there is no session for whatever the
    // player would decide comes next.
    expect(result.value.playNext()).toBe(false);
    expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
    expect(result.value.currentEpisode().episodeId).toBe('ep_1');
  });

  describe('switchToEpisode', () => {
    it('does nothing at all when the episode asked for is already playing', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.switchToEpisode('ep_1')).toBe('UNCHANGED');
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
    });

    it('advances the retained instance to the following episode', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.switchToEpisode('ep_2')).toBe('ADVANCED');
      expect(result.value.switchToEpisode('ep_3')).toBe('ADVANCED');
      expect(MockVePlayer.instances).toHaveLength(1);
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(2);
      expect(MockVePlayer.instances[0]?.currentEpisodeId).toBe('ep_3');
    });

    it('reports a jump as out of reach instead of calling playNext repeatedly', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      // Reaching ep_3 from ep_1 by advancing twice would start ep_2, with the play event and the
      // analytics that implies, on the way to an episode nobody asked for.
      expect(result.value.switchToEpisode('ep_3')).toBe('OUT_OF_REACH');
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
      expect(result.value.currentEpisode().episodeId).toBe('ep_1');
    });

    it('reports a step backwards as out of reach, because playNext only goes forwards', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.switchToEpisode('ep_2')).toBe('ADVANCED');
      expect(result.value.switchToEpisode('ep_1')).toBe('OUT_OF_REACH');
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(1);
    });

    it('reports an episode from another album as out of reach', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.switchToEpisode('ep_other_1')).toBe('OUT_OF_REACH');
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
    });
  });

  describe('enqueueNext', () => {
    it('lets playNext reach an episode the gate just entitled, without a second instance', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.enqueueNext(episode(2))).toBe(true);
      expect(result.value.playNext()).toBe(true);
      expect(MockVePlayer.instances).toHaveLength(1);
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(1);
      expect(result.value.currentEpisode().episodeId).toBe('ep_2');
      expect(MockVePlayer.instances[0]?.preloadList.map((item) => item.episodeId)).toEqual([
        'ep_1',
        'ep_2',
      ]);
      expect(JSON.stringify(MockVePlayer.instances[0]?.preloadList)).not.toMatch(
        /playUrl|https?:|\.m3u8/i,
      );
    });

    it('is a no-op when that episode is already the following one', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.enqueueNext(episode(2))).toBe(true);
      expect(MockVePlayer.instances[0]?.preloadList.map((item) => item.episodeId)).toEqual([
        'ep_1',
        'ep_2',
        'ep_3',
      ]);
    });

    it('refuses to replace a queued next with a different episode', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.enqueueNext(episode(9))).toBe(false);
      expect(MockVePlayer.instances[0]?.preloadList.map((item) => item.episodeId)).toEqual([
        'ep_1',
        'ep_2',
        'ep_3',
      ]);
    });
  });

  describe('reissue', () => {
    it('replaces the current token on the retained instance without playNext', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, {
        container,
        descriptor: { ...descriptor, playAuthToken: 'token-old' },
        upNext,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      const instance = MockVePlayer.instances[0]!;
      expect(
        result.value.reissue({
          ...descriptor,
          playAuthToken: 'token-new',
          resumePositionSec: 12,
        }),
      ).toBe(true);
      expect(MockVePlayer.instances).toHaveLength(1);
      expect(instance.destroyed).toBe(false);
      expect(instance.playNextCount).toBe(0);
      expect(instance.currentEpisodeId).toBe('ep_1');
      expect(instance.currentPlayAuthToken).toBe('token-new');
      expect(instance.config.startTime).toBe(42);
      expect(result.value.currentEpisode().playAuthToken).toBe('token-new');
    });

    it('refuses a different episode, because that is 切集 not a re-issue', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.reissue(episode(2))).toBe(false);
      expect(MockVePlayer.instances[0]?.playNextCount).toBe(0);
      expect(result.value.currentEpisode().episodeId).toBe('ep_1');
    });

    it('is inert after destroy', async () => {
      const bridge = await readyBridge();
      const result = await createPlayerFacade(bridge, {
        container,
        descriptor: { ...descriptor, playAuthToken: 'token-old' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      result.value.destroy();
      expect(result.value.reissue({ ...descriptor, playAuthToken: 'token-new' })).toBe(false);
      expect(MockVePlayer.instances[0]?.currentPlayAuthToken).toBe('token-old');
    });
  });

  it('pauses and resumes on click of the retained instance, without a product control', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const instance = MockVePlayer.instances[0]!;
    expect(instance.playing).toBe(true);
    container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(instance.playing).toBe(false);
    expect(MockVePlayer.instances).toHaveLength(1);
    container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(instance.playing).toBe(true);
    expect(instance.destroyed).toBe(false);
    expect(container.querySelector('video, audio, iframe, button, [role="button"]')).toBeNull();
    result.value.destroy();
  });

  it('is inert after destroy, because a resolved promise can still hold a reference', async () => {
    const bridge = await readyBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor, upNext });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const player = MockVePlayer.instances[0]!;
    result.value.destroy();
    const playSpy = vi.spyOn(player, 'play');
    const pauseSpy = vi.spyOn(player, 'pause');

    result.value.play();
    result.value.pause();
    expect(result.value.playNext()).toBe(false);
    expect(result.value.enqueueNext(episode(2))).toBe(false);
    expect(result.value.switchToEpisode('ep_2')).toBe('OUT_OF_REACH');

    expect(playSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(player.playNextCount).toBe(0);
  });

  it('destroys the instance it built when configuring it throws', async () => {
    const bridge = await readyBridge();
    class UnconfigurablePlayer extends MockVePlayer {
      override setPreloadList(): void {
        throw new Error('preload module rejected the list');
      }
    }
    vi.spyOn(bridge, 'getPlayerCtor').mockResolvedValue({ ok: true, value: UnconfigurablePlayer });

    const result = await createPlayerFacade(bridge, { container, descriptor, upNext });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNKNOWN');
    // Built, unusable, and nobody left holding a reference to it: it has to be torn down here.
    expect(MockVePlayer.instances[0]?.destroyed).toBe(true);
    expect(container.children).toHaveLength(0);
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
