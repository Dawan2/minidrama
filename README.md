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
pnpm verify                            # the full gate: format, lint, types, tests, build, guardrails

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
pnpm build               # client bundle + server typecheck
pnpm check:guardrails    # platform guardrails; run after build to include the bundle scan
pnpm gen:minis-config    # regenerate app/minis.config.json from the domain registry
```

CI (`.github/workflows/ci.yml`) runs the same sequence on every pull request.
