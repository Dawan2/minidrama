import { err, ok } from '@minidrama/shared';
import type { Page, Result } from '@minidrama/shared';

import { apiFailure } from './failure';
import type { ApiFailure } from './failure';

/**
 * Response narrowing, shared by every read client.
 *
 * The rule these three functions exist to hold: **a `200` whose body is not the documented shape is
 * a failure, not a value.** Caught here it is a `MALFORMED` failure and an error state with a retry
 * button; caught at the point of use it is a component reading `.map` off `undefined`, which takes
 * a whole screen down in a place that has no error copy at all.
 *
 * `MALFORMED` classifies as retryable on the reasoning that a truncated body or a captive portal
 * answering with HTML is far more likely in the field than a server that changed its contract.
 *
 * These were extracted from `catalog-api.ts` when the history read needed the same page envelope.
 * There is deliberately one implementation: two copies of "what counts as a page" is two places for
 * the answer to drift, and the second copy is always the one that forgets `nextCursor` can be null.
 * No behaviour changed in the move, which is why the catalogue's narrowing tests are untouched.
 */

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function narrow<T>(
  body: unknown,
  narrower: (value: unknown) => T | null,
): Result<T, ApiFailure> {
  const narrowed = narrower(body);
  return narrowed === null
    ? err(apiFailure({ kind: 'MALFORMED', message: 'the response did not match the contract' }))
    : ok(narrowed);
}

export function narrowPage<T>(
  body: unknown,
  narrower: (value: unknown) => T | null,
): Result<Page<T>, ApiFailure> {
  const record = asRecord(body);
  const rawItems = record?.['items'];
  const pageInfo = asRecord(record?.['pageInfo']);
  const nextCursor = pageInfo?.['nextCursor'];
  const hasMore = pageInfo?.['hasMore'];

  if (
    !Array.isArray(rawItems) ||
    typeof hasMore !== 'boolean' ||
    !(typeof nextCursor === 'string' || nextCursor === null)
  ) {
    return err(apiFailure({ kind: 'MALFORMED', message: 'the response was not a page' }));
  }

  const items: T[] = [];
  for (const raw of rawItems) {
    const narrowed = narrower(raw);
    if (narrowed === null) {
      return err(
        apiFailure({ kind: 'MALFORMED', message: 'a page item did not match the contract' }),
      );
    }
    items.push(narrowed);
  }

  return ok({ items, pageInfo: { nextCursor, hasMore } });
}
