import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { parseWebhookEnvelope, webhookIdempotencyKey } from './webhook-events.js';
import { retainHeaders } from './event-store.js';
import type { SignatureVerifier } from './signature-verifier.js';
import type { WebhookEventStore } from './event-store.js';

/**
 * Inbound platform webhooks.
 *
 * Processing order is the official one (`docs/research/tiktok-minis-official.md` §6.3):
 * store the raw payload → verify the signature → verify the timestamp window → idempotency →
 * fulfil → 200. Fulfilment is the billing slot's; everything up to it is here.
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

    // Fulfilment (secondary order query, atomic wallet credit, order state transition) belongs to
    // the billing module. Until it exists the event stays stored and unprocessed, which is what
    // makes replay the recovery path rather than a lost payment.
    request.log.info(
      { eventId: record.id, event: envelope.value.event, idempotencyKey },
      'tiktok webhook accepted',
    );

    return reply.status(200).send({ received: true, duplicate: false });
  });
}
