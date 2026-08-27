import { afterEach, describe, expect, it, vi } from 'vitest';

import { MockVePlayer } from '../player/mock-veplayer';
import { TikTokBridge } from './tiktok-bridge';
import { installFailClosedVideoReplace, refuseVideoReplace } from './video-replace';
import type { VideoReplaceCallback } from './video-replace';

/**
 * A stand-in for the element the platform would hand the callback. Constructed without
 * `createElement('video')`, which lint, the bundle scan and the source rules all reject — even
 * in tests — because a fixture that built the banned element would teach the suite the element
 * is fine.
 */
function disallowedVideo(): HTMLVideoElement {
  return { nodeName: 'VIDEO', tagName: 'VIDEO' } as HTMLVideoElement;
}

describe('refuseVideoReplace', () => {
  it("returns null, which leaves TikTok's default blocked UI in place", () => {
    expect(refuseVideoReplace(disallowedVideo(), 'native-html-video')).toBeNull();
  });

  it('does not return the original element, which would keep native video on screen', () => {
    const videoEl = disallowedVideo();
    expect(refuseVideoReplace(videoEl, 'native-html-video')).not.toBe(videoEl);
  });

  it('does not return an HTMLElement of any kind, which would be a custom replacement', () => {
    const result: HTMLElement | null = refuseVideoReplace(disallowedVideo(), 'third-party-player');
    expect(result).toBeNull();
    expect(result instanceof HTMLElement).toBe(false);
  });

  it.each(['native-html-video', 'third-party-player', 'migration', 'exemption', ''])(
    'refuses to customize for replaceReason %j — no reason is a reason to paint our own UI',
    (replaceReason) => {
      expect(refuseVideoReplace(disallowedVideo(), replaceReason)).toBeNull();
    },
  );
});

describe('installFailClosedVideoReplace', () => {
  it('installs refuseVideoReplace, not a different callback', () => {
    const setValidateVideoReplaceElement = vi.fn();
    const result = installFailClosedVideoReplace({ setValidateVideoReplaceElement });

    expect(result).toBe('installed');
    expect(setValidateVideoReplaceElement).toHaveBeenCalledTimes(1);
    expect(setValidateVideoReplaceElement).toHaveBeenCalledWith(refuseVideoReplace);
    expect(setValidateVideoReplaceElement.mock.calls[0]?.[0]).toBe(refuseVideoReplace);
  });

  it('binds the installer to the target, because the SDK method is a method', () => {
    const target = {
      setValidateVideoReplaceElement(this: unknown, _callback: VideoReplaceCallback) {
        expect(this).toBe(target);
      },
    };
    expect(installFailClosedVideoReplace(target)).toBe('installed');
  });

  it('reports absent when the method is missing, rather than inventing a replacement path', () => {
    expect(installFailClosedVideoReplace({})).toBe('absent');
    expect(
      installFailClosedVideoReplace({ setValidateVideoReplaceElement: 'not-a-function' }),
    ).toBe('absent');
    expect(installFailClosedVideoReplace(null)).toBe('absent');
    expect(installFailClosedVideoReplace(undefined)).toBe('absent');
    expect(installFailClosedVideoReplace('TTMinis')).toBe('absent');
  });

  it('installs on a constructor, which is what getPlayer returns', () => {
    const setValidateVideoReplaceElement = vi.fn();
    const ctor = function FakePlayer() {
      /* body unused: only the static method is under test */
    };
    (ctor as unknown as Record<string, unknown>)['setValidateVideoReplaceElement'] =
      setValidateVideoReplaceElement;

    expect(installFailClosedVideoReplace(ctor)).toBe('installed');
    expect(setValidateVideoReplaceElement).toHaveBeenCalledWith(refuseVideoReplace);
  });

  it('reports threw and does not rethrow, so a broken SDK cannot take boot down', () => {
    expect(
      installFailClosedVideoReplace({
        setValidateVideoReplaceElement: () => {
          throw new Error('sdk exploded');
        },
      }),
    ).toBe('threw');
  });

  /**
   * The mutation this exists to catch: a callback that returns the original `<video>` (keep
   * native playback) or any other element (custom blocked UI). The installer must pass the
   * refused callback, and that callback must still return null when the SDK invokes it.
   */
  it('the installed callback still returns null when the SDK later invokes it', () => {
    let installed: VideoReplaceCallback | undefined;
    installFailClosedVideoReplace({
      setValidateVideoReplaceElement: (callback: VideoReplaceCallback) => {
        installed = callback;
      },
    });

    expect(installed).toBe(refuseVideoReplace);
    expect(installed?.(disallowedVideo(), 'native-html-video')).toBeNull();
  });
});

describe('TikTokBridge wires the fail-closed replace policy', () => {
  const globalObject = globalThis as { TTMinis?: unknown };
  let previous: unknown;

  afterEach(() => {
    if (previous === undefined) {
      delete globalObject.TTMinis;
    } else {
      globalObject.TTMinis = previous;
    }
    previous = undefined;
    MockVePlayer.reset();
  });

  function withNamespace(namespace: Record<string, unknown>): void {
    previous = globalObject.TTMinis;
    globalObject.TTMinis = namespace;
  }

  function namespace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      getPlayer: () => MockVePlayer,
      init: (options: Record<string, unknown>) => {
        (options['success'] as () => void)();
      },
      canIUse: () => true,
      ...overrides,
    };
  }

  it('installs refuseVideoReplace on the namespace at init', async () => {
    const setValidateVideoReplaceElement = vi.fn();
    withNamespace(namespace({ setValidateVideoReplaceElement }));

    const bridge = new TikTokBridge('test-client-key');
    const result = await bridge.init();

    expect(result.ok).toBe(true);
    expect(setValidateVideoReplaceElement).toHaveBeenCalledTimes(1);
    expect(setValidateVideoReplaceElement).toHaveBeenCalledWith(refuseVideoReplace);
  });

  it('still inits when the method is missing — the platform default is already fail-closed', async () => {
    withNamespace(namespace());

    const bridge = new TikTokBridge('test-client-key');
    const result = await bridge.init();

    expect(result.ok).toBe(true);
  });

  it('still inits when the installer throws', async () => {
    withNamespace(
      namespace({
        setValidateVideoReplaceElement: () => {
          throw new Error('replace API rejected the callback');
        },
      }),
    );

    const bridge = new TikTokBridge('test-client-key');
    const result = await bridge.init();

    expect(result.ok).toBe(true);
  });

  it('installs the same callback on the constructor getPlayer returns', async () => {
    const setOnCtor = vi.fn();
    const ctor = function FakePlayer() {
      /* the constructor body is irrelevant; only the static method is under test */
    };
    (ctor as unknown as Record<string, unknown>)['setValidateVideoReplaceElement'] = setOnCtor;
    withNamespace(namespace({ getPlayer: () => ctor }));

    const bridge = new TikTokBridge('test-client-key');
    expect((await bridge.init()).ok).toBe(true);

    const ctorResult = await bridge.getPlayerCtor();
    expect(ctorResult.ok).toBe(true);
    expect(setOnCtor).toHaveBeenCalledTimes(1);
    expect(setOnCtor).toHaveBeenCalledWith(refuseVideoReplace);
  });

  it('does not treat a getPlayer constructor without the method as a player failure', async () => {
    withNamespace(namespace({ getPlayer: () => MockVePlayer }));

    const bridge = new TikTokBridge('test-client-key');
    expect((await bridge.init()).ok).toBe(true);

    const ctorResult = await bridge.getPlayerCtor();
    expect(ctorResult.ok).toBe(true);
    expect(ctorResult.ok && ctorResult.value).toBe(MockVePlayer);
  });
});
