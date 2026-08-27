import { randomUUID } from 'node:crypto';

import { ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

const LOG_ID_PREFIX = 'arl_';

export type AdRewardLogFailure = 'LOG_NOT_RECORDED';

export interface AdRewardLog {
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly sessionId: string;
  readonly isEndedReported: boolean | null;
  readonly completed: boolean;
  readonly granted: boolean;
  readonly refusal: string | null;
  readonly atMs: number;
}

export interface AdRewardLogStore {
  append(log: AdRewardLog): Promise<Result<AdRewardLog, AdRewardLogFailure>>;
  countGrantedSince(userId: string, sinceMs: number): Promise<number>;
  list(): Promise<readonly AdRewardLog[]>;
}

export function newAdRewardLogId(): string {
  return `${LOG_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}

export function createInMemoryAdRewardLogStore(): AdRewardLogStore {
  const logs: AdRewardLog[] = [];

  return {
    async append(log) {
      logs.push(log);
      return ok(log);
    },

    async countGrantedSince(userId, sinceMs) {
      return logs.filter(
        (entry) => entry.userId === userId && entry.granted && entry.atMs >= sinceMs,
      ).length;
    },

    async list() {
      return [...logs];
    },
  };
}
