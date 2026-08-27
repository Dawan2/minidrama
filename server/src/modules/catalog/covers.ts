import { checkCoverUrl } from '@minidrama/config';
import type { ImageUrlRejection } from '@minidrama/shared';

import type { DramaRecord } from './types.js';

/**
 * The cover-URL gate, applied where a catalogue record becomes a wire object.
 *
 * A cover URL is the one field in this module that is *both* attacker-influenced and rendered as a
 * URL. Everything else the catalogue serves is a title, a number or an enum; a cover arrives from a
 * licensor delivery, a CMS field or a fixture table, and ends up in an `<img src>` — and eventually
 * in a CSS `url()`, a share sheet, or an `<a href>` wrapped around the thumbnail. `checkCoverUrl`
 * (`packages/config/src/cover-hosts.ts`) is the decision; this module is the decision's *placement*,
 * which is the part that is easy to get wrong:
 *
 *   - **At read time, not at write time.** There is no write path yet — the catalogue is a fixture
 *     table — so a check at ingestion would today protect nothing and would still be the wrong
 *     place tomorrow. Records already in storage predate any rule added later, the trusted-host
 *     registry changes without the records changing, and a host removed from the registry has to
 *     stop being served immediately rather than at the next re-ingest. Checking on the way out is
 *     the only placement where the answer reflects the registry as it stands now.
 *   - **At the single boundary every response crosses.** `views.ts` is the only place a
 *     `DramaRecord` becomes a `DramaSummary` or a `DramaDetail`, and the drama list, the drama
 *     detail, the episode list and the recommendation feed all reach the wire through it. A check
 *     placed in a route handler instead would be correct for that route and absent from the next
 *     one somebody adds.
 *
 * A refused cover is **omitted**, not substituted and not passed through:
 *
 *   - not passed through, because "the client will just fail to load it" is only true of today's
 *     `<img src>` and is exactly the reasoning that leaves a `javascript:` URL in a field that
 *     later gets wrapped in a link;
 *   - not substituted with a placeholder URL, because a placeholder is itself a cover URL and would
 *     have to name a trusted host we do not have (`TRUSTED_COVER_HOSTS` is still the `.invalid`
 *     placeholder, U-IMG-1). Inventing one would mean shipping a second image pipeline whose only
 *     job is to be exempt from this check;
 *   - omitted as `null`, which the client already has to handle: `horizontalCoverUrl` has been
 *     nullable since the contract was written, so "no cover, draw your own placeholder" is a state
 *     the UI has to render regardless of whether a URL was refused or simply absent.
 *
 * The accepted value is the URL **as parsed**, never the input string. A check against one spelling
 * followed by a render of another is not a check.
 */

/**
 * Applies the gate to one cover field.
 *
 * `MISSING` is not a problem to report: a record with no horizontal cover is a normal record, and
 * the answer for "absent" and for "refused" is deliberately the same value. They differ only in
 * whether anyone should be told, which is `coverRejections`' job.
 */
export function safeCoverUrl(raw: string | null): string | null {
  const checked = checkCoverUrl(raw);
  return checked.ok ? checked.value : null;
}

export interface CoverRejection {
  /** The field on the record, so a report names something a content editor can find. */
  readonly field: 'coverUrl' | 'horizontalCoverUrl';
  readonly value: string;
  readonly rejection: ImageUrlRejection;
}

/**
 * Why a record's covers were dropped, for the callers that should be loud about it.
 *
 * Omitting a cover is the right thing to serve and a bad thing to do silently: the visible symptom
 * is a drama with no artwork, which looks like a content-entry oversight and gets triaged as one.
 * Reporting stays separate from serving so that the response never depends on whether anybody is
 * listening — `safeCoverUrl` cannot be made to pass a URL through by failing to log it.
 *
 * `MISSING` is excluded on purpose: a nullable field being null is not a finding, and a report that
 * fires on every drama without a horizontal cover is a report nobody reads.
 */
export function coverRejections(drama: DramaRecord): readonly CoverRejection[] {
  const rejections: CoverRejection[] = [];

  for (const field of ['coverUrl', 'horizontalCoverUrl'] as const) {
    const value = drama[field];
    if (value === null) continue;

    const checked = checkCoverUrl(value);
    if (checked.ok || checked.error === 'MISSING') continue;

    rejections.push({ field, value, rejection: checked.error });
  }

  return rejections;
}
