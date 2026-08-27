import { createHmac, timingSafeEqual } from 'node:crypto';
import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * TikTok webhook signature verification.
 *
 * Closes U-07 / blocker B-2 with the algorithm from `docs/research/tiktok-minis-official.md` §6.3
 * (source: TikTok "Webhooks Verification"):
 *
 *   Tiktok-Signature: t=1633174587,s=18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66
 *
 *   1. split the header on `,`, then each element on `=`; `t` = timestamp, `s` = signature
 *   2. signed_payload = t + "." + raw_request_body   ← the *raw* bytes, never a re-serialisation
 *   3. local_signature = HMAC_SHA256(key = client_secret, message = signed_payload)
 *   4. reject if local_signature != s
 *   5. then reject if `now - t` falls outside an acceptable window (the IAP page suggests 5 minutes)
 *
 * This module is pure: no clock, no environment, no I/O. The caller supplies `nowSec`, which is
 * what makes the replay window testable without faking timers.
 *
 * Fail-closed is the whole design premise. Every path that is not a byte-exact HMAC match inside
 * the window returns an error, and there is no configuration flag that turns verification off. A
 * missing signing key is a rejection, not a bypass: a webhook we cannot authenticate is an
 * instruction to give away paid content on an unauthenticated request.
 */

export const SIGNATURE_HEADER = 'tiktok-signature';

/** HMAC-SHA256 hex is always 64 characters. Anything else is malformed rather than merely wrong. */
const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;
const TIMESTAMP_PATTERN = /^[0-9]{1,15}$/;

export type WebhookRejectionReason =
  | 'SIGNATURE_HEADER_MISSING'
  | 'SIGNATURE_HEADER_MALFORMED'
  | 'SIGNATURE_HEADER_DUPLICATED'
  | 'SIGNING_KEY_UNAVAILABLE'
  | 'SIGNATURE_MISMATCH'
  | 'TIMESTAMP_OUTSIDE_WINDOW';

export interface SignatureHeader {
  readonly timestampSec: number;
  readonly signature: string;
}

export interface VerifiedSignature {
  readonly timestampSec: number;
  /** Signed-clock skew in seconds, positive when the sender's timestamp is in the past. */
  readonly ageSec: number;
}

/**
 * Parses `t=<epoch>,s=<hex>`.
 *
 * Unknown elements are ignored so that a future header addition does not break verification, but a
 * repeated `t` or `s` is malformed: accepting the first or the last would let a sender choose which
 * value we validate against.
 */
export function parseSignatureHeader(raw: string): Result<SignatureHeader, WebhookRejectionReason> {
  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const element of raw.split(',')) {
    const separator = element.indexOf('=');
    if (separator === -1) {
      return err('SIGNATURE_HEADER_MALFORMED');
    }

    const key = element.slice(0, separator).trim();
    const value = element.slice(separator + 1).trim();

    if (key === 't') {
      if (timestamp !== undefined) return err('SIGNATURE_HEADER_MALFORMED');
      timestamp = value;
    } else if (key === 's') {
      if (signature !== undefined) return err('SIGNATURE_HEADER_MALFORMED');
      signature = value;
    }
  }

  if (timestamp === undefined || signature === undefined) {
    return err('SIGNATURE_HEADER_MALFORMED');
  }
  if (!TIMESTAMP_PATTERN.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) {
    return err('SIGNATURE_HEADER_MALFORMED');
  }

  return ok({ timestampSec: Number.parseInt(timestamp, 10), signature });
}

/**
 * `HMAC_SHA256(client_secret, t + "." + raw_body)` as lowercase hex.
 *
 * `rawBody` is a Buffer on purpose. Reconstructing the JSON from a parsed object would re-order
 * keys, re-escape strings and drop whitespace, and the resulting signature would never match.
 */
export function computeWebhookSignature(
  rawBody: Buffer,
  signingKey: string,
  timestampSec: number,
): string {
  return createHmac('sha256', signingKey).update(`${timestampSec}.`).update(rawBody).digest('hex');
}

/** Constant-time hex comparison. `timingSafeEqual` throws on a length mismatch, so guard first. */
function signaturesMatch(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, 'hex');
  const receivedBytes = Buffer.from(received, 'hex');

  if (expectedBytes.length === 0 || expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
}

export interface VerifyWebhookSignatureInput {
  readonly rawBody: Buffer;
  /** The `Tiktok-Signature` header value, exactly as received. */
  readonly header: string | undefined;
  readonly signingKey: string;
  readonly nowSec: number;
  readonly toleranceSec: number;
}

export function verifyWebhookSignature(
  input: VerifyWebhookSignatureInput,
): Result<VerifiedSignature, WebhookRejectionReason> {
  if (input.header === undefined || input.header.trim().length === 0) {
    return err('SIGNATURE_HEADER_MISSING');
  }
  if (input.signingKey.length === 0) {
    return err('SIGNING_KEY_UNAVAILABLE');
  }

  const parsed = parseSignatureHeader(input.header);
  if (!parsed.ok) {
    return parsed;
  }

  const { timestampSec, signature } = parsed.value;
  const expected = computeWebhookSignature(input.rawBody, input.signingKey, timestampSec);

  // Signature before timestamp, per the official processing order. The timestamp is part of the
  // signed payload, so an attacker cannot slide the window without invalidating the MAC — checking
  // the cheap field first would only tell them which of the two they got wrong.
  if (!signaturesMatch(expected, signature)) {
    return err('SIGNATURE_MISMATCH');
  }

  const ageSec = input.nowSec - timestampSec;
  // Symmetric window: a timestamp far in the future is as unacceptable as a stale one, and it is
  // the shape a replayed capture takes once our own clock has been trusted too far.
  if (Math.abs(ageSec) > input.toleranceSec) {
    return err('TIMESTAMP_OUTSIDE_WINDOW');
  }

  return ok({ timestampSec, ageSec });
}
