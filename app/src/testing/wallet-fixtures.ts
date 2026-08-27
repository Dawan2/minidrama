import { ok } from '@minidrama/shared';
import type { Page, Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import { page } from './catalog-fixtures';
import type { ApiFailure } from '../data/failure';
import type {
  CoinBalance,
  WalletApi,
  WalletTransaction,
  WalletTransactionsRequest,
} from '../data/wallet-api';

/**
 * Test doubles for the wallet reads.
 *
 * Test-only: `import-hygiene.test.ts` fails the build if a screen imports from here.
 *
 * The stub implements `WalletApi`, the seam the screens depend on, rather than stubbing `fetch`.
 * The status codes behind the states are interpreted in `data/session-read.ts` and tested there;
 * asserting them through HTTP in every screen test would put the transport in the middle of the
 * product claims.
 *
 * The unscripted wallet is `UNAVAILABLE`, not `{ totalBalance: 0 }`. Zero is a real empty wallet
 * the server would have to send; the default here is "the endpoint is not deployed", which is
 * today's production answer and the state the screen must render without quoting a number.
 */

export function walletView(
  overrides: {
    readonly coinBalance?: number;
    readonly bonusBalance?: number;
    readonly totalBalance?: number;
    readonly pendingCredit?: boolean;
    readonly extra?: unknown;
  } = {},
): Record<string, unknown> {
  const coinBalance = overrides.coinBalance ?? 100;
  const bonusBalance = overrides.bonusBalance ?? 20;
  return {
    coinBalance,
    bonusBalance,
    totalBalance: overrides.totalBalance ?? coinBalance + bonusBalance,
    ...(overrides.pendingCredit === undefined ? {} : { pendingCredit: overrides.pendingCredit }),
    ...(overrides.extra === undefined ? {} : { extra: overrides.extra }),
  };
}

export function knownBalance(
  overrides: Partial<Extract<CoinBalance, { kind: 'KNOWN' }>> = {},
): Extract<CoinBalance, { kind: 'KNOWN' }> {
  return {
    kind: 'KNOWN',
    totalBalance: 120,
    coinBalance: 100,
    bonusBalance: 20,
    pendingCredit: false,
    ...overrides,
  };
}

export const UNAVAILABLE_WALLET: CoinBalance = { kind: 'UNAVAILABLE' };

export function walletTransaction(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    id: 'txn_test_0001',
    type: 'RECHARGE',
    coinDelta: 100,
    bonusDelta: 20,
    createdAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

export interface StubWalletApiScript {
  readonly wallet?: (callIndex: number) => Result<CoinBalance, ApiFailure>;
  readonly transactions?: (
    request: WalletTransactionsRequest,
    callIndex: number,
  ) => Result<Page<WalletTransaction>, ApiFailure>;
}

export interface StubWalletApi extends WalletApi {
  readonly walletCalls: number;
  readonly transactionCalls: readonly WalletTransactionsRequest[];
}

export function stubWalletApi(script: StubWalletApiScript = {}): StubWalletApi {
  const transactionCalls: WalletTransactionsRequest[] = [];
  let walletCalls = 0;

  return {
    get walletCalls() {
      return walletCalls;
    },
    transactionCalls,

    fetchWallet: () => {
      const index = walletCalls;
      walletCalls += 1;
      return Promise.resolve(script.wallet?.(index) ?? ok(UNAVAILABLE_WALLET));
    },

    fetchTransactions: (request) => {
      const index = transactionCalls.length;
      transactionCalls.push(request);
      return Promise.resolve(
        script.transactions?.(request, index) ?? ok(page<WalletTransaction>([])),
      );
    },
  };
}

export function walletHttpFailure(status: number, traceId = 'trace_wallet'): ApiFailure {
  return apiFailure({ kind: 'HTTP', status, message: `HTTP ${String(status)}`, traceId });
}
