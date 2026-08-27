import { describe, expect, it } from 'vitest';

import { parseDatabaseUrl } from './database-url.js';

describe('parseDatabaseUrl', () => {
  it('treats unset and blank as in-memory', () => {
    expect(parseDatabaseUrl(undefined)).toEqual({ kind: 'memory' });
    expect(parseDatabaseUrl('')).toEqual({ kind: 'memory' });
    expect(parseDatabaseUrl('  ')).toEqual({ kind: 'memory' });
  });

  it('reads a sqlite file path', () => {
    expect(parseDatabaseUrl('sqlite:./data/minidrama.sqlite')).toEqual({
      kind: 'sqlite',
      path: './data/minidrama.sqlite',
    });
  });

  it('reads a three-slash absolute sqlite URI', () => {
    expect(parseDatabaseUrl('sqlite:///tmp/minidrama.sqlite')).toEqual({
      kind: 'sqlite',
      path: '/tmp/minidrama.sqlite',
    });
  });

  it('reads an in-process sqlite database', () => {
    expect(parseDatabaseUrl('sqlite::memory:')).toEqual({ kind: 'sqlite', path: ':memory:' });
  });

  it('does not rewrite postgres to a file', () => {
    expect(parseDatabaseUrl('postgres://minidrama@localhost:5432/minidrama')).toEqual({
      kind: 'unwired',
      scheme: 'postgres',
    });
  });

  it('does not treat redis as a database we have', () => {
    expect(parseDatabaseUrl('redis://localhost:6379')).toEqual({
      kind: 'unwired',
      scheme: 'redis',
    });
  });
});
