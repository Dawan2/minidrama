import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Page, WalletTransaction, WalletView } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createFakeSessionResolver } from '../progress/test-sessions.js';
import { createUnresolvedViewerResolver } from '../entitlement/viewer-resolver.js';
import { createInMemoryUnlockStore } from '../unlock/unlock-store.js';
import { createCoinUnlock, newUnlockId } from '../unlock/unlocks.js';
import { createUnreadableWalletBalancePort } from './balance-port.js';
import { createUnreadableWalletLedgerPort } from './ledger-port.js';
import {
  createScriptedWalletBalancePort,
  createScriptedWalletLedgerPort,
  knownBalance,
  ledgerRow,
} from './fixtures.js';
import { loadConfig } from '../../config.js';
import { WALLET_PATH, WALLET_TRANSACTIONS_PATH } from './routes.js';
import { EMPTY_WALLET_LEDGER, WALLET_VIEW_KEYS } from './view.js';
import type { AppDependencies } from '../../app.js';

/**
 * `GET /v1/wallet` over HTTP.
 *
 * The default port reports `UNAVAILABLE`, so the assembled app — what a deployment gets — answers
 * `200` with the balance fields omitted. That is the property the client screen rests on: a missing
 * figure is not `0`. Tests that need a quoted number inject a scripted port.
 */

let app: FastifyInstance;

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      viewerResolver: createFakeSessionResolver(),
      ...dependencies,
    },
  );
  await app.ready();
}

async function startDeployedApp(): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
}

function get(token?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: WALLET_PATH,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function getLedger(
  token?: string,
  query = '',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: `${WALLET_TRANSACTIONS_PATH}${query}`,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

function bodyKeys(response: LightMyRequestResponse): readonly string[] {
  return Object.keys(response.json<Record<string, unknown>>());
}

afterEach(async () => {
  await app.close();
});

describe('GET /v1/wallet — without a resolvable viewer', () => {
  it('refuses with the app as deployed today, which issues no session to this token', async () => {
    await startDeployedApp();

    const response = await get('tok_a');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses a request that carries no credential', async () => {
    await startApp();

    const response = await get();

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
    expect(response.body).not.toMatch(/coinBalance|totalBalance/);
  });

  it('refuses a forged token the same way, and does not say which problem it hit', async () => {
    await startApp();

    const noToken = await get();
    const badToken = await get('tok_forged');

    expect(badToken.statusCode).toBe(401);
    expect(errorCode(noToken)).toBe(errorCode(badToken));
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNRESOLVABLE/);
    }
  });

  it('answers 503 when sessions cannot be resolved, not a guessed wallet', async () => {
    await startApp({ viewerResolver: createUnresolvedViewerResolver() });

    const response = await get('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/coinBalance|totalBalance/);
  });
});

describe('GET /v1/wallet — signed in, no platform figure', () => {
  it('answers 200 with the balance fields omitted, which is not zero', async () => {
    await startApp();

    const response = await get('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<WalletView>()).toEqual({});
    expect(JSON.stringify(response.json())).not.toMatch(
      /"coinBalance":0|"totalBalance":0|"bonusBalance":0/,
    );
  });

  it('sends Cache-Control: private, no-store, including on the refusal', async () => {
    await startApp();

    expect((await get('tok_a')).headers['cache-control']).toBe('private, no-store');
    expect((await get()).headers['cache-control']).toBe('private, no-store');
  });

  it('does not consult a per-viewer figure when the caller is unsigned', async () => {
    let reads = 0;
    await startApp({
      walletBalancePort: {
        readBalance: async () => {
          reads += 1;
          return { ok: true, value: { kind: 'KNOWN', coinBalance: 100 } };
        },
      },
    });

    expect((await get()).statusCode).toBe(401);
    expect(reads).toBe(0);
  });
});

describe('GET /v1/wallet — the platform named a figure', () => {
  it('quotes a platform zero, which is a real empty wallet', async () => {
    await startApp({
      walletBalancePort: createScriptedWalletBalancePort({
        user_a: knownBalance({ coinBalance: 0, bonusBalance: 0, totalBalance: 0 }),
      }),
    });

    const response = await get('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<WalletView>()).toEqual({
      coinBalance: 0,
      bonusBalance: 0,
      totalBalance: 0,
    });
  });

  it('quotes a split the platform named', async () => {
    await startApp({
      walletBalancePort: createScriptedWalletBalancePort({
        user_a: knownBalance({ coinBalance: 100, bonusBalance: 20, totalBalance: 120 }),
      }),
    });

    const response = await get('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<WalletView>()).toEqual({
      coinBalance: 100,
      bonusBalance: 20,
      totalBalance: 120,
    });
  });

  it('does not invent the missing half of a lone total', async () => {
    await startApp({
      walletBalancePort: createScriptedWalletBalancePort({
        user_a: knownBalance({ totalBalance: 50 }),
      }),
    });

    expect((await get('tok_a')).json<WalletView>()).toEqual({ totalBalance: 50 });
  });

  it("does not leak one viewer's figure to another", async () => {
    await startApp({
      walletBalancePort: createScriptedWalletBalancePort({
        user_a: knownBalance({ coinBalance: 100, bonusBalance: 0, totalBalance: 100 }),
        user_b: knownBalance({ coinBalance: 7, bonusBalance: 0, totalBalance: 7 }),
      }),
    });

    expect((await get('tok_a')).json<WalletView>().coinBalance).toBe(100);
    expect((await get('tok_b')).json<WalletView>().coinBalance).toBe(7);
  });

  it('answers 503 when the port cannot complete the check, never a guessed number', async () => {
    await startApp({ walletBalancePort: createUnreadableWalletBalancePort() });

    const response = await get('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/coinBalance|totalBalance|beansAmount/);
  });
});

describe('GET /v1/wallet — the body is coins, not Beans or fiat', () => {
  it('carries only WalletView keys, even when a figure is quoted', async () => {
    await startApp({
      walletBalancePort: createScriptedWalletBalancePort({
        user_a: knownBalance({
          coinBalance: 100,
          bonusBalance: 20,
          totalBalance: 120,
          pendingCredit: true,
        }),
      }),
    });

    const response = await get('tok_a');
    const keys = bodyKeys(response);

    expect(keys.every((key) => (WALLET_VIEW_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(JSON.stringify(response.json())).not.toMatch(
      /beans|amountCents|currency|USD|fiat|beansPerCoin/i,
    );
  });

  /**
   * A source scan, not a typecheck. Adding `beansPerCoin = 0.7` to the route would still
   * typecheck; this is the check that fails when somebody writes the rate C3-09 forbids.
   */
  it('names no coin-to-Beans rate in the wallet module, outside comments', () => {
    const moduleDir = fileURLToPath(new URL('.', import.meta.url));
    const files = [
      'balance-port.ts',
      'view.ts',
      'routes.ts',
      'fixtures.ts',
      'ledger-port.ts',
      'query.ts',
    ];
    const rate = /\b(beansPerCoin|coinToBeans|BEANS_RATE|beansRate)\b/;
    const offenders: string[] = [];

    for (const file of files) {
      readFileSync(join(moduleDir, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return;
          }
          if (rate.test(line)) {
            offenders.push(`${file}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});

describe('GET /v1/wallet/transactions — without a resolvable viewer', () => {
  it('refuses with the app as deployed today, which issues no session to this token', async () => {
    await startDeployedApp();

    const response = await getLedger('tok_a');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses a request that carries no credential, including a malformed query', async () => {
    await startApp();

    const missing = await getLedger();
    const malformed = await getLedger(undefined, '?type=SPEND');

    expect(missing.statusCode).toBe(401);
    expect(malformed.statusCode).toBe(401);
    expect(errorCode(missing)).toBe('AUTH_REQUIRED');
    expect(missing.body).not.toMatch(/CONSUME|"items"/);
  });

  it('answers 503 when sessions cannot be resolved, not a guessed ledger', async () => {
    await startApp({ viewerResolver: createUnresolvedViewerResolver() });

    const response = await getLedger('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/CONSUME/);
  });
});

describe('GET /v1/wallet/transactions — fail-closed empty ledger', () => {
  it('answers 200 with an empty page when the platform named no rows', async () => {
    await startApp();

    const response = await getLedger('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(EMPTY_WALLET_LEDGER);
    expect(JSON.stringify(response.json())).not.toMatch(/CONSUME|RECHARGE|SPEND/);
  });

  it('still answers the empty page when asked for CONSUME, and does not invent spend', async () => {
    await startApp();

    const response = await getLedger('tok_a', '?type=CONSUME');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(EMPTY_WALLET_LEDGER);
  });

  it('does not turn an unlock receipt into a CONSUME row', async () => {
    const unlockStore = createInMemoryUnlockStore();
    await unlockStore.record(
      createCoinUnlock({
        id: newUnlockId(),
        userId: 'user_a',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        costCoins: 300,
        orderId: 'uord_1',
        grantedAtMs: Date.parse('2026-08-27T10:00:00.000Z'),
      }),
    );
    await startApp({ unlockStore });

    const response = await getLedger('tok_a');
    const page = response.json<Page<WalletTransaction>>();

    expect(response.statusCode).toBe(200);
    expect(page).toEqual(EMPTY_WALLET_LEDGER);
    expect(page.items.some((row) => row.type === 'CONSUME')).toBe(false);
    expect(JSON.stringify(page)).not.toMatch(/300/);
  });

  it('sends Cache-Control: private, no-store, including on the refusal', async () => {
    await startApp();

    expect((await getLedger('tok_a')).headers['cache-control']).toBe('private, no-store');
    expect((await getLedger()).headers['cache-control']).toBe('private, no-store');
  });

  it('does not consult a per-viewer ledger when the caller is unsigned', async () => {
    let lists = 0;
    await startApp({
      walletLedgerPort: {
        listTransactions: async () => {
          lists += 1;
          return {
            ok: true,
            value: {
              kind: 'KNOWN',
              page: {
                items: [ledgerRow({ id: 'txn_should_not_leak' })],
                pageInfo: { nextCursor: null, hasMore: false },
              },
            },
          };
        },
      },
    });

    expect((await getLedger()).statusCode).toBe(401);
    expect(lists).toBe(0);
  });
});

describe('GET /v1/wallet/transactions — the platform named rows', () => {
  it('quotes the platform rows, most recent first, and never as Beans', async () => {
    await startApp({
      walletLedgerPort: createScriptedWalletLedgerPort({
        user_a: [
          ledgerRow({
            id: 'txn_old',
            type: 'RECHARGE',
            createdAt: '2026-08-26T10:00:00.000Z',
          }),
          ledgerRow({
            id: 'txn_new',
            type: 'CONSUME',
            coinDelta: -30,
            bonusDelta: 0,
            createdAt: '2026-08-27T10:00:00.000Z',
          }),
        ],
      }),
    });

    const response = await getLedger('tok_a');
    const page = response.json<Page<WalletTransaction>>();

    expect(response.statusCode).toBe(200);
    expect(page.items.map((row) => row.id)).toEqual(['txn_new', 'txn_old']);
    expect(page.items[0]).toMatchObject({ type: 'CONSUME', coinDelta: -30 });
    expect(JSON.stringify(page)).not.toMatch(/beans|amountCents|currency|USD|fiat/i);
  });

  it('filters by type without inventing a CONSUME the platform did not post', async () => {
    await startApp({
      walletLedgerPort: createScriptedWalletLedgerPort({
        user_a: [
          ledgerRow({ id: 'txn_in', type: 'RECHARGE' }),
          ledgerRow({ id: 'txn_out', type: 'CONSUME', coinDelta: -10, bonusDelta: 0 }),
        ],
      }),
    });

    const recharge = await getLedger('tok_a', '?type=RECHARGE');
    const consume = await getLedger('tok_a', '?type=CONSUME');

    expect(recharge.json<Page<WalletTransaction>>().items.map((row) => row.id)).toEqual(['txn_in']);
    expect(consume.json<Page<WalletTransaction>>().items.map((row) => row.id)).toEqual(['txn_out']);
  });

  it("does not leak one viewer's rows to another", async () => {
    await startApp({
      walletLedgerPort: createScriptedWalletLedgerPort({
        user_a: [ledgerRow({ id: 'txn_a' })],
        user_b: [ledgerRow({ id: 'txn_b' })],
      }),
    });

    expect(
      (await getLedger('tok_a')).json<Page<WalletTransaction>>().items.map((row) => row.id),
    ).toEqual(['txn_a']);
    expect(
      (await getLedger('tok_b')).json<Page<WalletTransaction>>().items.map((row) => row.id),
    ).toEqual(['txn_b']);
  });

  it('pages, and refuses a cursor that does not belong to this query', async () => {
    await startApp({
      walletLedgerPort: createScriptedWalletLedgerPort({
        user_a: [
          ledgerRow({ id: 'txn_1', createdAt: '2026-08-27T12:00:00.000Z' }),
          ledgerRow({ id: 'txn_2', createdAt: '2026-08-27T11:00:00.000Z' }),
          ledgerRow({ id: 'txn_3', createdAt: '2026-08-27T10:00:00.000Z' }),
        ],
      }),
    });

    const first = (await getLedger('tok_a', '?limit=2')).json<Page<WalletTransaction>>();
    expect(first.items.map((row) => row.id)).toEqual(['txn_1', 'txn_2']);
    expect(first.pageInfo.hasMore).toBe(true);
    expect(first.pageInfo.nextCursor).not.toBeNull();

    const second = (
      await getLedger(
        'tok_a',
        `?limit=2&cursor=${encodeURIComponent(first.pageInfo.nextCursor ?? '')}`,
      )
    ).json<Page<WalletTransaction>>();
    expect(second.items.map((row) => row.id)).toEqual(['txn_3']);
    expect(second.pageInfo).toEqual({ nextCursor: null, hasMore: false });

    const mismatched = await getLedger(
      'tok_a',
      `?type=CONSUME&cursor=${encodeURIComponent(first.pageInfo.nextCursor ?? '')}`,
    );
    expect(mismatched.statusCode).toBe(400);
    expect(errorCode(mismatched)).toBe('COMMON_VALIDATION_FAILED');
  });

  it('refuses an unknown type rather than answering an empty spend list', async () => {
    await startApp();

    const response = await getLedger('tok_a', '?type=SPEND');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
    expect(response.body).not.toMatch(/"items"/);
  });

  it('answers 503 when the port cannot complete the check, never a guessed empty spend', async () => {
    await startApp({ walletLedgerPort: createUnreadableWalletLedgerPort() });

    const response = await getLedger('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/CONSUME|"items":\[\]/);
  });
});
