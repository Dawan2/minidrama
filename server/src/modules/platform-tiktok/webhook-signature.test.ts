import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  SIGNATURE_HEADER,
  computeWebhookSignature,
  parseSignatureHeader,
  verifyWebhookSignature,
} from './webhook-signature.js';

const SECRET = 'client-secret-for-tests';
const NOW_SEC = 1_700_000_000;
const TOLERANCE_SEC = 300;

const BODY = Buffer.from(
  '{"client_key":"awtest","event":"minis.trade_order.redeem.success","create_time":1700000000,' +
    '"user_openid":"open_abc","content":"{\\"trade_order_id\\":\\"to_1\\"}"}',
  'utf8',
);

function header(timestampSec: number, body: Buffer = BODY, secret = SECRET): string {
  return `t=${timestampSec},s=${computeWebhookSignature(body, secret, timestampSec)}`;
}

function verify(headerValue: string | undefined, overrides: { nowSec?: number } = {}) {
  return verifyWebhookSignature({
    rawBody: BODY,
    header: headerValue,
    signingKey: SECRET,
    nowSec: overrides.nowSec ?? NOW_SEC,
    toleranceSec: TOLERANCE_SEC,
  });
}

describe('the header name', () => {
  it('is lower-cased, because Node lower-cases incoming header names', () => {
    expect(SIGNATURE_HEADER).toBe('tiktok-signature');
  });
});

describe('parseSignatureHeader', () => {
  it('reads t and s from the documented header form', () => {
    const parsed = parseSignatureHeader(
      't=1633174587,s=18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66',
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toEqual({
      timestampSec: 1633174587,
      signature: '18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66',
    });
  });

  it('tolerates whitespace around the elements', () => {
    const parsed = parseSignatureHeader(
      ' t = 1633174587 , s = 18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66 ',
    );

    expect(parsed.ok && parsed.value.timestampSec).toBe(1633174587);
  });

  it('ignores elements it does not know, so a future addition does not break verification', () => {
    const parsed = parseSignatureHeader(`v=2,t=1633174587,s=${'a'.repeat(64)},extra=whatever`);

    expect(parsed.ok && parsed.value.timestampSec).toBe(1633174587);
  });

  it.each([
    ['no elements at all', ''],
    ['a signature but no timestamp', `s=${'a'.repeat(64)}`],
    ['a timestamp but no signature', 't=1633174587'],
    ['an element with no separator', `t=1633174587,sabc,s=${'a'.repeat(64)}`],
    ['a non-numeric timestamp', `t=not-a-number,s=${'a'.repeat(64)}`],
    ['a negative timestamp', `t=-1633174587,s=${'a'.repeat(64)}`],
    ['a signature that is not 64 hex characters', 't=1633174587,s=deadbeef'],
    ['a signature containing non-hex characters', `t=1633174587,s=${'z'.repeat(64)}`],
  ])('rejects a header with %s', (_case, raw) => {
    const parsed = parseSignatureHeader(raw);

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toBe('SIGNATURE_HEADER_MALFORMED');
  });

  // Accepting the first or the last would let the sender choose which value we validate against.
  it.each([
    ['t', `t=1633174587,t=1633174588,s=${'a'.repeat(64)}`],
    ['s', `t=1633174587,s=${'a'.repeat(64)},s=${'b'.repeat(64)}`],
  ])('rejects a header that repeats %s', (_field, raw) => {
    expect(parseSignatureHeader(raw).ok).toBe(false);
  });
});

describe('computeWebhookSignature', () => {
  it('signs timestamp + "." + raw body, keyed with the client secret', () => {
    // Recomputed independently of the implementation, straight from the documented definition.
    const expected = createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(`${NOW_SEC}.`, 'utf8'), BODY]))
      .digest('hex');

    expect(computeWebhookSignature(BODY, SECRET, NOW_SEC)).toBe(expected);
  });

  it('produces 64 lowercase hex characters', () => {
    expect(computeWebhookSignature(BODY, SECRET, NOW_SEC)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the body changes by a single byte', () => {
    const tampered = Buffer.from(BODY.toString('utf8').replace('to_1', 'to_2'), 'utf8');

    expect(computeWebhookSignature(tampered, SECRET, NOW_SEC)).not.toBe(
      computeWebhookSignature(BODY, SECRET, NOW_SEC),
    );
  });

  it('changes when the timestamp changes, so the timestamp cannot be slid', () => {
    expect(computeWebhookSignature(BODY, SECRET, NOW_SEC + 1)).not.toBe(
      computeWebhookSignature(BODY, SECRET, NOW_SEC),
    );
  });

  // The signature covers bytes. Re-serialising a parsed body reorders keys and drops whitespace,
  // and the result never verifies — which is why the route stores the raw body.
  it('does not survive a re-serialisation of the same JSON', () => {
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(BODY.toString('utf8'))), 'utf8');
    const withWhitespace = Buffer.from(`${BODY.toString('utf8')} `, 'utf8');

    expect(computeWebhookSignature(withWhitespace, SECRET, NOW_SEC)).not.toBe(
      computeWebhookSignature(BODY, SECRET, NOW_SEC),
    );
    expect(reserialised.equals(BODY)).toBe(true);
  });
});

describe('verifyWebhookSignature — the accepting path', () => {
  it('accepts a signature produced with the same secret over the same bytes', () => {
    const result = verify(header(NOW_SEC));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ timestampSec: NOW_SEC, ageSec: 0 });
  });

  it('accepts an uppercase hex signature', () => {
    const signature = computeWebhookSignature(BODY, SECRET, NOW_SEC).toUpperCase();

    expect(verify(`t=${NOW_SEC},s=${signature}`).ok).toBe(true);
  });

  it('accepts a timestamp at the edge of the window and reports its age', () => {
    const result = verify(header(NOW_SEC - TOLERANCE_SEC));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.ageSec).toBe(TOLERANCE_SEC);
  });
});

describe('verifyWebhookSignature — the rejecting paths', () => {
  it('rejects a missing header', () => {
    expect(verify(undefined)).toEqual({ ok: false, error: 'SIGNATURE_HEADER_MISSING' });
  });

  it('rejects a blank header', () => {
    expect(verify('   ')).toEqual({ ok: false, error: 'SIGNATURE_HEADER_MISSING' });
  });

  it('rejects a malformed header', () => {
    expect(verify('garbage')).toEqual({ ok: false, error: 'SIGNATURE_HEADER_MALFORMED' });
  });

  // The single most important assertion in this file: no signing key is a rejection, never a pass.
  it('rejects everything when no signing key is available', () => {
    const result = verifyWebhookSignature({
      rawBody: BODY,
      header: header(NOW_SEC),
      signingKey: '',
      nowSec: NOW_SEC,
      toleranceSec: TOLERANCE_SEC,
    });

    expect(result).toEqual({ ok: false, error: 'SIGNING_KEY_UNAVAILABLE' });
  });

  it('rejects a signature made with a different secret', () => {
    expect(verify(header(NOW_SEC, BODY, 'some-other-secret'))).toEqual({
      ok: false,
      error: 'SIGNATURE_MISMATCH',
    });
  });

  it('rejects a signature made over a different body', () => {
    const otherBody = Buffer.from(BODY.toString('utf8').replace('to_1', 'to_2'), 'utf8');

    expect(verify(header(NOW_SEC, otherBody))).toEqual({
      ok: false,
      error: 'SIGNATURE_MISMATCH',
    });
  });

  it('rejects a syntactically valid signature that is simply wrong', () => {
    expect(verify(`t=${NOW_SEC},s=${'a'.repeat(64)}`)).toEqual({
      ok: false,
      error: 'SIGNATURE_MISMATCH',
    });
  });

  it('rejects a stale timestamp — a captured request replayed later', () => {
    expect(verify(header(NOW_SEC - TOLERANCE_SEC - 1))).toEqual({
      ok: false,
      error: 'TIMESTAMP_OUTSIDE_WINDOW',
    });
  });

  it('rejects a timestamp far in the future as well as far in the past', () => {
    expect(verify(header(NOW_SEC + TOLERANCE_SEC + 1))).toEqual({
      ok: false,
      error: 'TIMESTAMP_OUTSIDE_WINDOW',
    });
  });

  // The window narrows the replay opportunity; it does not create one. A stale request that also
  // has a forged signature must fail on the signature, which is the check that cannot be gamed.
  it('reports a signature failure ahead of a timestamp failure', () => {
    expect(verify(`t=${NOW_SEC - 100_000},s=${'a'.repeat(64)}`)).toEqual({
      ok: false,
      error: 'SIGNATURE_MISMATCH',
    });
  });

  it('cannot be satisfied by an empty body when the signature covers a real one', () => {
    const result = verifyWebhookSignature({
      rawBody: Buffer.alloc(0),
      header: header(NOW_SEC),
      signingKey: SECRET,
      nowSec: NOW_SEC,
      toleranceSec: TOLERANCE_SEC,
    });

    expect(result).toEqual({ ok: false, error: 'SIGNATURE_MISMATCH' });
  });

  it('honours a zero tolerance without turning into a bypass', () => {
    const atTheEdge = verifyWebhookSignature({
      rawBody: BODY,
      header: header(NOW_SEC - 1),
      signingKey: SECRET,
      nowSec: NOW_SEC,
      toleranceSec: 0,
    });

    expect(atTheEdge).toEqual({ ok: false, error: 'TIMESTAMP_OUTSIDE_WINDOW' });
  });
});
