import { isApiErrorCode } from '@minidrama/shared';
import type { ApiErrorCode } from '@minidrama/shared';

/**
 * How a read failed, and what the UI is allowed to do about it.
 *
 * The product IA (`docs/02-information-architecture.md` §8.1) requires five page states, and two of
 * them are error states that must never be confused: a **retryable** error offers a retry button
 * in place, a **terminal** error explains itself and offers a way out. Deciding which one applies
 * is a property of the failure, not of the screen, so it is decided once, here, and every surface
 * renders the answer.
 *
 * The mistake this module exists to prevent is a retry button on a `410`. The content is gone; the
 * button cannot work; the user presses it until they give up. `classifyFailure` is what makes that
 * impossible to write by accident.
 */

/**
 * The transport-level classification, before any product meaning is attached.
 *
 * `OFFLINE` and `TIMEOUT` are kept apart even though they render identically: a device with no
 * network and a server that stopped answering are the same screen and completely different
 * operational responses, and the distinction is the difference between "check your connection"
 * and "we are down".
 */
export const API_FAILURE_KINDS = ['OFFLINE', 'TIMEOUT', 'HTTP', 'MALFORMED'] as const;

export type ApiFailureKind = (typeof API_FAILURE_KINDS)[number];

export interface ApiFailure {
  readonly kind: ApiFailureKind;
  /** The HTTP status, or `null` when the request never produced a response. */
  readonly status: number | null;
  /** The server's error code when the body was a recognised envelope, `null` otherwise. */
  readonly code: ApiErrorCode | null;
  /**
   * Diagnostic text. **Not display copy.** The server emits English only
   * (`docs/handoff/w2-work-d.md` conflict C9), and the review requirement is that every
   * user-facing string follows the locale, so surfaces render their own translated copy and keep
   * this for logs and bug reports.
   */
  readonly message: string;
  /** Echoed into the error component so a user report maps to a server trace. */
  readonly traceId: string | null;
  /** From `details.retryAfterSec` on a `429` or `503`. */
  readonly retryAfterSec: number | null;
}

export interface ApiFailureInit {
  readonly kind: ApiFailureKind;
  readonly message: string;
  readonly status?: number;
  readonly code?: ApiErrorCode;
  readonly traceId?: string;
  readonly retryAfterSec?: number;
}

export function apiFailure(init: ApiFailureInit): ApiFailure {
  return {
    kind: init.kind,
    status: init.status ?? null,
    code: init.code ?? null,
    message: init.message,
    traceId: init.traceId ?? null,
    retryAfterSec: init.retryAfterSec ?? null,
  };
}

/**
 * Why a surface is in a terminal state. These are the three variants the global fallback screen
 * renders (`docs/02-screen-inventory.md` SCR-13), so a page that hands off to `#/fallback` and a
 * page that renders the state inline agree on the vocabulary.
 *
 * `REJECTED` covers the failures that are our bug rather than the user's situation — a malformed
 * query, a cursor the server will not accept, an unexpected `4xx`. It is terminal because
 * repeating a request the server has already refused cannot produce a different answer.
 */
export const TERMINAL_REASONS = ['NOT_FOUND', 'OFFLINE', 'REJECTED'] as const;

export type TerminalReason = (typeof TERMINAL_REASONS)[number];

export type SurfaceError =
  | {
      readonly kind: 'RETRYABLE';
      readonly retryAfterSec: number | null;
      readonly failure: ApiFailure;
    }
  | {
      readonly kind: 'TERMINAL';
      readonly reason: TerminalReason;
      readonly failure: ApiFailure;
    };

/**
 * Whether the transport may repeat the request on its own.
 *
 * Narrower than "retryable" in the UI sense on purpose. A `429` is retryable *by the user, later*,
 * after `retryAfterSec`; retrying it immediately and automatically is how a rate limit becomes a
 * self-inflicted outage. So automatic retry is confined to the failures where the request plausibly
 * never arrived.
 */
export function isAutoRetryable(failure: ApiFailure): boolean {
  if (failure.kind === 'OFFLINE' || failure.kind === 'TIMEOUT') {
    return true;
  }
  return failure.kind === 'HTTP' && failure.status !== null && failure.status >= 500;
}

export function classifyFailure(failure: ApiFailure): SurfaceError {
  if (failure.kind !== 'HTTP') {
    // A malformed body is grouped with the transport failures deliberately: in practice it means a
    // truncated response or a captive portal answering with HTML, both of which a retry can fix.
    return { kind: 'RETRYABLE', retryAfterSec: failure.retryAfterSec, failure };
  }

  const { status } = failure;

  if (status === 404) {
    return { kind: 'TERMINAL', reason: 'NOT_FOUND', failure };
  }
  // 410 is the reason the catalogue distinguishes draft from delisted content at all
  // (`docs/handoff/w2-work-d.md` decision S24). Collapsing it into "not found" throws that away.
  if (status === 410) {
    return { kind: 'TERMINAL', reason: 'OFFLINE', failure };
  }
  if (status === 429 || (status !== null && status >= 500)) {
    return { kind: 'RETRYABLE', retryAfterSec: failure.retryAfterSec, failure };
  }
  return { kind: 'TERMINAL', reason: 'REJECTED', failure };
}

/**
 * Reads the error envelope (`docs/12-api-contracts.md` §2.5) out of an already-parsed body.
 *
 * Everything is optional in practice: a proxy, a WAF or a platform gateway can answer a `503` with
 * a body of its own, and the client still has to produce a usable failure from it. An unrecognised
 * code degrades to `null` rather than being cast, so a code that only exists on the server can
 * never reach a `switch` here as an unhandled value.
 */
export function readErrorEnvelope(status: number, body: unknown): ApiFailure {
  const error = extractRecord(extractRecord(body)?.['error']);
  const rawCode = error?.['code'];
  const rawMessage = error?.['message'];
  const rawTraceId = error?.['traceId'];
  const retryAfterSec = extractRecord(error?.['details'])?.['retryAfterSec'];

  return apiFailure({
    kind: 'HTTP',
    status,
    message: typeof rawMessage === 'string' ? rawMessage : `HTTP ${String(status)}`,
    ...(typeof rawCode === 'string' && isApiErrorCode(rawCode) ? { code: rawCode } : {}),
    ...(typeof rawTraceId === 'string' ? { traceId: rawTraceId } : {}),
    ...(typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec)
      ? { retryAfterSec }
      : {}),
  });
}

function extractRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
