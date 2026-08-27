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

/**
 * Values for the templated segments of documented paths.
 *
 * Dispatching `/v1/dramas/{dramaId}` literally would reach the handler and be answered "no such
 * drama", which proves nothing about whether the route exists. Every parameter therefore needs a
 * sample that resolves in the seed catalogue, and a parameter without one fails the suite — so a
 * new templated path cannot be added to the contract and left untested by omission.
 */
const SAMPLE_PATH_PARAMETERS: Readonly<Record<string, string>> = {
  dramaId: 'drm_revenge_0001',
  episodeId: 'ep_revenge_e01',
  // No such order, deliberately. The route refuses an unauthenticated read before it looks one up,
  // so what this proves is that the path is dispatched — which is all this suite claims.
  orderId: 'ord_0000000000000000000000000000',
};

const PATH_PARAMETER = /\{([A-Za-z0-9_]+)\}/g;

function concretePath(path: string): string {
  return path.replace(PATH_PARAMETER, (_match, name: string) => {
    const sample = SAMPLE_PATH_PARAMETERS[name];
    if (sample === undefined) {
      throw new Error(`contract.test.ts has no sample value for the path parameter {${name}}`);
    }
    return sample;
  });
}

/**
 * The routes Fastify actually holds, read back off the built app.
 *
 * `printRoutes` is the only published way to ask the instance what it registered, and it answers
 * with a tree: a node's path is its own segment appended to its ancestors'. The decoration is a
 * fixed four characters per level, which is what makes the depth recoverable.
 *
 * `HEAD` is dropped because Fastify synthesises one for every `GET` and no contract describes them.
 */
function registeredOperations(tree: string): readonly Operation[] {
  const DECORATION = /^(?:[├└]── |[│ ] {3})*/;
  const NODE = /^(\S*)(?: \(([A-Z, ]+)\))?$/;

  const ancestors: string[] = [];
  const operations: Operation[] = [];

  for (const line of tree.split('\n')) {
    if (line.trim() === '') continue;

    const decoration = DECORATION.exec(line)?.[0] ?? '';
    const depth = decoration.length / 4;
    const node = NODE.exec(line.slice(decoration.length));
    if (node === null) {
      throw new Error(`could not read a route out of printRoutes line: ${JSON.stringify(line)}`);
    }

    ancestors.length = depth;
    ancestors[depth] = node[1] ?? '';

    const methods = node[2];
    if (methods === undefined) continue;

    const path = ancestors.slice(0, depth + 1).join('');
    for (const method of methods.split(', ')) {
      if (method === 'HEAD') continue;
      operations.push({ method: method.toLowerCase() as HttpMethod, path });
    }
  }

  return operations;
}

/** `printRoutes` writes `:dramaId`; the contract writes `{dramaId}`. */
function toContractPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function sortedKeys(operations: readonly Operation[]): readonly string[] {
  return operations.map(({ method, path }) => `${method.toUpperCase()} ${path}`).sort();
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('contracts/openapi.yaml', () => {
  /**
   * The two halves of "one contract, matching the routes"
   * (`docs/plan/cycle-2-integration.md` §5 A5). The `it.each` below proves every documented
   * operation reaches a handler; this proves the converse, which nothing asserted before C2's
   * integration and which is the direction that fails silently.
   *
   * A merge that drops a `register` call from `app.ts` leaves the contract describing an endpoint
   * that is gone, and `it.each` catches that. A merge that drops a *path block* from the contract
   * leaves a served endpoint undocumented, and until this test existed the whole suite stayed
   * green — which is exactly the failure mode A6 predicted for `entitlementRoutes` and
   * `unlockRoutes`.
   */
  it('documents every route the server registers, and registers every route it documents', () => {
    const registered = registeredOperations(app.printRoutes({ commonPrefix: false })).map(
      ({ method, path }) => ({ method, path: toContractPath(path) }),
    );

    expect(sortedKeys(registered)).toEqual(sortedKeys(operations));
  });

  it('describes the operations this server implements', () => {
    expect(operations).toEqual(
      expect.arrayContaining([
        { method: 'get', path: '/health' },
        { method: 'post', path: '/v1/playback/sessions' },
        { method: 'post', path: '/v1/auth/login' },
        // The three the trunk served and that `r` and `m` both dropped at their fork points, named
        // here because A5 asks for their presence to be asserted rather than assumed.
        { method: 'post', path: '/v1/entitlement/episode-access' },
        { method: 'put', path: '/v1/progress/episodes/{episodeId}' },
        { method: 'get', path: '/v1/progress/episodes/{episodeId}' },
        { method: 'get', path: '/v1/progress/dramas/{dramaId}' },
        { method: 'get', path: '/v1/users/me' },
        { method: 'get', path: '/v1/users/me/watch-history' },
        { method: 'get', path: '/v1/search' },
        { method: 'get', path: '/v1/dramas/{dramaId}/favorite' },
        { method: 'put', path: '/v1/dramas/{dramaId}/favorite' },
        { method: 'delete', path: '/v1/dramas/{dramaId}/favorite' },
        { method: 'get', path: '/v1/users/me/favorites' },
        { method: 'post', path: '/v1/payments/callbacks/tiktok' },
        { method: 'post', path: '/v1/unlock/coin-orders' },
        { method: 'get', path: '/v1/unlock/coin-orders/{orderId}' },
        { method: 'get', path: '/v1/wallet' },
        { method: 'get', path: '/v1/dramas' },
        { method: 'get', path: '/v1/dramas/{dramaId}' },
        { method: 'get', path: '/v1/dramas/{dramaId}/episodes' },
        { method: 'get', path: '/v1/episodes/{episodeId}' },
        { method: 'get', path: '/v1/recommendations/feed' },
      ]),
    );
  });

  it('has a sample value for every documented path parameter', () => {
    expect(() => operations.map((operation) => concretePath(operation.path))).not.toThrow();
  });

  it.each(operations)('routes $method $path to a handler', async ({ method, path }) => {
    const response = await app.inject({
      method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: concretePath(path),
      headers: { 'content-type': 'application/json' },
      ...(method === 'get' ? {} : { payload: '{}' }),
    });

    // A documented operation may legitimately answer 4xx to an empty request. It may not be absent.
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(405);
    expect(response.statusCode).toBeLessThan(500);
  });
});
