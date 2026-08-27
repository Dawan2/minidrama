/**
 * One opaque token per purchase attempt (`docs/12-api-contracts.md` §2.4).
 *
 * The key is what makes pressing "try again" harmless: the server returns the order it already
 * holds for that key instead of opening a second thing the viewer can pay for. So a key must be
 * unguessable enough not to collide, and — far more importantly — it must be *reused* across the
 * retries of one attempt and never across two. That second half is the caller's job; this is only
 * the mint.
 *
 * `randomUUID` is feature-detected rather than assumed. It needs a secure context, and a mini app
 * loaded over anything but HTTPS in an old WebView would otherwise throw here, which would turn a
 * missing browser API into a purchase surface that cannot open at all. The fallback has less
 * entropy than a v4 UUID and enough for a value scoped to one account's keys.
 */
export function newIdempotencyKey(): string {
  const webCrypto: Partial<Crypto> | undefined = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return `unl_${webCrypto.randomUUID().replaceAll('-', '')}`;
  }

  return `unl_${randomHex(8)}${randomHex(8)}${String(Date.now().toString(36))}`;
}

function randomHex(digits: number): string {
  return Math.floor(Math.random() * 16 ** digits)
    .toString(16)
    .padStart(digits, '0');
}
