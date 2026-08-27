import { describe, expect, it } from 'vitest';

import { createPlatformCredentials } from './credentials.js';
import {
  createHmacSignatureVerifier,
  createRejectingSignatureVerifier,
  createSignatureVerifier,
} from './signature-verifier.js';
import { computeWebhookSignature } from './webhook-signature.js';

const SECRET = 'client-secret-for-tests';
const NOW_MS = 1_700_000_000_000;
const BODY = Buffer.from('{"client_key":"awtest","content":"{}"}', 'utf8');

const credentials = createPlatformCredentials('awtest', SECRET);

function signedHeaders(timestampSec: number) {
  return {
    'content-type': 'application/json',
    'tiktok-signature': `t=${timestampSec},s=${computeWebhookSignature(BODY, SECRET, timestampSec)}`,
  };
}

describe('createHmacSignatureVerifier', () => {
  const verifier = createHmacSignatureVerifier({
    credentials,
    toleranceSec: 300,
    now: () => NOW_MS,
  });

  it('accepts a correctly signed body', () => {
    expect(verifier.verify(BODY, signedHeaders(NOW_MS / 1000)).ok).toBe(true);
  });

  it('reads the header under its lower-cased name, as Node delivers it', () => {
    const headers = signedHeaders(NOW_MS / 1000);

    expect(verifier.verify(BODY, { 'Tiktok-Signature': headers['tiktok-signature'] }).ok).toBe(
      false,
    );
    expect(verifier.verify(BODY, headers).ok).toBe(true);
  });

  it('rejects a stale timestamp against the injected clock', () => {
    const result = verifier.verify(BODY, signedHeaders(NOW_MS / 1000 - 301));

    expect(result).toEqual({ ok: false, error: 'TIMESTAMP_OUTSIDE_WINDOW' });
  });

  // A repeated header arrives as an array. Choosing one of the values would let a sender pair a
  // valid signature with the one they actually want honoured.
  it('rejects a duplicated signature header outright', () => {
    const valid = signedHeaders(NOW_MS / 1000)['tiktok-signature'];
    const result = verifier.verify(BODY, { 'tiktok-signature': [valid, 't=1,s=bogus'] });

    expect(result).toEqual({ ok: false, error: 'SIGNATURE_HEADER_DUPLICATED' });
  });

  it('uses the wall clock when none is injected', () => {
    const live = createHmacSignatureVerifier({ credentials, toleranceSec: 300 });
    const nowSec = Math.floor(Date.now() / 1000);

    expect(live.verify(BODY, signedHeaders(nowSec)).ok).toBe(true);
  });
});

describe('createRejectingSignatureVerifier', () => {
  it('refuses even a correctly signed body', () => {
    const verifier = createRejectingSignatureVerifier();

    expect(verifier.verify(BODY, signedHeaders(NOW_MS / 1000))).toEqual({
      ok: false,
      error: 'SIGNING_KEY_UNAVAILABLE',
    });
  });
});

describe('createSignatureVerifier', () => {
  it('returns the HMAC verifier when a signing key is configured', () => {
    const verifier = createSignatureVerifier({
      credentials,
      toleranceSec: 300,
      now: () => NOW_MS,
    });

    expect(verifier.verify(BODY, signedHeaders(NOW_MS / 1000)).ok).toBe(true);
  });

  // The whole point of the fail-closed design: a deployment with no secret cannot be talked into
  // accepting a callback, whatever the sender presents.
  it('fails closed when no signing key is configured', () => {
    const verifier = createSignatureVerifier({
      credentials: createPlatformCredentials('awtest', ''),
      toleranceSec: 300,
      now: () => NOW_MS,
    });

    expect(verifier.verify(BODY, signedHeaders(NOW_MS / 1000))).toEqual({
      ok: false,
      error: 'SIGNING_KEY_UNAVAILABLE',
    });
  });
});
