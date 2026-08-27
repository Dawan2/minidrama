import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify';

import { ERROR_OUTCOMES, createIgnoringPaidTradeOrderSink } from './paid-trade-orders.js';
import { errorBody } from '../../core/errors.js';
import {
  REDEEM_SUCCESS_EVENT,
  parseWebhookEnvelope,
  readTradeOrderId,
  webhookIdempotencyKey,
} from './webhook-events.js';
import { retainHeaders } from './event-store.js';
import type { PaidTradeOrderSink } from './paid-trade-orders.js';
import type { SignatureVerifier } from './signature-verifier.js';
import type { WebhookEventStore } from './event-store.js';

/**
 * Inbound platform webhooks.
 *
 * Processing order is the official one (`docs/research/tiktok-minis-official.md` §6.3):
 * store the raw payload → verify the signature → verify the timestamp window → idempotency →
 * fulfil → 200. This module owns everything up to fulfilment and none of fulfilment itself: a
 * verified `redeem.success` is published to a `PaidTradeOrderSink`, and what a paid order entitles
 * anyone to is decided by the module that sold the thing.
 *
 * Three properties this handler must not lose:
 *
 *   - **the raw body is captured before the parse.** The signature covers the bytes TikTok sent, so
 *     a re-serialised body can never verify. The content-type parser below is the only reason this
 *     is possible, and it is registered inside this plugin's scope so it changes nothing elsewhere;
 *   - **an unverifiable request is rejected.** There is no flag, environment or header that skips
 *     verification. A callback we cannot authenticate is an unauthenticated instruction to hand over
 *     paid content;
 *   - **the response reveals nothing.** Every verification failure answers with the same status and
 *     the same code, so the endpoint cannot be used as an oracle for which check failed or for
 *     whether a signing key exists. The reason goes to the log and the stored record.
 */

export interface PlatformTiktokRouteOptions {
  readonly signatureVerifier: SignatureVerifier;
  readonly eventStore: WebhookEventStore;
  /** Public client key. When set, an envelope addressed to another partner is rejected. */
  readonly clientKey: string;
  /** Told about verified payments. Defaults to recording nothing, which grants nothing. */
  readonly paidTradeOrders?: PaidTradeOrderSink;
  readonly now?: () => number;
}

/** 64 KiB. Trade-order callbacks are well under 2 KiB; the rest is headroom, not a use case. */
const WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

export const TIKTOK_WEBHOOK_PATH = '/v1/payments/callbacks/tiktok';

export async function platformTiktokRoutes(
  app: FastifyInstance,
  options: PlatformTiktokRouteOptions,
): Promise<void> {
  const { signatureVerifier, eventStore, clientKey } = options;
  const paidTradeOrders = options.paidTradeOrders ?? createIgnoringPaidTradeOrderSink();
  const now = options.now ?? Date.now;

  // Both calls are encapsulated in this plugin's scope, so routes registered elsewhere keep
  // Fastify's default parsers and are unaffected.
  //
  // Every content type is captured as bytes, including the ones Fastify would otherwise parse for
  // us. The signature covers bytes, so a request whose body was decoded by another parser is a
  // request we can no longer verify — and the strict alternative, refusing anything that is not
  // `application/json`, would reject a real payment event over a header TikTok never promised.
  // Authenticity is decided by the HMAC; the content type decides nothing.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer', bodyLimit: WEBHOOK_BODY_LIMIT_BYTES },
    (request, body, done) => {
      (request as RawBodyRequest).rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);

      // Parsing is deliberately not attempted here. A malformed body must reach the handler so the
      // signature is checked first and the bytes are stored; a 400 raised by the parser would
      // discard an authentic payload we cannot yet interpret.
      done(null, undefined);
    },
  );

  app.post(TIKTOK_WEBHOOK_PATH, { bodyLimit: WEBHOOK_BODY_LIMIT_BYTES }, async (request, reply) => {
    const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.alloc(0);

    const record = await eventStore.record({
      rawPayload: rawBody,
      headers: retainHeaders(request.headers),
      receivedAtMs: now(),
    });

    const verification = signatureVerifier.verify(rawBody, request.headers);

    if (!verification.ok) {
      await eventStore.markRejected(record.id, verification.error);
      // Warn, not error: a single failure is noise, a rate of them is either an attack or our own
      // key being wrong, and the second one loses money quietly (`api-contracts` §8: webhooks are
      // never rate-limited, but verification failures must alert).
      request.log.warn(
        { eventId: record.id, reason: verification.error },
        'tiktok webhook rejected',
      );
      return reply
        .status(400)
        .send(
          errorBody('PAYMENT_CALLBACK_INVALID_SIGN', 'Signature verification failed', request.id),
        );
    }

    await eventStore.markVerified(record.id);

    const envelope = parseWebhookEnvelope(rawBody);
    if (!envelope.ok) {
      // Authentic but uninterpretable. The bytes are stored and can be replayed once the field set
      // is known (G-R4), so this is reported as a 400 rather than retried forever.
      await eventStore.markRejected(record.id, envelope.error);
      request.log.error(
        { eventId: record.id, reason: envelope.error },
        'tiktok webhook passed verification but could not be parsed',
      );
      return reply
        .status(400)
        .send(errorBody('COMMON_VALIDATION_FAILED', 'Unrecognised webhook payload', request.id));
    }

    // A valid signature from our own secret cannot carry another partner's client key. If it does,
    // something is wrong upstream and this is not an event we may act on.
    if (clientKey.length > 0 && envelope.value.clientKey !== clientKey) {
      await eventStore.markRejected(record.id, 'CLIENT_KEY_MISMATCH');
      request.log.warn(
        { eventId: record.id, reason: 'CLIENT_KEY_MISMATCH' },
        'tiktok webhook rejected',
      );
      return reply
        .status(400)
        .send(
          errorBody('PAYMENT_CALLBACK_INVALID_SIGN', 'Signature verification failed', request.id),
        );
    }

    const idempotencyKey = webhookIdempotencyKey(rawBody, envelope.value.content);
    const claimed = await eventStore.claimIdempotencyKey(record.id, idempotencyKey);

    if (!claimed) {
      // At-least-once delivery is documented, so a redelivery is normal traffic and must answer
      // 200 — a non-200 is treated as failed delivery and brings the event back for 72 hours.
      request.log.info({ eventId: record.id, idempotencyKey }, 'tiktok webhook already seen');
      return reply.status(200).send({ received: true, duplicate: true });
    }

    request.log.info(
      { eventId: record.id, event: envelope.value.event, idempotencyKey },
      'tiktok webhook accepted',
    );

    // Only a redeem success says a viewer was charged. The refund events are stored and left alone:
    // reversing an order is a different decision from making one, and inventing it from an event
    // shape we have never seen (G-R4) would be guessing with somebody's money.
    if (envelope.value.event === REDEEM_SUCCESS_EVENT) {
      await publishVerifiedPayment({
        log: request.log,
        sink: paidTradeOrders,
        eventId: record.id,
        payerOpenId: envelope.value.userOpenId,
        content: envelope.value.content,
        paidAtMs: now(),
      });
    }

    // Whether the sink recorded anything, granted anything or refused changes nothing above: the
    // response is a `200` because the delivery was authentic, and the outcome went to the log. The
    // event stays stored either way, which is what makes replay the recovery path rather than a lost
    // payment. The coin wallet and its ledger are still W14's; this endpoint has never known what a
    // paid order buys, and it still does not.
    return reply.status(200).send({ received: true, duplicate: false });
  });
}

interface PublishVerifiedPaymentInput {
  readonly log: FastifyBaseLogger;
  readonly sink: PaidTradeOrderSink;
  readonly eventId: string;
  readonly payerOpenId: string;
  readonly content: string;
  readonly paidAtMs: number;
}

/**
 * Hands one verified payment to the sink and reports what came of it.
 *
 * Nothing here can change the response. The delivery's idempotency key was claimed before this
 * runs, so answering anything other than `200` would bring the event back only to be discarded as a
 * duplicate; recovery for everything below is replay from the stored payload, and the log line is
 * how anyone learns a replay is owed.
 */
async function publishVerifiedPayment(input: PublishVerifiedPaymentInput): Promise<void> {
  const tradeOrderId = readTradeOrderId(input.content);

  if (tradeOrderId === null) {
    // Authentic, and about a payment we cannot name. Nothing can be correlated on an absent id, and
    // matching on anything else — the open id, the amount, the timing — is how the wrong order gets
    // paid.
    input.log.error(
      { eventId: input.eventId },
      'verified redeem success carries no trade_order_id',
    );
    return;
  }

  const outcome = await input.sink.recordPaid({
    tradeOrderId,
    payerOpenId: input.payerOpenId,
    paidAtMs: input.paidAtMs,
    eventId: input.eventId,
  });

  // An authentic payment arrived for an order we hold and the money did not end up where it
  // belongs: a correlation bug, an attempt to pay somebody else's order, an entitlement that was
  // not written, or an episode bought twice. Each needs a human and none of them is visible to the
  // viewer, who has been charged either way.
  const level = ERROR_OUTCOMES.includes(outcome) ? 'error' : 'info';

  input.log[level]({ eventId: input.eventId, tradeOrderId, outcome }, 'verified payment published');
}
