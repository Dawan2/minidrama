import { randomUUID } from 'node:crypto';

/**
 * Raw-payload-first storage for inbound platform webhooks
 * (`docs/design/minis-integration.md` §6.2, step 1).
 *
 * The payload is written *before* verification and before parsing, and it is written verbatim. Two
 * reasons, both of which have cost other integrations money:
 *
 *   - the field set is not exhaustive (G-R4), so any parse can silently drop data. Keeping the bytes
 *     means a clarified field list can be applied to history by replay rather than by apology;
 *   - a rejected event is evidence. Sustained verification failures are either our own
 *     misconfiguration — which loses revenue silently — or an attack, and neither can be
 *     investigated from a counter alone.
 *
 * The interface is async so the Postgres `platform_webhook_event` table drops in behind it without
 * changing a single caller. The in-memory implementation is bounded and is the default; it forgets
 * everything on restart. `DATABASE_URL=sqlite:<path>` puts a SQLite table behind this same
 * interface (the same file as unlock receipts, sessions, coin unlock orders, and watch progress);
 * a postgres URL is refused rather than rewritten to a file. A restart that kept the receipt and
 * lost the idempotency claim would honour a redelivery as a new payment.
 */

export interface WebhookEventRecord {
  readonly id: string;
  readonly source: 'TIKTOK';
  /**
   * The request body exactly as received, never a re-serialisation.
   *
   * A `Buffer` rather than a string, because the signature covers bytes and a stored event is only
   * re-verifiable if the bytes survived. A durable implementation must keep that property — a
   * column that decodes, re-encodes or normalises the payload silently makes replay unreliable in
   * exactly the cases worth replaying.
   */
  readonly rawPayload: Buffer;
  readonly headers: Readonly<Record<string, string>>;
  readonly receivedAtMs: number;
  readonly verified: boolean;
  readonly processed: boolean;
  readonly idempotencyKey: string | null;
  /** Populated only on rejection. Operator-facing, never returned to the sender. */
  readonly rejectionReason: string | null;
}

export interface RecordWebhookEventInput {
  readonly rawPayload: Buffer;
  readonly headers: Readonly<Record<string, string>>;
  readonly receivedAtMs: number;
}

export interface WebhookEventStore {
  record(input: RecordWebhookEventInput): Promise<WebhookEventRecord>;
  markVerified(id: string): Promise<void>;
  /**
   * Records why the event was not acted on. It deliberately does not touch `verified`: an authentic
   * payload we could not interpret is a different problem from a forged one, and collapsing the two
   * would hide the case where our parser, not the sender, is at fault.
   */
  markRejected(id: string, reason: string): Promise<void>;
  /**
   * Claims the key for this event. Resolves `true` when this caller won the claim and `false` when
   * the key was already taken, which is the duplicate-delivery signal.
   */
  claimIdempotencyKey(id: string, key: string): Promise<boolean>;
  markProcessed(id: string): Promise<void>;
  get(id: string): Promise<WebhookEventRecord | undefined>;
  list(): Promise<readonly WebhookEventRecord[]>;
}

/**
 * Headers worth keeping for replay and forensics. An allow-list rather than a redaction list:
 * a redaction list has to predict every header that might carry a credential, and it only has to be
 * wrong once. `tiktok-signature` is included — it is a MAC over a payload we already store, so it
 * discloses nothing, and without it a stored event cannot be re-verified.
 */
const RETAINED_HEADERS = [
  'tiktok-signature',
  'content-type',
  'content-length',
  'user-agent',
] as const;

export function retainHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string> {
  const retained: Record<string, string> = {};

  for (const name of RETAINED_HEADERS) {
    const value = headers[name];
    if (typeof value === 'string') {
      retained[name] = value;
    } else if (Array.isArray(value)) {
      // Preserved as evidence: a duplicated signature header is itself a rejection reason.
      retained[name] = value.join(', ');
    }
  }

  return retained;
}

export interface WebhookEventStoreOptions {
  /** Oldest records are dropped past this bound so a flood cannot exhaust the heap (or the file). */
  readonly capacity?: number;
}

export function createInMemoryWebhookEventStore(
  options: WebhookEventStoreOptions = {},
): WebhookEventStore {
  const capacity = options.capacity ?? 1000;
  const records = new Map<string, WebhookEventRecord>();
  const claimedKeys = new Set<string>();

  function update(id: string, patch: Partial<WebhookEventRecord>): void {
    const existing = records.get(id);
    if (existing !== undefined) {
      records.set(id, { ...existing, ...patch });
    }
  }

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

      records.set(created.id, created);

      while (records.size > capacity) {
        const oldest = records.keys().next();
        if (oldest.done === true) break;
        records.delete(oldest.value);
      }

      return created;
    },

    async markVerified(id) {
      update(id, { verified: true });
    },

    async markRejected(id, reason) {
      update(id, { rejectionReason: reason });
    },

    async claimIdempotencyKey(id, key) {
      update(id, { idempotencyKey: key });
      if (claimedKeys.has(key)) {
        return false;
      }
      claimedKeys.add(key);
      return true;
    },

    async markProcessed(id) {
      update(id, { processed: true });
    },

    async get(id) {
      return records.get(id);
    },

    async list() {
      return [...records.values()];
    },
  };
}
