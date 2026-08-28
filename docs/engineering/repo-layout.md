# Repository Layout

> **Slot:** Wave 1 · repo skeleton (W1 work slot 3, branch `cursor/w1-repo-skeleton-e7c9`).
> **Status:** describes the repository as it exists on this branch. It is a map of running code,
> not a proposal — every path below is real and every command below is one that passes today.
> **Reads from:** `docs/architecture/system-overview.md`, `docs/architecture/tech-stack.md`.
> **Does not modify** the architecture, design or plan documents owned by the other Wave 1 slots.

---

## 1. What this skeleton is for

A skeleton earns its place if it makes the *next* change cheap and the wrong change expensive.
Concretely, this one exists to answer four questions before any product code is written:

1. **Where does a new piece of code go?** Section 2.
2. **What stops a platform-prohibited construct from reaching a release?** Section 5.
3. **How is a platform-dependent feature developed and tested without a device?** Section 4.
4. **What does "it works" mean mechanically?** Section 6.

It is deliberately not a product. There is no catalogue, no wallet, no unlock flow, no feed. What
is here is the load-bearing structure those features attach to, plus the enforcement that keeps
them attachable.

---

## 2. The tree

```text
minidrama/
├── app/                        # H5 client — the artifact TikTok hosts
│   ├── index.html              # the platform SDK tag lives here, and nothing else external
│   ├── minis.config.json       # GENERATED from packages/config — do not hand-edit
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx            # boot sequence entry point (SCR-01 splash, then GET /v1/config)
│   │   ├── App.tsx             # route table
│   │   ├── boot/               # SCR-01 overlay and init-failure retry; not a hash route
│   │   ├── config/             # boot-config snapshot context
│   │   ├── platform/           # PlatformBridge: the only code that may touch window.TTMinis
│   │   ├── player/             # VePlayer facade, its types, and the mock player
│   │   ├── routes/             # hash-routed pages
│   │   └── core/i18n/          # locale bundles and lookup
│   └── tools/                  # build-time guardrails (Node, never bundled)
│       ├── bundle-scan.ts      # scans emitted chunks for prohibited constructs
│       ├── html-integrity.ts   # asserts index.html loads only the SDK externally
│       ├── source-rules.ts     # asserts TTMinis containment
│       ├── artifact-budget.ts  # G2.6 ZIP / first-screen JS / empty files / maps / backdoors
│       └── cli/                # the runnable checks (guardrails + G2.6 artifact budget)
├── server/                     # Fastify modular monolith
│   └── src/
│       ├── app.ts              # assembly + error envelope + 404 handler
│       ├── config.ts           # environment, no secrets in code
│       ├── core/errors.ts      # the single error envelope
│       ├── contract.test.ts    # asserts every documented path has a handler
│       └── modules/            # one directory per bounded context
│           ├── health/
│           ├── config/         # GET /v1/config — conservative boot flags
│           ├── identity/       # silent login, session issuance, GET /v1/users/me
│           ├── platform-tiktok/ # the sole TikTok adapter: webhook verification, identity port
│           └── playback/
├── packages/
│   ├── shared/                 # Result, error codes, playback descriptor — client and server
│   ├── config/                 # trusted-domain registry + minis.config.json generator
│   └── quality/                # G2.8 licenses, G1.5 coverage, G1.9 Conventional Commits, G1.10 skip/empty tests, QA-010 axe-core a11y, G1.8 Gitleaks, G1.6 oasdiff, G2.4 Semgrep + CodeQL, G2.5 Trivy, G2.3 Playwright; not bundled
├── contracts/openapi.yaml      # OpenAPI 3.1 — the HTTP surface's source of truth
├── contracts/oasdiff-baseline.yaml # G1.6 snapshot; additive paths do not require updating it
├── docs/                       # architecture, design, plan, engineering (this file)
├── .github/workflows/ci.yml    # L1: G1.8 Gitleaks, G1.6 oasdiff, format, lint, types, G1.9 Conventional Commits, G1.10 skip/empty tests, QA-010 a11y, tests+coverage, build, guardrails
└── .github/workflows/l2.yml    # L2: G2.8 + G2.7 + G2.2 + G2.6 + G2.4 Semgrep + CodeQL + G2.5 Trivy + G2.3 Playwright; does not skip L1
```

This matches the Wave 2 target layout in `docs/architecture/tech-stack.md` §7, with the module
directories created as their modules are implemented rather than pre-created empty. An empty
directory named after a module you have not designed yet is a promise, not a structure.

### 2.1 Deviations from the tech-stack document, and why

| Target (T22, §7) | Here | Reason |
|---|---|---|
| pnpm workspaces + Turborepo | pnpm workspaces, no Turborepo | With four packages and a sub-five-second full build, a task orchestrator adds a dependency and a cache to debug and saves nothing yet. `pnpm -r` is doing the job. Adding Turborepo later is a root-level change that touches no package. |
| `packages/{shared,config}` for generated types | Same, but types are hand-written | The OpenAPI generator is a Wave 2 step. `PlaybackDescriptor` is hand-written now and becomes generated output later; the import site does not change. |
| CSS Modules + design tokens | No styling yet | There is no design system to tokenize in Wave 1. The choice is unaffected by anything in this skeleton. |
| TanStack Query, Zustand, react-i18next | Not installed | Each is a Wave 2 decision that this structure accommodates without moving files. `core/i18n` already enforces the English-completeness rule that `react-i18next` will inherit. |

---

## 3. Package responsibilities

### `app` — the client

Standard SPA, single `index.html`, static output, **hash routing**. The routing mode is a
consequence, not a preference: the bundle ships as a ZIP that TikTok serves, so no server can
rewrite a path and a history-mode reload has no safe answer.

`vite.config.ts` sets `base: './'` for the same reason — an absolute `/assets/...` reference
resolves against the platform's host rather than our package.

### `server` — the API

Fastify, one deployable, modules registered as plugins so the boundary is real at the framework
level rather than by convention. The two live endpoints are the health probe and playback-session
issuance; the latter exists in the skeleton specifically because it is where the architecture's
most consequential correction lives (§4.2 below).

### `packages/shared` — the contract between them

`Result`, the error-code namespaces, and the playback descriptor. The two error namespaces
(`ApiErrorCode` and `BridgeErrorCode`) are kept provably disjoint by a test, because "the SDK
misbehaved" and "the server said no" need completely different handling and are easy to conflate
once they share a type.

### `packages/config` — the domain registry

The trusted-domain list exists once, in `src/domains.ts`. From it the generator produces
`app/minis.config.json` and the list to paste into the Developer Portal. The platform enforces
both lists; maintaining them by hand is how a request starts failing on device only.

---

## 4. The two structural decisions worth knowing before you edit anything

### 4.1 `window.TTMinis` is reachable from exactly one directory

`app/src/platform/` owns the SDK global. Everything else calls `PlatformBridge`. This is enforced
twice — by an ESLint rule and by `tools/source-rules.ts` — and both are tested.

The payoff is not tidiness. It is that `MockBridge` can stand in for the entire platform, which is
what makes login, ads, payment, subscription and the player developable in a plain browser and
testable in CI. Without that containment, every platform-dependent feature is blocked on a device.
It also means the unresolved SDK-namespace question (`TTMinis.*` versus `TTMinis.game.*`, open item
O-1) is a one-line change in `sdk.ts` rather than a repository-wide search.

Every bridge method follows three rules, each covered by tests in `src/platform/sdk.test.ts`:

- **It resolves, it never rejects.** Callers branch on a `Result`.
- **It is bounded by a timeout.** The SDK is not documented to guarantee a callback (open item
  U-06), and an un-timed call hangs a UI state forever.
- **It never destructures an SDK failure payload.** The error shape is undocumented (U-05), so it
  is carried opaquely as `cause` and classified as `BRIDGE_UNKNOWN`.

### 4.2 There is no `<video>` element, and there is no media URL

Episode video is BytePlus-hosted and played by VePlayer, obtained through `TTMinis.getPlayer()`.
Third-party players and native HTML video are prohibited platform-wide; TikTok replaces a `<video>`
element with a blocked UI.

The skeleton takes that constraint seriously in four places at once:

| Where | What it does |
|---|---|
| ESLint | Rejects `<video>`, `<audio>`, `<iframe>`, `<object>`, `<embed>` in JSX and via `createElement`, and rejects importing `hls.js`, `video.js`, `shaka-player`, `dashjs`, `plyr` |
| `app/tools/bundle-scan.ts` | Greps the emitted chunks for the same constructs, catching anything a dependency contributed |
| `app/tools/html-integrity.ts` | Rejects those elements in `index.html` and permits exactly one external script, the SDK |
| `MockVePlayer` | Renders a placeholder `div`. A mock built on `<video>` would make the forbidden thing feel normal in local development |

And on the server side, a test asserts the playback response contains no URL at all. That test is
the enforcement of correction A4: the endpoint returns identifiers, and a signed URL appearing in
it would mean we had quietly rebuilt the self-hosted delivery path the platform does not allow.

The player facade itself owns lifecycle and nothing else: one instance per surface, `enableMp4MSE`
always on because the preload module requires it, `destroy()` idempotent because a React StrictMode
cleanup runs twice, and episode switching through `playNext()` on the retained instance rather than
a new player.

---

## 5. Guardrails, and what each one catches that the others do not

The four layers are not redundant; each covers a gap the previous one cannot see.

| Layer | Command | Catches | Blind to |
|---|---|---|---|
| ESLint | `pnpm lint` | Prohibited constructs in **our source**, at the AST level | Anything a dependency ships |
| Bundle scan | `pnpm check:guardrails` after `build` (a missing artifact **fails**) | Prohibited constructs in the **emitted artifact**, including from dependencies | Source that was tree-shaken out but would return |
| HTML integrity | same command | External scripts and stylesheets, forbidden elements in the document | Runtime injection |
| Domain registry | `pnpm test` | Portal/bundle list drift, wildcards, paths, scheme, the 20-entry budget | Whether a domain is actually reachable |

The layer split matters most for the bundle scan: it runs against the artifact directory named by
`--dist`, so it sees the file the platform's own code scanner would see. Finding a violation there
costs a minute; finding it at upload costs a review cycle.

The scan is fail-closed: a missing or empty artifact directory, or one without `index.html`, is
reported as a violation and exits non-zero rather than being skipped. Absence of the artifact is
absence of evidence of compliance, and there is no flag that lets it pass
(`docs/plan/media-plane-decision.md` §5.3 item 1).

**Verified behaviour, not aspiration.** Injecting `eval("1")` into a built chunk and an extra
`<script src="https://cdn.example.com/x.js">` into `dist/index.html` makes
`pnpm check:guardrails` report both and exit non-zero. The lint rules are asserted the same way,
by `app/tools/eslint-guardrails.test.ts`, which runs the real config against fixtures — a rule
dropped in a config refactor fails a test instead of silently ceasing to enforce.

---

## 6. Commands

```bash
pnpm install              # Node >= 22, pnpm 10
pnpm verify               # format:check + lint + typecheck + check:commits + check:skips + check:a11y + test:coverage + check:coverage + build + guardrails

pnpm dev                  # not defined at the root; run per package:
pnpm --filter @minidrama/app dev      # Vite dev server, MockBridge active automatically
pnpm --filter @minidrama/server dev   # Fastify with watch

pnpm test                 # every package
pnpm lint
pnpm typecheck
pnpm build
pnpm check:guardrails     # requires the build first; a missing app/dist fails the check
pnpm check:licenses       # G2.8; requires the install; a missing store fails the check
pnpm check:coverage       # G1.5; requires test:coverage reports; a missing report fails the check
pnpm check:migrate        # G2.7; up → down → up on a temp sqlite file; a no-op down fails
pnpm check:integration    # G2.2; HTTP against a sqlite file; :memory: or postgres fails
pnpm check:artifact       # G2.6; ZIP / first-screen JS; empty files, maps, backdoors fail
pnpm check:sast           # G2.4; Semgrep custom rules; a missing binary or high finding fails
pnpm check:codeql         # G2.4; CodeQL security-extended; a missing binary or high finding fails
pnpm check:sca            # G2.5; Trivy lockfile SCA; a missing binary or CRITICAL finding fails
pnpm check:smoke          # G2.3; Playwright P0 smoke; a missing binary, dist, or failed spec fails
pnpm check:secrets        # G1.8; Gitleaks dir scan; a missing binary or a finding fails
pnpm check:contract       # G1.6; oasdiff breaking vs the committed baseline; a missing binary fails
pnpm check:commits        # G1.9; Conventional Commits on merge-base(origin/main)..HEAD; prose fails
pnpm check:skips          # G1.10; skip/only/todo/empty tests; a committed skip fails
pnpm check:a11y            # QA-010; axe-core in jsdom; contrast < 4.5:1 fails; not TikTok WebView
pnpm gen:minis-config     # regenerate app/minis.config.json from the domain registry
```

`pnpm verify` is the L1 suite minus G1.8 and G1.6, plus G1.9, G1.10, and QA-010. L1 CI installs Gitleaks
and oasdiff, runs `check:secrets`, then `check:contract`, then format/lint/types, then
`check:commits`, then `check:skips`, then `check:a11y`, then tests+coverage, then `gen:minis-config`. G1.8 and
G1.6 are not folded into `verify` because they need the binaries; a missing binary is red in
CI, not a skip. G1.9, G1.10, and QA-010 are folded into `verify` because they have no extra binary.
History on `main` is not rewritten. L2 (`check:licenses`, `check:migrate`,
`check:integration`, `check:artifact`, `check:sast`, `check:codeql`, `check:sca`,
`check:smoke`) is a second workflow and is not folded into `verify`, so adding it cannot
become a reason to skip a verify step.

---

## 7. Conventions

**TypeScript is strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.** The
second one is not pedantry here: `playAuthToken` is required only by TikTok clients below 44.5.0,
and passing an explicit `undefined` is not the same as omitting the field. The compiler enforces
that distinction, and a test asserts the key is absent rather than undefined.

**Tests live next to the code they test**, as `*.test.ts` / `*.test.tsx`. Node-environment tests
under `app/tools/` are marked with `// @vitest-environment node`.

**Comments explain constraints, not mechanics.** Nearly every comment in this skeleton answers
"why is this not the obvious thing?" and cites the document that decided it. That is the form that
survives; a comment restating the line below it is deleted at the first review.

**Secrets never enter the repository.** `.env.example` carries placeholders and marks every
SERVER-ONLY variable. The client bundle holds the client key and nothing else; `client_secret`
exists only server-side, and `server/src/config.ts` exposes only a presence flag for it.

**Placeholder hosts use `.invalid`.** RFC 2606 reserves it, so it can never resolve. A skeleton
that leaked into a build fails loudly instead of talking to somebody else's host.

---

## 8. Adding to this skeleton

| Adding | Where it goes | What you must not skip |
|---|---|---|
| A platform capability | A method on `PlatformBridge` + both implementations | The conformance test iterates `BRIDGE_METHOD_NAMES`; a type-level check fails `typecheck` if you add a method without listing it |
| An API endpoint | `server/src/modules/<context>/routes.ts` + `contracts/openapi.yaml` | The error envelope from `core/errors.ts`, and a `traceId` on every failure. `contract.test.ts` dispatches every documented operation, so a path with no handler fails the suite |
| An outbound TikTok call | `server/src/modules/platform-tiktok/` only | No other module may hold a client secret or build a TikTok request. Consumers get a port interface, as `identity` does |
| A trusted domain | `packages/config/src/domains.ts`, then `pnpm gen:minis-config` | Register it in the Developer Portal too; CI fails if the generated file drifts |
| A user-facing string | `app/src/core/i18n/locales/en.json` and every other locale | The parity test fails on a missing key in any locale, and English must never fall back to a raw key |
| A page | `app/src/routes/` + an entry in `ROUTES` | Hash-mode paths only; unknown routes must reach `#/fallback`, which always offers a way home |

---

## 9. What Wave 2 changes about this structure

Roughly in dependency order, and all additive:

- **Contract-generated types.** `contracts/openapi.yaml` starts generating client types and server
  validation. `PlaybackDescriptor` moves from hand-written to generated; import sites do not move.
- **Real state layers.** TanStack Query for server state, Zustand for client state, with the rule
  from the architecture that entitlement is never client state.
- **The rest of the boot sequence.** SCR-01 paints first, then silent login, then `GET /v1/config`
  (conservative flags: comments off, ads off, heartbeat 10 s). Deep-link target resolution is still
  a later insertion. The splash does not invent comments-on, legal URLs, or a Beans rate.
- **The remaining server modules**, as directories under `server/src/modules/` per the module table
  in `docs/architecture/system-overview.md` §7.1, with PostgreSQL, Drizzle and Redis behind them.
- **Playwright and Testcontainers**, joining the Vitest layer that exists now.
- **`minis` CLI integration**, which is also what confirms the real `minis.config.json` field set
  (open item U-11/O-4) and lets the generator emit the complete file.
