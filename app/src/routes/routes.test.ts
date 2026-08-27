import { describe, expect, it } from 'vitest';

import { ROUTES, playPath } from './routes';

describe('routes', () => {
  it('declares only path-style routes, since the router runs in hash mode', () => {
    for (const path of Object.values(ROUTES)) {
      expect(path.startsWith('/')).toBe(true);
      expect(path.startsWith('//')).toBe(false);
    }
  });

  it('builds a player path from an episode id', () => {
    expect(playPath('ep_1')).toBe('/play/ep_1');
  });

  it('escapes an episode id that would otherwise break the path', () => {
    expect(playPath('ep/1?x=2')).toBe('/play/ep%2F1%3Fx%3D2');
  });
});
