import { describe, expect, it } from 'vitest';

import {
  FALLBACK_REASONS,
  ROUTES,
  SEARCH_QUERY_PARAM,
  dramaPath,
  fallbackPath,
  isFallbackReason,
  playPath,
  searchPath,
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

describe('the search route', () => {
  // Named after the parameter the endpoint takes, so there is one name for the term from the
  // address bar to the request.
  it('carries its term in the same parameter the endpoint takes', () => {
    expect(SEARCH_QUERY_PARAM).toBe('q');
    expect(searchPath('twin moons')).toBe('/search?q=twin%20moons');
  });

  // The search screen with nothing searched yet is a state, not a missing parameter, so the bare
  // path is the one that reaches it.
  it('is the bare path when there is nothing to search for', () => {
    expect(searchPath()).toBe('/search');
    expect(searchPath('')).toBe('/search');
  });

  it('escapes a term that would otherwise add parameters of its own', () => {
    expect(searchPath('a&b=c#d')).toBe('/search?q=a%26b%3Dc%23d');
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
