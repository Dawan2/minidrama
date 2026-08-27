/**
 * Error codes shared by the client and the server.
 *
 * This is the Wave 1 skeleton subset, not the full catalogue. The authoritative list is
 * `docs/12-error-catalog.md` (API codes) and `docs/design/minis-integration.md` §5.2
 * (`BRIDGE_*` codes). Codes are added here as the endpoints that raise them are implemented,
 * so that a code in this file always has a producer and a consumer.
 */

export const API_ERROR_CODES = [
  'COMMON_VALIDATION_FAILED',
  'COMMON_RESOURCE_NOT_FOUND',
  'COMMON_RATE_LIMITED',
  'COMMON_INTERNAL_ERROR',
  'COMMON_SERVICE_UNAVAILABLE',
  'AUTH_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'CONTENT_NOT_FOUND',
  'CONTENT_OFFLINE',
  'EPISODE_LOCKED',
  'EPISODE_VIP_REQUIRED',
  'EPISODE_ASSET_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Bridge errors are produced by the client-side platform adapter, never by the API. They are
 * kept in a separate namespace precisely so that "the SDK misbehaved" is never mistaken for
 * "the server said no" — the two have completely different user-facing and operational handling.
 */
export const BRIDGE_ERROR_CODES = [
  'BRIDGE_NOT_READY',
  'BRIDGE_UNSUPPORTED',
  'BRIDGE_TIMEOUT',
  'BRIDGE_USER_CANCELLED',
  'BRIDGE_AD_NOT_COMPLETED',
  'BRIDGE_UNKNOWN',
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export interface ApiErrorBody {
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Echoed from the server so a user report maps to a trace. */
  readonly traceId: string;
  readonly details?: Readonly<Record<string, unknown>> | null;
}

export interface BridgeError {
  readonly code: BridgeErrorCode;
  readonly message: string;
  /** The unparsed SDK payload. Never destructured — its shape is undocumented (U-05). */
  readonly cause?: unknown;
}

export function bridgeError(code: BridgeErrorCode, message: string, cause?: unknown): BridgeError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

export function isApiErrorCode(value: string): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(value);
}

export function isBridgeErrorCode(value: string): value is BridgeErrorCode {
  return (BRIDGE_ERROR_CODES as readonly string[]).includes(value);
}
