import { presentSessionReadFailure } from '../data/session-read';
import type { ApiFailure } from '../data/failure';
import type { SessionReadPresentation } from '../data/session-read';

/**
 * What a failed history read means, in the history screen's own vocabulary.
 *
 * The rule itself — `401` is not an empty list, and a missing endpoint is not an error — is not
 * specific to the history and is no longer written here: it lives in `data/session-read.ts`, which
 * the favourites screen (SCR-08) reads the same way. What stays is the name the history screen and
 * its tests use, and the reason the history was the first read in the client to need it: every
 * catalogue read is anonymous-capable (`docs/12-api-contracts.md` §2.2), so a `401` had no meaning
 * anywhere in the client until a session-scoped list arrived.
 *
 * Kept as a named alias rather than deleted because the distinction is a *product* claim about
 * SCR-07 (`docs/handoff/w3-work-m.md`), and `history-presentation.test.ts` is where that claim is
 * asserted. A screen calling a generically named helper reads as incidental reuse; this reads as
 * "the history screen makes this promise".
 */

export type HistoryPresentation = SessionReadPresentation;

export function presentHistoryFailure(failure: ApiFailure): HistoryPresentation {
  return presentSessionReadFailure(failure);
}
