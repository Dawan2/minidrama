import type { FavoritesCursor } from './favorites.js';

/**
 * The favourites cursor, encoded.
 *
 * `docs/12-api-contracts.md` §2.3 says a cursor is an opaque string the client passes back
 * verbatim, and "opaque" is a contract about what the client may *do* with it, not a claim that it
 * is secret. Three properties are what make this encoding safe to hand out:
 *
 *   - **it carries no user id.** The viewer comes from the session on every request, and the cursor
 *     is applied inside a query already scoped to that viewer. A cursor naming the viewer would be
 *     a client-supplied user id, which is precisely the input this endpoint must not accept — and
 *     the reason it is worth stating is that it is the obvious way to encode a keyset;
 *   - **it is not signed, and does not need to be.** A caller who forges one moves a position
 *     within their own list; the worst outcome is a page of their own favourites in a strange
 *     place. Signing would buy nothing and would put a key rotation on the paging path;
 *   - **it decodes defensively.** Every field is validated on the way in — a cursor is
 *     attacker-controlled input like any query parameter, and `Number.parseInt` on arbitrary text
 *     yields `NaN`, which would silently become a comparison that is false against every row.
 *
 * Base64url rather than base64: a cursor travels in a query string, where `+` means a space and `/`
 * and `=` need escaping. The `+` case is the interesting one, because it fails only for the subset
 * of cursors whose encoding happens to contain it.
 */

/**
 * Longer than any cursor this codec produces (a 13-digit millisecond timestamp plus a 64-character
 * drama id encodes to well under 128 characters) and short enough that a caller cannot make us
 * decode a megabyte to learn it is invalid.
 */
export const MAX_FAVORITES_CURSOR_LENGTH = 128;

/** Milliseconds must be a non-negative whole number a `Date` can represent. */
const MAX_TIMESTAMP_MS = 8.64e15;

export function encodeFavoritesCursor(cursor: FavoritesCursor): string {
  // `:` cannot appear in the timestamp, so the first one is unambiguously the separator and a
  // drama id containing `:` still round-trips.
  return Buffer.from(`${cursor.favoritedAtMs}:${cursor.dramaId}`, 'utf8').toString('base64url');
}

/** `undefined` for anything that is not a cursor this codec produced. */
export function decodeFavoritesCursor(raw: string): FavoritesCursor | undefined {
  if (raw.length === 0 || raw.length > MAX_FAVORITES_CURSOR_LENGTH) return undefined;

  // Node's base64url decoder ignores characters outside the alphabet rather than refusing them, so
  // the charset is checked here. Otherwise `!!!!` decodes to an empty string and reads as merely
  // malformed content, and two different cursors could decode to one position.
  if (!/^[A-Za-z0-9_-]+$/u.test(raw)) return undefined;

  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator <= 0) return undefined;

  const timestamp = decoded.slice(0, separator);
  const dramaId = decoded.slice(separator + 1);
  if (dramaId.length === 0) return undefined;

  if (!/^[0-9]+$/u.test(timestamp)) return undefined;
  const favoritedAtMs = Number.parseInt(timestamp, 10);
  if (favoritedAtMs > MAX_TIMESTAMP_MS) return undefined;

  return { favoritedAtMs, dramaId };
}
