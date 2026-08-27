# Tech Stack

> **Slot:** Wave 1 · architecture. Companion to `docs/architecture/system-overview.md`.
> **Relationship to `docs/03-stack-decision.md`:** that document's D1–D16 remain the baseline. This document is the
> canonical version: it restates the decisions with the platform constraint that drives each one, and it **changes
> two of them** (D3 player, D11 media pipeline) for the reasons registered in `system-overview.md` §1.1.

Every choice below is justified against one question: *does this survive a platform code scan, a review, and a
production incident on a mid-range Android device inside a WebView?* Preference is otherwise given to boring,
widely-deployed technology.

---

## 1. Decision summary

| # | Area | Decision | Primary driver | Rejected |
|---|---|---|---|---|
| T1 | Client runtime | Standard SPA, single `index.html`, static ZIP artifact | Platform hosts the bundle; there is no origin server for the frontend | Next.js/Nuxt SSR, MPA |
| T2 | Language | TypeScript, `strict`, no implicit `any` | The bridge and the money paths are where types earn their keep | JavaScript |
| T3 | UI framework | React 19 | Team familiarity, ecosystem depth, VePlayer integrates cleanly via refs and effects | Vue 3, Svelte |
| T4 | Bundler | Vite (Rollup output), ES2020 target | Fast local loop; deterministic static output that satisfies the code scanner | Webpack, Parcel |
| T5 | Routing | `react-router` in **hash** mode | Static ZIP, no server rewrite capability; hash routing cannot 404 on refresh | History mode |
| T6 | Server state | TanStack Query | Dedupe, retry, stale-while-revalidate; the feed and catalogue are cache-shaped | Redux Toolkit Query, hand-rolled |
| T7 | Client state | Zustand | Small, no context tree churn; playback/session/capability state is global but tiny | Redux Toolkit, Jotai, MobX |
| T8 | Player | **VePlayer via `TTMinis.getPlayer()`** | Mandatory. Third-party players and native HTML video are blocked and replaced | hls.js, video.js, Shaka, `<video>` — **all prohibited** |
| T9 | Styling | CSS Modules + design tokens, logical properties | No runtime CSS-in-JS cost on low-end devices; logical properties give RTL for free | styled-components, Emotion, Tailwind |
| T10 | i18n | `react-i18next` | Namespacing, lazy locale loading, mature pluralization; English bundled | FormatJS, custom |
| T11 | Backend runtime | Node.js LTS (≥22) | One language across the stack; the platform's own tooling is Node | Go, Java |
| T12 | Backend framework | Fastify | Low overhead, first-class JSON Schema validation, mature plugin/lifecycle model | NestJS, Express |
| T13 | Contract | OpenAPI 3.1 as the single source; server validation and client types generated from it | Prevents contract drift between the H5 client and the API | Hand-written types on both ends |
| T14 | Database | PostgreSQL ≥16 | Wallet, entitlement and order fulfilment need one transactional store | MySQL, MongoDB |
| T15 | Cache/queue | Redis 7 + BullMQ | Rate limits, idempotency, progress buffering, media-job orchestration | Kafka, SQS |
| T16 | Data access | Drizzle ORM + `drizzle-kit` | SQL-first, typed, reversible migrations; no hidden query generation on money paths | Prisma, Knex, raw SQL |
| T17 | Auth | TikTok silent login → our ES256 JWT, **in-memory only** | WebView storage is not a safe place for long-lived credentials; silent re-login is cheap | Cookie sessions, refresh token in `localStorage` |
| T18 | Monetization | TikTok Beans (one-time) + platform subscriptions + rewarded/interstitial ads | The only permitted channels | Any external payment |
| T19 | Media plane | **Platform-owned: BytePlus VOD via TikTok media-asset APIs.** Our object storage is an ingest staging area only | Mandatory hosting/moderation path | S3 + CloudFront + MediaConvert as a delivery path |
| T20 | Observability | OpenTelemetry (server) + a first-party client telemetry endpoint | No third-party client SDK may load a remote script or consume a trusted-domain slot | Sentry browser SDK, Datadog RUM, GA |
| T21 | CI/CD | GitHub Actions | Already the repository host; matrix builds and required checks | GitLab CI, Jenkins |
| T22 | Repo | pnpm workspaces + Turborepo, single repository | Contract, client and server change together | Multi-repo |
| T23 | Testing | Vitest + Testing Library, Playwright, Testcontainers, MSW, `oasdiff` | Matches `docs/14-test-plan.md`; MSW and the `MockBridge` make the platform-dependent surface testable | Jest, Cypress |
| T24 | Package policy | MIT/Apache-2.0/BSD/ISC allowed; GPL/AGPL/SSPL excluded from distributed artifacts; no package that calls `eval` or `Function` reaches the client bundle | Platform code scanning + licence hygiene | — |

---

## 2. Client: why this shape

**Single-page, hash-routed, statically packaged.** The deliverable is a ZIP that TikTok serves. There is no server
to rewrite paths, so history-mode routing has no safe reload story. Hash routing is the boring correct answer and
costs nothing, since we control every entry point and deep links are resolved through the launch-parameter pipeline
rather than URLs.

**React 19 + Vite** is chosen for velocity and for a specific integration property: VePlayer is an imperative
class with its own DOM ownership. React's ref + effect model gives a clean way to hand a container element to a
foreign renderer and tear it down deterministically. The player facade owns exactly one `useEffect` with a
`destroy()` cleanup, and no React state ever tries to mirror the player's internal state — the player is the source
of truth for playback and we subscribe to its events.

**State split.** Server state (catalogue, feed, wallet, entitlements) goes to TanStack Query, where caching and
retry semantics are declared once. Client state (session, capabilities, unlock intent, playback queue) goes to
Zustand. The rule that keeps this from degenerating: **entitlement is never client state.** It is a server answer,
cached with a short TTL, and invalidated on every unlock, purchase, subscription change and app foreground event.
Optimistic unlock rendering is explicitly banned — it is the fastest route to a user who paid and sees a locked
episode, or worse, the reverse.

**Styling with CSS Modules and logical properties** keeps runtime cost near zero on the low-end Android devices that
dominate the target regions, and makes the Arabic/RTL launch region a layout flip rather than a rewrite.

**Bundle budget.** ZIP ≤ 200 MB is the platform ceiling; our internal budget is far tighter (≤ 20 MB package,
≤ 300 KB gzipped initial JavaScript, per `docs/03-nonfunctional.md` §2) because time-to-interactive competes with
the TikTok feed the user just left. Route-level code splitting, no polyfills beyond the supported WebView baseline,
and no icon-font or sprite-sheet bloat.

---

## 3. Player: the one decision with no alternatives

VePlayer is not a preference, it is a constraint:

> Third-party players and native HTML video are not allowed. If they are used, TikTok will replace them with a
> default blocked UI. ([TikTok Minis Player](https://developers.tiktok.com/docs/en/minis-player))

Consequences for the stack:

- **No `hls.js`, no `video.js`, no Shaka, no `<video>` tag** — including for trailers, previews and background
  loops. A lint rule bans the `video` element and those packages outright, and a build check greps the emitted
  bundle for them.
- We do not implement adaptive bitrate, quality ladders, DRM, or CDN token signing for episode video. Those belong
  to BytePlus and the platform. The corresponding sections of `docs/03-tech-architecture.md` §6 and
  `docs/14-security.md` §5.1 are superseded.
- We **do** own the player *facade*: instance lifecycle, playlist and preload configuration
  (`enableMp4MSE: true`, feed preload scene, media-info cache), event→analytics mapping, error classification, and
  plugin `ignores` for the immersive layout.
- Player configuration is treated as product surface and lives in server-side config where possible
  (preload counts, default definition, subtitle default policy), so tuning first-frame performance does not require
  a review cycle.

---

## 4. Backend: why a modular monolith on PostgreSQL

The decisive requirement is that **a purchase, a ledger entry and an entitlement grant must commit or fail
together.** With one PostgreSQL primary that is a transaction. Split across services it becomes a saga with
compensations, in a domain where a compensation error is a customer-visible money error. Nothing about the expected
load requires that trade — short-drama read traffic is cache-shaped and the write path is small.

Fastify over NestJS: fewer abstraction layers between a request and a SQL statement, and JSON Schema validation that
is generated from the same OpenAPI document the client is generated from. Drizzle over Prisma: the money paths use
explicit SQL with visible locking semantics, and migrations are plain reversible SQL that can be reviewed as SQL.

BullMQ carries the jobs that must survive a restart: media upload polling, moderation-state reconciliation, order
sweeping, subscription sync, progress flushing and analytics rollups. All of them are idempotent and all of them are
observable — a stuck queue is an alert, not a mystery.

**Schema-validation caveat.** AJV-style validators generate code with `new Function`. That is fine on the server and
**must never be bundled into the client**. Client-side validation, where needed, uses a non-code-generating
validator or plain hand-written guards.

---

## 5. Telemetry without third-party client SDKs

Every third-party browser SDK costs three things at once here: a trusted-domain slot out of 20, a remote script
against the self-source rule, and an unreviewable code path in a bundle that is scanned before release. So:

- The client posts batched events to **our** API domain. Crash/error reporting is a first-party endpoint fed by a
  global error handler and an error boundary, carrying the `traceId` the API returned.
- The server side is conventional OpenTelemetry: traces, metrics and logs to whichever backend operations prefers,
  reachable only from our infrastructure.
- Playback quality metrics come from VePlayer events, so we get first-frame, stall and preload-hit data without a
  media analytics vendor.

This is a deliberate trade: we give up vendor dashboards and buy back domain slots, review predictability and a
smaller bundle.

---

## 6. Platform constraint → enforcement matrix

Each platform rule is enforced by a mechanism that fails the build, not by a convention that fails the review.

| Platform rule | Enforcement |
|---|---|
| `eval` forbidden | ESLint `no-eval`, plus a post-build scan of emitted chunks |
| `Function` constructor forbidden | ESLint `no-new-func`, post-build scan; dependency policy (T24) |
| String-form `setTimeout`/`setInterval` forbidden | ESLint `no-implied-eval` |
| `iframe` unsupported | Lint rule banning the element; no embed-based dependencies |
| Script/CSS `src` from self only (fonts excepted) | No CDN-hosted dependencies; self-hosted fonts subset; the platform SDK tag is the single sanctioned external script and is asserted in an HTML integrity test |
| Dynamic script sources restricted | Vite configured with no remote dynamic imports; `import()` resolves to bundled chunks only |
| Blocked web APIs (clipboard, geolocation, vibration) | Lint rule + capability probe; no feature depends on them |
| Requests only to trusted domains, ≤ 20, `https://`/`wss://`, no wildcards or paths | One `domains.config.ts` generates `minis.config.json` and the Portal list; a CI check fails if any URL in the bundle resolves outside it |
| ZIP ≤ 200 MB, no zero-byte files | Package step asserts both; internal budget is far stricter |
| TikTok Login must be implemented | Boot sequence test in E2E; the code scanner also checks it |
| App must be compatible with English | i18n completeness check for `en` fails the build on a missing key |
| Required capabilities integrated (silent login, rewarded ads, interstitial ads, Beans IAP, subscriptions, navigation bar) | Bridge interface conformance test; each capability has an integration test against `MockBridge` and an on-device checklist item |
| Minimum supported library version | Every bridge call is `canIUse`-gated (§3.3 of the overview); a unit test asserts no direct `window.TTMinis` reference exists outside `platform/` |

---

## 7. Repository layout (Wave 2 target)

```text
minidrama/
├── docs/                     # architecture, plan, contracts documentation
├── contracts/                # OpenAPI 3.1 — single source of truth
├── app/                      # H5 client
│   ├── index.html            # platform SDK tag + TTMinis.init
│   ├── minis.config.json     # generated from domains.config.ts
│   └── src/{platform,player,features,routes,stores,api,core,i18n}/
├── server/                   # Fastify modular monolith
│   └── src/modules/{identity,catalog,media-ops,playback,entitlement,
│                    wallet,billing,ads,progress,discovery,engagement,
│                    analytics,config,platform-tiktok}/
├── packages/{shared,config}/ # generated types, error codes, shared tooling config
├── infra/                    # IaC + local compose
└── .github/workflows/        # CI gates, landed with the first code change
```

---

## 8. Explicitly not doing (Wave 1–2)

- No microservices, no event bus, no CQRS split.
- No self-hosted video delivery, transcoding, DRM or CDN signing for episode media.
- No third-party client analytics, ads or payment SDKs.
- No service worker or offline mode (the platform controls bundle delivery and caching).
- No WebAssembly, no dynamic remote code of any kind.
- No native app shell. If a native app is ever built, this stack shares only the backend.
