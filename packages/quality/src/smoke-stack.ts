import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';

/**
 * The listening stack G2.3 drives Playwright against: a sqlite-backed API process plus a
 * same-origin gateway that serves `app/dist` and proxies `/v1` and `/health`.
 *
 * Same-origin is the reason this exists. The CI client build leaves `VITE_API_BASE_URL` unset, so
 * the bundle fetches relative `/v1/...` URLs. Splitting static files and the API across origins
 * would need a baked URL or a CORS guess. Neither is G2.3. The API still sees the browser's
 * `Origin` on POSTs (Chromium sends it same-origin), so `CORS_ALLOWED_ORIGINS` names this
 * gateway — an empty allowlist 403s login while the anonymous feed still loads.
 *
 * Postgres is T14 and is not started. Redis is T15 and is not started. Test-login is on because
 * this process is `NODE_ENV=test` and unreachable from the internet; D4 stays `[ ]`.
 */

export const SMOKE_ORIGIN_ENV = 'MINIDRAMA_SMOKE_ORIGIN';

/**
 * Must equal `TEST_LOGIN_ENABLE_VALUE` in `server/src/modules/identity/test-login.ts`. Drift
 * fails the login spec rather than synthesising an openId in the client.
 */
export const SMOKE_TEST_LOGIN_VALUE = 'yes-i-am-a-non-production-test-deployment';

const API_PREFIXES = ['/v1', '/health'] as const;

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const HOP_BY_HOP = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export interface SmokeStack {
  readonly origin: string;
  readonly apiOrigin: string;
  stop(): Promise<void>;
}

export interface SmokeStackStartOptions {
  readonly root: string;
  readonly distDir: string;
}

export type SmokeStackStarter = (options: SmokeStackStartOptions) => Promise<SmokeStack>;

export async function startSmokeStack(options: SmokeStackStartOptions): Promise<SmokeStack> {
  const tempRoot = mkdtempSync(join(tmpdir(), 'check-smoke-'));
  const sqlitePath = join(tempRoot, 'g23.sqlite');
  const apiPort = await allocatePort();
  const gatewayPort = await allocatePort();
  const apiOrigin = `http://127.0.0.1:${String(apiPort)}`;
  const origin = `http://127.0.0.1:${String(gatewayPort)}`;

  const api = startApiProcess({
    root: options.root,
    port: apiPort,
    sqlitePath,
    browserOrigin: origin,
  });

  try {
    await waitForHealth(apiOrigin);
    const gateway = await listenGateway({
      distDir: options.distDir,
      apiOrigin,
      port: gatewayPort,
    });

    return {
      origin,
      apiOrigin,
      stop: async () => {
        await closeServer(gateway);
        await stopChild(api);
        rmSync(tempRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await stopChild(api);
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function listenGateway(options: {
  readonly distDir: string;
  readonly apiOrigin: string;
  readonly port: number;
}): Promise<Server> {
  const server = createServer((request, response) => {
    void handleGatewayRequest(request, response, options).catch((error: unknown) => {
      if (response.headersSent) return;
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(message);
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });

  return server;
}

export function isApiPath(urlPath: string): boolean {
  const path = urlPath.split('?')[0] ?? '';
  return API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function resolveDistFile(distDir: string, urlPath: string): string | undefined {
  const raw = urlPath.split('?')[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  const relativePath =
    decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\//, '');
  const resolved = resolve(distDir, relativePath);
  const root = resolve(distDir);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    return undefined;
  }
  return resolved;
}

async function handleGatewayRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: { readonly distDir: string; readonly apiOrigin: string },
): Promise<void> {
  const urlPath = request.url ?? '/';
  if (isApiPath(urlPath)) {
    await proxyToApi(request, response, options.apiOrigin);
    return;
  }

  const filePath = resolveDistFile(options.distDir, urlPath);
  if (filePath === undefined) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('bad path');
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }

  const body = readFileSync(filePath);
  const type = MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, {
    'content-type': type,
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function proxyToApi(
  request: IncomingMessage,
  response: ServerResponse,
  apiOrigin: string,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
    if (Array.isArray(value)) {
      headers.set(name, value.join(', '));
    } else {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD' && body.byteLength > 0) {
    init.body = body;
  }

  const upstream = await fetch(`${apiOrigin}${request.url ?? '/'}`, init);
  const payload = Buffer.from(await upstream.arrayBuffer());
  const out: Record<string, string> = {};
  upstream.headers.forEach((value, name) => {
    if (HOP_BY_HOP.has(name.toLowerCase())) return;
    out[name] = value;
  });
  response.writeHead(upstream.status, out);
  response.end(payload);
}

export function startApiProcess(options: {
  readonly root: string;
  readonly port: number;
  readonly sqlitePath: string;
  /**
   * The gateway origin Playwright loads. The browser sends `Origin` on same-origin POSTs; the
   * gateway forwards it; the API's `selfOrigin` is the API port, so an empty allowlist 403s
   * login while GETs without `Origin` still succeed. This is the allowlist, not a `*` or a
   * reflected Origin — a different origin is still 403.
   */
  readonly browserOrigin: string;
}): ChildProcess {
  const tsxBin = resolveTsx(options.root);
  const serverEntry = join(options.root, 'server', 'src', 'server.ts');
  if (!existsSync(serverEntry)) {
    throw new Error(
      `smoke API entry is required: ${relative(options.root, serverEntry)} is absent`,
    );
  }

  const child = spawn(tsxBin, [serverEntry], {
    cwd: options.root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(options.port),
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      MINIDRAMA_TEST_LOGIN: SMOKE_TEST_LOGIN_VALUE,
      CORS_ALLOWED_ORIGINS: options.browserOrigin,
      DATABASE_URL: `sqlite:${options.sqlitePath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return child;
}

function resolveTsx(root: string): string {
  const candidates = [
    join(root, 'server', 'node_modules', '.bin', 'tsx'),
    join(root, 'node_modules', '.bin', 'tsx'),
    join(root, 'packages', 'quality', 'node_modules', '.bin', 'tsx'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`tsx is required: not found in ${candidates.join(', ')}`);
  }
  return found;
}

export async function waitForHealth(apiOrigin: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiOrigin}/health`);
      if (response.ok) {
        const body = (await response.json()) as { readonly status?: unknown };
        if (body.status === 'ok') return;
        lastError = `GET /health returned ${JSON.stringify(body)}`;
      } else {
        lastError = `GET /health returned ${String(response.status)}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(150);
  }
  throw new Error(`smoke API did not become healthy: ${lastError}`);
}

export async function allocatePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('could not allocate a TCP port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolveClose();
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolveExited) => {
      child.once('exit', () => {
        resolveExited(true);
      });
    }),
    sleep(3_000).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}
