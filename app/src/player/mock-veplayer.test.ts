import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockVePlayer } from './mock-veplayer';
import type { VePlayerConfig } from './veplayer-types';

function config(overrides: Partial<VePlayerConfig> = {}): VePlayerConfig {
  const el = overrides.el ?? document.createElement('div');
  if (el.parentNode === null) {
    document.body.appendChild(el);
  }
  return {
    albumId: 'album_1',
    episodeId: 'ep_1',
    vid: 'vid_1',
    enableMp4MSE: true,
    autoplay: false,
    startTime: 0,
    lang: 'en',
    autoSubtitle: false,
    ignores: ['play'],
    closeVideoClick: false,
    closeVideoDblclick: true,
    ...overrides,
    el,
  };
}

describe('MockVePlayer tap-to-pause', () => {
  beforeEach(() => {
    MockVePlayer.reset();
  });

  afterEach(() => {
    for (const instance of MockVePlayer.instances) {
      instance.destroy();
      instance.config.el.remove();
    }
    MockVePlayer.reset();
  });

  it('toggles play/pause on the same instance when closeVideoClick is kept', () => {
    const player = new MockVePlayer(config());
    player.play();
    expect(player.playing).toBe(true);
    expect(player.config.el.querySelector('[data-veplayer-tap-pause="kept"]')).not.toBeNull();
    expect(player.config.el.querySelector('video, button, [role="button"]')).toBeNull();

    player.config.el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(player.playing).toBe(false);
    expect(MockVePlayer.instances).toHaveLength(1);

    player.config.el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(player.playing).toBe(true);
    expect(player.destroyed).toBe(false);
    expect(MockVePlayer.instances[0]).toBe(player);
  });

  it('does not steal the tap when closeVideoClick is closed', () => {
    const player = new MockVePlayer(config({ closeVideoClick: true }));
    player.play();
    expect(player.config.el.querySelector('[data-veplayer-tap-pause="closed"]')).not.toBeNull();
    player.config.el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(player.playing).toBe(true);
  });

  it('does not pause after destroy, because the click listener must not leak onto the mount', () => {
    const player = new MockVePlayer(config());
    const el = player.config.el;
    player.play();
    player.destroy();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(player.playing).toBe(false);
    expect(player.destroyed).toBe(true);
  });
});

describe('this slice does not invent a competing pause control', () => {
  it('does not name a native media element, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/player/mock-veplayer.ts'), 'utf8');
    expect(source).not.toMatch(/playbackRate|#\/vip|postgres:/);
    expect(source).not.toMatch(/0\.75/);
  });
});
