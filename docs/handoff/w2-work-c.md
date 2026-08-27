# Handoff — Wave 2, Work Slot C: webhook verification and the identity/platform-tiktok skeleton

> **Branch:** `cursor/w2-work-c-5101`, cut from `cursor/w1-repo-skeleton-e7c9`.
> **Scope:** fail-closed TikTok Minis webhook verification, plus the first two server modules it
> belongs to. It closes U-07 / blocker B-2 in code.
> **Not in scope:** fulfilment, wallets, orders, the real OAuth code exchange, any datastore.
> No pull request was opened.

---

## 1. What this slot closes

Blocker **B-2** ("webhook signature algorithm and field list unconfirmed") was the reason
`docs/design/minis-integration.md` §6.2 specified a *replaceable verifier interface* instead of a
verifier. The W1 research branch `cursor/w1-research-official-bb4f` closed the algorithm half of it
(`docs/research/tiktok-minis-official.md` §6.3, from TikTok's "Webhooks Verification" page):

```
Tiktok-Signature: t=1633174587,s=18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66

1. split the header on ',', then each element on '='.  t = timestamp, s = signature
2. signed_payload  = t + "." + raw_request_body        ← the raw bytes, never a re-serialisation
3. local_signature = HMAC_SHA256(key = client_secret, message = signed_payload)
4. reject if local_signature != s
5. then reject if now - t falls outside an acceptable window (the IAP page suggests 5 minutes)
```

That is now implemented for real. The interface stays, because it is how the route is tested against
a known secret and how key rotation or a second webhook source arrives later — but it is no longer a
placeholder for an unknown algorithm.

The **field list** half of B-2 remains open as gap **G-R4**: the One Page documents `pay_type`, which
appears in no public reference. Everything below is built on the assumption that the envelope is
incomplete.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `server/src/modules/platform-tiktok/webhook-signature.ts` | The algorithm. Pure: no clock, no environment, no I/O |
| `server/src/modules/platform-tiktok/signature-verifier.ts` | The `SignatureVerifier` seam, the HMAC implementation, and the rejecting implementation used when no key is configured |
| `server/src/modules/platform-tiktok/credentials.ts` | The client key/secret pair, with the secret held in a closure |
| `server/src/modules/platform-tiktok/webhook-events.ts` | Envelope parsing, `content` parsing, idempotency key derivation |
| `server/src/modules/platform-tiktok/event-store.ts` | Raw-payload-first storage behind an async interface; in-memory implementation |
| `server/src/modules/platform-tiktok/routes.ts` | `POST /v1/payments/callbacks/tiktok` |
| `server/src/modules/platform-tiktok/identity-port.ts` | The single seam through which `identity` reaches TikTok |
| `server/src/modules/identity/routes.ts` | `POST /v1/auth/login` |
| `server/src/modules/identity/session.ts` | Session issuance |
| `server/src/contract.test.ts` | Enforces the "a documented path always has a handler" rule |
| `contracts/openapi.yaml` | The two new operations and their schemas, added additively |
| `.env.example`, `server/src/config.ts`, `packages/shared/src/errors.ts` | The timestamp window, and two error codes with producers |

### 2.1 Verification

Every gate was run on this branch and passed.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **276 passing, 0 skipped, 0 failing** — 92 app, 16 config, 8 shared, **160 server** (was 9) |
| Build | `pnpm build` | pass — `assets/index-*.js` 242.80 kB (78.07 kB gzipped), unchanged |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The client bundle is byte-for-byte unchanged: nothing in this slot is reachable from `app/`. No
`<video>` element was added, no player code was touched, and no existing test was weakened, skipped
or deleted.

### 2.2 Where the 151 new server tests go

They sum to 151; the remaining 9 of the 160 are the skeleton's own health, envelope and playback
tests, which were not modified.

| Group | Tests | Protects |
|---|---|---|
| `webhook-signature.test.ts` | 34 | The algorithm: header parsing, the HMAC definition recomputed independently, and every rejection path including stale and future timestamps |
| `webhook-routes.test.ts` | 32 | The wiring: raw bytes reaching the verifier, storage before parse, rejection before action, redelivery handling, and the absence of an oracle |
| `webhook-events.test.ts` | 21 | Envelope typing, forward compatibility with unknown fields, idempotency key derivation |
| `identity/routes.test.ts` | 17 | The fail-closed login path, provider and code validation, and failure-to-status mapping |
| `event-store.test.ts` | 16 | Raw-payload fidelity, single-claimant idempotency, header allow-listing, capacity bound |
| `signature-verifier.test.ts` | 8 | The seam: header casing, duplicated headers, and that a missing key produces refusal rather than a pass |
| `credentials.test.ts` | 7 | That the secret is unreachable through JSON, spread, inspection or enumeration, and still readable by the verifier |
| `config.test.ts` | 6 new | That the timestamp window cannot be turned into a formality by a bad value |
| `identity/session.test.ts` | 5 | Token opacity, unpredictability, and the absence of a refresh token |
| `contract.test.ts` | 5 | That every operation in `openapi.yaml` reaches a handler |

---

## 3. How "fail-closed" is actually enforced

The phrase is easy to write and easy to lose. Concretely, in this slot:

1. **There is no bypass.** No environment variable, no header, no configuration flag skips
   verification. `TIKTOK_WEBHOOK_TOLERANCE_SEC` widens or narrows the replay window and cannot
   disable the signature check; an unusable value (`0`, `-1`, a typo) falls back to 300 seconds
   rather than widening it.
2. **A missing signing key is a rejection, not a pass.** `createSignatureVerifier` returns a verifier
   that refuses everything when no secret is configured. A deployment that forgot the secret rejects
   real callbacks — which loses revenue loudly — instead of accepting forged ones, which loses more,
   silently.
3. **Rejection happens before anything is acted on.** No idempotency key is claimed and nothing is
   marked processed for a request that failed verification. There is a test asserting exactly that.
4. **Comparison is constant-time,** via `timingSafeEqual` on the decoded digests.
5. **The window is symmetric.** A timestamp far in the future is rejected as firmly as a stale one.
6. **The signature is checked before the timestamp,** which is the official processing order. The
   timestamp is inside the signed payload, so it cannot be slid without invalidating the MAC.
7. **The response is not an oracle.** Every authenticity failure — wrong secret, altered body,
   malformed header, missing header, stale timestamp, no key configured, another partner's client
   key — answers `400` with `PAYMENT_CALLBACK_INVALID_SIGN` and the same message, with no `details`.
   The reason goes to the log and to the stored record, where operators can see it and a prober
   cannot.

---

## 4. Decisions taken in this slot

Recorded so the next slot can overturn them deliberately rather than by accident. Numbering
continues from `docs/handoff/w1-skeleton.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S10 | **The client secret is never a field on `ServerConfig`** | That object is passed around and logged at boot. The secret lives in a closure reached through `signingKey()`, so no own property carries it and `JSON.stringify`, spread, `Object.values` and `util.inspect` cannot leak it. The existing `config.test.ts` assertion that a config never stringifies its secret keeps working, which is why it was worth respecting rather than editing | Additive; call sites are the verifier and the identity port |
| S11 | **The raw-body parser is registered inside the `platform-tiktok` plugin scope** | Fastify encapsulates content-type parsers per plugin, so the rest of the server keeps normal JSON parsing. A global raw-body parser would change every route's behaviour to serve one endpoint. There is a test asserting `/v1/playback/sessions` still parses JSON | One line, plus a decision about global scope |
| S12 | **The parser does not attempt to parse.** It captures bytes and hands the handler `undefined` | A parse error raised by the parser answers 400 *before* verification and before storage, which would discard an authentic payload we cannot yet interpret. Parsing happens in the handler, after the signature is settled | None |
| S13 | **Content type is not enforced.** Bytes are captured under any content type | Authenticity is decided by the HMAC. Refusing anything that is not `application/json` would reject a real payment event over a header the platform never promised. An unsigned `text/plain` body is still rejected — both cases are tested | One conditional in the handler |
| S14 | **`markRejected` does not clear `verified`** | "Authentic but uninterpretable" and "forged" are different incidents, and only the first one means our parser is at fault. Collapsing them would hide the case we most need to see when the field list changes | None |
| S15 | **Idempotency keys on `trade_order_id`, falling back to a digest of the raw payload** | `trade_order_id` is the platform's own identifier for the thing being fulfilled, and it is the key the billing slot's conditional `PAID → CREDITED` update will use. For an event type whose `content` we have never seen, a digest deduplicates byte-identical redeliveries and claims nothing more — it does not guess at semantic equality for a field set we do not have (G-R4) | Additive |
| S16 | **Framework-level 4xx keep their own status** instead of being flattened to 500 by the error handler | A 500 tells TikTok's sender that delivery failed, and it returns for 72 hours over a request we had already decided to refuse. This changes `server/src/app.ts` for every route, which is the one shared file this slot touches | One branch in the error handler |
| S17 | **The identity port refuses every exchange** | The HTTP call to `open.tiktokapis.com` is a later slot's. A stub returning a synthesised `open_id` would issue real sessions for arbitrary strings — a working authentication bypass under a green test suite. The port distinguishes "no credentials" from "not built yet" in its logs and reports neither to the caller | Replace one function |
| S18 | **The session token is opaque random bytes, not a JWT** | The JWT decision belongs with the session design. What is *not* a placeholder: the token is CSPRNG-generated and is not derived from `open_id`, both of which are tested, because a token that encodes the user identifier without a signature is a token an attacker can build | Additive |
| S19 | **`contracts/openapi.yaml` gained a test rather than a lint rule** | The skeleton stated that a documented path always has a running handler. It was a convention; it is now enforced by dispatching every documented operation against the real app | None |

---

## 5. Deliberately not built

Listed so nobody re-scopes it as an omission:

- **No fulfilment.** A verified, deduplicated event is stored with `processed: false` and nothing is
  credited. The wallet credit, the order state transition and the optional secondary verification via
  `/trade_order/query/` belong to the `billing` module. This is the single largest thing still
  missing between here and taking money.
- **No persistence.** `createInMemoryWebhookEventStore` forgets everything on restart, which is
  survivable only because TikTok retries for 72 hours. It is bounded at 1000 records so a flood
  cannot exhaust the heap. The Postgres `platform_webhook_event` table drops in behind the existing
  interface without touching a caller.
- **No real OAuth exchange, no token storage, no refresh loop.**
- **No `is_sandbox` handling.** The flag is parsed as part of `content` and acted on nowhere. It must
  be honoured before any revenue reporting exists: sandbox orders are excluded from settlement by the
  developer, not by the platform.
- **No alerting.** The rejection path logs at `warn` with a reason, which is what an alert would be
  built from, but `docs/design/api-contracts.md` §8 requires a counter and an alert on sustained
  verification failure and there is no metrics pipeline yet.
- **No subscription events.** None are published (U-08 / G-R6). Periodic full sync remains the plan.
- **Nothing has run against a real TikTok delivery.** Every byte in the tests is one this repository
  produced. See §7.

---

## 6. For the next slots

**For whoever implements fulfilment (`billing`).** The handler is deliberately shaped so you insert
one step: after `claimIdempotencyKey` returns `true`, and before the 200. Keep the 200 immediate and
keep it unconditional on your success — a non-200 is a failed delivery and starts the 72-hour retry
cycle. `webhookIdempotencyKey` already gives you `trade_order:<id>`; make your conditional
`PAID → CREDITED` update the real idempotency boundary and treat zero affected rows as
"already processed". Two platform rules that are not enforced anywhere yet and are yours:
`token_amount` must come from your own configuration and never from the client, and `is_sandbox`
orders must never count as production revenue.

**For whoever replaces the event store.** Implement `WebhookEventStore` against Postgres and pass it
to `buildApp`. `claimIdempotencyKey` is the only method whose semantics matter: it must be a single
atomic claim (a unique index and an insert, not a read-then-write), because the in-memory `Set` this
slot uses is atomic only by accident of the single-threaded runtime.

**For whoever implements the OAuth exchange.** Replace `createTiktokIdentityPort` and nothing else.
`identity` never sees a client secret and never builds a TikTok request, which is the property to
preserve. Access and refresh tokens stay inside the adapter; `POST /v1/auth/login` currently returns
exactly `accessToken`, `expiresInSec` and `openId`, and a test asserts no platform token appears in
the response.

**For whoever gets sandbox access.** The first thing to capture is a real delivery: the exact header
casing, the exact `content-type`, and one full body per event type. Add them as fixtures. The second
thing is to confirm the field list and close G-R4 — the stored raw payloads make that a replay rather
than a migration.

**For whoever registers the callback URL in the Developer Portal.** The path is
`/v1/payments/callbacks/tiktok`. It must be HTTPS, and the deployment behind it must have
`TIKTOK_CLIENT_SECRET` set or it will reject every delivery by design.

---

## 7. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover:

- **The algorithm is verified against the documentation, not against TikTok.** Every test vector here
  is self-generated: the tests prove that our verifier accepts what our own signer produces and
  rejects everything else. They cannot prove that our reading of the spec matches the sender. The
  ambiguities that a real delivery would settle:   whether `s` is ever uppercase (accepted either way),
  whether the header ever carries additional elements (unknown elements are ignored), and whether
  `create_time` and `t` are ever expected to agree (they are not compared).
- **The replay window is the only replay defence until the store is durable.** Inside 300 seconds, a
  captured request replayed to a freshly restarted process is a first delivery as far as the
  in-memory store is concerned. It would be stored and accepted — and, once fulfilment exists, that
  is a double credit. The durable store closes this, and it should land before fulfilment does.
- **`user_openid` is not cross-checked against the order.** Nothing yet exists to check it against.
- **Header capture is an allow-list of four names.** A future header carrying something we need for
  replay would be dropped silently. An allow-list was still the right default: a redaction list has to
  anticipate every header that might carry a credential, and only has to be wrong once.
- **The client-key check is skipped when no client key is configured.** In that state the endpoint has
  no signing key either, so it rejects everything anyway — but the two conditions are independent in
  the code and a future refactor could separate them.
- **`AUTH_PROVIDER_ERROR` is returned for a condition that will usually be ours.** A 502 for
  "not built yet" is the honest status once the exchange exists and is unreachable; today it is a
  slightly generous description of "unimplemented".
