import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  KNOWN_WEBHOOK_EVENTS,
  REDEEM_SUCCESS_EVENT,
  parseEventContent,
  parseWebhookEnvelope,
  readTradeOrderId,
  webhookIdempotencyKey,
} from './webhook-events.js';

function envelope(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      client_key: 'awtest',
      event: 'minis.trade_order.redeem.success',
      create_time: 1_700_000_000,
      user_openid: 'open_abc',
      content: JSON.stringify({ trade_order_id: 'to_1', order_id: 'ord_1', is_sandbox: false }),
      ...overrides,
    }),
    'utf8',
  );
}

describe('parseWebhookEnvelope', () => {
  it('maps the five documented envelope fields', () => {
    const parsed = parseWebhookEnvelope(envelope());

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toMatchObject({
      clientKey: 'awtest',
      event: 'minis.trade_order.redeem.success',
      createTimeSec: 1_700_000_000,
      userOpenId: 'open_abc',
    });
  });

  // The One Page documents `pay_type`, which appears in no public reference (G-R4). An envelope
  // carrying an unknown field must still parse, or a platform-side addition breaks fulfilment.
  it('accepts unknown envelope fields', () => {
    expect(parseWebhookEnvelope(envelope({ pay_type: 'BEANS', future_field: 1 })).ok).toBe(true);
  });

  it('keeps content as a string, because that is what is on the wire', () => {
    const parsed = parseWebhookEnvelope(envelope());

    expect(parsed.ok && typeof parsed.value.content).toBe('string');
  });

  it('rejects a body that is not JSON', () => {
    expect(parseWebhookEnvelope(Buffer.from('<html>gateway error</html>', 'utf8'))).toEqual({
      ok: false,
      error: 'PAYLOAD_NOT_JSON',
    });
  });

  it.each([
    ['a JSON array', Buffer.from('[]', 'utf8')],
    ['a JSON scalar', Buffer.from('"nope"', 'utf8')],
    ['JSON null', Buffer.from('null', 'utf8')],
  ])('rejects %s at the top level', (_case, body) => {
    expect(parseWebhookEnvelope(body).ok).toBe(false);
  });

  it.each([
    ['client_key', { client_key: 42 }],
    ['event', { event: null }],
    ['create_time', { create_time: 'yesterday' }],
    ['user_openid', { user_openid: { id: 'x' } }],
    ['content', { content: { trade_order_id: 'to_1' } }],
  ])('rejects an envelope whose %s has the wrong type', (_field, override) => {
    expect(parseWebhookEnvelope(envelope(override))).toEqual({
      ok: false,
      error: 'ENVELOPE_FIELDS_INVALID',
    });
  });

  it('rejects a non-integer create_time', () => {
    expect(parseWebhookEnvelope(envelope({ create_time: 1.5 })).ok).toBe(false);
  });
});

describe('parseEventContent', () => {
  it('parses the serialised content string', () => {
    const parsed = parseEventContent('{"trade_order_id":"to_1","is_sandbox":true}');

    expect(parsed.ok && parsed.value['is_sandbox']).toBe(true);
  });

  it('rejects content that is not a JSON object', () => {
    expect(parseEventContent('not json').ok).toBe(false);
    expect(parseEventContent('[1,2]').ok).toBe(false);
  });
});

describe('readTradeOrderId', () => {
  it('reads the identifier a payment is correlated on', () => {
    expect(readTradeOrderId('{"trade_order_id":"to_1","is_sandbox":false}')).toBe('to_1');
  });

  // Correlating on a coerced key is worse than not correlating: `""` would match every order that
  // failed to get a real identifier, and the first thing it would do is pay the wrong one.
  it.each([
    ['content that is not JSON', 'not json'],
    ['content with no trade_order_id', '{"refund_amount":100}'],
    ['an empty trade_order_id', '{"trade_order_id":""}'],
    ['a trade_order_id that is not a string', '{"trade_order_id":42}'],
    ['a null trade_order_id', '{"trade_order_id":null}'],
  ])('reports %s as no identifier at all', (_case, content) => {
    expect(readTradeOrderId(content)).toBeNull();
  });
});

describe('webhookIdempotencyKey', () => {
  it('keys on trade_order_id when the content carries one', () => {
    const body = envelope();
    const content = JSON.parse(body.toString('utf8'))['content'] as string;

    expect(webhookIdempotencyKey(body, content)).toBe('trade_order:to_1');
  });

  it('gives redeliveries of the same order the same key regardless of envelope timing', () => {
    const first = envelope({ create_time: 1_700_000_000 });
    const second = envelope({ create_time: 1_700_000_060 });
    const content = JSON.parse(first.toString('utf8'))['content'] as string;

    expect(webhookIdempotencyKey(first, content)).toBe(webhookIdempotencyKey(second, content));
  });

  it('gives different orders different keys', () => {
    const other = JSON.stringify({ trade_order_id: 'to_2' });

    expect(webhookIdempotencyKey(envelope(), other)).not.toBe(
      webhookIdempotencyKey(envelope(), JSON.stringify({ trade_order_id: 'to_1' })),
    );
  });

  // Deduplicating only byte-identical redeliveries is the honest floor for an event type whose
  // content fields we have never seen. It does not guess at semantic equality.
  it('falls back to a digest of the raw payload when no trade_order_id is present', () => {
    const body = envelope({ content: JSON.stringify({ refund_amount: 100 }) });
    const digest = createHash('sha256').update(body).digest('hex');

    expect(webhookIdempotencyKey(body, JSON.stringify({ refund_amount: 100 }))).toBe(
      `payload:${digest}`,
    );
  });

  it('falls back to the digest when the content is not parseable at all', () => {
    expect(webhookIdempotencyKey(envelope(), 'not-json')).toMatch(/^payload:[0-9a-f]{64}$/);
  });
});

describe('KNOWN_WEBHOOK_EVENTS', () => {
  it('lists the published trade-order events under the minis namespace', () => {
    expect(KNOWN_WEBHOOK_EVENTS).toContain('minis.trade_order.redeem.success');
    for (const event of KNOWN_WEBHOOK_EVENTS) {
      expect(event).toMatch(/^minis\.trade_order\./);
    }
  });

  // The one event that means a viewer was charged. The refunds are stored and acted on by nobody:
  // reversing an order is a different decision from making one.
  it('names the redeem success separately, because only it moves an order', () => {
    expect(REDEEM_SUCCESS_EVENT).toBe('minis.trade_order.redeem.success');
    expect(KNOWN_WEBHOOK_EVENTS).toContain(REDEEM_SUCCESS_EVENT);
  });
});
