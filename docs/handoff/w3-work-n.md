# Handoff — Wave 3, Work Slot N: cross-origin access, and who is refused

> **Branch:** `cursor/w3-work-n-bea1`, cut from `cursor/w2-work-k-6bb5` (`7b81146`).
> **Scope:** the API decides which browser origins may talk to it. An allowlist that comes from
> configuration and holds exact origins only, a refusal that happens before routing, and an
> `OPTIONS` preflight the server answers itself. Nothing else changed: no endpoint gained or lost a
> behaviour, and no route file was touched.
> **Not in scope:** the coin unlock order, identity sessions and the history UI, all in flight in
> other slots and all byte-identical here; `app/` is untouched and the built bundle still hashes
> `index-B_KnFxaH.js`. No pull request was opened.

---

## 1. The problem this slot had to solve

The client bundle is uploaded as a ZIP and served by TikTok. We host no frontend origin
(`docs/architecture/system-overview.md` §2), so the API is never the page's own origin and **every**
call the app makes is a cross-origin call. Until this slot the server said nothing about that, which
means the browser refused to hand any response to the app. The feed could not load. That is the gap.

The gap has an obvious fix and the obvious fix is the reason this slot is written carefully.
`Access-Control-Allow-Origin: *` makes the feed work in one line, and it also means any page on the
internet can call this API from a viewer's browser and read the answer. That matters here more than
it does for a read-only API: `POST /v1/unlock/coin-orders` opens a payment, and
`POST /v1/auth/login` mints a session.

So the shapes to design against are not "CORS is missing". They are:

- `*` on an API that reads an `Authorization` header;
- reflecting whatever `Origin` arrived, which is `*` written less obviously;
- a default allowlist with a convenience origin in it, which is `*` for whoever registers that name;
- and the subtle one: a policy that *omits* the header for a stranger instead of refusing the
  request. A browser sends a "simple" cross-origin `POST` **before** it checks anything, so by the
  time the missing header takes effect the order has been opened. The viewer's browser cannot read
  the response, which is no comfort to the viewer who was charged.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `server/src/core/origin-policy.ts` | New. The allowlist parser and the per-request decision, as pure functions |
| `server/src/core/cors.ts` | New. The `onRequest` hook: applies the decision, answers the preflight, refuses the rest |
| `server/src/core/origin-policy.test.ts` | New. 53 cases on the parser, the `Origin` reader and the decision |
| `server/src/core/cors.test.ts` | New. 24 cases through the assembled server |
| `server/src/config.ts` | `CORS_ALLOWED_ORIGINS` → `corsAllowedOrigins` and `corsRejectedOrigins` |
| `server/src/app.ts` | The hook is added to the root instance before the 404 handler; discarded allowlist entries are logged by name |
| `packages/shared/src/errors.ts` | `COMMON_ORIGIN_NOT_ALLOWED`, which now has a producer |
| `contracts/openapi.yaml` | The cross-origin rule, stated once for every path |
| `.env.example` | The variable, its format, and what an unset value costs |

**Tests: 83 new, 0 skipped, 0 deleted.** `origin-policy.test.ts` 53, `cors.test.ts` 24, plus 4 in
`config.test.ts` and 2 in `app.test.ts`. No existing assertion was changed; the two files that grew
only gained cases. Nothing under `server/src/modules/` was modified at all — the slot adds a hook
in front of the modules rather than a check inside any of them.

### 2.1 The decision, in order

```
   Origin header?  ── absent ──▶  not a browser request. Left alone.
          │                        (this is how the TikTok payment callback still works)
       present
          │
   readable as an origin? ── no ──▶ 403        ("null", two joined headers, an origin with a path)
          │
   equal to this server's own origin? ── yes ──▶ same-origin. Left alone.
          │
   on the allowlist? ── no ──▶ 403             (empty allowlist: everyone takes this branch)
          │
        yes
          │
   is it a preflight? ── no ──▶ Access-Control-Allow-Origin: <origin>, then the route runs
          │
   method and headers it asked for, both allowed? ── no ──▶ 403
          │
        yes ──▶ 204 + Allow-Origin / Allow-Methods / Allow-Headers / Max-Age
```

`Vary: Origin` goes on every response above, including the refusals and the requests that carried no
origin at all.

### 2.2 What an allowlist entry may be

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact origins: a scheme, a host and a port.
Entries are normalised to the serialisation a browser actually sends (`new URL(...).origin`), which
is what lets the comparison be `===` rather than a family of near-matches.

| Refused entry | Reason |
|---|---|
| `*`, `https://*.example.com`, anything containing `*` | `WILDCARD` |
| `example.com`, `//example.com` | `NOT_AN_ABSOLUTE_URL` |
| `http://example.com`, `ftp://…`, `blob:…` | `SCHEME_NOT_ALLOWED` — `http://` is accepted on loopback only |
| `https://u:p@example.com`, `https://example.com/app`, `about:blank` | `NOT_A_BARE_ORIGIN` |
| the same origin twice | `DUPLICATE` |

A refused entry is dropped individually and logged by name at boot rather than failing the boot: a
server that refuses to start over one bad entry gets restarted with the whole variable deleted,
which is the outcome this design exists to avoid.

### 2.3 The comparison is exact, and the tests are about lookalikes

Four origins are asserted to be denied against an allowlist holding
`https://webview.example.invalid`: `https://webview.example.invalid.evil.example` (a prefix match
would allow it), `https://evilwebview.example.invalid` (a suffix match would),
`http://webview.example.invalid` (a scheme-insensitive one would) and
`https://webview.example.invalid:8443` (a port-insensitive one would). Each of those four is a real
implementation somebody writes when asked to "support subdomains".

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-k.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S59 | **A denied origin is refused with `403`, not merely left without CORS headers** | The browser blocking the response is protection for a *read*. It is not protection for a request that has already been sent, and a form-encoded `POST` is sent without a preflight. Refusing costs a legitimate browser client nothing — it could not have read the response either way — and it closes the window where a stranger's page opens a payment that we then decline to describe. The test for it is an empty trade-order log, not a response body | One branch; eleven tests |
| S60 | **The check runs in `onRequest`, before routing and before body parsing** | A refused request must not reach a handler, must not have its body read and must not be able to distinguish a real path from an absent one. Asserted directly: a malformed body from a denied origin is answered `403`, not the `400` that would mean we parsed it on their behalf | Moving the hook, which is what that test exists to catch |
| S61 | **The hook is added to the root instance, not `register`ed as a plugin** | Fastify encapsulates hooks by scope, so a registered one would guard its own children and nothing else — that is, every module written after it. This is the same class of mistake as handing two modules separate order stores (S48): both halves look correct and the gap is invisible until something is already through it | One line |
| S62 | **There is no configuration value that means "any origin"** | `*` is not parsed into an allowlist entry, it is discarded and reported. An API that reads an `Authorization` header and answers `*` has delegated authorization to whoever asks. `CORS_ALLOWED_ORIGINS=*` is the setting a deployment reaches for at 2am when the client cannot connect, so it has to be inert rather than available | One condition; six tests |
| S63 | **An unconfigured deployment allows no browser origin** | The two candidate defaults are "allow nothing" and "allow something", and only one of them is wrong quietly. Failing closed produces a client outage with a warning in the log naming the variable to set; failing open produces a working app and an open API, and nobody investigates a working app | One default; five tests |
| S64 | **`Access-Control-Allow-Credentials` is never sent** | The session is a bearer token the client attaches deliberately (`docs/12-api-contracts.md` §3), not a cookie the browser attaches for it. Allowing credentials would opt this API into ambient authority it does not use, and it is the header that turns an allowlist mistake into account access. Asserted on every allowed verdict rather than assumed from its absence in the source | One header; two tests |
| S65 | **The `Origin` header is matched byte-exactly against the browser's serialisation** | `readRequestOrigin` returns a value only when the header *is* the canonical serialisation, so `null`, two joined headers, a trailing slash and an origin with a path glued on are all unreadable rather than nearly-matching. Being lenient here means the parser and the comparison disagree about what an origin is, and the attacker picks which one to satisfy | One comparison; six tests |
| S66 | **A preflight for a method or header this API does not accept is refused, not answered with the list anyway** | The browser would refuse it either way; the difference is whether the decision is ours and in the log. It also means the advertised method list is never wider than the request that was actually approved | Two conditions; three tests |
| S67 | **A request carrying no `Origin` at all is left completely alone** | The TikTok payment callback is server-to-server and sends none. A CORS policy that refuses originless traffic is a payment outage with a security rationale, and it would be discovered by a webhook retrying for 72 hours | One branch; two tests |
| S68 | **A same-origin request passes without CORS headers, decided from `Origin` against this server's own host** | Both sides of that comparison are set by the browser, so a cross-origin page cannot make it true by choosing a header. Behind a TLS terminator the server sees `http` and an internal host, so the comparison simply fails and the allowlist decides instead — the safe direction for it to be wrong in | One comparison |
| S69 | **`Access-Control-Expose-Headers` is not sent** | Nothing a client needs is in a response header: the trace id every failure carries is in the error envelope's body (`core/errors.ts`). An empty expose list is one fewer thing to keep true as headers are added | One header, when something needs it |
| S70 | **The preflight is answered for paths that do not exist** | Routing has not happened when the decision is made, and making it happen first would mean a preflight could be used to enumerate paths. The browser learns nothing: the real request that follows gets its `404` | It is a consequence of S60 |

### 3.1 What was deliberately not changed

No file under `server/src/modules/` was modified, and `app/` is byte-identical — the built bundle
still hashes `index-B_KnFxaH.js`. The in-flight coin-unlock, identity-session and history-UI work
needs no rebase against this branch: the hook sits in front of every route and none of them can tell
it is there. `server/src/app.ts` gained thirteen lines, all of them before the first route, and no
route registration moved.

---

## 4. Reverse verification

Each rule was reintroduced as a defect and the full server suite re-run, per `SR-1`. A rule nothing
fails for is a rule that is not being enforced.

| Defect reintroduced | Failing tests | Representative names |
|---|---|---|
| The allowlist is not consulted — every readable origin is reflected | **10** | `opens no payment, because the handler never runs`, `is refused with the standard envelope and no CORS header`, `denies 'https://webview.example.invalid.evil.example', which only looks like the allowed origin`, + 7 |
| A denial omits the headers instead of refusing the request | **11** | `opens no payment, because the handler never runs`, `is refused for a method no route implements`, `cannot tell a real path from an absent one`, + 8 |
| An empty allowlist means "allow everyone" | **5** | `denies everything when the allowlist is empty`, `is not rescued by the wildcard configuration '*'`, `refuses a browser origin when no allowlist is configured` |
| Wildcard entries accepted by the parser | **6** | `refuses the wildcard entry '*' rather than honouring it`, `never turns a wildcard into an allowed origin`, + 4 |
| The origin matched by suffix, as "subdomain support" | **2** | `denies 'https://evilwebview.example.invalid'`, `denies 'http://webview.example.invalid'` |
| `Origin` parsed leniently — the URL's origin rather than the exact header | **6** | `refuses to read 'https://example.com/path' as an origin`, `refuses a repeated header, however Node presents it`, + 4 |
| The preflight left to routing instead of answered | **2** | `is answered by the server, since no route declares OPTIONS`, `answers for an unknown path without confirming anything about it` |
| `Access-Control-Allow-Credentials: true` on an allowed origin | **2** | `never offers credentials, on any verdict`, `is never offered credentials` |
| `Vary: Origin` sent only on allowed responses | **2** | `varies on Origin for a refused origin`, `varies on Origin for no origin at all` |
| The check moved from `onRequest` to `preHandler` | **1** | `is refused before its body is parsed` |

Three rows deserve a note.

The **omitted-headers** defect is the one this slot is really about, and it is worth reading what
fails: `opens no payment, because the handler never runs` is the only test in the suite that
distinguishes "the browser could not read the answer" from "we did not do the thing". Everything
else about that defect looks like a working CORS implementation.

The **suffix match** row fails only two tests, and both are lookalike origins that exist for no
other reason. A suite without them would report a subdomain-wildcard implementation as correct,
because every legitimate origin still matches.

The **`preHandler`** row fails exactly one test, which is the honest size of that mistake: the
refusal still happens and the handler still does not run. What changes is that a stranger's body has
been parsed, and the response tells them so. It is one test because it is one property, and it would
be zero tests if the property had not been written down.

### 4.1 Gates

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **644 passing, 0 skipped, 0 failing** — 511 server (was 428), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

---

## 5. Registered rather than resolved

**`COMMON_ORIGIN_NOT_ALLOWED` is an addition to the catalogue.** `docs/12-error-catalog.md` has no
code for a refused origin. It is a `403`, and deliberately not an `AUTH_*` code: no client recovers
from it by retrying or by signing in, because the fix is a deployment registering an origin. For
slot B at the next contract pass, alongside the `CTR-009`/`CTR-010` entries from
`docs/handoff/w2-work-k.md` §5.

**The platform WebView's origin is unknown (U-CORS-1).** Nothing in the documentation we hold names
the origin a Minis WebView loads the bundle from, and it cannot be guessed — an allowlist entry is
only useful if it is exactly right. `.env.example` therefore carries a placeholder in the reserved
`.invalid` TLD, and the value has to be read off a real device or a Portal setting before the client
works anywhere but locally. This is the one thing in this slot that cannot be finished without the
platform, and it is a configuration value rather than a code change.

**The trusted-domain registry is a different list.** `packages/config/src/domains.ts` is the list of
domains *our client is allowed to call*, enforced by TikTok. This is the list of origins *allowed to
call us*, enforced by us. They point in opposite directions and neither implies the other, so they
are deliberately not generated from each other; the day the API domain is registered for real, both
need editing.

---

## 6. Deliberately not built

- **No `Access-Control-Expose-Headers`, and no CORS-related response header beyond the four.** S69.
- **No per-origin policy.** Every allowed origin gets the same methods and the same headers. A
  second policy needs a second consumer, and there is one client.
- **No rate limiting on the refusal path.** A refused request is cheap — no routing, no parse, no
  handler — but it is not free, and `docs/12-api-contracts.md` §2.6 is still unimplemented
  everywhere. Unchanged by this slot.
- **No `trustProxy`.** Enabling it would let the `X-Forwarded-*` headers decide what this server's
  own origin is, which is a decision worth taking on purpose when the terminator is known (§8).
- **No CSRF token.** Not needed while the session is a bearer token the client attaches itself. If
  cookie sessions ever arrive, this file's `Access-Control-Allow-Credentials` decision (S64) is the
  first thing that has to change, and a CSRF design is the second.
- **No client code.** `app/` is byte-identical. The app needs no change to benefit from this: a
  plain `fetch` with `Authorization` and `Content-Type` is already within the allowed set.

---

## 7. For the next slots

**For whoever deploys this.** Set `CORS_ALLOWED_ORIGINS` or the client gets a `403` on every call.
The value is exact origins, comma-separated, no wildcard, no trailing slash. If the log says
`no browser origin is allowed` at boot, that is this. If it says `CORS_ALLOWED_ORIGINS entry
ignored`, an entry was discarded and the line names it and why.

**For whoever owns the app.** Nothing to do while requests carry only `Authorization`,
`Content-Type` and `Idempotency-Key`. The moment a custom header is added — a client version, a
device id, a request id — the preflight for it is refused until that name is added to
`ALLOWED_REQUEST_HEADERS` in `core/origin-policy.ts`. That refusal is a `403` on the `OPTIONS`, not
on the request, which is worth knowing before it is debugged as a routing problem. Do not set
`credentials: 'include'`: it is not allowed and never will be while sessions are bearer tokens.

**For whoever puts this behind a load balancer.** The same-origin comparison (S68) uses the scheme
and host this process sees. Behind a TLS terminator that is `http` and an internal name, so
same-origin detection stops working and the allowlist decides — which is safe, and is the reason
`trustProxy` was not enabled speculatively. Turn it on deliberately, with the terminator's address
known, or the `X-Forwarded-Host` header becomes an input to a security decision.

**For whoever adds a method.** `ALLOWED_METHODS` is `GET`, `POST`, `OPTIONS` because that is what
the routes implement. A new `DELETE` route works for server-to-server callers and is refused at the
preflight for browsers until the list grows. That is intentional — the list is meant to be a
transcription of the routes, not a guess about them.

---

## 8. Known gaps in this slot's own work

- **The origin that matters is not known (U-CORS-1).** Everything here is proven against fixture
  origins. The first real deployment will find out whether the WebView sends the origin anyone
  expects, and whether it sends one at all — a WebView loading from a non-HTTP scheme would send
  `Origin: null`, which this policy refuses by design and which no amount of configuration would
  allow. If that turns out to be the platform's behaviour, the answer is not to allow `null`; it is
  that the trusted-domain mechanism is doing this job and this policy is defence in depth.
- **Nothing is proven in a browser.** The assertions are what the server sends. Whether a real
  Chrome accepts the preflight is a claim about the header values, and it is untested against a
  browser here.
- **The self-origin comparison trusts the `Host` header.** It is set by the browser, and the
  comparison fails closed, but behind a proxy that rewrites `Host` it will misfire in the direction
  of denying — which is an outage, not a hole.
- **A refused request is a log line and nothing else.** No metric, no alert, no threshold. A sudden
  rate of `cross-origin request refused` is either a misconfiguration that has just taken the client
  down or somebody probing, and the two look identical until somebody reads the log.
- **The discarded-entry warning is emitted at boot and never again.** A deployment whose allowlist
  is half-broken looks healthy from the outside; the evidence is in the first few lines of the log.
- **Nothing prevents an allowlist from growing.** There is no cap and no review step, unlike the
  trusted-domain registry's 20-entry limit. The list is small because nobody has added to it yet.
