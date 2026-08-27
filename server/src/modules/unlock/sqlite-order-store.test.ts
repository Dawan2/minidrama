import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createUnlockOrder } from './orders.js';
import { createSqliteUnlockOrderStore } from './sqlite-order-store.js';

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

function pending(overrides: { id?: string; tradeOrderId?: string; idempotencyKey?: string } = {}) {
  return createUnlockOrder({
    id: overrides.id ?? 'uord_1',
    userId: 'usr_1',
    episodeId: 'ep_1',
    dramaId: 'drm_1',
    priceCoins: 300,
    tradeOrderId: overrides.tradeOrderId ?? 'tto_1',
    idempotencyKey: overrides.idempotencyKey ?? 'key-1',
    createdAtMs: NOW,
  });
}

describe('createSqliteUnlockOrderStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a pending order after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-order-'));
    dirs.push(dir);
    const path = join(dir, 'orders.sqlite');

    const first = openMigratedSqlite(path);
    const written = await createSqliteUnlockOrderStore(first).create(pending());
    expect(written.ok).toBe(true);
    first.close();

    const second = openMigratedSqlite(path);
    const found = await createSqliteUnlockOrderStore(second).get('uord_1');
    second.close();

    expect(found).toMatchObject({
      id: 'uord_1',
      status: 'PENDING',
      tradeOrderId: 'tto_1',
      paidAtMs: null,
    });
  });

  it('keeps a paid order, and the first paidAtMs, after close and reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-order-'));
    dirs.push(dir);
    const path = join(dir, 'orders.sqlite');

    const first = openMigratedSqlite(path);
    const store = createSqliteUnlockOrderStore(first);
    await store.create(pending());
    await store.apply('uord_1', { type: 'PAYMENT_VERIFIED', atMs: NOW + 1 });
    first.close();

    const second = openMigratedSqlite(path);
    const found = await createSqliteUnlockOrderStore(second).get('uord_1');
    second.close();

    expect(found).toMatchObject({ status: 'PAID', paidAtMs: NOW + 1, unlockId: null });
  });
});
