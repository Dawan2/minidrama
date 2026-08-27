import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { installFailClosedVideoReplace, refuseVideoReplace } from '../platform/video-replace';
import { MockVePlayer } from './mock-veplayer';
import { createPlayerFacade } from './player-facade';
import {
  MEDIA_HANDLE_KEY,
  MEDIA_HANDLE_VALUE,
  PLY_002_REQUIRED_HOSTS,
  leakingMediaHandleKeys,
  leakingMediaHandleValues,
  measurePly002EquivalentHost,
} from './ply-002-probe';
import type { VePlayerConfig, VePlayerPlaylistItem } from './veplayer-types';

/**
 * C3 exit PLY-002, as a contract this repository can enforce without a TikTok WebView.
 *
 * Three properties, and not a fourth:
 *   1. the player is obtained through `bridge.getPlayerCtor()`;
 *   2. native-`<video>` replacement stays fail-closed (`refuseVideoReplace` → `null`);
 *   3. no media URL / MSE locator reaches VePlayer.
 *
 * Host MSE/EME availability is *not* asserted. `measurePly002EquivalentHost` is pinned to
 * `unmeasured` so a later slot cannot flip it to "available" from jsdom (`docs/gates/ply-002.md`).
 */

const descriptor: PlaybackDescriptor = {
  albumId: 'album_1',
  episodeId: 'ep_1',
  vid: 'vid_1',
  resumePositionSec: 0,
};

const upNext: readonly PlaybackDescriptor[] = [
  { albumId: 'album_1', episodeId: 'ep_2', vid: 'vid_2', resumePositionSec: 0 },
];

/** Vitest runs this package with cwd = `app/`. jsdom's `import.meta.url` is not a file: URL. */
const APP_ROOT = process.cwd();

function disallowedVideo(): HTMLVideoElement {
  return { nodeName: 'VIDEO', tagName: 'VIDEO' } as HTMLVideoElement;
}

function productionSourceFiles(relativeDir: string): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) {
        continue;
      }
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
        continue;
      }
      found.push(full);
    }
  };
  walk(join(APP_ROOT, relativeDir));
  return found;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

async function readyMockBridge() {
  const bridge = new MockBridge();
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

describe('PLY-002 host measurement stays fail-closed', () => {
  it('does not invent an equivalent-WebView MSE/EME result in this process', () => {
    const measurement = measurePly002EquivalentHost();

    expect(measurement.status).toBe('unmeasured');
    expect(measurement.reason).toBe('NOT_EQUIVALENT_WEBVIEW_AND_NOT_TIKTOK_WEBVIEW');
    expect(measurement.requiredHosts).toEqual(PLY_002_REQUIRED_HOSTS);
    expect(measurement.constructedMediaSource).toBe(false);
  });

  it('does not construct MediaSource or ManagedMediaSource to produce that answer', () => {
    const mediaSource = vi.fn();
    const managed = vi.fn();
    const globalObject = globalThis as {
      MediaSource?: unknown;
      ManagedMediaSource?: unknown;
    };
    const previousMedia = globalObject.MediaSource;
    const previousManaged = globalObject.ManagedMediaSource;
    globalObject.MediaSource = mediaSource;
    globalObject.ManagedMediaSource = managed;

    try {
      const measurement = measurePly002EquivalentHost();
      expect(measurement.status).toBe('unmeasured');
      expect(mediaSource).not.toHaveBeenCalled();
      expect(managed).not.toHaveBeenCalled();
    } finally {
      if (previousMedia === undefined) {
        delete globalObject.MediaSource;
      } else {
        globalObject.MediaSource = previousMedia;
      }
      if (previousManaged === undefined) {
        delete globalObject.ManagedMediaSource;
      } else {
        globalObject.ManagedMediaSource = previousManaged;
      }
    }
  });
});

describe('getPlayer ctor', () => {
  it('constructs the player only through bridge.getPlayerCtor', async () => {
    const bridge = await readyMockBridge();
    const getPlayerCtor = vi.spyOn(bridge, 'getPlayerCtor');

    const result = await createPlayerFacade(bridge, { container, descriptor, upNext });

    expect(result.ok).toBe(true);
    expect(getPlayerCtor).toHaveBeenCalledTimes(1);
    expect(MockVePlayer.instances).toHaveLength(1);
    const ctorResult = await getPlayerCtor.mock.results[0]?.value;
    expect(ctorResult).toEqual({ ok: true, value: MockVePlayer });
    expect(MockVePlayer.instances[0]).toBeInstanceOf(MockVePlayer);
  });

  it('does not obtain the constructor from window.TTMinis in the facade source', () => {
    const source = readFileSync(join(APP_ROOT, 'src/player/player-facade.ts'), 'utf8');
    expect(source).toContain('bridge.getPlayerCtor()');
    expect(source).not.toMatch(/\bTTMinis\b/);
    expect(source).not.toMatch(/\bnew MockVePlayer\b/);
  });
});

describe('replace-element stays fail-closed', () => {
  it('creates no native media element when the facade mounts a player', async () => {
    const bridge = await readyMockBridge();
    const result = await createPlayerFacade(bridge, { container, descriptor });
    expect(result.ok).toBe(true);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(refuseVideoReplace(disallowedVideo(), 'native-html-video')).toBeNull();
  });

  it('installs refuseVideoReplace on a constructor, which is what getPlayer returns', () => {
    // Product code outside `src/platform/` must not name `TTMinis`. The documented second home
    // of the installer is still the constructor `getPlayer()` returns, so the probe pins that
    // shape here and leaves namespace wiring to `video-replace.test.ts`.
    const setOnCtor = vi.fn();
    const ctor = function FakePlayer() {
      /* body unused: only the static installer is under test */
    };
    (ctor as unknown as Record<string, unknown>)['setValidateVideoReplaceElement'] = setOnCtor;

    expect(installFailClosedVideoReplace(ctor)).toBe('installed');
    expect(setOnCtor).toHaveBeenCalledTimes(1);
    expect(setOnCtor).toHaveBeenCalledWith(refuseVideoReplace);
    const installed = setOnCtor.mock.calls[0]?.[0] as typeof refuseVideoReplace;
    expect(installed(disallowedVideo(), 'third-party-player')).toBeNull();
  });
});

describe('no MSE URL leak into VePlayer', () => {
  type MediaHandleKey = `${string}Url` | `${string}Uri` | 'url' | 'src' | `${string}Manifest`;
  const _configCarriesNoMediaHandle: Extract<keyof VePlayerConfig, MediaHandleKey> extends never
    ? true
    : false = true;
  const _playlistCarriesNoMediaHandle: Extract<
    keyof VePlayerPlaylistItem,
    MediaHandleKey
  > extends never
    ? true
    : false = true;
  const _descriptorCarriesNoMediaHandle: Extract<
    keyof PlaybackDescriptor,
    MediaHandleKey
  > extends never
    ? true
    : false = true;

  it('keeps URL-shaped members off the constructor, playlist and descriptor types', () => {
    expect(_configCarriesNoMediaHandle).toBe(true);
    expect(_playlistCarriesNoMediaHandle).toBe(true);
    expect(_descriptorCarriesNoMediaHandle).toBe(true);
  });

  it('hands VePlayer identifiers and the MSE flag, never a locator', async () => {
    const bridge = await readyMockBridge();
    await createPlayerFacade(bridge, {
      container,
      descriptor: { ...descriptor, playAuthToken: 'token-1' },
      upNext,
    });

    const config = MockVePlayer.instances[0]?.config;
    expect(config).toBeDefined();
    if (config === undefined) {
      return;
    }

    const configRecord = { ...config } as unknown as Record<string, unknown>;
    expect(leakingMediaHandleKeys(configRecord)).toEqual([]);
    expect(leakingMediaHandleValues(configRecord)).toEqual([]);
    expect(config.enableMp4MSE).toBe(true);
    expect(config.vid).toBe('vid_1');
    expect(config.playAuthToken).toBe('token-1');

    const preload = MockVePlayer.instances[0]?.preloadList ?? [];
    expect(preload).toHaveLength(2);
    for (const item of preload) {
      const record = { ...item } as unknown as Record<string, unknown>;
      expect(leakingMediaHandleKeys(record)).toEqual([]);
      expect(leakingMediaHandleValues(record)).toEqual([]);
    }
  });

  it('treats a playUrl on the constructor config as a leak', () => {
    expect(leakingMediaHandleKeys({ playUrl: 'https://cdn.example/a.m3u8' })).toEqual(['playUrl']);
    expect(leakingMediaHandleValues({ vid: 'https://cdn.example/a.m3u8' })).toEqual([
      'vid=https://cdn.example/a.m3u8',
    ]);
    expect(MEDIA_HANDLE_KEY.test('enableMp4MSE')).toBe(true);
    expect(leakingMediaHandleKeys({ enableMp4MSE: true })).toEqual([]);
    expect(MEDIA_HANDLE_VALUE.test('vid_1')).toBe(false);
  });

  it('does not construct MSE, import a third-party player, or embed a manifest URL in player source', () => {
    const banned = [
      /new\s+MediaSource\b/,
      /new\s+ManagedMediaSource\b/,
      /\bhls\.js\b/,
      /\bvideojs\b/,
      /\bshaka-player\b/,
      /\.m3u8\b/,
      /\bplayUrl\b/,
      /\bstreamUrl\b/,
      /\bmanifestUrl\b/,
    ];
    const offenders: string[] = [];
    // The detector names the leak tokens on purpose, the same way video-replace.ts is allowed
    // to name setValidateVideoReplaceElement. Product files next to it must not.
    const detector = join('src', 'player', 'ply-002-probe.ts');

    for (const file of [
      ...productionSourceFiles('src/player'),
      ...productionSourceFiles('src/platform'),
    ]) {
      const path = relative(APP_ROOT, file);
      if (path === detector) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (isCommentLine(line)) {
            return;
          }
          for (const pattern of banned) {
            if (pattern.test(line)) {
              offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
            }
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
