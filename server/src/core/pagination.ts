import { createHash } from 'node:crypto';
import { err, ok } from '@minidrama/shared';
import type { Page, Result } from '@minidrama/shared';

/**
 * Cursor pagination, as `docs/12-api-contracts.md` §2.3 specifies it.
 *
 * The scheme is **keyset**, not offset: a cursor names the last item a page returned, and the next
 * page starts at the first item ordered after it. Offsets are the obvious implementation and the
 * wrong one for a catalogue — a drama published or delisted between two requests shifts every
 * subsequent offset, so the client silently skips an item or shows one twice. Keyset pagination is
 * unaffected by inserts and deletes anywhere except at the cursor itself.
 *
 * Two invariants hold for every page produced here, both tested:
 *   - `nextCursor` is non-null exactly when `hasMore` is true;
 *   - a cursor is only accepted by the query that produced it (§ `queryFingerprint`).
 *
 * The in-memory scan below is the mock implementation. The shape it commits to is the one a real
 * store implements as `WHERE sort_key > $1 ORDER BY sort_key LIMIT $2 + 1`, so the module boundary
 * survives the datastore arriving.
 */

/** A cursor is opaque, not secret. Nothing viewer-specific may be encoded into one. */
interface CursorPayload {
  /** Fingerprint of the query that produced the cursor. */
  readonly f: string;
  /** Sort key of the last item on the previous page. */
  readonly k: string;
}

/** Bounds the work a malformed cursor can cause before it is rejected. */
const MAX_CURSOR_LENGTH = 512;

export type PaginationFailure = 'INVALID_CURSOR' | 'INVALID_LIMIT';

export interface PaginateOptions<T> {
  /** Must be ascending, unique, and stable across requests for a given item. */
  readonly keyOf: (item: T) => string;
  readonly limit: number;
  readonly cursor: string | undefined;
  readonly fingerprint: string;
}

export function encodeCursor(fingerprint: string, key: string): string {
  const payload: CursorPayload = { f: fingerprint, k: key };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Result<CursorPayload, 'INVALID_CURSOR'> {
  if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) return err('INVALID_CURSOR');

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return err('INVALID_CURSOR');
  }

  if (typeof parsed !== 'object' || parsed === null) return err('INVALID_CURSOR');
  const { f, k } = parsed as { f?: unknown; k?: unknown };
  if (typeof f !== 'string' || typeof k !== 'string') return err('INVALID_CURSOR');

  return ok({ f, k });
}

/**
 * Identifies the query a cursor belongs to.
 *
 * Replaying a `sort=HOT` cursor against `sort=NEW` would resume from a key that means something
 * else in the new ordering, and the page would be quietly wrong rather than loudly rejected. The
 * fingerprint makes that a 400. It is a hash, not a signature: it detects a mismatched cursor, not
 * a hostile one, and nothing depends on it being unforgeable.
 */
export function queryFingerprint(parts: Readonly<Record<string, string | number | null>>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${String(parts[key] ?? '')}`)
    .join('&');

  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

export function paginate<T>(
  items: readonly T[],
  options: PaginateOptions<T>,
): Result<Page<T>, 'INVALID_CURSOR'> {
  let start = 0;

  if (options.cursor !== undefined) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded.ok) return decoded;
    if (decoded.value.f !== options.fingerprint) return err('INVALID_CURSOR');

    const after = decoded.value.k;
    // The item the cursor names may have been delisted since. Resuming at "the first key greater
    // than it" rather than "the index after it" is what keeps that from skipping its successor.
    start = items.findIndex((item) => options.keyOf(item) > after);
    if (start === -1) start = items.length;
  }

  const page = items.slice(start, start + options.limit);
  const hasMore = start + page.length < items.length;
  const lastKey = page.length > 0 ? options.keyOf(page[page.length - 1] as T) : undefined;

  return ok({
    items: page,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && lastKey !== undefined ? encodeCursor(options.fingerprint, lastKey) : null,
    },
  });
}

export interface LimitOptions {
  readonly fallback: number;
  readonly max: number;
}

/**
 * Parses `?limit=`.
 *
 * An out-of-range limit is rejected rather than clamped. A client that asks for 500 and silently
 * receives 100 pages the rest of the catalogue by accident and never learns why; a 400 tells it
 * immediately, and the contract publishes the maximum.
 */
export function parseLimit(raw: unknown, options: LimitOptions): Result<number, 'INVALID_LIMIT'> {
  if (raw === undefined) return ok(options.fallback);
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) return err('INVALID_LIMIT');

  const value = Number.parseInt(raw, 10);
  if (value < 1 || value > options.max) return err('INVALID_LIMIT');

  return ok(value);
}

const KEY_WIDTH = 12;
const KEY_CEILING = 10 ** KEY_WIDTH - 1;

/**
 * Renders a non-negative integer so that lexicographic string order matches numeric order.
 *
 * Sort keys are compared as strings — that is what lets one comparison serve numbers, timestamps
 * and identifiers alike — and `"9" > "10"` lexicographically. Zero-padding removes the trap.
 */
export function ascendingKey(value: number): string {
  const bounded = Math.min(Math.max(Math.trunc(value), 0), KEY_CEILING);
  return String(bounded).padStart(KEY_WIDTH, '0');
}

/** The same, inverted, so a descending sort (most played, most recent) is still an ascending scan. */
export function descendingKey(value: number): string {
  const bounded = Math.min(Math.max(Math.trunc(value), 0), KEY_CEILING);
  return String(KEY_CEILING - bounded).padStart(KEY_WIDTH, '0');
}
