# Handoff — Wave 7, Client Authorization Header: the session the transport was missing

> **Branch:** `cursor/w7-work-auth-header-96d6`, cut from `cursor/w7-work-unlock-overlay-ec70` (`2c0cde3`).
> **Scope:** the client half of authentication. Silent login, an in-memory session store, and the
> `Authorization: Bearer` header on every API request that goes out of this app.
> **Not in scope:** nothing under `server/`, nothing in `app/tools/`, nothing in `contracts/`, and no
> screen. The favourites surfaces were not touched (another slot). **No branch was merged into this
> one and no pull request was opened.**

---

## 1. What this closes

The unlock overlay slot ended with one sentence in its §7 that made the whole feature unreachable:

> An order belongs to an account, the transport sends no `Authorization` header, and slot K answers
> an anonymous creation with `401 AUTH_REQUIRED`. The panel renders that as `SIGN_IN_REQUIRED` with
> no retry, which is correct and is also the only thing a viewer can currently reach.

So the funnel was: tap "Unlock" → `POST /v1/unlock/coin-orders` with no credential → `401` → "please
sign in", with no way to sign in. Every coin purchase in the app ended there.

That slot also said where the fix belonged — "inside `createHttpClient` — one place that attaches it
and one place that refreshes it — and both clients pick it up for free because they share the
transport" — and that is where it went.

**What this does not do is make a purchase succeed.** The client now presents a session when it has
one; the server still resolves every request to the anonymous viewer behind its `ViewerResolver`
seam (slot D's decision S28), and slot K's coin-order endpoints are on a different branch. The
honest description of this slot is: the client stopped being the reason a purchase cannot be
authenticated. §7 lists what has to land on the server side before the funnel actually opens.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `app/src/session/session-store.ts` | New. The in-memory session, and the gate a grant passes to become one |
| `app/src/session/silent-login.ts` | New. `runSilentLogin`: bridge code → exchange → store, plus the single-flight wrapper |
| `app/src/data/session-api.ts` | New. `POST /v1/auth/login`, and the narrowing of what comes back |
| `app/src/data/transports.ts` | New. Two transports and the rule that separates them |
| `app/src/data/http.ts` | `authToken` and `onCredentialRefused`; the header attached per attempt; a caller's `Authorization` dropped |
| `app/src/main.tsx` | Silent login in the boot sequence, where W2's comment said it would go |
| `app/src/testing/import-hygiene.test.ts` | Three source scans: no storage, no credential in a `console` call, no header assembled outside the transport |

Nothing outside `app/src/` and `docs/` is in this diff. No dependency was added, no lint rule was
relaxed, and no i18n key changed — this slot has no UI.

### 2.1 The flow

```
   boot: bridge.init()
            │
            ▼
   canIUse('login') ── no ──▶ PLATFORM_UNAVAILABLE. Signed out; nothing is called
            │ yes
            ▼
   bridge.login()  ── refused / timed out ──▶ PLATFORM_REFUSED. Signed out
            │ authCode (single-use, never logged)
            ▼
   POST /v1/auth/login   ── 401 / 400 ──▶ CODE_REJECTED   ┐
   (anonymous transport) ── 5xx / 502 ──▶ UNREACHABLE     ├ all signed out,
            │ 200                        ── malformed ──▶ │ no fallback identity
            ▼                               UNREACHABLE   ┘
   store.adopt(grant) ── unusable ──▶ SESSION_UNUSABLE. Signed out
            │ ok
            ▼
   SIGNED_IN ──▶ every request through `transports.http` carries
                 `Authorization: Bearer <token>`
                          │
                          └── 401 on a request that carried it ──▶ store.clear()
                                                                   (the next request is
                                                                    honestly anonymous)
```

Boot continues whatever the outcome. The catalogue is anonymous-capable, so a signed-out app still
shows content and only refuses to sell.

### 2.2 Fail-closed, stated as the four things that cannot happen

The brief's requirement was "no token = no fake user". Four separate places had to refuse for that
to hold, and each has its own tests:

| Where | What it refuses |
|---|---|
| `session-store.ts` | There is no way to construct a session. `adopt` is the only entrance and it takes what the server issued. No device id, no guest mode, no "assume signed in", and no `openId` that can exist without a token beside it |
| `silent-login.ts` | Every failure path returns an outcome and leaves the store empty. Nothing retries with a synthesised code, and nothing falls back to a remembered identity |
| `http.ts` | No token means **no header** — not `Bearer`, not an empty bearer, not a placeholder. A missing session reaches the server as a missing session, because the server is the only thing that can decide what an anonymous caller may have |
| `session-api.ts` | A `200` that is not a login response is a failure, not a value. `expiresInSec` in particular is never defaulted: inventing a lifetime for a credential the server described differently is a `401` in the middle of a purchase |

The mock bridge is the reason the third and fourth rows matter in practice. It hands out
`mock-auth-code` in browser development, and the exchange still has to be refused by the server —
which it is, today, by the unavailable identity port. Development therefore looks exactly like
production: signed out, with a panel that says so.

---

## 3. Decisions taken in this slot

Numbered `A*`, continuing the convention of `U*` for the unlock slot and `S*` for server ones.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| A1 | **The header is attached in `createHttpClient` and nowhere else** | One place to audit, one place to change when the token's lifecycle grows. A call site cannot forget the header, and — because a caller's own `Authorization` is dropped before the token source is consulted — cannot invent one either | One function; ~12 tests |
| A2 | **The token source is a function, asked once per attempt** | It does not exist yet when the client is built, and after login it can be dropped at any moment. A value captured at construction is `null` forever in the first case and stale in the second | One line |
| A3 | **The login exchange gets a transport built without a token source, not a per-request flag** | A session cannot be created by presenting one. A flag would say the same thing while handing every other call site an opt-out from authentication | Delete a client |
| A4 | **A `401` on a request that carried a token drops the session; a `401` on an anonymous one does not** | A refused credential is dead, and resending it turns one expiry into a purchase button that never works again. Restricting it to requests that actually presented something keeps a proxy's `401` on an anonymous catalogue read from signing the viewer out | One condition |
| A5 | **The drop is not a refresh-and-replay interceptor** | IA §8.2 asks for silent refresh plus one replay. Replaying the only `POST` this client makes is a second thing the viewer can be charged for (U4), and a replay layer that has to know which methods are safe is a bigger change than this slot | §7 |
| A6 | **The token is memory-only, and the store is the only thing that holds it** | Minis holds the access token in memory and re-runs silent login when it expires (`contracts/openapi.yaml`). Persisting it leaves a credential in a WebView's storage, outliving the session, for a refresh that costs nothing to redo — the platform can always issue a fresh `authCode` without asking the viewer anything | A source-scan test |
| A7 | **`openId` is stored next to the token or not at all** | A viewer identifier that survives a missing token is the fake user this slot exists to make unrepresentable. They are one variable, assigned once, so there is nowhere to put a half-session | One field |
| A8 | **A token is dropped a guard interval (5s) before its stated expiry** | A token that dies mid-flight is a `401` on a request the viewer already committed to — and when that request is the coin order, they are told to sign in immediately after tapping "Unlock". Half a request budget is comfortably under any plausible session lifetime and comfortably over the round trip it protects | One constant |
| A9 | **A grant whose lifetime is shorter than the guard is refused on arrival** | Adopting it would produce a store that reads as signed-out a moment later, with nothing logged. Refusing it gives the caller a reason (`EXPIRED_ON_ARRIVAL`) | One condition |
| A10 | **A token that cannot go in a header is refused before it is sent** | `\r\n` in a header assembled by hand is request splitting; through `fetch` it is a throw at the worst possible moment. Either way it is not a credential | One regex |
| A11 | **Silent login is single-flight** | The `authCode` is single-use. Two concurrent logins spend two codes and the second exchange fails, which would then be reported as "the platform rejected you" | One ref |
| A12 | **Boot awaits silent login, with a 5s budget of its own rather than the full 10s read budget** | A viewer who taps "Unlock" a second after boot must not be told to sign in while the login that would have worked is still in flight. The shorter budget is the other half of that trade: a misconfigured base URL must not hold the first paint for a full request timeout | One `await` |
| A13 | **The grant is rebuilt field by field, not cast** | A login response is the body where an extra field is most likely to be a secret. The platform token behind the exchange is not ours to hold, and slot C already asserts server-side that the response is exactly `accessToken`, `expiresInSec` and `openId` (`docs/handoff/w2-work-c.md`) — this is the client end of the same rule | One function |
| A14 | **Only the outcome is logged, never the code or the token** | A console inside a WebView is not a private place, and `contracts/openapi.yaml` says the `authCode` is never logged and never echoed. A source scan enforces it | A test |
| A15 | **The two-transport arrangement lives in `data/transports.ts`, not inline in `boot()`** | It is the kind of rule that survives review and then breaks quietly when someone passes the wrong client to `createSessionApi`. Outside the entry module it has tests instead of a comment | Inline it, and lose 7 tests |

---

## 4. Verification

### 4.1 Tests

56 new tests, all in `pnpm test`. App suite: **341 → 397**, nothing skipped.

| File | Tests | What they hold down |
|---|---|---|
| `session/session-store.test.ts` | 15 | An empty store has no token *and no user*; what `adopt` refuses; expiry, the guard, and that an expired token is dropped rather than hidden; that a refused grant does not disturb a good session |
| `session/silent-login.test.ts` | 11 | The happy path; a capability-less client is never called; five bridge failures mapped to two outcomes; a refused exchange; a provider fault grouped with a dead network; that a refused exchange never synthesises a session; single-flight |
| `data/session-api.test.ts` | 6 | The request shape; the three fields kept and everything else dropped; seven malformed bodies refused; a missing lifetime not defaulted; a refusal passed through with its trace id |
| `data/transports.test.ts` | 7 | The header on reads and writes; **no header on the login exchange even when a session is held**; the drop on `401` and the anonymous request after it; a `401` from the login endpoint not ending a good session; the shorter login budget |
| `data/http.test.ts` | +14 | 8 on attaching: the header on a `GET` and a `POST`, omitted with no session, no source, or a blank token, read per attempt, a caller's `Authorization` dropped in either casing. 6 on invalidation: a `401` on a read, on a write, and with an unreadable body; silence on an anonymous `401` and on every other status; and that no handler is required |
| `testing/import-hygiene.test.ts` | +3 | No storage API anywhere in the app; no credential in a `console` call; no `Authorization` assembled outside `http.ts` |

### 4.2 Defects injected

Every mutation was applied to the branch, the app suite run, and the mutation reverted.

| Defect injected | Tests failing |
|---|---|
| No `Authorization` header at all — the bug this slot exists to fix | 4 |
| Honour a caller-supplied `Authorization` header | 2 |
| Send an empty bearer instead of no header | 1 |
| Read the token once at construction instead of per attempt | 1 |
| Invalidate the session on any `401`, including an anonymous read | 1 |
| Keep sending a token the server refused | 3 |
| Ignore expiry when handing out the token | 3 |
| Drop the expiry guard, so a token may die mid-request | 1 |
| Accept a token that cannot go in a header | 3 |
| **Invent an `openId` when the grant has none (a fake user)** | 1 |
| Accept a grant with no usable lifetime | 2 |
| Default an absent `expiresInSec` to an hour | 2 |
| Cast the login body instead of rebuilding it | 1 |
| Spend an `authCode` even when a session is already held | 2 |
| Call `login` without checking the capability | 1 |
| Report a signed-out app as signed in when the exchange fails | 3 |
| **Adopt a locally minted session when the server refuses the code** | 4 |
| Let concurrent callers each spend a code | 1 |
| Persist the token so the viewer stays signed in | 1 |
| Log the grant while debugging | 1 |
| Give the login exchange the session too (a session creates a session) | 1 |
| Never drop a refused session | 2 |
| Ignore the login timeout, so boot can hold the first paint | 1 |
| Merge the token *before* the caller's headers | **0** |

The two bold rows are the brief's requirement, and they fail loudly.

**The survivor is a real finding and it is not a coverage gap.** Merge order and the
caller-`Authorization` strip are two guards over the same thing: with the strip in place, reversing
the merge order changes no observable behaviour, and with the order intact, removing the strip is
caught by two tests. Disabling either one alone leaves the other standing. The order is kept because
it is the correct expression of "the transport decides", not because it is currently load-bearing —
and if `withoutAuthorization` is ever removed, the mutation above stops surviving.

### 4.3 Against a running server

The unlock slot's §4.3 flagged "not verified against a running server" as its first gap. This slot
ran `server/` on `:8099` (`PORT=8099 pnpm --filter @minidrama/server start`) and drove the real
modules — `createTransports`, `createSessionApi`, `createSilentLogin`, `createSessionStore`,
`MockBridge`, and the unlock and catalogue clients — against it.

| Observation | Result |
|---|---|
| `POST /v1/auth/login` with the mock bridge's code | `502 AUTH_PROVIDER_ERROR` — the identity port refuses every exchange until the real HTTP call lands |
| Silent login outcome | `UNREACHABLE`, and **`bearerToken()` and `session()` both `null`** |
| The catalogue afterwards | `GET /v1/recommendations/feed` returned 2 cards, with no `Authorization` header sent |
| `POST /v1/unlock/coin-orders` | `404 COMMON_RESOURCE_NOT_FOUND` — slot K's endpoints are on another branch |
| Headers actually on the wire | `/v1/auth/login`, `/v1/recommendations/feed` and `/v1/unlock/coin-orders` all sent none, because there was no session |

Because no server in this repository can issue a session yet, the signed-in half was driven against
a loopback API implementing `LoginResponse` from `contracts/openapi.yaml` verbatim:

| Observation | Result |
|---|---|
| Silent login | `SIGNED_IN`, session `{ openId: 'open_probe', expiresAtMs: … }` |
| `POST /v1/unlock/coin-orders` | Received with `Authorization: Bearer tok_loopback_1` |
| The login request itself | Received with **no** `Authorization`, with a live session held |
| After the API answered `401 AUTH_TOKEN_EXPIRED` | `bearerToken()` became `null` |
| The next request | Sent with no `Authorization` at all, rather than replaying the refused token |

The probe script was not committed.

### 4.4 Gates

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **762 passing, 0 skipped, 0 failing** — 397 app (was 341), 338 server, 16 config, 11 shared |
| Build | `pnpm build` | pass — `index-CfNFBRKv.js` 280.20 kB (88.94 kB gzipped), `index-C9-CfGp4.css` 5.53 kB unchanged |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle grew 2.82 kB raw / 0.96 kB gzipped over the unlock slot's `277.38 kB / 87.98 kB`. The CSS
hash is unchanged, which is the expected shape of a slot with no UI.

---

## 5. Deliberately not built

- **No refresh-and-replay interceptor.** IA §8.2 wants `AUTH_TOKEN_EXPIRED` handled globally with a
  silent refresh and at most one replay. This slot drops the dead token and stops (A5). The replay
  is the part that needs care, not the refresh: the one `POST` here opens a payment.
- **No re-login after boot.** `createSilentLogin` is exactly the seam — single-flight, idempotent
  when a session is held — and nothing calls it a second time. A session that dies mid-visit stays
  dead until the next cold start.
- **No sign-in affordance anywhere.** The unlock panel still renders `SIGN_IN_REQUIRED` with no
  retry, which is unchanged behaviour and still correct: today there is nothing a viewer can do that
  a re-login would not do silently. Giving that state a button is a UI change with copy in two
  locales, and it belongs with the re-login above.
- **No explicit authorization and no profile.** `bridge.authorize` is still called by nothing;
  `GET /users/me` does not exist. `openId` is stored and read by no surface.
- **No sign-out, no account screen, no ban state.**
- **No server change.** The server still answers every request as the anonymous viewer (S28), so a
  header grants nothing today. That is deliberate and it is the next slot's work, not something to
  paper over from the client.
- **No favourites and no watch progress.** Untouched, and in flight elsewhere.

---

## 6. On not merging

Nothing was merged. This branch is `cursor/w7-work-unlock-overlay-ec70` plus two commits, and it
touches no file that slot K, W14 or the favourites slots are likely to be editing: four new modules,
plus `http.ts`, `main.tsx` and one test file.

`packages/shared/src/errors.ts` did **not** need to change. `AUTH_REQUIRED`,
`AUTH_TOKEN_EXPIRED` and `AUTH_PROVIDER_ERROR` were already there, and the unlock slot's
`refusedOrder` already maps the first two to `SIGN_IN_REQUIRED` — so the panel's copy for a missing
session was written before there was a session to miss, and needed no edit now that there is.

The login wire shapes in `data/session-api.ts` are read from `contracts/openapi.yaml` and from
`server/src/modules/identity/routes.ts`, not re-exported from either. The server's `Session` carries
things the client has no business holding, and the contract is the thing both sides agreed on.

---

## 7. For the next slots

**For whoever lands the server's auth guard (the blocker).** The client now presents
`Authorization: Bearer <opaque>` on every business request, and the server still resolves every
request to the anonymous viewer. Until that changes, a coin order authenticated by this slot is
still refused. Two things to get right, both already documented as open on the server side: the
session token is opaque random bytes with **no verification path** (W2-C decision S18), so a guard
that trusts the string is the authorization bypass S28 refused to write; and `createSessionIssuer`
does not store what it issued, so there is nothing to verify against yet. The order of work is a
session record first, then a `ViewerResolver` that reads it, then the unlock grant.

**For whoever integrates slot K.** The `401 AUTH_REQUIRED` path is now reachable *and* recoverable
in principle: a signed-in viewer gets a header, and a refused token is dropped. What is not built is
the re-login that would make the drop useful mid-visit (§5). If K's `422 UNLOCK_POLICY_NOT_ALLOWED`
and `409 UNLOCK_ALREADY_UNLOCKED` are exercised for the first time against a real session, note that
the panel's classification reads the error code before the status, so a bare status will land in
`REFUSED`.

**For whoever builds the `AUTH_TOKEN_EXPIRED` interceptor.** The two hooks are already there:
`authToken` reads the current token per attempt, and `onCredentialRefused` fires on a `401` that
carried one. A refresh is `createSilentLogin`'s function, which is already single-flight, so the
interceptor's real work is deciding what may be replayed. Suggestion, from U4: replay `GET`s at most
once, never replay a `POST`, and let the panel's existing `SAME_KEY` retry advice carry the write —
the idempotency key is what makes the viewer's own second press safe, and an automatic one has no
such guarantee.

**For whoever adds a sign-in affordance.** The panel's `SIGN_IN_REQUIRED` state is the place, and
the copy already exists in both locales. What it needs is a `retry` that runs silent login and then
re-runs the order with the same key. Worth knowing that the platform's silent login needs no viewer
interaction, so the honest button is "try again" rather than "sign in".

**For whoever measures the boot budget.** Silent login is now one serialized request between
`bridge.init()` and the first paint, capped at 5s (A12). Nobody has measured what `TTMinis.login()`
plus an exchange actually costs on a real device. If it turns out to be slow, the fix is not to
lower the cap but to render the catalogue while the login resolves and gate only the purchase path
on it — the machinery for that is the same promise `boot()` already holds.

**For whoever persists anything.** `import-hygiene.test.ts` now fails on `localStorage`,
`sessionStorage`, `indexedDB` and `document.cookie` anywhere in `app/src/`. That rule is about
credentials (A6); if a later slot needs to persist something harmless — a locale preference, an
unlock intent across a recharge sheet (PNL-03) — the test needs a permit list entry with a reason,
and the token must not be in it.

---

## 8. Known gaps in this slot's own work

- **No server in this repository can issue a session**, so the signed-in half was proven against a
  loopback API implementing the documented contract, not against `server/` (§4.3). The refused half
  *was* proven against the real endpoint.
- **The `401` → drop → re-login loop is only two thirds built.** The token is dropped and nothing
  re-acquires one until the next boot (§5).
- **Every cold start spends an `authCode`**, including one that is about to be refused. There is no
  memory of "the exchange failed a second ago", so a viewer on a broken network pays for one bridge
  call and one request per launch.
- **The 5s expiry guard and the 5s login budget are both guesses.** The first is derived from the
  request timeout, the second from wanting to be under it. Neither was measured.
- **`main.tsx` has no test.** There is no harness for the entry module in this repo, so the boot
  sequence is asserted indirectly: `transports.test.ts` covers the arrangement it composes and the
  probe in §4.3 ran the same construction against a real server.
- **A `403` is not treated as a credential problem.** Only `401` invalidates. If a later server
  answers an expired session with `403`, the client will keep presenting the dead token.
- **`openId` is stored and used by nothing**, so the only thing proving it is carried correctly is a
  unit test.
- **The store is not observable.** Nothing can subscribe to "signed in" / "signed out", so no
  surface can react to the session changing. A React context for it is the obvious next step and was
  not needed by anything in this slot.
- **A caller's `Authorization` is dropped silently.** No warning, no throw. The source scan is what
  catches it in review, and the scan only covers `app/src/`.
- **One mutation survives** (§4.2), because two guards overlap. Documented rather than removed.
