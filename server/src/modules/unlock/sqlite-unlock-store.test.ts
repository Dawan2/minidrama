import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { openSqlite } from '../../db/sqlite.js';
import { createCoinUnlock, newUnlockId } from './unlocks.js';
import { createSqliteUnlockStore } from './sqlite-unlock-store.js';

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

function receipt() {
  return createCoinUnlock({
    id: newUnlockId(),
    userId: 'usr_1',
    episodeId: 'ep_1',
    dramaId: 'drm_1',
    costCoins: 300,
    orderId: 'uord_1',
    grantedAtMs: NOW,
  });
}

describe('createSqliteUnlockStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a granted unlock after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-unlock-'));
    dirs.push(dir);
    const path = join(dir, 'unlocks.sqlite');
    const firstId = 'ulk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const first = openMigratedSqlite(path);
    const written = await createSqliteUnlockStore(first).record(
      createCoinUnlock({
        id: firstId,
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        costCoins: 300,
        orderId: 'uord_1',
        grantedAtMs: NOW,
      }),
    );
    expect(written.ok && written.value.created).toBe(true);
    first.close();

    const second = openMigratedSqlite(path);
    const found = await createSqliteUnlockStore(second).findForEpisode('usr_1', 'ep_1');
    second.close();

    expect(found).toMatchObject({ id: firstId, orderId: 'uord_1', grantedAtMs: NOW });
  });

  it('reports UNLOCK_NOT_RECORDED when the file cannot be written', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-unlock-'));
    dirs.push(dir);
    const path = join(dir, 'unlocks.sqlite');
    const writable = openMigratedSqlite(path);
    writable.close();

    const readonly = openSqlite(path, { readOnly: true });
    const recorded = await createSqliteUnlockStore(readonly).record(receipt());
    readonly.close();

    expect(recorded).toEqual({ ok: false, error: 'UNLOCK_NOT_RECORDED' });
  });
});
