# minidrama

A mini-drama app for **TikTok Minis**: a standard H5 client rendered in the TikTok app's WebView,
packaged as a static ZIP that TikTok hosts, plus a backend we own.

> **Status: Wave 1 skeleton.** The toolchain, the platform-constraint enforcement and the
> structural decisions are real and running. The product — catalogue, feed, unlock, wallet, VIP —
> is not built yet. See [`docs/engineering/repo-layout.md`](docs/engineering/repo-layout.md).

## Quick start

Requires Node ≥ 22 and pnpm 10.

```bash
pnpm install
pnpm verify                            # the full gate: format, lint, types, tests+coverage, build, guardrails

pnpm --filter @minidrama/app dev       # client at http://localhost:5173
pnpm --filter @minidrama/server dev    # API at http://localhost:8080
```

The client runs in a plain browser: with no TikTok SDK present it selects `MockBridge`
automatically, so login, ads, payment and the player all have a working local path.

Copy `.env.example` to `.env` for local configuration. It contains placeholders only — every
value marked SERVER-ONLY must never appear in anything under `app/`.

## Layout

| Path | What it is |
|---|---|
| `app/` | The H5 client. React, hash routing, static output |
| `app/src/platform/` | `PlatformBridge` — the only code allowed to touch `window.TTMinis` |
| `app/src/player/` | The VePlayer facade |
| `app/tools/` | Build-time guardrails: bundle scan, HTML integrity, source rules |
| `server/` | Fastify modular monolith |
| `packages/shared` | Types shared by client and server |
| `packages/config` | Trusted-domain registry; generates `app/minis.config.json` |
| `packages/quality` | G2.8 license whitelist, G1.5 coverage, G2.4 Semgrep + CodeQL, G2.5 Trivy, G2.3 Playwright |
| `contracts/` | OpenAPI 3.1 — the source of truth for the HTTP surface |
| `docs/` | Architecture, design, plan and engineering documentation |

## Two rules that shape everything here

**Episode video plays through VePlayer, obtained from `TTMinis.getPlayer()`.** Episodes are hosted
in BytePlus and moderated by TikTok. Third-party players and native HTML video are prohibited —
TikTok replaces a `<video>` element with a blocked UI — so there is no `<video>` anywhere in the
bundle, including in mocks and for trailers. Lint rules, a post-build bundle scan and an
`index.html` check each enforce this independently.

**The SDK global lives in one directory.** Business code never touches `window.TTMinis`; it calls
`PlatformBridge`, which has a real implementation and a mock held to the same interface by a
conformance test. That containment is what makes every platform-dependent feature developable and
testable without a device.

Both are explained in full in [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md).

## Commands

```bash
pnpm lint                # ESLint, including the platform-constraint rules
pnpm typecheck           # strict TypeScript across all packages
pnpm test                # Vitest across all packages
pnpm test:coverage       # the same tests, with V8 coverage reports
pnpm build               # client bundle + server typecheck
pnpm check:guardrails    # platform guardrails; requires the build — a missing app/dist fails
pnpm check:licenses      # G2.8 license whitelist; requires the install — a missing store fails
pnpm check:coverage      # G1.5 coverage floors; requires test:coverage — a missing report fails
pnpm check:migrate       # G2.7 migrate up → down → up; a no-op down or up-only file fails
pnpm check:integration   # G2.2 HTTP + sqlite file; :memory: or postgres URL fails
pnpm check:artifact      # G2.6 client ZIP / first-screen JS; empty files, maps, backdoors fail
pnpm check:sast          # G2.4 Semgrep 14-security §2.1 rules; a missing binary fails
pnpm check:codeql        # G2.4 CodeQL security-extended; a missing binary or high finding fails
pnpm check:sca           # G2.5 Trivy lockfile SCA; a missing binary or CRITICAL finding fails
pnpm check:smoke         # G2.3 Playwright P0 smoke; a missing binary, dist, or failed spec fails
pnpm gen:minis-config    # regenerate app/minis.config.json from the domain registry
```

L1 CI (`.github/workflows/ci.yml`) runs the verify sequence on every pull request, every push to
`main` or a `cursor/**` branch, and on `workflow_dispatch`. L2 CI (`.github/workflows/l2.yml`)
runs the G2.8 license whitelist, the G2.7 migrate check, the G2.2 sqlite integration check,
the G2.6 artifact budget, the G2.4 Semgrep + CodeQL SAST checks, the G2.5 Trivy SCA check,
and the G2.3 Playwright smoke on the same events; it does not skip, filter, or `continue-on-error`
the L1 suite.
`check:migrate`, `check:integration`, `check:artifact`, `check:sast`, `check:codeql`,
`check:sca`, and `check:smoke` are not folded into `verify`.
