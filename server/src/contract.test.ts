import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * `contracts/openapi.yaml` claims that "a path in this document always has a running handler"
 * (`docs/handoff/w1-skeleton.md` §6). This test is what makes that a fact rather than a convention:
 * every documented operation is dispatched against the real app and must reach a handler.
 *
 * The scan is deliberately textual so the server package does not take a YAML dependency to police
 * its own contract. It only needs to find the operation keys, and OpenAPI's nesting fixes those at a
 * known indentation.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const CONTRACT_PATH = fileURLToPath(new URL('../../contracts/openapi.yaml', import.meta.url));

interface Operation {
  readonly method: HttpMethod;
  readonly path: string;
}

function documentedOperations(yaml: string): readonly Operation[] {
  const operations: Operation[] = [];
  let inPaths = false;
  let currentPath: string | undefined;

  for (const line of yaml.split('\n')) {
    if (/^[a-zA-Z]/.test(line)) {
      inPaths = line.startsWith('paths:');
      currentPath = undefined;
      continue;
    }
    if (!inPaths) continue;

    const pathKey = /^ {2}(\/\S*):\s*$/.exec(line);
    if (pathKey?.[1] !== undefined) {
      currentPath = pathKey[1];
      continue;
    }

    const methodKey = /^ {4}([a-z]+):\s*$/.exec(line);
    const method = methodKey?.[1];
    if (currentPath !== undefined && method !== undefined) {
      if ((HTTP_METHODS as readonly string[]).includes(method)) {
        operations.push({ method: method as HttpMethod, path: currentPath });
      }
    }
  }

  return operations;
}

const operations = documentedOperations(readFileSync(CONTRACT_PATH, 'utf8'));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('contracts/openapi.yaml', () => {
  it('describes the operations this server implements', () => {
    expect(operations).toEqual(
      expect.arrayContaining([
        { method: 'get', path: '/health' },
        { method: 'post', path: '/v1/playback/sessions' },
        { method: 'post', path: '/v1/auth/login' },
        { method: 'put', path: '/v1/progress/episodes/{episodeId}' },
        { method: 'get', path: '/v1/progress/episodes/{episodeId}' },
        { method: 'post', path: '/v1/payments/callbacks/tiktok' },
      ]),
    );
  });

  it.each(operations)('routes $method $path to a handler', async ({ method, path }) => {
    const response = await app.inject({
      method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: path,
      headers: { 'content-type': 'application/json' },
      ...(method === 'get' ? {} : { payload: '{}' }),
    });

    // A documented operation may legitimately answer 4xx to an empty request. It may not be absent.
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(405);
    expect(response.statusCode).toBeLessThan(500);
  });
});
