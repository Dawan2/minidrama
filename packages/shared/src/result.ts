/**
 * `Result` is the return convention for every fallible boundary in this repository — the
 * platform bridge above all (`docs/architecture/system-overview.md` §4.2: "every bridge method
 * returns a `Promise<Result<T, BridgeError>>`, never throws").
 *
 * The TikTok SDK is callback-shaped (`success` / `fail` / `complete`) and its error payloads are
 * undocumented (`docs/design/minis-integration.md` U-05). Forcing every call through `Result`
 * means an unrecognised failure shape degrades to a typed error instead of an unhandled rejection.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
