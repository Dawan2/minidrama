import { describe, expect, it } from 'vitest';

import { createInMemoryWebhookEventStore, retainHeaders } from './event-store.js';

const RAW = '{"client_key":"awtest","content":"{}"}';

function input(rawPayload = RAW) {
  return { rawPayload, headers: {}, receivedAtMs: 1_700_000_000_000 };
}

describe('createInMemoryWebhookEventStore', () => {
  it('stores the payload verbatim and starts unverified and unprocessed', async () => {
    const store = createInMemoryWebhookEventStore();
    const record = await store.record(input());

    expect(record.rawPayload).toBe(RAW);
    expect(record.source).toBe('TIKTOK');
    expect(record).toMatchObject({ verified: false, processed: false, idempotencyKey: null });
  });

  it('does not normalise the payload it was given', async () => {
    const store = createInMemoryWebhookEventStore();
    const spaced = `  ${RAW}\n`;

    expect((await store.record(input(spaced))).rawPayload).toBe(spaced);
  });

  it('gives each delivery its own record, so a redelivery is still evidence', async () => {
    const store = createInMemoryWebhookEventStore();
    const first = await store.record(input());
    const second = await store.record(input());

    expect(first.id).not.toBe(second.id);
    expect(await store.list()).toHaveLength(2);
  });

  it('marks a record verified', async () => {
    const store = createInMemoryWebhookEventStore();
    const record = await store.record(input());

    await store.markVerified(record.id);

    expect((await store.get(record.id))?.verified).toBe(true);
  });

  it('keeps the rejection reason on the record without exposing it elsewhere', async () => {
    const store = createInMemoryWebhookEventStore();
    const record = await store.record(input());

    await store.markRejected(record.id, 'SIGNATURE_MISMATCH');

    expect(await store.get(record.id)).toMatchObject({
      verified: false,
      rejectionReason: 'SIGNATURE_MISMATCH',
    });
  });

  // "Authentic but uninterpretable" and "forged" are different incidents. Rejecting must not
  // rewrite the verification fact, or the case where our own parser is at fault disappears.
  it('does not un-verify an event it rejects for a later reason', async () => {
    const store = createInMemoryWebhookEventStore();
    const record = await store.record(input());

    await store.markVerified(record.id);
    await store.markRejected(record.id, 'ENVELOPE_FIELDS_INVALID');

    expect(await store.get(record.id)).toMatchObject({
      verified: true,
      processed: false,
      rejectionReason: 'ENVELOPE_FIELDS_INVALID',
    });
  });

  it('grants an idempotency key to the first claimant only', async () => {
    const store = createInMemoryWebhookEventStore();
    const first = await store.record(input());
    const second = await store.record(input());

    expect(await store.claimIdempotencyKey(first.id, 'trade_order:to_1')).toBe(true);
    expect(await store.claimIdempotencyKey(second.id, 'trade_order:to_1')).toBe(false);
  });

  it('records the key on the losing claimant too', async () => {
    const store = createInMemoryWebhookEventStore();
    const first = await store.record(input());
    const second = await store.record(input());

    await store.claimIdempotencyKey(first.id, 'trade_order:to_1');
    await store.claimIdempotencyKey(second.id, 'trade_order:to_1');

    expect((await store.get(second.id))?.idempotencyKey).toBe('trade_order:to_1');
  });

  it('claims distinct keys independently', async () => {
    const store = createInMemoryWebhookEventStore();
    const record = await store.record(input());

    expect(await store.claimIdempotencyKey(record.id, 'trade_order:to_1')).toBe(true);
    expect(await store.claimIdempotencyKey(record.id, 'trade_order:to_2')).toBe(true);
  });

  it('marks a record processed only when asked', async () => {
    const store = createInMemoryWebhookEventStore();
    const record = await store.record(input());

    expect((await store.get(record.id))?.processed).toBe(false);
    await store.markProcessed(record.id);
    expect((await store.get(record.id))?.processed).toBe(true);
  });

  it('ignores updates to an unknown id instead of throwing at the caller', async () => {
    const store = createInMemoryWebhookEventStore();

    await expect(store.markVerified('nope')).resolves.toBeUndefined();
    expect(await store.get('nope')).toBeUndefined();
  });

  it('drops the oldest records past its capacity so a flood cannot exhaust the heap', async () => {
    const store = createInMemoryWebhookEventStore({ capacity: 3 });
    const first = await store.record(input('1'));
    for (const payload of ['2', '3', '4']) {
      await store.record(input(payload));
    }

    expect(await store.list()).toHaveLength(3);
    expect(await store.get(first.id)).toBeUndefined();
  });
});

describe('retainHeaders', () => {
  it('keeps the signature header, because a stored event must be re-verifiable', () => {
    const retained = retainHeaders({
      'tiktok-signature': 't=1,s=abc',
      'content-type': 'application/json',
    });

    expect(retained).toEqual({
      'tiktok-signature': 't=1,s=abc',
      'content-type': 'application/json',
    });
  });

  // An allow-list, not a redaction list: a redaction list only has to be wrong once.
  it('drops everything it was not told to keep, including credentials', () => {
    const retained = retainHeaders({
      authorization: 'Bearer secret-token',
      cookie: 'session=secret',
      'x-internal-debug': 'on',
    });

    expect(retained).toEqual({});
  });

  it('joins a duplicated header rather than silently picking one', () => {
    const retained = retainHeaders({ 'tiktok-signature': ['t=1,s=a', 't=2,s=b'] });

    expect(retained['tiktok-signature']).toBe('t=1,s=a, t=2,s=b');
  });

  it('omits a header that is absent instead of storing undefined', () => {
    expect('user-agent' in retainHeaders({ 'content-type': 'application/json' })).toBe(false);
  });
});
