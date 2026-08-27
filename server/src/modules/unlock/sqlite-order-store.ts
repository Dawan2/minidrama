import { err, ok } from '@minidrama/shared';

import type { SqliteDatabase } from '../../db/sqlite.js';
import { advanceUnlockOrder, UNLOCK_ORDER_STATUSES } from './orders.js';
import type { UnlockOrder, UnlockOrderStatus } from './orders.js';
import type {
  UnlockOrderApplyFailure,
  UnlockOrderCreateFailure,
  UnlockOrderStore,
  UnlockOrderStoreOptions,
} from './order-store.js';

/**
 * The durable `UnlockOrderStore`: a SQLite table behind the same interface as the in-memory map.
 *
 * Three unique indexes — `id`, `(user_id, idempotency_key)`, `trade_order_id` — are what the
 * in-memory Maps were simulating. The last one is what makes a payment callback single-valued: two
 * rows claiming the same trade order id would make correlation pick one of them arbitrarily.
 * Status only changes through `advanceUnlockOrder`; there is no UPDATE that skips it.
 *
 * The interface is already async; `node:sqlite` is synchronous underneath, which is the same
 * bargain the unlock, session, and webhook stores made.
 */

const DEFAULT_CAPACITY = 1000;

const INSERT_SQL = `
  INSERT INTO unlock_orders (
    id, user_id, episode_id, drama_id, price_coins, trade_order_id, idempotency_key,
    status, created_at_ms, paid_at_ms, fulfilled_at_ms, unlock_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_COLUMNS = `
  id, user_id, episode_id, drama_id, price_coins, trade_order_id, idempotency_key,
  status, created_at_ms, paid_at_ms, fulfilled_at_ms, unlock_id
`;

const FIND_BY_ID_SQL = `SELECT ${SELECT_COLUMNS} FROM unlock_orders WHERE id = ?`;
const FIND_BY_IDEMPOTENCY_SQL = `
  SELECT ${SELECT_COLUMNS} FROM unlock_orders WHERE user_id = ? AND idempotency_key = ?
`;
const FIND_BY_TRADE_SQL = `SELECT ${SELECT_COLUMNS} FROM unlock_orders WHERE trade_order_id = ?`;
const LIST_SQL = `SELECT ${SELECT_COLUMNS} FROM unlock_orders ORDER BY seq ASC`;
const UPDATE_SQL = `
  UPDATE unlock_orders
  SET status = ?, paid_at_ms = ?, fulfilled_at_ms = ?, unlock_id = ?
  WHERE id = ?
`;
const COUNT_SQL = `SELECT COUNT(*) AS n FROM unlock_orders`;
const EVICT_OLDEST_SQL = `
  DELETE FROM unlock_orders WHERE seq = (
    SELECT seq FROM unlock_orders ORDER BY seq ASC LIMIT 1
  )
`;

export function createSqliteUnlockOrderStore(
  db: SqliteDatabase,
  options: UnlockOrderStoreOptions = {},
): UnlockOrderStore {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;

  const insert = db.prepare(INSERT_SQL);
  const findById = db.prepare(FIND_BY_ID_SQL);
  const findByIdempotency = db.prepare(FIND_BY_IDEMPOTENCY_SQL);
  const findByTrade = db.prepare(FIND_BY_TRADE_SQL);
  const list = db.prepare(LIST_SQL);
  const update = db.prepare(UPDATE_SQL);
  const countStmt = db.prepare(COUNT_SQL);
  const evictOldest = db.prepare(EVICT_OLDEST_SQL);

  const liveCount = (): number => asCount(countStmt.get()?.['n']);

  return {
    async create(order) {
      try {
        insert.run(
          order.id,
          order.userId,
          order.episodeId,
          order.dramaId,
          order.priceCoins,
          order.tradeOrderId,
          order.idempotencyKey,
          order.status,
          order.createdAtMs,
          order.paidAtMs,
          order.fulfilledAtMs,
          order.unlockId,
        );
      } catch (error) {
        const failure = uniqueCreateFailure(error);
        if (failure !== undefined) return err(failure);
        throw error;
      }

      while (liveCount() > capacity) evictOldest.run();

      return ok(order);
    },

    async get(orderId) {
      return readOrder(findById.get(orderId));
    },

    async findByIdempotencyKey(userId, idempotencyKey) {
      return readOrder(findByIdempotency.get(userId, idempotencyKey));
    },

    async findByTradeOrderId(tradeOrderId) {
      return readOrder(findByTrade.get(tradeOrderId));
    },

    async apply(orderId, transition) {
      const existing = readOrder(findById.get(orderId));
      if (existing === undefined) return err('ORDER_NOT_FOUND' satisfies UnlockOrderApplyFailure);

      const advanced = advanceUnlockOrder(existing, transition);
      if (!advanced.ok) return advanced;

      update.run(
        advanced.value.status,
        advanced.value.paidAtMs,
        advanced.value.fulfilledAtMs,
        advanced.value.unlockId,
        orderId,
      );

      return ok(advanced.value);
    },

    async list() {
      const rows: UnlockOrder[] = [];
      for (const row of list.all()) {
        const order = readOrder(row);
        if (order !== undefined) rows.push(order);
      }
      return rows;
    },
  };
}

function uniqueCreateFailure(error: unknown): UnlockOrderCreateFailure | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (!/UNIQUE constraint failed/i.test(message)) return undefined;
  // The in-memory store checks idempotency before trade-order-taken. When both collide the
  // suite does not care; when only one does, the column name in the sqlite error picks it.
  if (message.includes('idempotency_key')) return 'IDEMPOTENCY_CONFLICT';
  if (message.includes('trade_order_id')) return 'TRADE_ORDER_TAKEN';
  return undefined;
}

function readOrder(row: Record<string, unknown> | undefined): UnlockOrder | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const userId = asString(row['user_id']);
  const episodeId = asString(row['episode_id']);
  const dramaId = asString(row['drama_id']);
  const priceCoins = asNumber(row['price_coins']);
  const tradeOrderId = asString(row['trade_order_id']);
  const idempotencyKey = asString(row['idempotency_key']);
  const status = asStatus(row['status']);
  const createdAtMs = asNumber(row['created_at_ms']);
  const paidAtMs = asNullableNumber(row['paid_at_ms']);
  const fulfilledAtMs = asNullableNumber(row['fulfilled_at_ms']);
  const unlockId = asNullableString(row['unlock_id']);

  if (
    id === undefined ||
    userId === undefined ||
    episodeId === undefined ||
    dramaId === undefined ||
    priceCoins === undefined ||
    tradeOrderId === undefined ||
    idempotencyKey === undefined ||
    status === undefined ||
    createdAtMs === undefined ||
    paidAtMs === undefined ||
    fulfilledAtMs === undefined ||
    unlockId === undefined
  ) {
    return undefined;
  }

  return {
    id,
    userId,
    episodeId,
    dramaId,
    priceCoins,
    tradeOrderId,
    idempotencyKey,
    status,
    createdAtMs,
    paidAtMs,
    fulfilledAtMs,
    unlockId,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return asString(value);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asNumber(value);
}

function asStatus(value: unknown): UnlockOrderStatus | undefined {
  return typeof value === 'string' && (UNLOCK_ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as UnlockOrderStatus)
    : undefined;
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}
