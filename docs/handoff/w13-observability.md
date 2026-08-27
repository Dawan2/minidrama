# Handoff — Wave 13: request id + structured JSON logs

> **Slot:** W13, work slot (`bc-dd5c69d1`).
> **Branch:** `cursor/w13-work-observability-72c4`, cut from `origin/main` at `58abb3e`.
> **Item:** C2 observability (`OBS-001` without a vendor backend, plus `SRV-006` redact). W10 found
> the error envelope already stamped `req_*` and Fastify already printed JSON, and nothing asserted
> that those were the same id.
> **Not in scope:** OpenTelemetry, Sentry, Grafana, Datadog, Prometheus, a `/metrics` endpoint,
> remaining in-memory stores (T14/T16), wallet UI, CI L2. No pull request.

---

## 1. What was picked, and why

C2 assigned observability. W10 (`docs/verify/cycle-2-report.md` §0) marked the exit condition
"traceId 端到端贯通" as met for the error envelope, and in the same report called observability
otherwise at zero besides ad-hoc logs. `OBS-001` wants the id in the application log, the error
body, and a trace backend, with an end-to-end assertion. A vendor APM is the third of those three
and is refused here.

The smallest named slice is the two we own: a request id that is the same value in the JSON log,
the error envelope, and the `x-request-id` response header, plus pino redact so a credential that
lands on a log line is unreadable (`SRV-006`, `docs/14-security.md` §6.1).

Cycle-3 named items on the board at pick: wallet UI and CI L2 were in flight; unlock sqlite had
just landed. Remaining in-memory stores were out of scope. D9 is still the cheapest unblocked
client item and a different file set.

---

## 2. What changed

### 2.1 Request identity

`server/src/core/logging.ts`. Fastify is told `requestIdHeader: false` so an inbound value is
validated rather than copied as-is. A usable `x-request-id` or legacy `request-id` (8–128 of
`[\w.-]`) is honoured, including a ULID of the shape `docs/12-api-contracts.md` §2.5 uses as an
example. Anything else — empty, short, spaced, quoted, a newline, oversized — is ignored and a
`req_` + UUID is minted. `Math.random` is gone.

`onSend` echoes `x-request-id` on every response, including CORS refusals and 2xx, which have no
error envelope to carry the id.

### 2.2 Structured JSON logs

The logger is still pino, still JSON, now constructed in one place so tests can capture the
stream. Fastify's default request serializer omits headers, which would make redact a no-op on
the line operators read. The serializer therefore includes headers; the redact list strips the
credentials.

A request that 404s produces three names for one id: `reqId` on `incoming request` / `request
completed`, `error.traceId` in the body, `x-request-id` on the response. A test asserts they are
equal.

### 2.3 Redaction (`SRV-006`)

`authCode`, `accessToken`, `refreshToken`, `clientSecret` / `client_secret`, `password`,
`authorization`, `req.headers.authorization`, `req.headers.cookie`, and
`req.headers["tiktok-signature"]`, plus the one-nest `*.` copies. Censor is `[Redacted]`. Tests
log the original and assert it is absent from the dumped line.

Login is asserted through the assembled app: `POST /v1/auth/login` with a secret `authCode`
answers 502 (unwired identity port) and neither the body nor any log line contains the code.

### 2.4 CORS, so the client can send and read the id

`x-request-id` is on the request allowlist and on `Access-Control-Expose-Headers`. A 2xx is
otherwise unreadable from the WebView. The origin check is unchanged; a stranger still learns
nothing about which headers an allowed origin may send.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/src/core/logging.ts` | Request id, logger options, redact paths, echo hook |
| `server/src/core/logging.test.ts` | 27 tests: mint / honour / reject, JSON shape, redact, assembled correlation |
| `server/src/app.ts` | Wires the logger, `genReqId`, `logDestination` for tests |
| `server/src/app.test.ts` | 404 envelope id equals the response header |
| `server/src/core/origin-policy.ts` | Allow and expose `x-request-id` |
| `server/src/core/origin-policy.test.ts` | Preflight may ask for it; expose-headers on ALLOWED |
| `server/src/core/cors.test.ts` | Assembled expose-headers |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | No OpenTelemetry, Sentry, Grafana, or Prometheus | `OBS-001`'s third site is a vendor backend. The assignment forbids a vendor APM. The two sites we own are the log and the envelope |
| D2 | Validate inbound ids in `genReqId`, do not use Fastify's `requestIdHeader` | The default copies the header as-is. A newline in `x-request-id` is a second log line |
| D3 | Echo the header on 2xx, not only on errors | Success has no envelope. CORS expose-headers is what makes that visible in the WebView |
| D4 | Include headers on the request serializer, then redact | Default pino-http omits them. A redact list that never fires is the C1 guardrail pattern |
| D5 | Unset `logDestination` is stdout | Tests capture; a deployment does not write a file |

---

## 5. Mutations

**Drop `authCode` from `REDACT_PATHS` and log `{ authCode: 'code_do_not_log_this_value' }`:**

```
FAIL  redacts authCode so the original never appears in the line
AssertionError: expected '…code_do_not_log_this_value…' not to contain 'code_do_not_log_this_value'
```

**Stop honouring inbound `x-request-id`:** the assembled test that supplies `req_from_the_client_01`
expects that exact string on the envelope, the header, and `reqId`.

**Stop echoing the header:** `app.test.ts` 404 and the 2xx health case fail.

---

## 6. Verification

`pnpm verify` green on this branch. `origin/main` then moved to `18fa6d4` (wallet UI + L2 G2.8
license job). Merged; no overlap — those files are `app/src/wallet`, `app/src/routes/WalletPage`,
`.github/workflows/l2.yml`, `packages/quality`. Server tests 1,390 (the 28 this slice added:
27 in `logging.test.ts`, one preflight case). App tests 857 are the wallet landing, not this
slice. Guardrails passed against `app/dist`. Bundle `index-CQnFIqTJ.js` 318.14 kB (gzip 98.12 kB)
— the wallet screen, not this change.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 51 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,390 |
| `app` | 857 |
| **Total** | **2,380** |

---

## 7. Left open

- **`OBS-001` trace backend.** Grafana Cloud / OTLP is the third site. Not this slice.
- **Sentry, `/metrics`, readiness vs liveness.** `/health` is still `{ status: 'ok' }`.
- **Client sending `x-request-id`.** CORS now allows it. No product caller sets it yet; the
  client already surfaces `error.traceId` on unlock failures.
- **C3-05 D9.** Still the cheapest unblocked client item. Different files.
- **Remaining in-memory stores.** Orders and webhook events are the other two C3-06 named as
  severe. Not this slot (T14/T16).

Wallet UI landed on `main` as `8a2b1aa` while this slot ran. L2 G2.8 landed as `bc49847`. This
branch has taken both; the files do not overlap.
