import type { WalletView } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { requireViewer, sendViewerRefusal } from '../progress/viewer.js';
import { toWalletView } from './view.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';
import type { WalletBalancePort } from './balance-port.js';

/**
 * The wallet read.
 *
 * ```
 * GET /v1/wallet  -> 200 WalletView
 * ```
 *
 * Auth is required: a wallet without a session is not a wallet, and an anonymous `200` with an
 * omitted figure would look like "this viewer has no coins" to a client that then has to guess
 * whether to sign in. The client's move for `401` is silent login, then one retry.
 *
 * The figure is fail-closed. There is no coin ledger on this server (unlocks do not debit one —
 * `docs/handoff/w9-work-unlock-grant.md` S73), and the platform has not given us a coin balance
 * API. The default port therefore reports `UNAVAILABLE`, which this route answers as `200` with
 * the balance fields **omitted**. That is not `0`. `0` is forwarded only when the port carried it.
 *
 * Beans and fiat never leave this handler. There is no coin→Beans rate (`C3-09`); quoting either
 * would be a commercial decision made in a route.
 *
 * `GET /v1/wallet/transactions` is deliberately not here. An empty ledger page would claim the
 * viewer has never moved coins, and we do not know that: nothing writes a ledger row. The client's
 * 404-as-unavailable empty state is the honest answer until a ledger exists.
 */

export interface WalletRouteOptions {
  readonly viewerResolver: ViewerResolver;
  readonly balancePort: WalletBalancePort;
}

export const WALLET_PATH = '/v1/wallet';

export async function walletRoutes(
  app: FastifyInstance,
  options: WalletRouteOptions,
): Promise<void> {
  const { viewerResolver, balancePort } = options;

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
}
