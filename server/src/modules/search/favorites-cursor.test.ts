import { describe, expect, it } from 'vitest';

import {
  MAX_FAVORITES_CURSOR_LENGTH,
  decodeFavoritesCursor,
  encodeFavoritesCursor,
} from './favorites-cursor.js';

/**
 * The cursor codec.
 *
 * Every test below is about a value arriving from a query string, because that is the only way a
 * cursor ever reaches `decodeFavoritesCursor`. The round trip is the easy half; the half worth
 * testing is that nothing else decodes into a position, since a cursor that decoded to `NaN` would
 * compare false against every row and silently return an empty page forever.
 */

const NOW = Date.parse('2026-08-27T12:00:00.000Z');

describe('encodeFavoritesCursor', () => {
  it('round-trips a position', () => {
    const cursor = { favoritedAtMs: NOW, dramaId: 'drm_revenge_0001' };

    expect(decodeFavoritesCursor(encodeFavoritesCursor(cursor))).toEqual(cursor);
  });

  // `+` is a space in a query string and `/` and `=` need escaping, so a base64 cursor would fail
  // for exactly the subset of positions whose encoding happens to contain one.
  it('produces something a query string carries unescaped', () => {
    const encoded = encodeFavoritesCursor({ favoritedAtMs: NOW, dramaId: 'drm_ÿÿÿ_0001' });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it('stays well inside the length the endpoint accepts', () => {
    const encoded = encodeFavoritesCursor({ favoritedAtMs: NOW, dramaId: 'd'.repeat(64) });

    expect(encoded.length).toBeLessThanOrEqual(MAX_FAVORITES_CURSOR_LENGTH);
  });

  // The separator is the *first* colon, so an identifier containing one survives. Drama ids do not
  // contain colons today, which is exactly why an encoding that assumed it would go unnoticed.
  it('round-trips a drama id containing the separator', () => {
    const cursor = { favoritedAtMs: NOW, dramaId: 'drm:1:2' };

    expect(decodeFavoritesCursor(encodeFavoritesCursor(cursor))).toEqual(cursor);
  });

  it('does not reveal a viewer, because a cursor carries none', () => {
    const encoded = encodeFavoritesCursor({ favoritedAtMs: NOW, dramaId: 'drm_1' });

    expect(Buffer.from(encoded, 'base64url').toString('utf8')).toBe(`${NOW}:drm_1`);
  });
});

describe('decodeFavoritesCursor', () => {
  it.each([
    ['empty', ''],
    ['not base64url', 'not a cursor!'],
    // Node's decoder ignores characters outside the alphabet rather than refusing them, so without
    // an explicit charset check this decodes to nothing and two distinct inputs mean one position.
    ['base64 with characters outside the alphabet', '!!!!'],
    ['padded base64', 'MTIzOmRybV8x=='],
    ['valid base64url that is not a cursor', Buffer.from('hello').toString('base64url')],
    ['no separator', Buffer.from('1756296000000drm_1').toString('base64url')],
    ['an empty timestamp', Buffer.from(':drm_1').toString('base64url')],
    ['an empty drama id', Buffer.from('1756296000000:').toString('base64url')],
    ['a non-numeric timestamp', Buffer.from('yesterday:drm_1').toString('base64url')],
    ['a negative timestamp', Buffer.from('-1:drm_1').toString('base64url')],
    ['a fractional timestamp', Buffer.from('1756296000000.5:drm_1').toString('base64url')],
    ['a timestamp with a leading plus', Buffer.from('+1756296000000:drm_1').toString('base64url')],
    ['a timestamp no Date can hold', Buffer.from('99999999999999999:drm_1').toString('base64url')],
    ['longer than the bound', 'a'.repeat(MAX_FAVORITES_CURSOR_LENGTH + 1)],
  ])('refuses %s', (_case, raw) => {
    expect(decodeFavoritesCursor(raw)).toBeUndefined();
  });

  // Epoch zero is a real timestamp, and refusing a falsy one is the classic off-by-truthiness.
  it('accepts a position at epoch zero', () => {
    expect(decodeFavoritesCursor(Buffer.from('0:drm_1').toString('base64url'))).toEqual({
      favoritedAtMs: 0,
      dramaId: 'drm_1',
    });
  });

  it('accepts a cursor exactly at the length bound', () => {
    const dramaId = 'd'.repeat(80);
    const encoded = encodeFavoritesCursor({ favoritedAtMs: NOW, dramaId });

    expect(encoded.length).toBeLessThanOrEqual(MAX_FAVORITES_CURSOR_LENGTH);
    expect(decodeFavoritesCursor(encoded)?.dramaId).toBe(dramaId);
  });
});
