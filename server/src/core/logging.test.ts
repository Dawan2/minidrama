import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import {
  GENERATED_REQUEST_ID,
  REDACTED,
  REDACT_PATHS,
  REQUEST_ID_HEADER,
  createLoggerOptions,
  generateRequestId,
  readIncomingRequestId,
} from './logging.js';

/**
 * Request identity and structured JSON logs, through the logger itself and through the assembled
 * server. The envelope already carried a `req_*` id; these tests are what make that id a property
 * of the logs rather than a coincidence of Fastify defaults.
 */

const AUTH_CODE = 'code_do_not_log_this_value';
const BEARER = 'Bearer tok_do_not_log_this_value';
const WEBHOOK_SIGNATURE = 't=1,s=do-not-log-this-mac';

interface LogLine {
  readonly level?: number;
  readonly reqId?: string;
  readonly msg?: string;
  readonly req?: { readonly method?: string; readonly url?: string };
  readonly res?: { readonly statusCode?: number };
  readonly [key: string]: unknown;
}

function createLogCapture(): {
  readonly records: LogLine[];
  readonly stream: { write(msg: string): void };
} {
  const records: LogLine[] = [];
  return {
    records,
    stream: {
      write(msg: string) {
        const text = msg.trim();
        if (text === '') return;
        for (const line of text.split('\n')) {
          if (line !== '') records.push(JSON.parse(line) as LogLine);
        }
      },
    },
  };
}

describe('generateRequestId', () => {
  it('mints a req_ UUID when nothing inbound is usable', () => {
    const id = generateRequestId({ headers: {} });

    expect(id).toMatch(GENERATED_REQUEST_ID);
  });

  it('mints distinct ids', () => {
    expect(generateRequestId({ headers: {} })).not.toBe(generateRequestId({ headers: {} }));
  });

  it('honours a usable x-request-id, including a ULID the contract uses as an example', () => {
    expect(readIncomingRequestId({ [REQUEST_ID_HEADER]: '01J6ABCDEFGHJKMNPQRSTVWXYZ' })).toBe(
      '01J6ABCDEFGHJKMNPQRSTVWXYZ',
    );
    expect(generateRequestId({ headers: { [REQUEST_ID_HEADER]: 'req_client_supplied_01' } })).toBe(
      'req_client_supplied_01',
    );
  });

  it("still honours Fastify's legacy request-id header", () => {
    expect(generateRequestId({ headers: { 'request-id': 'req_legacy_header1' } })).toBe(
      'req_legacy_header1',
    );
  });

  it('prefers x-request-id when both arrive', () => {
    expect(
      generateRequestId({
        headers: { [REQUEST_ID_HEADER]: 'req_canonical_hdr', 'request-id': 'req_legacy_header1' },
      }),
    ).toBe('req_canonical_hdr');
  });

  it.each([
    ['short', 'abc'],
    ['empty', ''],
    ['spaces', 'req has spaces'],
    ['newline', 'req_abc\n{"level":50}'],
    ['quote', 'req_"inject"'],
    ['too long', `req_${'a'.repeat(130)}`],
  ])('ignores an inbound id that is %s rather than echoing it', (_case, value) => {
    expect(readIncomingRequestId({ [REQUEST_ID_HEADER]: value })).toBeUndefined();
    expect(generateRequestId({ headers: { [REQUEST_ID_HEADER]: value } })).toMatch(
      GENERATED_REQUEST_ID,
    );
  });
});

describe('the logger writes JSON and redacts credentials', () => {
  it('emits one JSON object per line, not pretty-printed text', () => {
    const capture = createLogCapture();
    const app = Fastify({ logger: createLoggerOptions('info', capture.stream) });

    app.log.info({ answer: 42 }, 'structured');

    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]).toMatchObject({ msg: 'structured', answer: 42 });
    expect(typeof capture.records[0]?.level).toBe('number');
  });

  it.each([
    ['authCode', AUTH_CODE],
    ['accessToken', 'tok_secret_access'],
    ['refreshToken', 'tok_secret_refresh'],
    ['clientSecret', 'sk_platform_secret'],
    ['client_secret', 'sk_platform_secret'],
    ['password', 'hunter2-not-a-real-password'],
    ['authorization', BEARER],
  ] as const)('redacts %s so the original never appears in the line', (field, secret) => {
    const capture = createLogCapture();
    const app = Fastify({ logger: createLoggerOptions('info', capture.stream) });

    app.log.info({ [field]: secret }, 'leak-probe');

    const dumped = JSON.stringify(capture.records);
    expect(dumped).not.toContain(secret);
    expect(capture.records[0]?.[field]).toBe(REDACTED);
  });

  it('redacts the same fields one nest down, which is how a body gets logged', () => {
    const capture = createLogCapture();
    const app = Fastify({ logger: createLoggerOptions('info', capture.stream) });

    app.log.info({ body: { authCode: AUTH_CODE, provider: 'TIKTOK' } }, 'login');

    const dumped = JSON.stringify(capture.records);
    expect(dumped).not.toContain(AUTH_CODE);
    expect((capture.records[0]?.body as { authCode: string; provider: string }).authCode).toBe(
      REDACTED,
    );
    expect((capture.records[0]?.body as { provider: string }).provider).toBe('TIKTOK');
  });

  it('redacts authorization on a Fastify request log, which is the line operators actually read', async () => {
    const capture = createLogCapture();
    const app = Fastify({ logger: createLoggerOptions('info', capture.stream) });
    app.get('/probe', async () => ({ ok: true }));
    await app.ready();

    try {
      await app.inject({ method: 'GET', url: '/probe', headers: { authorization: BEARER } });
    } finally {
      await app.close();
    }

    const dumped = JSON.stringify(capture.records);
    expect(dumped).not.toContain('tok_do_not_log_this_value');
    const incoming = capture.records.find((line) => line.msg === 'incoming request');
    expect(
      (incoming?.req as { headers?: { authorization?: string } } | undefined)?.headers
        ?.authorization,
    ).toBe(REDACTED);
  });

  it('names the credential fields it covers, so dropping one is a test failure', () => {
    expect(REDACT_PATHS).toEqual(expect.arrayContaining(['authCode', 'req.headers.authorization']));
    expect(REDACT_PATHS).toContain('req.headers["tiktok-signature"]');
  });
});

describe('the assembled server correlates logs, envelope and header', () => {
  let app: FastifyInstance;
  let records: LogLine[];

  async function start(): Promise<LogLine[]> {
    const capture = createLogCapture();
    records = capture.records;
    app = await buildApp(
      { ...loadConfig({}), logLevel: 'info' },
      { logDestination: capture.stream },
    );
    await app.ready();
    return records;
  }

  afterEach(async () => {
    await app.close();
  });

  it('puts the same id on the JSON log, the error envelope and the response header', async () => {
    await start();

    const response = await app.inject({ method: 'GET', url: '/nope' });
    const body = response.json<{ error: { traceId: string } }>();
    const header = response.headers[REQUEST_ID_HEADER];

    expect(body.error.traceId).toMatch(GENERATED_REQUEST_ID);
    expect(header).toBe(body.error.traceId);

    const incoming = records.find((line) => line.msg === 'incoming request');
    const completed = records.find((line) => line.msg === 'request completed');
    expect(incoming?.reqId).toBe(body.error.traceId);
    expect(completed?.reqId).toBe(body.error.traceId);
    expect(incoming?.req).toMatchObject({ method: 'GET', url: '/nope' });
    expect(completed?.res).toMatchObject({ statusCode: 404 });
  });

  it('echoes a supplied x-request-id through the envelope, the header and the log', async () => {
    await start();
    const supplied = 'req_from_the_client_01';

    const response = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { [REQUEST_ID_HEADER]: supplied },
    });
    const body = response.json<{ error: { traceId: string } }>();

    expect(body.error.traceId).toBe(supplied);
    expect(response.headers[REQUEST_ID_HEADER]).toBe(supplied);
    expect(records.find((line) => line.msg === 'incoming request')?.reqId).toBe(supplied);
  });

  it('echoes the id on a 2xx, which has no error envelope to carry it', async () => {
    await start();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers[REQUEST_ID_HEADER])).toMatch(GENERATED_REQUEST_ID);
    expect(records.find((line) => line.msg === 'incoming request')?.reqId).toBe(
      response.headers[REQUEST_ID_HEADER],
    );
  });

  it("does not write the authorization code into the login request's log lines", async () => {
    await start();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { provider: 'TIKTOK', authCode: AUTH_CODE },
    });

    // Unwired identity port: 502. The status is not the point; the code staying off the line is.
    expect(response.statusCode).toBe(502);
    expect(JSON.stringify(records)).not.toContain(AUTH_CODE);
    expect(response.body).not.toContain(AUTH_CODE);
  });

  it('does not write a bearer token or a webhook signature into any log line of the request', async () => {
    await start();

    await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: BEARER, 'tiktok-signature': WEBHOOK_SIGNATURE },
    });

    const dumped = JSON.stringify(records);
    expect(dumped).not.toContain('tok_do_not_log_this_value');
    expect(dumped).not.toContain('do-not-log-this-mac');
  });
});
