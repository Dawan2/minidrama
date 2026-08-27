import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { TIKTOK_WEBHOOK_PATH } from './routes.js';
import { buildApp } from '../../app.js';
import { computeWebhookSignature } from './webhook-signature.js';
import { createInMemoryWebhookEventStore } from './event-store.js';
import { createPlatformCredentials } from './credentials.js';
import { loadConfig } from '../../config.js';
import type { WebhookEventStore } from './event-store.js';

/**
 * End-to-end webhook behaviour, through the real Fastify stack.
 *
 * These are the tests that matter most in this slot, because the unit tests prove the algorithm and
 * only these prove the *wiring*: that the raw bytes reach the verifier unmodified, that a rejection
 * happens before anything is acted on, and that the response says nothing useful to a prober.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const NOW_MS = 1_700_000_000_000;
const NOW_SEC = NOW_MS / 1000;

const CONTENT = JSON.stringify({ trade_order_id: 'to_1', order_id: 'ord_1', is_sandbox: false });

function rawEnvelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    client_key: CLIENT_KEY,
    event: 'minis.trade_order.redeem.success',
    create_time: NOW_SEC,
    user_openid: 'open_abc',
    content: CONTENT,
    ...overrides,
  });
}

function signature(rawBody: string, timestampSec = NOW_SEC, secret = SECRET): string {
  return `t=${timestampSec},s=${computeWebhookSignature(Buffer.from(rawBody, 'utf8'), secret, timestampSec)}`;
}

let app: FastifyInstance;
let eventStore: WebhookEventStore;

async function startApp(secret = SECRET): Promise<void> {
  eventStore = createInMemoryWebhookEventStore();
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, secret),
      webhookEventStore: eventStore,
      now: () => NOW_MS,
    },
  );
  await app.ready();
}

function post(rawBody: string, signatureHeader?: string) {
  return app.inject({
    method: 'POST',
    url: TIKTOK_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      ...(signatureHeader === undefined ? {} : { 'tiktok-signature': signatureHeader }),
    },
    payload: rawBody,
  });
}

beforeEach(async () => {
  await startApp();
});

afterEach(async () => {
  await app.close();
});

describe('POST /v1/payments/callbacks/tiktok — a valid signature', () => {
  it('is accepted with 200, which is what stops the 72-hour retry cycle', async () => {
    const body = rawEnvelope();
    const response = await post(body, signature(body));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, duplicate: false });
  });

  it('marks the stored event verified', async () => {
    const body = rawEnvelope();
    await post(body, signature(body));

    const [record] = await eventStore.list();
    expect(record).toMatchObject({ verified: true, rejectionReason: null });
  });

  it('claims the idempotency key from the order, not from the delivery', async () => {
    const body = rawEnvelope();
    await post(body, signature(body));

    const [record] = await eventStore.list();
    expect(record?.idempotencyKey).toBe('trade_order:to_1');
  });

  // Fulfilment is the billing module's. Until it exists, an accepted event is stored and left
  // unprocessed on purpose, so replay is the recovery path rather than a lost payment.
  it('does not claim to have processed the event', async () => {
    const body = rawEnvelope();
    await post(body, signature(body));

    const [record] = await eventStore.list();
    expect(record?.processed).toBe(false);
  });

  it('accepts a timestamp at the far edge of the window', async () => {
    const body = rawEnvelope();
    const response = await post(body, signature(body, NOW_SEC - 300));

    expect(response.statusCode).toBe(200);
  });

  // The proof that the raw body survives to the verifier: this payload's whitespace and key order
  // would not survive a JSON round-trip, and the signature covers them.
  it('verifies a body whose exact bytes no re-serialisation would reproduce', async () => {
    const body = `{ "content": ${JSON.stringify(CONTENT)},\n  "user_openid": "open_abc",\n  "create_time": ${NOW_SEC}, "event": "minis.trade_order.redeem.success",\n  "client_key": "${CLIENT_KEY}" }`;
    expect(JSON.stringify(JSON.parse(body))).not.toBe(body);

    const response = await post(body, signature(body));

    expect(response.statusCode).toBe(200);
    expect((await eventStore.list())[0]?.rawPayload).toBe(body);
  });
});

describe('POST /v1/payments/callbacks/tiktok — at-least-once delivery', () => {
  it('answers 200 to a redelivery and flags it as a duplicate', async () => {
    const body = rawEnvelope();
    const header = signature(body);

    const first = await post(body, header);
    const second = await post(body, header);

    expect(first.json()).toEqual({ received: true, duplicate: false });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ received: true, duplicate: true });
  });

  it('deduplicates on the order even when the envelope timing differs', async () => {
    const first = rawEnvelope({ create_time: NOW_SEC });
    const second = rawEnvelope({ create_time: NOW_SEC - 30 });

    await post(first, signature(first));
    const redelivery = await post(second, signature(second));

    expect(redelivery.json<{ duplicate: boolean }>().duplicate).toBe(true);
  });

  it('still stores every delivery, because a redelivery is evidence too', async () => {
    const body = rawEnvelope();
    await post(body, signature(body));
    await post(body, signature(body));

    expect(await eventStore.list()).toHaveLength(2);
  });

  it('does not treat a different order as a duplicate', async () => {
    const first = rawEnvelope();
    const second = rawEnvelope({ content: JSON.stringify({ trade_order_id: 'to_2' }) });

    await post(first, signature(first));
    const other = await post(second, signature(second));

    expect(other.json<{ duplicate: boolean }>().duplicate).toBe(false);
  });
});

describe('POST /v1/payments/callbacks/tiktok — rejection', () => {
  it('rejects a body signed with the wrong secret', async () => {
    const body = rawEnvelope();
    const response = await post(body, signature(body, NOW_SEC, 'attacker-secret'));

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CALLBACK_INVALID_SIGN',
    );
  });

  it('rejects a body that was altered after signing', async () => {
    const original = rawEnvelope();
    const header = signature(original);
    const tampered = original.replace('to_1', 'to_9');

    expect((await post(tampered, header)).statusCode).toBe(400);
  });

  it('rejects a request with no signature header', async () => {
    expect((await post(rawEnvelope())).statusCode).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    expect((await post(rawEnvelope(), 'garbage')).statusCode).toBe(400);
  });

  it('rejects a replayed request whose timestamp has gone stale', async () => {
    const body = rawEnvelope();
    const response = await post(body, signature(body, NOW_SEC - 301));

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CALLBACK_INVALID_SIGN',
    );
  });

  it('rejects a request timestamped in the future', async () => {
    const body = rawEnvelope();

    expect((await post(body, signature(body, NOW_SEC + 301))).statusCode).toBe(400);
  });

  it('rejects an envelope addressed to another client key', async () => {
    const body = rawEnvelope({ client_key: 'awsomeoneelse' });
    const response = await post(body, signature(body));

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CALLBACK_INVALID_SIGN',
    );
  });

  it('never fulfils or claims a key for a rejected request', async () => {
    const body = rawEnvelope();
    await post(body, signature(body, NOW_SEC, 'attacker-secret'));

    const [record] = await eventStore.list();
    expect(record).toMatchObject({ verified: false, processed: false, idempotencyKey: null });
  });

  it('keeps the rejection reason in the record for the operator', async () => {
    const body = rawEnvelope();
    await post(body, signature(body, NOW_SEC - 301));

    expect((await eventStore.list())[0]?.rejectionReason).toBe('TIMESTAMP_OUTSIDE_WINDOW');
  });

  // No oracle: a prober must not be able to tell a wrong secret from a stale timestamp from a
  // deployment that holds no key at all.
  it('answers every verification failure identically', async () => {
    const body = rawEnvelope();
    const responses = await Promise.all([
      post(body, signature(body, NOW_SEC, 'attacker-secret')),
      post(body, signature(body, NOW_SEC - 301)),
      post(body, 'garbage'),
      post(body),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
      const parsed = response.json<{
        error: { code: string; message: string; details?: unknown };
      }>();
      expect(parsed.error.code).toBe('PAYMENT_CALLBACK_INVALID_SIGN');
      expect(parsed.error.message).toBe('Signature verification failed');
      expect(parsed.error.details).toBeUndefined();
    }
  });

  it('leaks neither the reason nor the signing key in the response body', async () => {
    const body = rawEnvelope();
    const response = await post(body, signature(body, NOW_SEC - 301));

    expect(response.body).not.toContain('TIMESTAMP');
    expect(response.body).not.toContain('MISMATCH');
    expect(response.body).not.toContain(SECRET);
  });
});

describe('POST /v1/payments/callbacks/tiktok — the raw body is stored before anything else', () => {
  it('stores the bytes of a request that fails verification', async () => {
    const body = rawEnvelope();
    await post(body, 'garbage');

    expect((await eventStore.list())[0]).toMatchObject({
      rawPayload: body,
      source: 'TIKTOK',
      verified: false,
    });
  });

  it('stores a body that is not JSON at all, rather than 400-ing before the store', async () => {
    await post('<html>not json</html>', 'garbage');

    expect((await eventStore.list())[0]?.rawPayload).toBe('<html>not json</html>');
  });

  it('keeps the signature header so a stored event can be re-verified later', async () => {
    const body = rawEnvelope();
    const header = signature(body);
    await post(body, header);

    expect((await eventStore.list())[0]?.headers['tiktok-signature']).toBe(header);
  });

  // Authentic but uninterpretable. The field set is not exhaustive (G-R4), so the bytes are kept
  // and this is a 400 rather than an event retried for 72 hours.
  it('reports a verified-but-unparseable payload separately from a bad signature', async () => {
    const body = '{"client_key":"awtest"}';
    const response = await post(body, signature(body));

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );

    const [record] = await eventStore.list();
    expect(record).toMatchObject({ verified: true, rejectionReason: 'ENVELOPE_FIELDS_INVALID' });
  });

  it('does not answer 500 to any of these — a crash is a failed delivery and a retry storm', async () => {
    const responses = await Promise.all([
      post('', 'garbage'),
      post('null', signature('null')),
      post('[]', signature('[]')),
      post('{"content":', signature('{"content":')),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
    }
  });

  it('refuses a body beyond the route limit instead of buffering it', async () => {
    const oversized = `{"padding":"${'x'.repeat(70 * 1024)}"}`;
    const response = await post(oversized, signature(oversized));

    expect(response.statusCode).toBe(413);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  // Authenticity is decided by the HMAC, so the bytes are captured whatever the content type says.
  // The alternative — refusing anything that is not `application/json` — would discard a real
  // payment event over a header the platform never promised.
  it('captures the raw bytes under any content type', async () => {
    const body = rawEnvelope();
    const response = await app.inject({
      method: 'POST',
      url: TIKTOK_WEBHOOK_PATH,
      headers: { 'content-type': 'text/plain', 'tiktok-signature': signature(body) },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect((await eventStore.list())[0]?.rawPayload).toBe(body);
  });

  it('still rejects an unsigned body sent under a permissive content type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: TIKTOK_WEBHOOK_PATH,
      headers: { 'content-type': 'text/plain' },
      payload: rawEnvelope(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CALLBACK_INVALID_SIGN',
    );
  });
});

describe('POST /v1/payments/callbacks/tiktok — no signing key configured', () => {
  beforeEach(async () => {
    await app.close();
    await startApp('');
  });

  it('rejects a request that would otherwise verify', async () => {
    const body = rawEnvelope();
    const response = await post(body, signature(body));

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CALLBACK_INVALID_SIGN',
    );
  });

  it('records the misconfiguration as the reason, so it is diagnosable', async () => {
    const body = rawEnvelope();
    await post(body, signature(body));

    expect((await eventStore.list())[0]?.rejectionReason).toBe('SIGNING_KEY_UNAVAILABLE');
  });
});

describe('the raw-body parser is scoped to this module', () => {
  it('leaves JSON parsing intact for routes registered elsewhere', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_free_0001' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ episodeId: string }>().episodeId).toBe('ep_free_0001');
  });
});
