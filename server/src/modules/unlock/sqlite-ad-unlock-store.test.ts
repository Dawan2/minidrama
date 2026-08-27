import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAdUnlockSession, newAdSessionId } from './ad-sessions.js';
import { createSqliteAdUnlockSessionStore } from './sqlite-ad-session-store.js';
import { createSqliteAdRewardLogStore } from './sqlite-ad-reward-log-store.js';
import { newAdRewardLogId } from './ad-reward-log.js';
import { openMigratedSqlite } from '../../db/migrate.js';

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

describe('ad unlock sqlite stores — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a minted session after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-ad-unlock-'));
    dirs.push(dir);
    const path = join(dir, 'ad.sqlite');
    const id = newAdSessionId();

    const first = openMigratedSqlite(path);
    const written = await createSqliteAdUnlockSessionStore(first).create(
      createAdUnlockSession({
        id,
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        idempotencyKey: 'idem-1',
        createdAtMs: NOW,
      }),
    );
    expect(written.ok && written.value.id).toBe(id);
    first.close();

    const second = openMigratedSqlite(path);
    const found = await createSqliteAdUnlockSessionStore(second).get(id);
    second.close();

    expect(found).toMatchObject({ id, episodeId: 'ep_1', redeemedAtMs: null });
  });

  it('keeps a reward log after bounce, including a skipped view', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-ad-log-'));
    dirs.push(dir);
    const path = join(dir, 'ad.sqlite');

    const first = openMigratedSqlite(path);
    await createSqliteAdRewardLogStore(first).append({
      id: newAdRewardLogId(),
      userId: 'usr_1',
      episodeId: 'ep_1',
      sessionId: 'ads_1',
      isEndedReported: false,
      completed: false,
      granted: false,
      refusal: 'NOT_COMPLETED',
      atMs: NOW,
    });
    first.close();

    const second = openMigratedSqlite(path);
    const listed = await createSqliteAdRewardLogStore(second).list();
    const granted = await createSqliteAdRewardLogStore(second).countGrantedSince('usr_1', NOW);
    second.close();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      isEndedReported: false,
      granted: false,
      refusal: 'NOT_COMPLETED',
    });
    expect(granted).toBe(0);
  });

  it('stores a null isEnded report, and redeems a session once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-ad-redeem-'));
    dirs.push(dir);
    const path = join(dir, 'ad.sqlite');
    const id = newAdSessionId();

    const first = openMigratedSqlite(path);
    const sessions = createSqliteAdUnlockSessionStore(first);
    await sessions.create(
      createAdUnlockSession({
        id,
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        idempotencyKey: 'idem-null',
        createdAtMs: NOW,
      }),
    );
    const redeemed = await sessions.redeem(id, {
      outcome: 'NOT_COMPLETED',
      unlockId: null,
      atMs: NOW + 1,
    });
    expect(redeemed.ok).toBe(true);
    const again = await sessions.redeem(id, {
      outcome: 'GRANTED',
      unlockId: 'ulk_1',
      atMs: NOW + 2,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('ALREADY_REDEEMED');

    const missing = await sessions.redeem('ads_nope', {
      outcome: 'GRANTED',
      unlockId: null,
      atMs: NOW,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe('SESSION_NOT_FOUND');

    await createSqliteAdRewardLogStore(first).append({
      id: newAdRewardLogId(),
      userId: 'usr_1',
      episodeId: 'ep_1',
      sessionId: id,
      isEndedReported: null,
      completed: false,
      granted: false,
      refusal: 'NOT_COMPLETED',
      atMs: NOW,
    });
    first.close();

    const second = openMigratedSqlite(path);
    const listed = await createSqliteAdRewardLogStore(second).list();
    const found = await createSqliteAdUnlockSessionStore(second).get(id);
    second.close();

    expect(listed[0]?.isEndedReported).toBeNull();
    expect(found).toMatchObject({ outcome: 'NOT_COMPLETED', redeemedAtMs: NOW + 1 });
  });

  it('replays the same idempotency key and conflicts on a different episode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-ad-idem-'));
    dirs.push(dir);
    const path = join(dir, 'ad.sqlite');
    const first = openMigratedSqlite(path);
    const sessions = createSqliteAdUnlockSessionStore(first);
    const created = await sessions.create(
      createAdUnlockSession({
        id: newAdSessionId(),
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        idempotencyKey: 'same',
        createdAtMs: NOW,
      }),
    );
    const replayed = await sessions.create(
      createAdUnlockSession({
        id: newAdSessionId(),
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        idempotencyKey: 'same',
        createdAtMs: NOW,
      }),
    );
    const conflict = await sessions.create(
      createAdUnlockSession({
        id: newAdSessionId(),
        userId: 'usr_1',
        episodeId: 'ep_2',
        dramaId: 'drm_1',
        idempotencyKey: 'same',
        createdAtMs: NOW,
      }),
    );
    first.close();

    expect(created.ok).toBe(true);
    expect(replayed.ok).toBe(true);
    if (created.ok && replayed.ok) {
      expect(replayed.value.id).toBe(created.value.id);
    }
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error).toBe('IDEMPOTENCY_CONFLICT');
  });
});
