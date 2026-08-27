import { createServer, request as httpRequest } from 'node:http';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  allocatePort,
  isApiPath,
  listenGateway,
  resolveDistFile,
  startApiProcess,
  startSmokeStack,
  waitForHealth,
} from './smoke-stack.js';

const fixtures: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server === undefined) continue;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  while (fixtures.length > 0) {
    rmSync(fixtures.pop() ?? '', { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  fixtures.push(root);
  return root;
}

describe('isApiPath', () => {
  it('proxies /v1 and /health, not the SPA', () => {
    expect(isApiPath('/v1/dramas')).toBe(true);
    expect(isApiPath('/v1')).toBe(true);
    expect(isApiPath('/health')).toBe(true);
    expect(isApiPath('/health?ready=1')).toBe(true);
    expect(isApiPath('/')).toBe(false);
    expect(isApiPath('/assets/index.js')).toBe(false);
    expect(isApiPath('/v1sneaky')).toBe(false);
  });
});

describe('resolveDistFile', () => {
  it('maps / to index.html and refuses path escape', () => {
    const dist = '/tmp/dist';
    expect(resolveDistFile(dist, '/')).toBe(join(dist, 'index.html'));
    expect(resolveDistFile(dist, '/assets/app.js')).toBe(join(dist, 'assets', 'app.js'));
    expect(resolveDistFile(dist, '/../secrets.txt')).toBeUndefined();
  });
});

describe('listenGateway', () => {
  it('serves the built index and proxies /health to the API', async () => {
    const dist = tempDir('smoke-dist-');
    writeFileSync(join(dist, 'index.html'), '<!doctype html><p>fixture-home</p>');
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'assets', 'app.js'), 'window.__fixture = true;');

    const api = createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok', service: 'minidrama-api' }));
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/auth/login') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ accessToken: 'tok', openId: 'usr_x', expiresInSec: 60 }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    servers.push(api);
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      api.listen(0, '127.0.0.1', () => {
        api.off('error', reject);
        resolve();
      });
    });
    const apiAddress = api.address();
    if (apiAddress === null || typeof apiAddress === 'string') {
      throw new Error('api did not bind');
    }
    const apiOrigin = `http://127.0.0.1:${String(apiAddress.port)}`;

    const gateway = await listenGateway({ distDir: dist, apiOrigin, port: 0 });
    servers.push(gateway);
    const address = gateway.address() as AddressInfo;
    const origin = `http://127.0.0.1:${String(address.port)}`;

    const home = await fetch(`${origin}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('fixture-home');

    const asset = await fetch(`${origin}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain('window.__fixture');

    const health = await fetch(`${origin}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', service: 'minidrama-api' });

    const login = await fetch(`${origin}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'TIKTOK', authCode: 'mock:usr_x' }),
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ openId: 'usr_x' });

    const missing = await fetch(`${origin}/no-such-file`);
    expect(missing.status).toBe(404);

    const escapedStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port: address.port, path: '/../secrets.txt', method: 'GET' },
        (res) => {
          resolve(res.statusCode ?? 0);
          res.resume();
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(escapedStatus).toBe(400);

    const malformedStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port: address.port, path: '/%E0%A4%A', method: 'GET' },
        (res) => {
          resolve(res.statusCode ?? 0);
          res.resume();
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(malformedStatus).toBe(400);
  });

  it('answers 502 when the API is down', async () => {
    const dist = tempDir('smoke-dist-down-');
    writeFileSync(join(dist, 'index.html'), '<p>x</p>');
    const gateway = await listenGateway({
      distDir: dist,
      apiOrigin: 'http://127.0.0.1:1',
      port: 0,
    });
    servers.push(gateway);
    const address = gateway.address() as AddressInfo;
    const health = await fetch(`http://127.0.0.1:${String(address.port)}/health`);
    expect(health.status).toBe(502);
  });
});

describe('waitForHealth', () => {
  it('returns when /health is ok', async () => {
    const api = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    });
    servers.push(api);
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      api.listen(0, '127.0.0.1', () => {
        api.off('error', reject);
        resolve();
      });
    });
    const address = api.address() as AddressInfo;
    await waitForHealth(`http://127.0.0.1:${String(address.port)}`, 2_000);
  });

  it('keeps polling a 500 until timeout', async () => {
    const api = createServer((_request, response) => {
      response.writeHead(500);
      response.end('no');
    });
    servers.push(api);
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      api.listen(0, '127.0.0.1', () => {
        api.off('error', reject);
        resolve();
      });
    });
    const address = api.address() as AddressInfo;
    await expect(waitForHealth(`http://127.0.0.1:${String(address.port)}`, 400)).rejects.toThrow(
      /GET \/health returned 500/,
    );
  });

  it('rejects a 200 whose body is not ok', async () => {
    const api = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'starting' }));
    });
    servers.push(api);
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      api.listen(0, '127.0.0.1', () => {
        api.off('error', reject);
        resolve();
      });
    });
    const address = api.address() as AddressInfo;
    await expect(waitForHealth(`http://127.0.0.1:${String(address.port)}`, 400)).rejects.toThrow(
      /starting/,
    );
  });

  it('times out when nothing listens', async () => {
    const port = await allocatePort();
    await expect(waitForHealth(`http://127.0.0.1:${String(port)}`, 400)).rejects.toThrow(
      /did not become healthy/,
    );
  });
});

describe('startApiProcess', () => {
  it('fails when tsx is not installed in the tree', () => {
    const root = tempDir('smoke-notsx-');
    expect(() =>
      startApiProcess({
        root,
        port: 1,
        sqlitePath: join(root, 'g23.sqlite'),
        browserOrigin: 'http://127.0.0.1:9',
      }),
    ).toThrow(/tsx is required/);
  });

  it('fails when the server entry is absent', () => {
    const root = tempDir('smoke-noentry-');
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
    const tsx = join(root, 'node_modules', '.bin', 'tsx');
    writeFileSync(tsx, '#!/bin/sh\n');
    chmodSync(tsx, 0o755);
    expect(() =>
      startApiProcess({
        root,
        port: 1,
        sqlitePath: join(root, 'g23.sqlite'),
        browserOrigin: 'http://127.0.0.1:9',
      }),
    ).toThrow(/smoke API entry is required/);
  });
});

describe('allocatePort', () => {
  it('returns a TCP port on loopback', async () => {
    const port = await allocatePort();
    expect(port).toBeGreaterThan(0);
  });
});

describe('startSmokeStack', () => {
  it('serves the fixture dist and proxies the real sqlite API', async () => {
    const dist = tempDir('smoke-live-dist-');
    writeFileSync(join(dist, 'index.html'), '<!doctype html><p>g23-live</p>');
    const stack = await startSmokeStack({ root: repoRoot, distDir: dist });
    try {
      const home = await fetch(`${stack.origin}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('g23-live');

      const health = await fetch(`${stack.origin}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: 'ok' });

      const dramas = await fetch(`${stack.origin}/v1/dramas`);
      expect(dramas.status).toBe(200);
      const body = (await dramas.json()) as { readonly items?: unknown };
      expect(Array.isArray(body.items)).toBe(true);

      // Chromium sends Origin on same-origin POSTs. Without CORS_ALLOWED_ORIGINS=gateway,
      // this 403s and silent login stays anonymous while the feed still loads.
      const login = await fetch(`${stack.origin}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: stack.origin,
        },
        body: JSON.stringify({ provider: 'TIKTOK', authCode: 'mock:usr_browser_local' }),
      });
      expect(login.status).toBe(200);
      const session = (await login.json()) as { readonly openId?: unknown };
      expect(session.openId).toBe('usr_browser_local');

      const foreign = await fetch(`${stack.origin}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
        },
        body: JSON.stringify({ provider: 'TIKTOK', authCode: 'mock:usr_browser_local' }),
      });
      expect(foreign.status).toBe(403);
    } finally {
      await stack.stop();
    }
  }, 30_000);
});
