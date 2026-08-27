import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';

/**
 * Request identity and structured JSON logs.
 *
 * C2's observability exit is "traceId flows end to end" (`docs/plan/wave-protocol.md` §5.1). W10
 * found the error envelope already carries `req_*`, and Fastify's default logger already prints
 * JSON — and nothing asserted that those two are the same id, that an incoming id is honoured, or
 * that a secret logged by accident is unreadable (`OBS-001` without a vendor backend; `SRV-006`).
 *
 * This file is that slice. It does not ship OpenTelemetry, Sentry, Grafana, or a metrics
 * endpoint. Those are later work; a vendor APM is not a substitute for a request id we own.
 */

/** Canonical header. Echoed on every response; accepted inbound when it is a usable id. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Fastify's own default, still honoured so a probe that predates this file keeps correlating. */
const LEGACY_REQUEST_ID_HEADER = 'request-id';

/**
 * What a generated id looks like, and what an inbound one must look like.
 *
 * The `req_` prefix is the existing envelope (`app.test.ts` asserts it). Inbound values may omit
 * it — the contract example is a ULID (`docs/12-api-contracts.md` §2.5) — but they may not be
 * empty, huge, or carry characters that turn a log line into two.
 */
export const GENERATED_REQUEST_ID = /^req_[0-9a-f-]{36}$/;
const USABLE_INCOMING_ID = /^[\w.-]{8,128}$/;

/** pino's default censor. Tests assert this exact spelling so a silent removal is a failure. */
export const REDACTED = '[Redacted]';

/**
 * Paths `docs/14-security.md` §6.1 and the identity route already treat as credentials.
 *
 * Bracket form is required for hyphenated header names. The `*.` copies catch a field logged at
 * the top level of a child logger or one nest down — the shapes `request.log.info({ authCode })`
 * and `request.log.info({ body })` actually produce.
 */
export const REDACT_PATHS: readonly string[] = [
  'authorization',
  'authCode',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'client_secret',
  'password',
  '*.authorization',
  '*.authCode',
  '*.accessToken',
  '*.refreshToken',
  '*.clientSecret',
  '*.client_secret',
  '*.password',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["tiktok-signature"]',
];

/**
 * A pino destination. Fastify's logger option accepts this shape rather than a Node stream, so
 * tests can capture lines without going through stdout.
 */
export interface LogDestination {
  write(msg: string): void;
}

export function createLoggerOptions(
  level: string,
  destination?: LogDestination,
): NonNullable<FastifyServerOptions['logger']> {
  return {
    level,
    redact: {
      paths: [...REDACT_PATHS],
      censor: REDACTED,
    },
    // Default request logs omit headers, which would make the redact list a no-op on the line
    // operators actually read. Headers go on the line; the paths above strip the credentials.
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          host: request.host,
          remoteAddress: request.ip,
          headers: request.headers,
        };
      },
    },
    ...(destination === undefined ? {} : { stream: destination }),
  };
}

/**
 * Fastify is told `requestIdHeader: false` so an inbound value is validated here rather than
 * copied as-is. A header that fails the charset is ignored, not echoed: the alternative is log
 * injection sitting in every line of the request.
 */
export function generateRequestId(req: { readonly headers: IncomingHttpHeaders }): string {
  return readIncomingRequestId(req.headers) ?? `req_${randomUUID()}`;
}

export function readIncomingRequestId(headers: IncomingHttpHeaders): string | undefined {
  for (const name of [REQUEST_ID_HEADER, LEGACY_REQUEST_ID_HEADER]) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && USABLE_INCOMING_ID.test(value)) return value;
  }
  return undefined;
}

/**
 * Echo the request id on every response, including CORS refusals and 404s. The error envelope
 * already carries it as `traceId`; the header is what a 2xx has instead of an envelope.
 */
export function registerRequestId(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });
}
