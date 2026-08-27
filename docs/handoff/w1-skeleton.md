# Handoff — Wave 1, Repo Skeleton (W1 work slot 3)

> **Branch:** `cursor/w1-repo-skeleton-e7c9`, cut from `cursor/w1-architecture-bed5`.
> **Scope:** a running, Minis-compatible project scaffold with lint and tests that actually
> execute. Not the drama product.
> **Companion document:** `docs/engineering/repo-layout.md` — the structural map. This file is the
> slot record: what was decided, what was verified, what is deliberately absent, and what the next
> slot must not re-litigate.

---

## 1. State on arrival

`main` held documentation only: a `README.md` of one line and 27 documents under `docs/`. There was
no `package.json`, no toolchain, no code. Three Wave 1 branches were in flight, all
documentation-only and none of them touched by this slot:

| Branch | Owns | Touched here |
|---|---|---|
| `cursor/w1-architecture-bed5` | `docs/architecture/**` | No — this branch is its descendant |
| `cursor/w1-technical-design-docs-8a32` | `docs/design/**` | No |
| `cursor/w1-plan-p3-e16a` | `docs/plan/**` | No |

This branch adds `docs/engineering/repo-layout.md` and this file, and no other document. Prettier
is configured to ignore `docs/` entirely so that a formatting pass can never rewrite another
slot's prose.

---

## 2. What was delivered

Five commits, 81 files, all green.

| Commit | Contents |
|---|---|
| `4bfb4ea` | pnpm workspace root, strict TypeScript baseline, Prettier, `.gitignore`, `.env.example`, and the ESLint flat config that encodes the platform restrictions |
| `4675b9f` | `@minidrama/shared` (Result, error namespaces, playback descriptor) and `@minidrama/config` (trusted-domain registry + `minis.config.json` generator) |
| `9b7220e` | `app/` — the H5 client: `index.html` with the SDK tag, `PlatformBridge` with real and mock implementations, the VePlayer facade, hash routes, i18n, and the `app/tools/` guardrails |
| `3629091` | `server/` — Fastify with health and playback-session endpoints, and `contracts/openapi.yaml` |
| `abfc664` | GitHub Actions CI running the whole gate |

### 2.1 Verification

Every command below was run on this branch and passed.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **125 passing, 0 skipped, 0 failing** — 92 app, 16 config, 8 shared, 9 server |
| Build | `pnpm build` | pass — `dist/index.html` 0.75 kB, `assets/index-*.js` 242.80 kB (78.07 kB gzipped) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The gzipped initial JavaScript is 78 kB against the 300 kB budget in `docs/03-nonfunctional.md` §2.
That is React, React DOM and the router with no product code, so it is the floor rather than a
result — but it confirms the budget is not already spent.

### 2.2 Test inventory

No test is skipped, and none asserts only that a module imports. The distribution, by what each
group actually protects:

| Group | Tests | Protects |
|---|---|---|
| `app/tools/eslint-guardrails.test.ts` | 15 | That the platform lint rules still fire, by running the real config against fixtures |
| `app/tools/{bundle-scan,html-integrity,source-rules}.test.ts` | 24 | The post-build scan, the document integrity rules, and TTMinis containment — the last two also run against the real files in this repository |
| `app/src/platform/*.test.ts` | 27 | Bridge conformance across both implementations, timeout behaviour, SDK-callback normalization, opaque failure payloads, capability gating |
| `app/src/player/*.test.ts(x)` | 15 | Player lifecycle: single instance, `enableMp4MSE`, idempotent destroy, `playNext` reuse, no `video` element, graceful degradation |
| `app/src/{App,routes,core}` | 11 | Routing including the fallback path, and English/locale completeness |
| `packages/config` | 16 | Domain-rule validation and generated-file drift |
| `packages/shared` | 8 | Result semantics and error-namespace disjointness |
| `server` | 9 | Health, the error envelope, playback denial, and the no-media-URL assertion |

---

## 3. Decisions taken in this slot

These were not in the architecture documents. They are recorded here so the next slot can overturn
them deliberately rather than by accident.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S1 | **No Turborepo yet**, despite T22 | Four packages, full build under five seconds. A task orchestrator would add a dependency and a cache to debug for no measured gain | Root-level change, no package moves |
| S2 | **`MockVePlayer` renders a `div`, never a `<video>`** | A mock built on the forbidden element normalizes it in local development and defeats the point of the bundle scan | None |
| S3 | **Guardrails split into lint rules and file-level checks** | Lint sees our AST; only a post-build scan sees what a dependency contributed to the artifact the platform scans | None |
| S4 | **The real ESLint config is executed by a test** | The enforcement matrix claims each rule "fails the build". A rule dropped during a config refactor would keep that claim on paper only | None |
| S5 | **Placeholder hosts use `.invalid`** (RFC 2606) | Cannot resolve, so a leaked placeholder fails loudly instead of reaching an unrelated host | One line in `domains.ts` |
| S6 | **`exactOptionalPropertyTypes` on** | `playAuthToken` must be *absent*, not `undefined`, for clients at or above TikTok 44.5.0. The compiler now enforces the distinction | Flag flip, some call sites |
| S7 | **Playback endpoint shipped in the skeleton** | It is where correction A4 lives. Encoding "no media URL" as an executable test now is cheaper than discovering the regression later | None |
| S8 | **`packages/shared` carries a code subset, not the full catalogue** | A code with no producer and no consumer is documentation pretending to be code | Additive |
| S9 | **Hand-written types now, generated from OpenAPI in W2** | The generator is a W2 step; import sites do not change when it lands | Additive |

---

## 4. What this slot deliberately did not build

Listed so nobody re-scopes it as an omission:

- No catalogue, feed, drama detail, unlock panel, wallet, recharge, VIP, comments, history or
  profile. No product surface of any kind beyond the three routes needed to prove routing works.
- No TanStack Query, Zustand, `react-i18next`, CSS Modules or design tokens.
- No PostgreSQL, Redis, Drizzle, BullMQ or Docker Compose.
- No real TikTok API calls: no OAuth exchange, no trade orders, no webhooks, no media-asset APIs.
- No Playwright, Testcontainers or MSW.
- No `minis` CLI integration, and therefore no confirmed `minis.config.json` field set.
- **No pull request**, per the slot brief.

---

## 5. Open items this slot touched

Numbering follows the existing registries so nothing forks. None of these are resolved here; each
is *isolated* so it cannot block downstream work.

| # | Item | How the skeleton isolates it | Resolution |
|---|---|---|---|
| O-1 | `TTMinis.*` vs `TTMinis.game.*` | `resolveSdkNamespace()` picks at runtime by probing for `getPlayer`; tested both ways | On-device, W2 |
| U-05 | SDK error payload shape undocumented | Carried opaquely as `cause`, classified `BRIDGE_UNKNOWN`, never destructured | On-device, W2 |
| U-06 | SDK timeout behaviour undocumented | Every call bounded; a hang becomes `BRIDGE_TIMEOUT` | On-device, W2 |
| U-11 / O-4 | `minis.config.json` field set unknown | Generator emits only the domain fields and passes unknown fields through untouched | `minis init` on a real project |
| U-19 | Whether the SDK host consumes a trusted-domain slot | Registered defensively; the budget check has 18 free entries either way | Portal, W2 |
| U-21 | Ad unit identifiers | The bridge takes `adUnitId` as an argument; nothing is hard-coded in the client | After IAA enablement |
| B-1 | The official requirements PDF was never located | Unchanged by this slot. No platform claim here originates anywhere but the public documentation already cited by the architecture set | When the PDF arrives |

---

## 6. Notes for the next slots

**For whoever implements a platform capability.** Add the method to `PlatformBridge`, then to both
implementations. You cannot forget the mock: a type-level check fails `pnpm typecheck` if a method
is added without being listed in `BRIDGE_METHOD_NAMES`, and the conformance test then runs against
both implementations automatically.

**For whoever implements an API endpoint.** Add it to `contracts/openapi.yaml` in the same change.
The document's rule is that a path in it always has a running handler, which is what keeps it
usable as a generation source in W2. Use the envelope from `server/src/core/errors.ts`; every
failure carries a `traceId`.

**For whoever touches playback.** Read `docs/architecture/system-overview.md` §5 first. The two
things that will fail review or production if forgotten: the response is a descriptor and never a
URL, and there is no `<video>` element anywhere including in mocks and trailers. Both are tested,
so you will find out immediately — but knowing why is cheaper than being told by a red test.

**For whoever adds a domain.** Edit `packages/config/src/domains.ts` and run
`pnpm gen:minis-config`. CI regenerates and diffs, so a hand-edit of `app/minis.config.json` fails.
Register the same domain in the Developer Portal; the repository cannot check that for you, and it
is the half of the pair that fails silently on device.

**For whoever plans W2 sequencing.** The dependency order that this skeleton implies:
contract-generated types → state layers → the rest of the boot sequence → server modules with
their datastores → Playwright and Testcontainers → `minis` CLI. The first four are independent of
any platform credential or on-device access, which matters because the IAA/IAP enablement chain is
long and everything above is buildable while it runs.

---

## 7. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover:

- **The bundle scan is textual.** It greps emitted chunks. A sufficiently exotic construction
  (`window["ev" + "al"]`) would pass it. It is a net under the lint rules, not a proof, and the
  platform's own scanner remains the authority.
- **`TikTokBridge` has never run against a real SDK.** Its failure paths and its shape are tested;
  its payload mapping is inference from documentation and is the first thing to verify on device.
- **`react-hooks/exhaustive-deps` is a warning, not an error**, matching the plugin's default. The
  one effect where it matters — the player facade in `PlayerSurface` — is covered by mount/unmount
  tests instead.
- **CI has never executed.** The workflow is written against `pnpm/action-setup@v4` and
  `actions/setup-node@v4` with `node-version-file: .nvmrc`, and every step is a command verified
  locally, but the first real run is on the first push that triggers it.
- **No E2E layer.** Vitest plus the mock bridge covers a great deal off-device, but nothing here
  has been seen inside the TikTok WebView. That gap closes only with a test client.
