import { describe, expect, it } from 'vitest';

import { CHROME_NAV_BAR, IMMERSIVE_NAV_BAR, navigationBarForPath } from './navigation-bar';

describe('navigationBarForPath', () => {
  it('paints the player immersive and every other route as chrome', () => {
    expect(navigationBarForPath('/play/ep_demo_0001')).toEqual(IMMERSIVE_NAV_BAR);
    expect(navigationBarForPath('/play')).toEqual(IMMERSIVE_NAV_BAR);
    expect(navigationBarForPath('/home')).toEqual(CHROME_NAV_BAR);
    expect(navigationBarForPath('/me')).toEqual(CHROME_NAV_BAR);
    expect(navigationBarForPath('/wallet')).toEqual(CHROME_NAV_BAR);
    expect(navigationBarForPath('/drama/drm_1')).toEqual(CHROME_NAV_BAR);
    expect(navigationBarForPath('/fallback')).toEqual(CHROME_NAV_BAR);
  });

  it('does not treat a path that merely mentions play as the player', () => {
    expect(navigationBarForPath('/search?q=play')).toEqual(CHROME_NAV_BAR);
    expect(navigationBarForPath('/playback')).toEqual(CHROME_NAV_BAR);
  });
});
