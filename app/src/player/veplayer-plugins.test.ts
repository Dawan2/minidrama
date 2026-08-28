import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
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

  it('still ignores playbackrate, so this slice does not pick X-26 倍速', () => {
    expect(VEPLAYER_IGNORED_PLUGINS).toContain('playbackrate');
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
      'playbackrate',
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
