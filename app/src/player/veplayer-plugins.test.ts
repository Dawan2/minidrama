import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ignoresPlaybackratePlugin,
  ignoresProgressPlugin,
  VEPLAYER_CLOSE_VIDEO_CLICK,
  VEPLAYER_CLOSE_VIDEO_DBLCLICK,
  VEPLAYER_IGNORED_PLUGINS,
} from './veplayer-plugins';

describe('VEPLAYER_IGNORED_PLUGINS', () => {
  it('keeps the progress bar by not listing it, so scrub stays plugin-owned', () => {
    expect(ignoresProgressPlugin(VEPLAYER_IGNORED_PLUGINS)).toBe(false);
    expect(VEPLAYER_IGNORED_PLUGINS).not.toContain('progress');
    expect(VEPLAYER_IGNORED_PLUGINS.join(',')).not.toMatch(/progress/i);
  });

  it('keeps playbackrate by not listing it, so 倍速 stays plugin-owned', () => {
    expect(ignoresPlaybackratePlugin(VEPLAYER_IGNORED_PLUGINS)).toBe(false);
    expect(VEPLAYER_IGNORED_PLUGINS).not.toContain('playbackrate');
    expect(VEPLAYER_IGNORED_PLUGINS.join(',')).not.toMatch(/playbackrate/i);
  });

  it('treats a listed progress plugin as hidden, which this slice must not ship', () => {
    expect(ignoresProgressPlugin(['progress'])).toBe(true);
    expect(ignoresProgressPlugin(['play'])).toBe(false);
  });

  it('treats a listed rate plugin as hidden, which this slice must not ship', () => {
    expect(ignoresPlaybackratePlugin(['playbackrate'])).toBe(true);
    expect(ignoresPlaybackratePlugin(['play', 'PlaybackRate'])).toBe(true);
    expect(ignoresPlaybackratePlugin(['play'])).toBe(false);
  });

  it('matches the immersive sample for chrome that is wrong on a vertical drama', () => {
    expect([...VEPLAYER_IGNORED_PLUGINS]).toEqual([
      'moreButtonPlugin',
      'enter',
      'fullscreen',
      'volume',
      'play',
      'pip',
      'replay',
      'sdkDefinitionPlugin',
    ]);
  });

  it('leaves tap-to-pause on VePlayer and takes double-click for 点赞', () => {
    expect(VEPLAYER_CLOSE_VIDEO_CLICK).toBe(false);
    expect(VEPLAYER_CLOSE_VIDEO_DBLCLICK).toBe(true);
  });
});

describe('this slice does not invent a competing 倍速 control', () => {
  it('does not name a client HTML media rate API or a guessed ladder value', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/veplayer-plugins.ts'), 'utf8');
    expect(source).not.toMatch(/playbackRate|#\/vip|postgres:/);
    expect(source).not.toMatch(/0\.75/);
  });
});
