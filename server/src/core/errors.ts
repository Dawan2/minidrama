import type { ApiErrorBody, ApiErrorCode } from '@minidrama/shared';

/**
 * The single error envelope. Every failure carries the trace id so a user report maps to a trace
 * (`docs/architecture/system-overview.md` §7.2, §12).
 */
export function errorBody(
  code: ApiErrorCode,
  message: string,
  traceId: string,
  details?: Readonly<Record<string, unknown>>,
): { readonly error: ApiErrorBody } {
  return {
    error: details === undefined ? { code, message, traceId } : { code, message, traceId, details },
  };
}
