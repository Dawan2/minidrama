import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createSqliteWebhookEventStore } from './sqlite-event-store.js';

const RAW = '{"client_key":"awtest","content":"{}"}';
const BYTES = Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]);

describe('createSqliteWebhookEventStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the payload bytes and a claimed key after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-webhook-'));
    dirs.push(dir);
    const path = join(dir, 'webhooks.sqlite');

    const first = openMigratedSqlite(path);
    const written = await createSqliteWebhookEventStore(first).record({
      rawPayload: BYTES,
      headers: { 'tiktok-signature': 't=1,s=abc' },
      receivedAtMs: 1_700_000_000_000,
    });
    expect(
      await createSqliteWebhookEventStore(first).claimIdempotencyKey(written.id, 'trade_order:to_1'),
    ).toBe(true);
    first.close();

    const second = openMigratedSqlite(path);
    const store = createSqliteWebhookEventStore(second);
    const found = await store.get(written.id);
    const replay = await store.record({
      rawPayload: Buffer.from(RAW, 'utf8'),
      headers: {},
      receivedAtMs: 1_700_000_000_001,
    });
    const duplicate = await store.claimIdempotencyKey(replay.id, 'trade_order:to_1');
    second.close();

    expect(found?.rawPayload.equals(BYTES)).toBe(true);
    expect(found?.headers['tiktok-signature']).toBe('t=1,s=abc');
    expect(found?.idempotencyKey).toBe('trade_order:to_1');
    expect(duplicate).toBe(false);
  });

  it('does not decode the payload as text, so a dump still holds the original bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-webhook-'));
    dirs.push(dir);
    const path = join(dir, 'webhooks.sqlite');
    const db = openMigratedSqlite(path);
    const written = await createSqliteWebhookEventStore(db).record({
      rawPayload: BYTES,
      headers: {},
      receivedAtMs: 1_700_000_000_000,
    });

    const row = db.prepare('SELECT raw_payload FROM webhook_events WHERE id = ?').get(written.id);
    db.close();

    const blob = row?.['raw_payload'];
    const stored = Buffer.isBuffer(blob)
      ? blob
      : blob instanceof Uint8Array
        ? Buffer.from(blob)
        : undefined;
    expect(stored?.equals(BYTES)).toBe(true);
    expect(typeof blob).not.toBe('string');
  });
});
