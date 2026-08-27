import { describe, expect, it } from 'vitest';

import {
  FALLBACK_REASONS,
  ROUTES,
  dramaPath,
  fallbackPath,
  isFallbackReason,
  playPath,
} from './routes';

describe('routes', () => {
  it('declares only path-style routes, since the router runs in hash mode', () => {
    for (const path of Object.values(ROUTES)) {
      expect(path.startsWith('/')).toBe(true);
      expect(path.startsWith('//')).toBe(false);
    }
  });

  // The parameter names are the contract's id prefixes (`docs/02-information-architecture.md` §5),
  // and `:episodeId` is the authoritative locator: a deep link carries one id and the drama is
  // looked up from it.
  it('names its parameters after the ids the contract uses', () => {
    expect(ROUTES.drama).toBe('/drama/:dramaId');
    expect(ROUTES.play).toBe('/play/:episodeId');
  });

  it('declares the personal screens at the paths the IA publishes', () => {
    expect(ROUTES.me).toBe('/me');
    expect(ROUTES.history).toBe('/history');
  });

  /**
   * SCR-08 has no screen behind it. A declared path with no route registered resolves to the
   * fallback, so declaring it here is how the profile's favourites entry would become "this page
   * does not exist" the first time someone linked to the constant.
   */
  it('declares no path for a screen that does not exist', () => {
    expect(Object.values(ROUTES)).not.toContain('/favorites');
  });

  it('builds a drama path from a drama id', () => {
    expect(dramaPath('drm_1')).toBe('/drama/drm_1');
  });

  it('builds a player path from an episode id', () => {
    expect(playPath('ep_1')).toBe('/play/ep_1');
  });

  // Ids arrive from deep links and are untrusted. Interpolated raw, a slash in one addresses a
  // different route entirely.
  it('escapes an id that would otherwise break the path', () => {
    expect(playPath('ep/1?x=2')).toBe('/play/ep%2F1%3Fx%3D2');
    expect(dramaPath('drm/1#x')).toBe('/drama/drm%2F1%23x');
  });
});

describe('the fallback reason', () => {
  it('publishes the three variants the fallback screen renders', () => {
    expect([...FALLBACK_REASONS]).toEqual(['NOT_FOUND', 'OFFLINE', 'MAINTENANCE']);
  });

  it('builds a fallback path carrying its reason', () => {
    expect(fallbackPath('OFFLINE')).toBe('/fallback?reason=OFFLINE');
  });

  it('recognises only the published reasons', () => {
    expect(isFallbackReason('MAINTENANCE')).toBe(true);
    expect(isFallbackReason('maintenance')).toBe(false);
    expect(isFallbackReason('WHATEVER')).toBe(false);
  });
});
