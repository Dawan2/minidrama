# Handoff — Wave 12, Silent Re-login: the other two thirds of the `401` path

> **Slot:** W12, work slot. **Branch:** `cursor/w12-work-silent-login-97cf`, cut from `main` at
> `d830d1d` ("Record the W12 merge: the unlock-grant tail is on main…").
> **Scope:** what the client does after the server refuses its token. A bounded automatic re-login,
> and the transport hook that makes the bound mean something.
> **Not in scope:** nothing under `server/`, nothing in `contracts/`, nothing in `app/tools/`, no
> screen, no copy, no dependency. **No branch was merged into this one and no pull request was
> opened** (`docs/plan/wave-protocol.md` §8 rule 3).
> **Predecessor:** `docs/handoff/w7-work-auth-header.md` (decisions `A*`), whose §5 and §8 name this
> gap. Its §7 paragraph "For whoever builds the `AUTH_TOKEN_EXPIRED` interceptor" is the brief.

---

## 1. What this closes

C3 landed the first third of a three-part path and its own integration note said so
(`docs/handoff/w9-integrate-c3.md` §3.1, `w7-work-auth-header.md` §8):

> **The `401` → drop → re-login loop is only two thirds built.** The token is dropped and nothing
> re-acquires one until the next boot.

So the behaviour on `main` was: a session expires mid-visit → the next request is answered `401` →
the dead token is dropped → and that is the end of it. Every later request goes out anonymous for the
rest of the visit. The favourites screen empties, the unlock panel renders `SIGN_IN_REQUIRED`, and
the client sits there signed out while holding everything it needs to sign itself back in without
asking the viewer for anything: `createSilentLogin` was already built, already single-flight, and
already had exactly one caller — boot.

This slot gives it a second caller. After this branch:

| | Before | After |
|---|---|---|
| Request that presented an expired token | `401`, token dropped | `401`, token dropped |
| The request after it | anonymous, and every one after that | carries a freshly acquired session |
| The refused request itself | not repeated | **not repeated** — unchanged, and deliberate |
| A server that refuses every token it issues | one login per visit | at most three logins, then it stops |

The middle row is the feature. The last row is the reason the feature is more than three lines.

---

## 2. What was delivered

| File | Change |
|---|---|
| `app/src/session/session-recovery.ts` | New. The policy: may another login run now, and what happened when it did |
| `app/src/session/session-recovery.test.ts` | New. 18 tests, including the loop this exists to make impossible |
| `app/src/session/silent-login.ts` | A named `SilentLogin` type for the shared login. No behaviour change |
| `app/src/data/http.ts` | `onCredentialAccepted`, the mirror of `onCredentialRefused` |
| `app/src/data/transports.ts` | Split into `createLoginTransport` and `createSessionTransport`; the session transport now re-acquires as well as dropping |
| `app/src/data/transports.test.ts` | Rewritten around the two builders; the refusal assertions kept, one replaced, six added |
| `app/src/data/http.test.ts` | Six tests for the accepted-credential hook |
| `app/src/main.tsx` | The four-call boot wiring, in dependency order |

Nothing outside `app/src/` and this document is in the diff.

### 2.1 The path, end to end

```
  a request goes out carrying `Authorization: Bearer <token>`
            │
      ┌─────┴───────────────────────────┐
      │ 2xx                             │ 401
      ▼                                 ▼
  onCredentialAccepted            onCredentialRefused
      │                                 │
      ▼                          ┌──────┴──────┐
  budget := max                  │             │
  (the credential works,         ▼             ▼
   so forgive the attempts   store.clear()   recovery.credentialRefused()
   before it)               (the next request  (not awaited: the refused
                             is honestly        request is answered as the
                             anonymous)         failure it is)
                                                     │
                              ┌──────────────────────┼───────────────────────┐
                              ▼                      ▼                       ▼
                      an attempt is         budget spent, or a          budget available
                      already running       platform with no login
                              │                      │                       │
                              ▼                      ▼                       ▼
                      ATTEMPT_IN_FLIGHT     BUDGET_SPENT /            createSilentLogin()
                      (spends nothing)      NO_PLATFORM_LOGIN         (single-flight, so a
                                            (calls nothing;            viewer's tap joins it)
                                             signed out is a                  │
                                             state the product          ┌─────┴─────┐
                                             already renders)           ▼           ▼
                                                                   REACQUIRED   STILL_SIGNED_OUT
                                                                        │
                                                                        ▼
                                                          the *next* request carries it
```

### 2.2 The three refusals this module is made of

Everything here is a "no" rather than a feature, which is why it is 170 lines of which most are
prose:

| It refuses to | Because |
|---|---|
| replay the refused request | The only `POST` this client makes opens a payment (`http.ts` rule 4). An automatic second attempt is a second thing the viewer can be charged for; a viewer's own second press carries the same `Idempotency-Key`, which is what makes *that* one safe |
| retry without a bound | A `401` provokes a login and a login is followed by a request that can be answered `401`. That is a loop, and a delay between the turns only slows it down |
| count logins as progress | A server that issues tokens and then refuses them keeps every login successful. A budget reset by a successful login would bound nothing at all |

The third row is the whole reason `onCredentialAccepted` exists. The only honest evidence this client
gets that its credential works is a `2xx` on a request that presented one, so that — and nothing else
— refills the budget.

---

## 3. Decisions taken in this slot

Numbered `R*`, continuing the convention (`A*` the auth-header slot, `U*` unlock, `S*` server).

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| R1 | **A `401` on a request that carried a token re-acquires a session, and does not replay the request** | The half of IA §8.2 that is safe here. The replay is the part that needs care, not the refresh — see §2.2 row 1 and A5 | One line in `transports.ts` |
| R2 | **The re-acquire is bounded by a budget of attempts, not by a delay or a timer** | A rate limit still loops; it just loops slower, forever, spending a bridge call and a `POST` per turn. A finite budget stops | One condition |
| R3 | **The budget is refilled only by a `2xx` on a request that carried a token** | The alternatives are both wrong: refill on a successful login and a token-refusing server loops forever with every login "succeeding"; refill on nothing and the budget is a lifetime cap that a long visit with three expiries in it exhausts for good | The new hook, ~4 lines in `http.ts` |
| R4 | **Three attempts** | One for the case this exists for, and two because the attempt travels over the network that just proved it can fail. Not a tuned number — the property that matters is that it is finite, which is more than IA §8.2 says anywhere | One constant |
| R5 | **`PLATFORM_UNAVAILABLE` gives up permanently, not just for one unit of budget** | There is no `login` on this client version, or the bridge never initialised. That is a property of the runtime, and a `401` is not evidence it has changed. Retrying means a bridge call per refused request for a capability that will not appear | One flag |
| R6 | **A `PLATFORM_REFUSED` does not** | A cancelled or timed-out SDK call can work on the next attempt, so it costs a unit of budget like any other failure | One condition |
| R7 | **Refusals that arrive while an attempt is running join it and spend nothing** | A session that expires with four panels on screen is four `401`s and one event. Queueing them spends four single-use `authCode`s, three of which fail and get reported as "the platform rejected you" | One ref |
| R8 | **A refusal that finds a session already held costs nothing** | `ALREADY_SIGNED_IN` means no code was spent and no exchange was made. It happens when a request that was already on the wire with the old token is refused after a newer attempt installed a session — a burst of those must not exhaust the budget for a session that is fine | One branch |
| R9 | **`credentialRefused` never rejects** | The transport calls it from inside a `401` handler and discards the promise, so a rejection becomes an unhandled one — in a WebView, where nobody sees it and the app is already in its least happy state. A thrown login is charged to the budget like a failed one | A `try`/`catch` |
| R10 | **The recovery holds no session store** | Dropping the dead token belongs to the transport that presented it; installing a new session belongs to `adopt`. What is left is pure policy, testable with a stub login and no store at all | One dependency |
| R11 | **The viewer's own sign-in (`SignInPrompt`) runs the login directly, bypassing the budget** | The bound exists because an automatic retry has nothing to stop it. A tap is the thing that stops this one. It is still the same single-flight login, so a tap landing during a `401`-driven attempt joins it rather than spending a second code | Nothing; it is the absence of a call |
| R12 | **`transports.ts` is two builders rather than one factory, and `createTransports` is gone** | The dependency runs login transport → silent login → recovery → session transport, and each of those takes what the one before produced. A single factory building both ends would have to be handed a callback that closes over a variable it also fills in — a mutable slot, in the module whose job is to make the arrangement assertable (A15) | Reinstate a wrapper; 4 call sites in `main.tsx` |
| R13 | **`recovery` is a required option on `createSessionTransport`, not an optional hook** | Optional would make "drop the token and never get another one" the default, which is the state C3 shipped by accident and nobody noticed for two cycles | One `?` |
| R14 | **Only the outcome is logged** | A `SessionRecoveryResult` carries an outcome, a status, a trace id and a rejection reason and never a credential — but the log line takes the outcome anyway, because a console in a WebView is not a private place (A14). A test asserts the reported result contains no token | A test |

---

## 4. Verification

### 4.1 Gates

Every gate was run on this branch, from a clean `pnpm install`.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **2,167 passing, 0 skipped, 0 failing** |
| Build | `pnpm build` | pass — `index-DGWHgxN1.js` 307.15 kB (95.53 kB gzipped), CSS 10.23 kB unchanged |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

| Package | Files | Tests | Change |
|---|---:|---:|---|
| `server` | 53 | 1,314 | — |
| `app` | 55 | 757 | **+1 file, +30 tests** |
| `packages/shared` | 4 | 51 | — |
| `packages/config` | 3 | 45 | — |

### 4.2 The tests, and what each file holds down

| File | New | What they hold down |
|---|---:|---|
| `session/session-recovery.test.ts` | 18 | The policy. A refusal re-acquires; concurrent refusals fold into one attempt; the budget drains, stops and refills; `PLATFORM_UNAVAILABLE` gives up for good; a login that throws does not become an unhandled rejection; the reported result carries no credential |
| `data/transports.test.ts` | 6 | The wiring. A refused token is dropped **and** a login runs; the next request carries the new token; the refused request is not repeated; the caller is answered before the login settles; a `401` on the login exchange or on an anonymous read provokes nothing; an accepted authenticated request refills the budget |
| `data/http.test.ts` | 6 | The new hook. It fires on a `2xx` that carried a token, including a `204` write (above the shortcut) and a `2xx` with an unreadable body; it stays quiet on an anonymous `2xx` and on every refusal; it is optional |

One test was **replaced** rather than added, and it is the one a reader of the old file will look for:
`sends no header on the request after a refusal` asserted the thing this slot exists to stop being
true. Its successor asserts the same request, with the new expectation —
`sends the re-acquired session on the next request`.

The test that carries the most weight is `cannot loop against a server that issues tokens and then
refuses them`: twelve refusals, a login that always succeeds, and exactly three logins. That is the
case a budget reset by "the login worked" would pass while looping forever in production.

### 4.3 Mutation checks

Each of these was applied to the source, the three suites were run, and the source was restored. All
eight were caught, which is what makes the numbers in §4.2 mean something:

| Mutation | Caught by |
|---|---|
| The `401` handler drops the token and does not re-acquire | 3 tests |
| The transport awaits the login before answering its caller (the replay this refuses) | 1 test |
| `onCredentialAccepted` is never called | 4 tests |
| The budget check is removed — retry forever | 5 tests |
| The budget is refilled by a successful login instead of an accepted request | 2 tests |
| Concurrent refusals each start their own attempt | 1 test |
| A login that throws is rethrown out of the `401` handler | 3 tests |
| `PLATFORM_UNAVAILABLE` does not give up | 2 tests |

### 4.4 Observed against a real server

`main.tsx` still has no harness (`w7-work-auth-header.md` §8), so the composition was driven from a
throwaway script against a loopback `node:http` server implementing `LoginResponse` from
`contracts/openapi.yaml`, with the real `createLoginTransport` / `createSilentLogin` /
`createSessionRecovery` / `createSessionTransport` and a stub bridge. The script was **not**
committed. What the server saw:

| Step | Observed |
|---|---|
| Boot | `SIGNED_IN`; read with `tok_1` → `200` |
| Server rotates the session away | read with `tok_1` → `401` |
| Immediately after | one login (anonymous, as always), then read with `tok_2` → `200` |
| Server then refuses every token it issues | `tok_2`, `tok_3`, `tok_4`, `tok_5` refused — **four** logins, then `BUDGET_SPENT` |
| Every request after that | sent with **no** `Authorization` at all, and no further login attempted |
| Every `/v1/auth/login` request, throughout | carried no `Authorization` (A3 holding live) |

Four rather than three in the pathological phase because the successful read in the row above it
refilled the budget — which is R3 doing exactly what it is for, visible in the recovery log:
`REACQUIRED (attemptsLeft=2)`, `REACQUIRED (attemptsLeft=2)`, `(1)`, `(0)`, `BUDGET_SPENT`.

---

## 5. Deliberately not built

- **No replay, of anything.** Not even a `GET`. `w7-work-auth-header.md` §7 suggested replaying reads
  at most once, and it is a reasonable next step — but a replay layer has to know which requests are
  safe to repeat, and the value of doing it inside the transport is small: every surface that reads
  already has a retry, and after this slot that retry finds a session waiting for it. The one call
  that would genuinely benefit is the coin order, and that is the one call that must never be
  repeated automatically.
- **No sign-in affordance change.** `SignInPrompt` already runs `session.signIn()` on a tap and is
  untouched. Its copy is right either way: silent login needs no viewer interaction, so the honest
  button is "try again".
- **No weak-network banner.** IA §8.2 wants one after two consecutive failures. `onRecovery` is now a
  place a banner could be driven from, and a banner is a UI change with copy in two locales.
- **No observable session.** Nothing can subscribe to "signed out", so no surface re-renders when a
  re-acquire succeeds; a screen that failed while signed out still needs its own retry to notice.
  Unchanged from `w7-work-auth-header.md` §8, and the reason the re-acquire buys the *next* request a
  session rather than fixing the screen in front of the viewer.
- **No `403` handling.** Only `401` is treated as a credential problem. If a later server answers an
  expired session with `403`, the client keeps presenting the dead token. Unchanged, and still worth
  fixing on the server side rather than by guessing here.
- **No delay between attempts.** Three attempts back to back, with no backoff. Adding one would need
  a clock injected into a module that currently has no time in it, and the budget is what makes the
  absence of a delay safe.
- **No server change.** Nothing about the server's refusal behaviour was touched or needed.

---

## 6. On not merging

Nothing was merged into this branch. It is `main` at `d830d1d` plus one commit, and it touches five
existing files:

- `data/http.ts` and `data/http.test.ts` — additive. One new option, one `if` restructured into two
  branches of the same condition. The A7 collision this file caused in C3 (§3.1 of the integration
  note) is not repeated here: the `401` check keeps its position above the `204` shortcut, and the
  new call sits inside it for the same reason.
- `data/transports.ts` and `data/transports.test.ts` — the only structural change, and the one to look
  at in a conflict. `createTransports` is gone; a branch that still calls it wants
  `createLoginTransport` + `createSessionTransport`, in that order, with a recovery in between.
- `main.tsx` — the boot wiring. `transports.http` is now `http`; `transports.login` is inlined into
  `createSessionApi`.
- `session/silent-login.ts` — one exported type alias. No behaviour.

**W10's report and `CoverImage` were not touched**, being in flight elsewhere.

---

## 7. For the next slots

**For whoever adds the weak-network banner or any session UI.** `onRecovery` is the hook, and it
already fires for the outcomes that ran nothing (`BUDGET_SPENT`, `NO_PLATFORM_LOGIN`) as well as the
ones that ran a login. Two of those are the honest triggers for "you appear to be offline" and the
`REACQUIRED` one is the trigger for a silent re-render. What is missing for the re-render is an
observable store (§5), not another hook.

**For whoever makes the session observable.** The interesting consumer is now this module rather than
a screen: a store that published "signed in again" would let a surface that failed with
`SIGN_IN_REQUIRED` refetch itself without a tap, which is the last visible piece of the mid-visit
expiry story. The recovery would not change — it already knows when it succeeded.

**For whoever tunes the budget.** `DEFAULT_MAX_RECOVERY_ATTEMPTS` is 3 and it is a guess (R4), like
the 5s expiry guard and the 5s login budget before it. The number to measure first is not this one:
it is how often a real Minis session actually expires inside one visit, because if the answer is
"never" then every attempt this budget allows is spent on something else going wrong.

**For whoever builds a replay after all.** The two hooks to build it from are unchanged and the third
is new: `authToken` per attempt, `onCredentialRefused`, and now `onCredentialAccepted`. The rule to
keep is `http.ts` rule 4 — the retry is switched off by the *type* (`WriteMethod` excludes `POST`),
not per call site, and any replay should be gated the same way rather than by a flag a caller can
pass.

**For whoever integrates this.** The one behavioural change outside the `401` path is that a `2xx` on
an authenticated request now calls a hook. It is a synchronous counter assignment; nothing awaits it
and nothing branches on its result. If a future hook there does more, note that it runs before the
body is parsed and before the `204` shortcut, deliberately, for the same reason the refusal check
does.

---

## 8. Known gaps in this slot's own work

- **A straggling `401` can still discard a fresh session.** A request that was already on the wire
  with the old token, answered `401` after a re-acquire has installed a new one, reaches
  `store.clear()` — which clears the *new* token, because a `401` does not say which credential it
  refused. The re-login that follows repairs it (and R8 keeps it from costing budget), but it costs
  one `authCode` and one round trip. Fixing it properly means the transport telling the store *which*
  token was refused, which is a change to the store's interface and was not worth it here.
- **The budget is per runtime, not per session.** A visit that burns all three attempts and then
  succeeds through a viewer's tap gets its budget back only when an authenticated request is accepted
  — which is the tap's own refetch, in practice, but nothing guarantees one happens.
- **`main.tsx` still has no test.** The wiring is asserted through `transports.test.ts`, which
  composes the same four calls in the same order, and through the §4.4 probe. A mistake in `main.tsx`
  itself — passing the wrong transport to `createSessionApi`, say — would be caught by the fact that
  a session cannot be created by presenting one, and not by a test.
- **Nothing measured how long a `401` → re-acquire → next request round trip actually takes.** On a
  slow network it is a bridge call plus a `POST` before the viewer's next tap works.
- **`NO_PLATFORM_LOGIN` is reported to a `console.warn` and nowhere else.** A client that can never
  log in is a client that can never sell anything, and that is worth an alert rather than a log line
  nobody reads.
- **The recovery is not cancelled at teardown.** There is no teardown — a mini app is killed rather
  than unmounted — but an in-flight attempt outliving the thing that provoked it is the shape of bug
  this would produce if that ever changes.
