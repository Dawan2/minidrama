import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * What a caller is allowed to say, as pure functions.
 *
 * Every value here arrives from a query string or a path segment, which means every one of them is
 * attacker-controlled and unbounded until something bounds it. The three rules below are the whole
 * input edge of this slot, and they are separated from the matching rules in `search.ts` for the
 * usual reason: "the request was malformed" and "nothing matched" are different answers, and a
 * function that decided both would make it hard to tell which one it gave.
 */

export type DiscoveryField = 'q' | 'limit' | 'dramaId';

export type DiscoveryFieldReason =
  /** Missing, or present and empty once whitespace is removed. */
  | 'required'
  /** Longer than the bound, or a number outside the published range. */
  | 'out_of_range'
  /** Not a whole number where one was required. */
  | 'not_an_integer'
  /** Given more than once. A repeated parameter is a client bug, not a value to guess at. */
  | 'repeated';

export interface FieldFailure {
  readonly field: DiscoveryField;
  readonly reason: DiscoveryFieldReason;
}

export function fieldFailure(field: DiscoveryField, reason: DiscoveryFieldReason): FieldFailure {
  return { field, reason };
}

/**
 * Bounds the query a caller can make us scan, and it is short on purpose.
 *
 * 64 characters is longer than any drama title in the catalogue, so no legitimate search is refused,
 * and it caps the per-request work of a substring scan at something a rate limiter can reason about.
 * The scan itself uses `String.prototype.includes`, never a regular expression built from the
 * query — a pattern compiled from caller input is a ReDoS, and it is the classic way a search
 * endpoint becomes a denial-of-service amplifier.
 */
export const MAX_SEARCH_QUERY_LENGTH = 64;

/**
 * `?limit=`. The maximum is small because a search result set is scrolled far less than a browse
 * list is: `docs/00-wave-plan.md` W18 gives search a 500 ms budget, and 50 rows of hits is already
 * more than a viewer reads before retyping.
 */
export const SEARCH_LIMIT = { fallback: 20, max: 50 } as const;

/**
 * Bounds a drama identifier, and matches `catalog`'s own bound.
 *
 * 64 is clear of a prefixed ULID (`drm_` plus 26 characters) and deliberately below Fastify's
 * default `maxParamLength` of 100 — past that the router answers `414` before any handler runs and
 * without naming the parameter at fault, so keeping our bound the tighter of the two means one
 * defect always gets one answer.
 */
export const MAX_DRAMA_ID_LENGTH = 64;

/**
 * A query parameter given twice arrives as an array. That is a client bug: picking the first, the
 * last or joining them are three different guesses, and all three hide the bug from whoever wrote it.
 */
export function singleQueryValue(
  raw: unknown,
  field: DiscoveryField,
): Result<string | undefined, FieldFailure> {
  if (raw === undefined) return ok(undefined);
  if (typeof raw !== 'string') return err(fieldFailure(field, 'repeated'));
  return ok(raw);
}

/**
 * Trims the query and collapses runs of whitespace to a single space.
 *
 * Case and accents are *not* touched here. This is the form echoed back in the response, so it
 * keeps the viewer's own words ("no results for Café"); the aggressive folding that matching needs
 * happens in `search.ts` and is never shown to anyone.
 */
export function normalizeQueryText(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ');
}

/**
 * `?q=`. Empty is a `400`, not an empty result set.
 *
 * A search box that has not been typed into yet should not be issuing a request at all, and
 * answering "here are no results for nothing" would make an empty query indistinguishable from a
 * query that genuinely matched nothing — which is the one state the empty-result screen exists for
 * (`docs/02-screen-inventory.md` SCR-03).
 */
export function validateSearchQuery(raw: unknown): Result<string, FieldFailure> {
  const single = singleQueryValue(raw, 'q');
  if (!single.ok) return single;
  if (single.value === undefined) return err(fieldFailure('q', 'required'));

  // Length is checked before normalisation so a megabyte of whitespace is refused rather than
  // trimmed into a valid query.
  if (single.value.length > MAX_SEARCH_QUERY_LENGTH) {
    return err(fieldFailure('q', 'out_of_range'));
  }

  const normalized = normalizeQueryText(single.value);
  if (normalized.length === 0) return err(fieldFailure('q', 'required'));

  return ok(normalized);
}

/**
 * Parses `?limit=`. An out-of-range limit is refused rather than clamped: a client that asks for
 * 500 and silently receives 50 believes it has seen every match and never learns otherwise, while a
 * `400` tells it immediately and the contract publishes the maximum.
 */
export function parseSearchLimit(raw: unknown): Result<number, FieldFailure> {
  const single = singleQueryValue(raw, 'limit');
  if (!single.ok) return single;
  if (single.value === undefined) return ok(SEARCH_LIMIT.fallback);

  if (!/^[0-9]+$/u.test(single.value)) return err(fieldFailure('limit', 'not_an_integer'));

  const value = Number.parseInt(single.value, 10);
  if (value < 1 || value > SEARCH_LIMIT.max) return err(fieldFailure('limit', 'out_of_range'));

  return ok(value);
}

/** A path parameter, so it is present by construction; it can still be empty or absurdly long. */
export function validateDramaId(raw: unknown): Result<string, FieldFailure> {
  if (typeof raw !== 'string' || raw.length === 0) return err(fieldFailure('dramaId', 'required'));
  if (raw.length > MAX_DRAMA_ID_LENGTH) return err(fieldFailure('dramaId', 'out_of_range'));
  return ok(raw);
}
