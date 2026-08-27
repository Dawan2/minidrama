import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { sessionFingerprint } from './session-store.js';
import { createSqliteSessionStore } from './sqlite-session-store.js';

describe('createSqliteSessionStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a token after the connection is closed and reopened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-session-'));
    dirs.push(dir);
    const path = join(dir, 'sessions.sqlite');

    const first = openMigratedSqlite(path);
    const issued = createSqliteSessionStore(first, {
      generateToken: () => 'tok_secret_value',
    }).issue('usr_abc');
    first.close();

    const second = openMigratedSqlite(path);
    const found = createSqliteSessionStore(second).resolve(issued.accessToken);
    const keys = createSqliteSessionStore(second).fingerprints();
    second.close();

    expect(found).toEqual({ ok: true, value: 'usr_abc' });
    expect(keys).toEqual([sessionFingerprint('tok_secret_value')]);
    expect(keys).not.toContain('tok_secret_value');
  });

  it('does not write the raw token into the table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-session-'));
    dirs.push(dir);
    const path = join(dir, 'sessions.sqlite');
    const db = openMigratedSqlite(path);
    createSqliteSessionStore(db, { generateToken: () => 'tok_secret_value' }).issue('usr_abc');

    const rows = db.prepare('SELECT * FROM sessions').all();
    db.close();

    const dumped = JSON.stringify(rows);
    expect(dumped).not.toContain('tok_secret_value');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['fingerprint']).toBe(sessionFingerprint('tok_secret_value'));
  });
});
