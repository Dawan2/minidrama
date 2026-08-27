import type { Page, WalletTransaction, WalletView } from '@minidrama/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { requireViewer, sendViewerRefusal } from '../progress/viewer.js';
import { EMPTY_WALLET_LEDGER, toWalletTransactionPage, toWalletView } from './view.js';
import { parseWalletTransactionsQuery } from './query.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';
import type { WalletBalancePort } from './balance-port.js';
import type { WalletLedgerPort } from './ledger-port.js';

/**
 * The wallet reads.
 *
 * ```
 * GET /v1/wallet                 -> 200 WalletView
 * GET /v1/wallet/transactions    -> 200 Page<WalletTransaction>
 * ```
 *
 * Auth is required: a wallet without a session is not a wallet, and an anonymous `200` with an
 * omitted figure or an empty ledger would look like "this viewer has no coins / has never moved
 * coins" to a client that then has to guess whether to sign in. The client's move for `401` is
 * silent login, then one retry.
 *
 * Both figures are fail-closed. There is no coin ledger on this server (unlocks do not debit one
 * — `docs/handoff/w9-work-unlock-grant.md` S73), and the platform has not given us a coin balance
 * or a movement list. The default ports therefore report `UNAVAILABLE`:
 *
 * - the balance route answers `200` with the balance fields **omitted**. That is not `0`.
 * - the ledger route answers `200` with `{ items: [], pageInfo: { nextCursor: null, hasMore: false } }`.
 *   That is not a guessed `CONSUME`. An empty page is "we have no platform rows to quote", and
 *   it must never be filled from unlock receipts.
 *
 * Beans and fiat never leave this handler. There is no coin→Beans rate (`C3-09`); quoting either
 * would be a commercial decision made in a route.
 */

export interface WalletRouteOptions {
  readonly viewerResolver: ViewerResolver;
  readonly balancePort: WalletBalancePort;
  readonly ledgerPort: WalletLedgerPort;
}

export const WALLET_PATH = '/v1/wallet';
export const WALLET_TRANSACTIONS_PATH = '/v1/wallet/transactions';

export async function walletRoutes(
  app: FastifyInstance,
  options: WalletRouteOptions,
): Promise<void> {
  const { viewerResolver, balancePort, ledgerPort } = options;

  app.get(WALLET_PATH, async (request, reply) => {
    // A wallet is the most complete picture of a viewer's money this product holds, and a shared
    // cache holding it is a cross-user leak waiting for a misconfigured proxy. Set before the
    // answer is known, so the refusals carry it too (`docs/design/api-contracts.md` CA-3).
    const answer = reply.header('cache-control', 'private, no-store');

    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) {
      return sendViewerRefusal(request, answer, viewer.error, 'wallet read');
    }

    const balance = await balancePort.readBalance(viewer.value);
    if (!balance.ok) {
      request.log.error({ reason: balance.error }, 'wallet: coin balance cannot be read');
      return answer
        .status(503)
        .send(errorBody('COMMON_SERVICE_UNAVAILABLE', 'Wallet cannot be read', request.id));
    }

    const body: WalletView = toWalletView(balance.value);
    return answer.status(200).send(body);
  });

  app.get(WALLET_TRANSACTIONS_PATH, async (request, reply) => {
    const answer = reply.header('cache-control', 'private, no-store');

    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) {
      return sendViewerRefusal(request, answer, viewer.error, 'wallet ledger read');
    }

    const query = parseWalletTransactionsQuery(request.query as Record<string, unknown>);
    if (!query.ok) {
      return invalidQuery(request, answer, query.error.field, query.error.reason);
    }

    const ledger = await ledgerPort.listTransactions(viewer.value, query.value);
    if (!ledger.ok) {
      if (ledger.error === 'INVALID_CURSOR') {
        return invalidQuery(request, answer, 'cursor', 'not valid for this query');
      }
      request.log.error({ reason: ledger.error }, 'wallet: coin ledger cannot be read');
      return answer
        .status(503)
        .send(errorBody('COMMON_SERVICE_UNAVAILABLE', 'Wallet ledger cannot be read', request.id));
    }

    const body: Page<WalletTransaction> =
      ledger.value.kind === 'UNAVAILABLE'
        ? EMPTY_WALLET_LEDGER
        : toWalletTransactionPage(ledger.value);
    return answer.status(200).send(body);
  });
}

function invalidQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  field: string,
  reason: string,
): FastifyReply {
  return reply.status(400).send(
    errorBody('COMMON_VALIDATION_FAILED', `${field} is invalid`, request.id, {
      fields: [{ field, reason }],
    }),
  );
}
