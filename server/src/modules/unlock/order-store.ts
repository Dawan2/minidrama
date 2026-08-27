import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { advanceUnlockOrder } from './orders.js';
import type { UnlockOrder, UnlockOrderTransition, UnlockOrderTransitionFailure } from './orders.js';

/**
 * Where coin unlock orders live.
 *
 * The interface is async so the Postgres table drops in behind it without changing a caller, and it
 * exposes exactly the three lookups the system needs: by id (the viewer polling their own order),
 * by idempotency key (a retried creation), and by trade order id (the payment callback). Nothing
 * lists another user's orders, and there is no update method other than `apply`, which routes every
 * write through the transition table in `orders.ts`.
 *
 * The in-memory implementation is bounded and is the default; it forgets everything on restart.
 * A forgotten `PAID` order is a payment we have to reconcile, and a forgotten `PENDING` order is
 * a callback that can match nothing. `DATABASE_URL=sqlite:<path>` puts a SQLite table behind this
 * same interface (the same file as unlock receipts, sessions, webhook events, and watch
 * progress); a postgres URL is refused rather than rewritten to a file. Three unique indexes
 * — `id`, `(userId, idempotencyKey)` and `tradeOrderId` — are what the Maps below simulate,
 * and the last one is what makes callback correlation single-valued.
 */

/**
 * `IDEMPOTENCY_CONFLICT` is a key already used by this viewer (`api-contracts` §2.4).
 * `TRADE_ORDER_TAKEN` is the platform identifier already belonging to another order — it should be
 * unreachable, since the platform mints those, and it is refused rather than tolerated because a
 * trade order id matching two orders makes callback correlation pick one of them arbitrarily.
 */
export type UnlockOrderCreateFailure = 'IDEMPOTENCY_CONFLICT' | 'TRADE_ORDER_TAKEN';

export type UnlockOrderApplyFailure = 'ORDER_NOT_FOUND' | UnlockOrderTransitionFailure;

export interface UnlockOrderStore {
  /**
   * Persists a new order. Fails when `(userId, idempotencyKey)` is taken, which is the backstop
   * behind the route's own lookup: the route checks first so it does not create a platform trade
   * order for a request it is about to refuse, and this check is what a concurrent duplicate hits.
   */
  create(order: UnlockOrder): Promise<Result<UnlockOrder, UnlockOrderCreateFailure>>;
  get(orderId: string): Promise<UnlockOrder | undefined>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<UnlockOrder | undefined>;
  findByTradeOrderId(tradeOrderId: string): Promise<UnlockOrder | undefined>;
  /** Applies a transition from `orders.ts`. The only way a stored order ever changes. */
  apply(
    orderId: string,
    transition: UnlockOrderTransition,
  ): Promise<Result<UnlockOrder, UnlockOrderApplyFailure>>;
  list(): Promise<readonly UnlockOrder[]>;
}

export interface UnlockOrderStoreOptions {
  /** Oldest records are dropped past this bound so a flood cannot exhaust the heap (or the file). */
  readonly capacity?: number;
}

export function createInMemoryUnlockOrderStore(
  options: UnlockOrderStoreOptions = {},
): UnlockOrderStore {
  const capacity = options.capacity ?? 1000;
  const orders = new Map<string, UnlockOrder>();

  function idempotencyIndex(userId: string, key: string): string {
    return `${userId}\u0000${key}`;
  }

  const byIdempotencyKey = new Map<string, string>();
  const byTradeOrderId = new Map<string, string>();

  return {
    async create(order) {
      const index = idempotencyIndex(order.userId, order.idempotencyKey);
      if (byIdempotencyKey.has(index)) {
        return err('IDEMPOTENCY_CONFLICT');
      }
      if (byTradeOrderId.has(order.tradeOrderId)) {
        return err('TRADE_ORDER_TAKEN');
      }

      orders.set(order.id, order);
      byIdempotencyKey.set(index, order.id);
      byTradeOrderId.set(order.tradeOrderId, order.id);

      while (orders.size > capacity) {
        const oldest = orders.keys().next();
        if (oldest.done === true) break;
        const dropped = orders.get(oldest.value);
        orders.delete(oldest.value);
        if (dropped !== undefined) {
          byIdempotencyKey.delete(idempotencyIndex(dropped.userId, dropped.idempotencyKey));
          byTradeOrderId.delete(dropped.tradeOrderId);
        }
      }

      return ok(order);
    },

    async get(orderId) {
      return orders.get(orderId);
    },

    async findByIdempotencyKey(userId, idempotencyKey) {
      const orderId = byIdempotencyKey.get(idempotencyIndex(userId, idempotencyKey));

      return orderId === undefined ? undefined : orders.get(orderId);
    },

    async findByTradeOrderId(tradeOrderId) {
      const orderId = byTradeOrderId.get(tradeOrderId);

      return orderId === undefined ? undefined : orders.get(orderId);
    },

    async apply(orderId, transition) {
      const existing = orders.get(orderId);
      if (existing === undefined) return err('ORDER_NOT_FOUND');

      const advanced = advanceUnlockOrder(existing, transition);
      if (!advanced.ok) return advanced;

      orders.set(orderId, advanced.value);

      return ok(advanced.value);
    },

    async list() {
      return [...orders.values()];
    },
  };
}
