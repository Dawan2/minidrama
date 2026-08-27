import { randomUUID } from 'node:crypto';

import type { SqliteDatabase } from '../../db/sqlite.js';
import type {
  WebhookEventRecord,
  WebhookEventStore,
  WebhookEventStoreOptions,
} from './event-store.js';

/**
 * The durable `WebhookEventStore`: a SQLite table behind the same interface as the in-memory map.
 *
 * The payload is a BLOB, never TEXT, so bytes that are not valid UTF-8 come back equal to what
 * arrived. The claim is a separate unique table so a losing redelivery still records the key on
 * its own row, and so a restart cannot honour a payment twice. The interface is already async;
 * `node:sqlite` is synchronous underneath, which is the same bargain the unlock store made.
 */

const DEFAULT_CAPACITY = 1000;

const INSERT_EVENT_SQL = `
  INSERT INTO webhook_events (
    id, source, raw_payload, headers, received_at_ms, verified, processed, idempotency_key, rejection_reason
  ) VALUES (?, 'TIKTOK', ?, ?, ?, 0, 0, NULL, NULL)
`;

const FIND_SQL = `
  SELECT id, source, raw_payload, headers, received_at_ms, verified, processed, idempotency_key, rejection_reason
  FROM webhook_events
  WHERE id = ?
`;

const LIST_SQL = `
  SELECT id, source, raw_payload, headers, received_at_ms, verified, processed, idempotency_key, rejection_reason
  FROM webhook_events
  ORDER BY seq ASC
`;

const MARK_VERIFIED_SQL = `UPDATE webhook_events SET verified = 1 WHERE id = ?`;
const MARK_REJECTED_SQL = `UPDATE webhook_events SET rejection_reason = ? WHERE id = ?`;
const MARK_PROCESSED_SQL = `UPDATE webhook_events SET processed = 1 WHERE id = ?`;
const SET_KEY_SQL = `UPDATE webhook_events SET idempotency_key = ? WHERE id = ?`;
const CLAIM_KEY_SQL = `INSERT OR IGNORE INTO webhook_idempotency_keys (key) VALUES (?)`;
const COUNT_SQL = `SELECT COUNT(*) AS n FROM webhook_events`;
const EVICT_OLDEST_SQL = `
  DELETE FROM webhook_events WHERE seq = (
    SELECT seq FROM webhook_events ORDER BY seq ASC LIMIT 1
  )
`;

export function createSqliteWebhookEventStore(
  db: SqliteDatabase,
  options: WebhookEventStoreOptions = {},
): WebhookEventStore {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;

  const insertEvent = db.prepare(INSERT_EVENT_SQL);
  const find = db.prepare(FIND_SQL);
  const list = db.prepare(LIST_SQL);
  const markVerifiedStmt = db.prepare(MARK_VERIFIED_SQL);
  const markRejectedStmt = db.prepare(MARK_REJECTED_SQL);
  const markProcessedStmt = db.prepare(MARK_PROCESSED_SQL);
  const setKey = db.prepare(SET_KEY_SQL);
  const claimKey = db.prepare(CLAIM_KEY_SQL);
  const countStmt = db.prepare(COUNT_SQL);
  const evictOldest = db.prepare(EVICT_OLDEST_SQL);

  const liveCount = (): number => asCount(countStmt.get()?.['n']);

  return {
    async record(input) {
      const created: WebhookEventRecord = {
        id: randomUUID(),
        source: 'TIKTOK',
        rawPayload: input.rawPayload,
        headers: input.headers,
        receivedAtMs: input.receivedAtMs,
        verified: false,
        processed: false,
        idempotencyKey: null,
        rejectionReason: null,
      };

      insertEvent.run(
        created.id,
        created.rawPayload,
        JSON.stringify(created.headers),
        created.receivedAtMs,
      );

      while (liveCount() > capacity) evictOldest.run();

      return created;
    },

    async markVerified(id) {
      markVerifiedStmt.run(id);
    },

    async markRejected(id, reason) {
      markRejectedStmt.run(reason, id);
    },

    async claimIdempotencyKey(id, key) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const claimed = claimKey.run(key);
        setKey.run(key, id);
        db.exec('COMMIT');
        return claimed.changes === 1;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async markProcessed(id) {
      markProcessedStmt.run(id);
    },

    async get(id) {
      return readEvent(find.get(id));
    },

    async list() {
      const rows: WebhookEventRecord[] = [];
      for (const row of list.all()) {
        const record = readEvent(row);
        if (record !== undefined) rows.push(record);
      }
      return rows;
    },
  };
}

function readEvent(row: Record<string, unknown> | undefined): WebhookEventRecord | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const source = row['source'] === 'TIKTOK' ? 'TIKTOK' : undefined;
  const rawPayload = asBuffer(row['raw_payload']);
  const headers = asHeaders(row['headers']);
  const receivedAtMs = asNumber(row['received_at_ms']);
  const verified = asBoolean(row['verified']);
  const processed = asBoolean(row['processed']);
  const idempotencyKey = asNullableString(row['idempotency_key']);
  const rejectionReason = asNullableString(row['rejection_reason']);

  if (
    id === undefined ||
    source === undefined ||
    rawPayload === undefined ||
    headers === undefined ||
    receivedAtMs === undefined ||
    verified === undefined ||
    processed === undefined ||
    idempotencyKey === undefined ||
    rejectionReason === undefined
  ) {
    return undefined;
  }

  return {
    id,
    source,
    rawPayload,
    headers,
    receivedAtMs,
    verified,
    processed,
    idempotencyKey,
    rejectionReason,
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
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 0n) return false;
  if (value === 1 || value === 1n) return true;
  return undefined;
}

function asBuffer(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return undefined;
}

function asHeaders(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const headers: Record<string, string> = {};
    for (const [name, header] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof header !== 'string') return undefined;
      headers[name] = header;
    }
    return headers;
  } catch {
    return undefined;
  }
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}
