# Handoff — Wave 3, Work Slot L: identity session mapping

> **Branch:** `cursor/w3-work-l-8551`, cut from `cursor/w2-work-i-e53c` (`0be48a9`).
> **Scope:** the token-to-user mapping that did not exist. An in-memory `SessionStore` that both
> issues and resolves sessions, the login route binding what it issues to a user id, one
> store instance shared by the login route and the `ViewerResolver` the entitlement and playback
> modules read, and a mock login path that cannot be enabled without two deliberate non-production
> environment values.
> **Not in scope:** the real TikTok code exchange, which still refuses every code — production
> remains fail-closed and this slot does not fake it. `modules/entitlement/access.ts`,
> `facts-port.ts`, `viewer-resolver.ts` and the entitlement fixtures are byte-identical. Coin
> unlock, the app feed UI and the data layer are untouched; `app/` is byte-identical and the built
> bundle hashes to `index-B_KnFxaH.js`, the same as the base. No pull request was opened.

---

## 1. What was wrong

Sessions were write-only. `POST /v1/auth/login` minted an opaque CSPRNG token and threw the
knowledge of who it belonged to away:

```ts
return {
  issue: (_openId: string): Session => ({
    accessToken: generateToken(),
    expiresInSec: ttlSec,
  }),
};
```

Note the `_openId`. On the other side, every reader of a session refused every token, because there
was nothing to ask:

```ts
return token.value === null ? ok(null) : err('SESSION_UNRESOLVABLE');
```

Both halves were deliberate and both were correct in isolation — W2 slot C would not ship a session
store it had not designed, and slot F would not ship a resolver that guessed. Together they were an
application that hands out credentials it cannot read. Everything downstream of a viewer inherited
that: watch progress, favorites, the wallet and the unlock endpoints all resolve the caller through
the same `ViewerResolver`, so a client holding a session this server had issued one millisecond
earlier was told `401` — or, worse for an operator, `503`, because "no store" was reported as our
fault rather than the caller's.

Two further things about that state are worth naming, because they are the reason this slot is not
just "add a Map".

**A missing store cannot be fixed by a stub in the identity port.** The obvious way to get a
testable login is to make `createTiktokIdentityPort` synthesise an `open_id`. That ships an
authentication bypass into the real port, and the only thing standing between it and production is
that nobody sets the wrong environment variable. S17 refused to do it and this slot does not undo
that decision — §3 explains what it does instead.

**"Presented but unresolvable" was the right answer to the wrong question.** With no store,
`SESSION_UNRESOLVABLE` → `503` was honest. With a store, it is not: the store *answered*, and the
answer was "not one of ours". Keeping the `503` would tell a client to retry the same dead token
forever, when the contract's remedy for a bad session is to run silent login again (§3, S49).

---

## 2. What was delivered

| File | Contents |
|---|---|
| `server/src/modules/identity/session-store.ts` | New. `SessionStore` — `issue`, `resolve`, `revoke`, plus two diagnostics — and `createInMemorySessionStore`. Supersedes `session.ts` |
| `server/src/modules/identity/session-viewer-resolver.ts` | New. `createSessionViewerResolver(store)`: identity's implementation of entitlement's `ViewerResolver` port. The only place a bearer token becomes a viewer id |
| `server/src/modules/identity/test-login.ts` | New. The gate (`isTestLoginEnabled`) and the mock exchange (`createMockIdentityPort`), which accepts only `mock:<userId>` codes |
| `server/src/modules/identity/routes.ts` | Binds the issued token to the account id, and refuses an exchange that succeeded without naming a user |
| `server/src/app.ts` | Constructs **one** store, gives it to the login route and to the viewer resolver, and selects the mock identity port in the one place a mock port can enter the system |
| `server/src/config.ts` | `testLoginEnabled`, so the whole of what the environment can switch on is visible in one file |
| `server/src/modules/identity/session-store.test.ts` | New, **31 tests** — issuance, resolution, expiry boundaries, revocation, the fingerprint property, the ceiling |
| `server/src/modules/identity/session-viewer-resolver.test.ts` | New, **14 tests** — the three outcomes, and the refusals that must not read as anonymous |
| `server/src/modules/identity/test-login.test.ts` | New, **30 tests** — the gate enumerated as a security control, and the mock code shape |
| `server/src/modules/identity/routes.test.ts` | **+19 tests** — what the token is bound to, an end-to-end login that resolves a viewer at another endpoint, and the mock path both enabled and refused |
| `server/src/config.test.ts` | +1 test: mock login stays off unless the environment asks for it twice |
| `server/src/modules/identity/session.ts`, `session.test.ts` | Deleted. §2.4 |
| `.env.example` | Documents `MINIDRAMA_TEST_LOGIN`, commented out, with what it does and why not to set it |

`server/src/modules/entitlement/` is untouched except for four lines of one test file (§2.5), and
`contracts/openapi.yaml` is unchanged: no endpoint, status or body shape moved.

### 2.1 One store, both halves

`SessionStore` is issuance *and* resolution in one interface, and `buildApp` constructs one instance:

```ts
const sessionStore = dependencies.sessionStore ?? createInMemorySessionStore({ now });
const viewerResolver = dependencies.viewerResolver ?? createSessionViewerResolver(sessionStore);
```

Splitting them was the defect. Two instances here is a two-line mistake that reads as correct and
recreates exactly the state the slot was opened to fix, so it is reverse-verified: it fails three
tests, all of them the end-to-end ones (§4).

The properties the store holds, each with a test that fails without it:

| Property | Why it is not incidental |
|---|---|
| Keyed by `sha256(token)`, never by the token | A dump of this map — heap snapshot, debug log, a future `KEYS *` against Redis — must not be a set of usable bearer credentials. `store.fingerprints()` exists so the suite can assert this rather than a reader having to trust it; a fingerprint is safe to expose for the same reason it is worth asserting |
| A fixed lifetime, no sliding renewal | "Logged in for an hour" is then a statement about the session, not about how often the client happened to call. Reading a session does not extend it |
| An absent or expired session is a refusal | Never an anonymous viewer (the silent downgrade slot F named), and never a silent renewal |
| `issue('')` throws | A session bound to nobody resolves to a viewer id the rest of the system would treat as a user, and every unlock and progress row written under it would belong to one shared phantom account |
| A ceiling, evicting oldest-first | An unbounded in-memory session table is a memory-exhaustion target for anything that can drive issuance. It evicts rather than refusing: being logged out costs one silent login, while refusing to issue turns a flood into an outage for everyone. Expired entries are reclaimed before a live one is evicted |
| `SESSION_UNKNOWN` and `SESSION_EXPIRED` are distinct | The same `401` to a client, different events to an operator: a flood of the first is someone guessing tokens, a flood of the second is a client that is not refreshing |

### 2.2 What a session is bound to

`store.issue(userId)` takes the account id, and the login route passes the platform `open_id`,
because there is no user row to link it to yet:

```ts
// The account id the session is bound to. Until the users table lands (W7) the platform's
// `open_id` *is* the account id: there is no row to link it to, and minting a local `usr_` id
// here would create a second identifier space that the real link would then have to migrate.
// When that link arrives it goes on this line, between the exchange and the issuance, and
// nothing else in this route changes.
const session = options.sessionStore.issue(openId);
```

This is a known conflation, recorded in §8 rather than hidden. It is contained: the real exchange
cannot succeed, so in production nothing is bound at all, and under the mock path the code names the
account id directly (`mock:usr_fx_vip_active`), which is why the fixture entitlement world resolves
against a mocked login without a translation table.

The route also refuses an exchange that succeeded with an empty `open_id` — `502
AUTH_PROVIDER_ERROR`, logged at error level. The store would throw anyway; the guard makes it a
provider fault rather than a `500`, and it is the second of the two layers standing between a
degenerate platform response and a shared phantom account.

### 2.3 The mock login path, and why it is not a bypass

The path exists because everything downstream of a session needs one and the real exchange does not
exist. What keeps it out of production:

1. **It is a separate port.** `createMockIdentityPort` is a `PlatformIdentityPort` living in
   `test-login.ts`. `createTiktokIdentityPort` is unchanged and cannot delegate to it. There is
   exactly one line in the repository where the mock port can enter the system, and it is in
   `buildApp` next to the gate.
2. **The gate has two independent conditions.** `MINIDRAMA_TEST_LOGIN` must equal
   `yes-i-am-a-non-production-test-deployment` — a sentence, not a boolean, so `true`, `1`, `yes`,
   `on` and an empty-but-present value all refuse — **and** `NODE_ENV` must be `test` or
   `development`. The second is an allowlist: an unset `NODE_ENV`, `staging`, `prod` and `Test` all
   refuse. A blocklist (`!== 'production'`) would make "forgot to set `NODE_ENV`" the enabling
   condition, which is precisely backwards.
3. **Enabled is not open.** Even live, the port accepts only `mock:<userId>` where the user id
   matches `/^[A-Za-z0-9_-]{1,64}$/`. A real TikTok authorization code arriving at a mock deployment
   is still rejected, so a client pointed at the wrong host does not silently log in.
4. **It announces itself.** `buildApp` logs a warning at every start where the path is live. A
   deployment that has mock login enabled and does not know it is the failure this design is
   guarding against.
5. **It reuses the real route.** Same validation, same failure mapping, same issuance. A second
   login route for tests would be a second thing to keep correct, and the one not exercised in
   production is the one that rots.

There is also a **flagless** way for a test to log in, and it is the preferred one:
`buildApp(config, { sessionStore })`, then `sessionStore.issue('usr_...')`. It needs no environment
variable because it is reachable from a test process and from nowhere else. The mock path exists for
the cases that need the HTTP endpoint itself — a client integration test, a manual `curl` against a
dev server.

### 2.4 `session.ts` was replaced rather than extended

`createSessionIssuer` issued a token bound to nothing. Leaving it next to the store would leave a
second issuance path whose only distinguishing feature is that it produces unusable sessions —
available to any future caller, and correct-looking. It is deleted, and its five assertions about
the token (opacity, non-derivation from the subject, uniqueness, url-safety, no refresh token)
are preserved verbatim in the first block of `session-store.test.ts`, because they were about the
token and the token has not changed.

### 2.5 The four lines changed outside this module

`entitlement/routes.test.ts` and `playback/routes.test.ts` each assert that the default app "refuses
a presented session rather than downgrading it to anonymous". That property still holds and both
test names are unchanged; the status changed from `503 COMMON_SERVICE_UNAVAILABLE` to `401
AUTH_REQUIRED`, because the default app now has a store and a token it never issued is the caller's
problem (S49). Each edit is two lines plus a comment naming this slot. No other assertion in either
file moved, and `entitlement/viewer-resolver.test.ts` — including its `SESSION_UNRESOLVABLE` case —
is untouched.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-i.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S46 | **Issuance and resolution are one interface, and `buildApp` constructs one instance of it** | An object that issues credentials and an object that reads them, wired separately, is the defect this slot fixes — and it is invisible in review, because each half looks right. Making them the same object means "the app can resolve what it issued" is structural rather than a wiring convention | None; the store is behind an interface either way |
| S47 | **The store is keyed by a SHA-256 fingerprint of the token** | A store keyed by the token *is* a credential store: whatever can read it can authenticate as anyone in it. Hashing costs one `createHash` per lookup and makes a leaked key set useless. The usual "hash secrets slowly" argument does not apply — the input is 256 bits of CSPRNG output, not a guessable secret | One expression, and a fleet-wide logout |
| S48 | **A token nobody issued and an expired token are distinct failures internally, one `401` externally** | The client's remedy is the same for both — run silent login — and telling it apart would make the endpoint an oracle for which tokens exist. An operator needs the distinction: guessing traffic and a client that is not refreshing look identical otherwise | One union member |
| S49 | **A presented token the store does not hold is `401`, not `503`** | With no store, `503 SESSION_UNRESOLVABLE` was honest. With one, the store has answered. A `503` tells the client to retry the same dead token — forever — where a `401` tells it to run silent login, which is the contract's remedy. `SESSION_UNRESOLVABLE` is kept in the vocabulary for a store that genuinely cannot answer (Redis down), which the in-memory one never is | Two test assertions; §2.5 |
| S50 | **No sliding expiry** | A session renewed on every read has no lifetime an operator can state, and the heartbeat traffic from watch progress would keep every session alive indefinitely — an idle timeout that never fires. The client re-runs silent login instead, which it is already built to do | One `records.set` |
| S51 | **The store refuses to bind a session to an empty user id, and the route refuses an empty `open_id` first** | Two layers because the failure is silent and expensive: a session bound to `''` resolves to a viewer id the facts port, the unlock path and progress would all treat as a user, and every row written under it would belong to one shared phantom account. The route's guard turns it into a `502` (a provider fault) instead of a `500` | One condition each |
| S52 | **The in-memory store has a ceiling and evicts oldest-first** | An unbounded session table is a memory-exhaustion target. Evicting is chosen over refusing to issue because the cost of eviction is one silent login for one user, while refusing to issue is an outage for everyone. Expired entries are reclaimed first, so a store full of dead sessions does not log live users out | One line; the ceiling is a parameter |
| S53 | **Mock login is a separate port behind a two-condition gate, and the gate is an allowlist** | §2.3. The alternative — a stub inside `createTiktokIdentityPort` — puts the bypass in the production code path and makes an environment variable the only thing preventing it. Making `NODE_ENV` an allowlist matters more than it looks: with a blocklist, "forgot to set `NODE_ENV`" enables the bypass | Delete one file and one ternary |
| S54 | **The mock port only accepts `mock:<userId>`, even when enabled** | A port that accepts any code makes an enabled deployment an open door for anyone who can reach it, and makes a misconfigured client log in silently instead of failing loudly. It also forces a test to state which user it is logging in as, which is what makes the fixture-world assertions legible | One condition; nine tests |
| S55 | **The adapter between `SessionStore` and entitlement's `ViewerResolver` lives in `identity` and reuses `readBearerToken`** | The interface is entitlement's published port and the sessions are identity's, so the implementor depends on the consumer's interface — the normal direction. The header parser is *not* duplicated: two parsers for one header is how `Authorization: Basic ...` ends up refused in one path and read as anonymous in the other. Cost: one cross-module import of an exported function, noted here because the boundary is otherwise strict | Move one function |
| S56 | **`createSessionIssuer` is deleted rather than kept alongside the store** | It issued sessions nobody could resolve. Left in place it is a correct-looking call available to any future caller. Its five token assertions survive in `session-store.test.ts` | Restore 43 lines |
| S57 | **`open_id` is used as the account id, with the future link named in the code** | There is no users table (W7), and minting a local `usr_` id here would create a second identifier space that the real link would then have to migrate. The comment marks the exact line the link goes on. Recorded as a gap in §8 rather than presented as a design | One call, once the users table exists |

### 3.1 What was deliberately not changed

`modules/entitlement/access.ts` is byte-identical, as are `facts-port.ts`, `viewer-resolver.ts` and
the entitlement fixtures. `createUnresolvedViewerResolver` is still exported and still tested even
though nothing in `buildApp` selects it any more: it is entitlement's own fail-closed default, it
documents the posture for a deployment with no session storage, and deleting another module's
default to tidy up after a wiring change is how a slot's diff stops being reviewable. The mock
`fxt_` resolver in the entitlement fixtures is likewise untouched — the tests that use it are
testing the access decision, not sessions, and making them go through issuance would couple 31
entitlement tests to this module for no gain.

`contracts/openapi.yaml` is unchanged. Nothing about `/v1/auth/login` moved: same request, same
`200` body, same four statuses. The mock path is the same operation with a different port behind it,
and a contract that documented it would be documenting a thing no deployment a client can reach will
ever have enabled.

---

## 4. Reverse verification

Each rule was reintroduced as a defect on the working tree and the full server suite re-run, per
`SR-1`. A rule nothing fails for is a rule that is not being enforced. Scope is all 407 server tests
in every row.

| Defect reintroduced | Failing tests | Representative names |
|---|---|---|
| The mock port selected unconditionally, bypassing the gate | **7** | `refuses to issue a session when no credentials are configured`, `still refuses when credentials exist but the exchange is not built`, `refuses a mock code with the flag in production, and issues nothing`, + 4 |
| A token the store does not hold read as anonymous | **8** | `refuses a token it did not issue rather than reading it as anonymous`, `refuses a presented session rather than downgrading it to anonymous` (both endpoints), `does not resolve a session issued by another store`, + 4 |
| The gate as a blocklist with a truthy flag (`Boolean(flag) && NODE_ENV !== 'production'`) | **16** | `stays off for the flag value '1'`, `stays off when NODE_ENV is absent entirely`, `refuses a mock code with the flag alone, and issues nothing`, + 13 |
| The mock port accepting any non-empty code | **9** | `refuses the code 'act.example12345'`, `refuses the malformed code 'mock:usr/../../etc'`, `refuses a code that is not a mock code, even while enabled`, + 6 |
| Expiry not checked on resolution | **5** | `reports an expired session as expired rather than as unknown`, `stops resolving a viewer once the session has expired`, `is live one millisecond before its expiry and gone at it`, + 2 |
| Two store instances in `buildApp` — one issuing, one resolving | **3** | `answers a live subscriber as the subscriber they are`, `answers a newcomer as a newcomer`, `stops resolving a viewer once the session has expired` |
| The store keyed by the raw token instead of its fingerprint | **3** | `holds no key that could be presented as a token`, `holds no key that resolves as a token, so a leaked key is not a session`, `produces a key that is not the token and cannot be read back as one` |
| Sliding expiry on read | **2** | `does not extend a session by reading it`, `is live one millisecond before its expiry and gone at it` |
| The ceiling removed | **2** | `never grows past its ceiling`, `evicts the oldest session and keeps the newest` |
| `issue('')` permitted | **3** | `refuses to bind a session to an empty user id`, `stores nothing when it refuses to issue`, `never puts a token in the error it throws` |
| The route's empty-`open_id` guard removed | **1** | `refuses an exchange that returns an empty open_id, and stores nothing` |

Three rows deserve a note.

The **two-store** row is the smallest number in the table and the most important. Three tests are
the whole of what separates the delivered behaviour from the bug that opened this slot, and none of
them is a unit test of the store — they are the ones that log in over HTTP and then ask another
endpoint who the caller is. Everything else in the suite passes happily with an app that cannot
resolve its own sessions.

The **empty-`open_id`** row fails one test rather than four because it is the outer of two layers:
with the route guard gone the store still throws, so the request fails — as a `500` instead of a
`502`. Both layers are wanted, and the test asserts which one answers.

The **fingerprint** row is why `fingerprints()` is on the interface. Before it existed, the same
defect failed nothing that mattered: the property was asserted about the hash function while the
store's keys were private, so keying by the raw token would have passed. A security property that is
tested one level away from where it is enforced is not tested.

### 4.1 Gates

Every gate was run on this branch, at `pnpm verify`.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **540 passing, 0 skipped, 0 failing** — 407 server (was 317), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The server gained 90 tests net: 31 in `session-store.test.ts` (5 of them inherited from the deleted
`session.test.ts`), 30 in `test-login.test.ts`, 19 in `identity/routes.test.ts`, 14 in
`session-viewer-resolver.test.ts`, 1 in `config.test.ts`. No test is skipped. Two assertions were
changed in files this slot does not own, both because the behaviour genuinely changed (§2.5).

---

## 5. Deliberately not built

- **No real code exchange.** `createTiktokIdentityPort` still refuses every code and production
  still answers `502`. This slot does not fake the platform.
- **No JWT.** The token stays opaque random bytes. Signing it is a decision about key management and
  rotation, and nothing in this slot is easier with a JWT — the store already holds the binding, and
  a signed token would still need it for revocation.
- **No Redis, no session table.** The store is an interface with a process-local implementation.
  W7 replaces the Map without touching a caller.
- **No logout endpoint.** `revoke` exists, is tested and has no route. `DELETE /auth/session` is a
  contract question, and inventing the endpoint here would put an unreviewed operation in the API.
- **No progress or favorites endpoints.** They are another slot's. What they needed from this one is
  a `ViewerResolver` that resolves an issued token, which they get from `buildApp` with no code of
  their own — §7.
- **No change to coin unlock, the app feed UI, or `entitlement/access.ts`.** All three are in flight
  or explicitly out of scope; none is touched.
- **No rate limiting on login.** Issuance is unauthenticated by nature and the store's ceiling caps
  the memory, but nothing caps the request rate. Named as a gap below.
- **No `users` table and no `open_id` → `usr_` link.** S57, and §8.

---

## 6. How to log in during a test

Two supported ways, in order of preference.

**Inject the store.** No flag, no environment, and the token is available before the request:

```ts
const sessionStore = createInMemorySessionStore();
const app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, {
  sessionStore,
  entitlementFactsPort: createFixtureEntitlementFactsPort(),
  now: () => FIXTURE_NOW_MS,
});
const { accessToken } = sessionStore.issue('usr_fx_vip_active');
// Authorization: Bearer ${accessToken}
```

**Go through the endpoint**, when the endpoint is what is under test:

```ts
const app = await buildApp(
  { ...loadConfig({ MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE, NODE_ENV: 'test' }), logLevel: 'silent' },
  { entitlementFactsPort: createFixtureEntitlementFactsPort(), now: () => FIXTURE_NOW_MS },
);
// POST /v1/auth/login { provider: 'TIKTOK', authCode: mockAuthCode('usr_fx_vip_active') }
```

Do **not** inject `viewerResolver` when what you are testing is session resolution: injecting it
replaces the thing under test, which is how the wiring defect in §1 survived two slots.

---

## 7. For the next slots

**For whoever owns watch progress and favorites.** You need no session code. Ask `buildApp` for the
app, take `ViewerResolver` from your route options exactly as `entitlement/routes.ts` does, and note
that resolution has three outcomes and not two: `ok(null)` is anonymous, `ok(id)` is a viewer,
`err` is a refusal. For `PUT /progress/episodes/{episodeId}` the anonymous outcome is a `401`, not a
no-op write: `docs/12-domain-model.md` §7.1 keys a progress row on `(userId, episodeId)`, so there
is no row to upsert without a viewer, and the request body carries no user id to fall back on
(`docs/12-api-contracts.md` §4.7). `SESSION_REJECTED` maps to `401 AUTH_REQUIRED` and `SESSION_UNRESOLVABLE`
to `503`; copy the two-row table at the top of `entitlement/routes.ts` rather than inventing a third
mapping. For issuance-time reads (playback's `resumePositionSec`, S44) remember the anonymous path
reaches `201` for free episodes, so the lookup has to tolerate a `null` viewer.

**For whoever lands the real code exchange.** Nothing in this slot needs to change. Implement
`exchangeAuthCode` inside `platform-tiktok`, and login binds and resolves as it does now. Two things
to keep: the `open_id` must not appear in the token, and the exchange's own access and refresh tokens
must not leave the adapter. If the exchange can return an empty `open_id`, the route already refuses
it as a provider fault.

**For whoever lands the users table (W7).** The link is one call in `identity/routes.ts`, on the line
the comment marks. Everything downstream keys on whatever the session is bound to, so the migration
question is what happens to sessions issued before the link exists — the answer is nothing: they are
process-local and an in-flight deployment loses them anyway. Replace the Map with Redis in the same
slot if you can; §8's first two gaps both close with it.

**For whoever owns rate limiting.** `POST /v1/auth/login` is the endpoint that writes to the session
store, and the store's only defence today is a ceiling that evicts legitimate sessions under load.
It is the first endpoint that wants a limit.

---

## 8. Known gaps in this slot's own work

- **The store is process-local.** A restart, a second replica or a rolling deploy invalidates every
  session it did not issue, and the client sees a `401` it answers with silent login — which, in
  production, currently fails with a `502`. Survivable only because there is no real login yet. This
  is the single largest reason to land Redis with the exchange rather than after it.
- **Nothing is proven against a real session store.** Every test here runs against the Map. The
  interface is exercised; a network round trip, a TTL implemented by the store rather than by us, and
  a `resolve` that can fail with "store unavailable" are not. `SESSION_UNRESOLVABLE` has no producer
  in the code today — it is kept in the vocabulary for exactly that case, and a Redis store is where
  it starts being returned.
- **`open_id` is the account id.** S57. Two identifier spaces are conflated, and the mock path
  quietly depends on the conflation (a code names a `usr_` id and it arrives as an `open_id`). It is
  one line to fix and it is marked, but until it is fixed a reader of the store's contents cannot
  tell which space an id belongs to.
- **Eviction can log out a legitimate user.** Under a flood, the oldest live session is dropped to
  admit a new one, and the victim gets a `401` with no explanation. Rate limiting on login is the
  real answer; the ceiling is only a memory guarantee.
- **Nothing limits sessions per user.** A single account can hold as many live sessions as the
  ceiling allows, and `revoke` acts on one token. "Log out everywhere" has no implementation and
  cannot have one until the store can be queried by user.
- **The fingerprint property is asserted through `fingerprints()`.** That proves no key in the map is
  a usable token. It does not prove the token is nowhere else in the process — it is, transiently, in
  the response body and in whatever the client does with it — and it says nothing about what a
  request log might capture. `Authorization` header redaction in the logger is not in this slot.
- **The mock path is enabled by an environment variable, and environment variables get copied.** The
  two-condition gate, the sentence-valued flag and the startup warning make that unlikely rather than
  impossible. The stronger control — building the mock port out of the production artifact entirely —
  needs a build-time flag the repository does not have yet.
- **No test asserts the startup warning.** The `buildApp` log line is verified by reading it. It is
  the one part of §2.3's five controls with no test behind it, because asserting on Fastify's logger
  output means injecting a logger `buildApp` does not currently accept.
- **Concurrency is untested.** Node's single-threaded event loop makes the Map safe today, so there
  is nothing to test; the moment the store is shared, `issue` and the eviction loop become a
  read-modify-write against a remote store and that stops being true.
