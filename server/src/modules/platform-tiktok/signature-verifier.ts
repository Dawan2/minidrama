import { err } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { SIGNATURE_HEADER, verifyWebhookSignature } from './webhook-signature.js';
import type { PlatformCredentials } from './credentials.js';
import type { VerifiedSignature, WebhookRejectionReason } from './webhook-signature.js';

/**
 * The replaceable verifier interface from `docs/design/minis-integration.md` §6.2, which existed so
 * that blocker B-2 could not block the route. B-2 is now closed and the HMAC implementation below
 * is the real one, but the interface stays: it is how the route is tested against a known secret,
 * and how a future key rotation or a second webhook source is introduced without touching handlers.
 *
 * The design sketched `verify(): boolean`. This returns a `Result` carrying the rejection reason
 * instead, because "invalid signature" and "we hold no signing key" need different operator
 * responses — the second is a misconfiguration that silently stops revenue — and a boolean forces
 * the route to log them identically. The reason is for logs and metrics only; it is never sent to
 * the caller (see `routes.ts`).
 */
export interface SignatureVerifier {
  verify(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Result<VerifiedSignature, WebhookRejectionReason>;
}

/** Shaped after Fastify's `request.headers`, so the route passes it through unchanged. */
export type WebhookHeaders = Readonly<Record<string, string | string[] | undefined>>;

export interface HmacSignatureVerifierOptions {
  readonly credentials: PlatformCredentials;
  readonly toleranceSec: number;
  /** Injected for tests. Real callers get the system clock. */
  readonly now?: () => number;
}

export function createHmacSignatureVerifier(
  options: HmacSignatureVerifierOptions,
): SignatureVerifier {
  const now = options.now ?? Date.now;

  return {
    verify(rawBody, headers) {
      const header = headers[SIGNATURE_HEADER];

      // A repeated header arrives as an array. Picking one of the values would let a sender submit
      // a valid signature alongside the one they actually want us to accept.
      if (Array.isArray(header)) {
        return err('SIGNATURE_HEADER_DUPLICATED');
      }

      return verifyWebhookSignature({
        rawBody,
        header,
        signingKey: options.credentials.signingKey(),
        nowSec: Math.floor(now() / 1000),
        toleranceSec: options.toleranceSec,
      });
    },
  };
}

/**
 * A verifier that rejects everything, used when no signing key is configured.
 *
 * It exists so that "misconfigured" is a distinct, loud state rather than an accidental bypass: the
 * route still runs, still stores the raw payload for later replay, and still answers with a
 * rejection. Nothing is ever fulfilled.
 */
export function createRejectingSignatureVerifier(
  reason: WebhookRejectionReason = 'SIGNING_KEY_UNAVAILABLE',
): SignatureVerifier {
  return { verify: () => err(reason) };
}

export function createSignatureVerifier(options: HmacSignatureVerifierOptions): SignatureVerifier {
  return options.credentials.hasClientSecret
    ? createHmacSignatureVerifier(options)
    : createRejectingSignatureVerifier();
}
