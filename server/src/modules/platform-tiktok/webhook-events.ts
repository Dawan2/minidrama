import { createHash } from 'node:crypto';
import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * The webhook envelope, and only the envelope.
 *
 * `docs/research/tiktok-minis-official.md` §6.3 documents five envelope fields — and then the One
 * Page adds `pay_type`, which appears in no public reference. The field set is therefore
 * documented-but-not-exhaustive (gap G-R4), which is exactly why the raw payload is stored before
 * anything here runs: when the real field list arrives, historical events can be replayed instead
 * of being permanently lossy.
 *
 * `content` is a *serialised JSON string* on the wire, not an object. It is kept as a string in the
 * envelope type and parsed separately, so a malformed `content` cannot invalidate an envelope whose
 * signature we already verified.
 */

export interface TiktokWebhookEnvelope {
  readonly clientKey: string;
  readonly event: string;
  readonly createTimeSec: number;
  readonly userOpenId: string;
  readonly content: string;
}

export type EnvelopeRejectionReason = 'PAYLOAD_NOT_JSON' | 'ENVELOPE_FIELDS_INVALID';

/** The one event that means a viewer's Beans were taken and something is owed to them. */
export const REDEEM_SUCCESS_EVENT = 'minis.trade_order.redeem.success';

/** Published trade-order events. `refund_success` / `refund_fail` are currently unavailable. */
export const KNOWN_WEBHOOK_EVENTS = [
  REDEEM_SUCCESS_EVENT,
  'minis.trade_order.redeem.refund_success',
  'minis.trade_order.redeem.refund_fail',
  'minis.trade_order.redeem.refund_traceback',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseWebhookEnvelope(
  rawBody: Buffer,
): Result<TiktokWebhookEnvelope, EnvelopeRejectionReason> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return err('PAYLOAD_NOT_JSON');
  }

  if (!isRecord(parsed)) {
    return err('ENVELOPE_FIELDS_INVALID');
  }

  const { client_key: clientKey, event, create_time: createTime, user_openid: openId } = parsed;
  const content = parsed['content'];

  if (
    typeof clientKey !== 'string' ||
    typeof event !== 'string' ||
    typeof createTime !== 'number' ||
    !Number.isInteger(createTime) ||
    typeof openId !== 'string' ||
    typeof content !== 'string'
  ) {
    return err('ENVELOPE_FIELDS_INVALID');
  }

  return ok({ clientKey, event, createTimeSec: createTime, userOpenId: openId, content });
}

export function parseEventContent(
  content: string,
): Result<Record<string, unknown>, 'CONTENT_NOT_JSON'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return err('CONTENT_NOT_JSON');
  }

  return isRecord(parsed) ? ok(parsed) : err('CONTENT_NOT_JSON');
}

/**
 * The platform's identifier for the payment, or `null` when the content does not carry one.
 *
 * It is the only field an order can be correlated on, so an empty or non-string value is `null`
 * rather than a coerced key: correlating on `""` would match every order that failed to get a real
 * identifier, and the first thing it would do is pay the wrong one.
 */
export function readTradeOrderId(content: string): string | null {
  const parsed = parseEventContent(content);
  if (!parsed.ok) return null;

  const tradeOrderId = parsed.value['trade_order_id'];

  return typeof tradeOrderId === 'string' && tradeOrderId.length > 0 ? tradeOrderId : null;
}

/**
 * The idempotency key for at-least-once delivery: TikTok warns that "webhook endpoints might
 * receive the same event more than once".
 *
 * `trade_order_id` is the platform's own identifier for the thing being fulfilled and is the key the
 * billing slot will use for the conditional `PAID → CREDITED` update. When it is absent — an event
 * type whose `content` we have never seen — the digest of the raw payload is the honest fallback: it
 * deduplicates byte-identical redeliveries and nothing more. It deliberately does not guess at
 * semantic equality for a field set we do not have (G-R4).
 */
export function webhookIdempotencyKey(rawBody: Buffer, content: string): string {
  const tradeOrderId = readTradeOrderId(content);
  if (tradeOrderId !== null) {
    return `trade_order:${tradeOrderId}`;
  }

  return `payload:${createHash('sha256').update(rawBody).digest('hex')}`;
}
