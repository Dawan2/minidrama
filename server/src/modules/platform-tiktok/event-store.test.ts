import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import {
  createInMemoryWebhookEventStore,
  retainHeaders,
  type WebhookEventStore,
  type WebhookEventStoreOptions,
} from './event-store.js';
import { createSqliteWebhookEventStore } from './sqlite-event-store.js';

/**
 * Both implementations run the same suite. The in-memory map is the default; sqlite is what
 * `DATABASE_URL=sqlite:<path>` puts behind the interface. Filtering sqlite out of `describe.each`
 * is how the durable path would ship untested.
 */

const RAW = '{"client_key":"awtest","content":"{}"}';

function input(rawPayload = RAW) {
  return {
    rawPayload: Buffer.from(rawPayload, 'utf8'),
    headers: {},
    receivedAtMs: 1_700_000_000_000,
  };
}

interface StoreHandle {
  readonly store: WebhookEventStore;
  close(): void;
}

const backends: ReadonlyArray<
  readonly [string, (options?: WebhookEventStoreOptions) => StoreHandle]
> = [
  [
    'in-memory',
    (options) => ({ store: createInMemoryWebhookEventStore(options), close: () => undefined }),
  ],
  [
    'sqlite',
    (options) => {
      const db = openMigratedSqlite(':memory:');
      return { store: createSqliteWebhookEventStore(db, options), close: () => db.close() };
    },
  ],
];

describe.each(backends)('WebhookEventStore (%s)', (_label, open) => {
  const handles: StoreHandle[] = [];

  function store(options?: WebhookEventStoreOptions): WebhookEventStore {
    const handle = open(options);
    handles.push(handle);
    return handle.store;
  }

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it('stores the payload verbatim and starts unverified and unprocessed', async () => {
    const record = await store().record(input());

    expect(record.rawPayload.toString('utf8')).toBe(RAW);
    expect(record.source).toBe('TIKTOK');
    expect(record).toMatchObject({ verified: false, processed: false, idempotencyKey: null });
  });

  it('does not normalise the payload it was given', async () => {
    const spaced = `  ${RAW}\n`;

    expect((await store().record(input(spaced))).rawPayload.toString('utf8')).toBe(spaced);
  });

  // The signature covers bytes, so a stored event is re-verifiable only if the bytes survived. A
  // string column that decodes and re-encodes would substitute U+FFFD here and lose that.
  it('keeps bytes that are not valid UTF-8', async () => {
    const bytes = Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]);

    const record = await store().record({
      rawPayload: bytes,
      headers: {},
      receivedAtMs: 1_700_000_000_000,
    });

    expect(record.rawPayload.equals(bytes)).toBe(true);
  });

  it('gives each delivery its own record, so a redelivery is still evidence', async () => {
    const events = store();
    const first = await events.record(input());
    const second = await events.record(input());

    expect(first.id).not.toBe(second.id);
    expect(await events.list()).toHaveLength(2);
  });

  it('marks a record verified', async () => {
    const events = store();
    const record = await events.record(input());

    await events.markVerified(record.id);

    expect((await events.get(record.id))?.verified).toBe(true);
  });

  it('keeps the rejection reason on the record without exposing it elsewhere', async () => {
    const events = store();
    const record = await events.record(input());

    await events.markRejected(record.id, 'SIGNATURE_MISMATCH');

    expect(await events.get(record.id)).toMatchObject({
      verified: false,
      rejectionReason: 'SIGNATURE_MISMATCH',
    });
  });

  // "Authentic but uninterpretable" and "forged" are different incidents. Rejecting must not
  // rewrite the verification fact, or the case where our own parser is at fault disappears.
  it('does not un-verify an event it rejects for a later reason', async () => {
    const events = store();
    const record = await events.record(input());

    await events.markVerified(record.id);
    await events.markRejected(record.id, 'ENVELOPE_FIELDS_INVALID');

    expect(await events.get(record.id)).toMatchObject({
      verified: true,
      processed: false,
      rejectionReason: 'ENVELOPE_FIELDS_INVALID',
    });
  });

  it('grants an idempotency key to the first claimant only', async () => {
    const events = store();
    const first = await events.record(input());
    const second = await events.record(input());

    expect(await events.claimIdempotencyKey(first.id, 'trade_order:to_1')).toBe(true);
    expect(await events.claimIdempotencyKey(second.id, 'trade_order:to_1')).toBe(false);
  });

  it('records the key on the losing claimant too', async () => {
    const events = store();
    const first = await events.record(input());
    const second = await events.record(input());

    await events.claimIdempotencyKey(first.id, 'trade_order:to_1');
    await events.claimIdempotencyKey(second.id, 'trade_order:to_1');

    expect((await events.get(second.id))?.idempotencyKey).toBe('trade_order:to_1');
  });

  it('claims distinct keys independently', async () => {
    const events = store();
    const record = await events.record(input());

    expect(await events.claimIdempotencyKey(record.id, 'trade_order:to_1')).toBe(true);
    expect(await events.claimIdempotencyKey(record.id, 'trade_order:to_2')).toBe(true);
  });

  it('marks a record processed only when asked', async () => {
    const events = store();
    const record = await events.record(input());

    expect((await events.get(record.id))?.processed).toBe(false);
    await events.markProcessed(record.id);
    expect((await events.get(record.id))?.processed).toBe(true);
  });

  it('ignores updates to an unknown id instead of throwing at the caller', async () => {
    const events = store();

    await expect(events.markVerified('nope')).resolves.toBeUndefined();
    expect(await events.get('nope')).toBeUndefined();
  });

  it('drops the oldest records past its capacity so a flood cannot exhaust the heap', async () => {
    const events = store({ capacity: 3 });
    const first = await events.record(input('1'));
    for (const payload of ['2', '3', '4']) {
      await events.record(input(payload));
    }

    expect(await events.list()).toHaveLength(3);
    expect(await events.get(first.id)).toBeUndefined();
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
