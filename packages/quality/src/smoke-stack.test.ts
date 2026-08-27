import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { isApiPath, listenGateway, resolveDistFile } from './smoke-stack.js';

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
  });
});
