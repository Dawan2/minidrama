/**
 * The audit half of the dual-track reward record (S9 / AC-MON-6).
 *
 * U-18 closed negatively: there is no platform SSV callback. The honest substitute is a log
 * of every grant *attempt* — completed, skipped, quota-refused — so a later operator can
 * compare client reports against `AD` rows in the unlock table. The log does not grant. A
 * row here with `COMPLETED` and no matching unlock is a grant that failed after verification,
 * which is the recoverable direction.
 *
 * In-memory is fail-closed across restarts, the same as the nonce store. The durable slice
 * is the unlock row itself; this log is the forensic companion, not a second entitlement.
 */

export type AdRewardOutcome =
  'COMPLETED' | 'NOT_COMPLETED' | 'QUOTA_EXCEEDED' | 'UNAVAILABLE' | 'REFUSED';

export interface AdRewardLogEntry {
  readonly atMs: number;
  readonly userId: string;
  readonly episodeId: string;
  readonly sessionId: string;
  readonly isEndedReported: boolean;
  readonly verdict: AdRewardOutcome;
}

export interface AdRewardLog {
  record(entry: AdRewardLogEntry): void;
  list(): readonly AdRewardLogEntry[];
}

export function createInMemoryAdRewardLog(): AdRewardLog {
  const entries: AdRewardLogEntry[] = [];

  return {
    record(entry) {
      entries.push(entry);
    },
    list() {
      return entries;
    },
  };
}
