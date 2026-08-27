import { err, ok } from '@minidrama/shared';

import type { AdRewardLog, AdRewardLogFailure, AdRewardLogStore } from './ad-reward-log.js';
import type { SqliteDatabase } from '../../db/sqlite.js';

const INSERT_SQL = `
  INSERT INTO ad_reward_log (
    id, user_id, episode_id, session_id, is_ended_reported, completed, granted, refusal, at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const COUNT_GRANTED_SQL = `
  SELECT COUNT(*) AS n FROM ad_reward_log
  WHERE user_id = ? AND granted = 1 AND at_ms >= ?
`;

const LIST_SQL = `
  SELECT id, user_id, episode_id, session_id, is_ended_reported, completed, granted, refusal, at_ms
  FROM ad_reward_log
  ORDER BY rowid
`;

export function createSqliteAdRewardLogStore(db: SqliteDatabase): AdRewardLogStore {
  const insert = db.prepare(INSERT_SQL);
  const countGranted = db.prepare(COUNT_GRANTED_SQL);
  const list = db.prepare(LIST_SQL);

  return {
    async append(log) {
      try {
        insert.run(
          log.id,
          log.userId,
          log.episodeId,
          log.sessionId,
          log.isEndedReported === null ? null : log.isEndedReported ? 1 : 0,
          log.completed ? 1 : 0,
          log.granted ? 1 : 0,
          log.refusal,
          log.atMs,
        );
        return ok(log);
      } catch {
        return err('LOG_NOT_RECORDED' satisfies AdRewardLogFailure);
      }
    },

    async countGrantedSince(userId, sinceMs) {
      const n = countGranted.get(userId, sinceMs)?.['n'];
      return typeof n === 'number' && Number.isFinite(n) ? n : 0;
    },

    async list() {
      const rows: AdRewardLog[] = [];
      for (const row of list.all()) {
        const log = readLog(row);
        if (log !== undefined) rows.push(log);
      }
      return rows;
    },
  };
}

function readLog(row: Record<string, unknown>): AdRewardLog | undefined {
  const id = asString(row['id']);
  const userId = asString(row['user_id']);
  const episodeId = asString(row['episode_id']);
  const sessionId = asString(row['session_id']);
  const isEndedReported = asNullableBool(row['is_ended_reported']);
  const completed = asBool(row['completed']);
  const granted = asBool(row['granted']);
  const refusal = asNullableString(row['refusal']);
  const atMs = asNumber(row['at_ms']);

  if (
    id === undefined ||
    userId === undefined ||
    episodeId === undefined ||
    sessionId === undefined ||
    isEndedReported === undefined ||
    completed === undefined ||
    granted === undefined ||
    refusal === undefined ||
    atMs === undefined
  ) {
    return undefined;
  }

  return { id, userId, episodeId, sessionId, isEndedReported, completed, granted, refusal, atMs };
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

function asBool(value: unknown): boolean | undefined {
  if (value === 0 || value === 1) return value === 1;
  return undefined;
}

function asNullableBool(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  return asBool(value);
}
