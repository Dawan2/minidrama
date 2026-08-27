# W14 — C4 cont: L2 G2.5 Trivy SCA

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-cont-72c4`, cut from `origin/main` at `2a74748` (C4-04
> `GET /v1/config` + splash). Merged forward onto `727592f` (C4-08 ads, landed while this
> slot ran).
> **Item:** `C4-02` remainder / `INF-007`, the G2.5 slice. Next missing L2 job that does not
> need Playwright, a device, or AM, after G2.8 / G2.7 / G2.2 / G2.6 / G2.4 on main.
> **Skipped on purpose:** C4-04 (already on `main` as `2a74748`). C4-08
> (`bc-e055048b` / `cursor/w14-work-c4-follow-72c4`, landed as `727592f`). Subsequent C4
> `bc-eed03394` and following C4 `bc-dd13f497` (in flight at pick). G2.3 needs Playwright.
> **Not in scope:** CodeQL (G2.4 later slice), G2.3, C4-03 Postgres, C4-07 VIP, Beans,
> inventing ad-unit ids. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` C4-02 names remaining L2 cheapest-first: G2.7, G2.2, G2.6,
G2.3, G2.4/G2.5. G2.8, G2.7, G2.2, G2.6, and G2.4 already have jobs. G2.3 needs Playwright.
C4-04 was on `main`. C4-08 was already on `cursor/w14-work-c4-follow-72c4`. C4-03 is T14
Postgres ("do not fake"). C4-07 has no subscription contract. The next local unblocked
slice was **G2.5**.

`docs/03-stack-decision.md` D13 names Trivy for G2.5 SCA/镜像. `docs/14-quality-gates.md`
§4 fails on critical findings, and on high findings that have a published fix older than
seven days. The backlog says not to fake this with a grep. What was missing is the **job
that runs Trivy**.

There is no container image in this repository. This slice scans the committed
`pnpm-lock.yaml`. A Dockerfile or image tarball that appears later fails rather than
reporting "0 images" over a file the job ignored. That is the image half's fail-closed
until a later slice has a real image to scan.

L2 stays a second workflow. Folding SCA into `pnpm verify` would mix the levels and would
put a Trivy binary on the L1 path. `.github/workflows/ci.yml` is byte-identical to
`origin/main`. There is no `continue-on-error`, no path filter, no test skip.

---

## 2. What changed

`pnpm run check:sca` requires a lockfile, a tree with no unscanned Dockerfile, and a
Trivy binary. It invokes `trivy fs --format json --scanners vuln` on `pnpm-lock.yaml`
(never a TypeScript grep of CVE ids) and applies the G2.5 policy to the JSON. A missing
binary, a missing lockfile, empty engine output, or a scan with no language-package
targets fails — the same fail-open G2.8 closed for an absent pnpm store.

The L2 job installs Trivy 0.74.0 (0.66.0 is no longer a GitHub release asset), then runs
that CLI. The unit tests inject a runner so L1 does not need Trivy; the reverse-verification
quote below is the real engine against a fixture.

| File | Change |
| --- | --- |
| `.github/workflows/l2.yml` | Job `sca` (G2.5). Install Trivy, then `check:sca`. No `continue-on-error` |
| `.github/workflows/ci.yml` | **Unchanged** vs `origin/main` |
| `packages/quality/src/sca.ts` | Args, lockfile preflight, Dockerfile refuse, JSON policy, Trivy argv |
| `packages/quality/src/cli/check-sca.ts` | Process boundary. `process.exit` of the library result |
| `package.json` | `check:sca`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The sixth L2 job exists |

The live check on this tree (Trivy 0.74.0):

```
sca passed (1 targets, 0 images, 0 non-blocking findings)
```

---

## 3. Reverse verification

The CLI tests are the injection for missing binary / missing lockfile / unknown args.
Against a fixture whose `package-lock.json` pins `lodash@4.17.4`, the real engine
(Trivy 0.74.0) exits 1:

```
sca failed (5):
  CVE-2019-10744 lodash@4.17.4 CRITICAL (fixed 4.17.12) package-lock.json
  CVE-2018-16487 lodash@4.17.4 HIGH (fixed >=4.17.11) package-lock.json
  CVE-2020-8203 lodash@4.17.4 HIGH (fixed 4.17.19) package-lock.json
  CVE-2021-23337 lodash@4.17.4 HIGH (fixed 4.17.21) package-lock.json
  CVE-2026-4800 lodash@4.17.4 HIGH (fixed 4.18.0) package-lock.json
```

A missing `trivy` binary:

```
trivy is required: the binary is absent or not executable
```

Exit 1. A tree that contains a Dockerfile, with no image scan:

```
container image scan has not run: Dockerfile or image tarball present
  …/Dockerfile
```

Exit 1. An unknown argument exits 2. That is how greening G2.5 by skipping Trivy, or by
adding a Dockerfile the job never looks at, stays red.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| C4-04 (`2a74748`) | Already on `main` at pick. Not retaken |
| C4-08 (`cursor/w14-work-c4-follow-72c4`) | Landed on `main` as `727592f` while this slot ran. Ad routes, UnlockPanel, `adUnlock: false`. Merged in; this slot does not touch those files |
| `bc-eed03394` (subsequent C4), `bc-dd13f497` (following C4) | In flight at pick. No `cursor/*` G2.5 branch on origin. This slot's files are `l2.yml` job `sca`, `packages/quality/src/sca*`, `check-sca` |
| `bc-25ee8442` (further remaining C4) | Running at pick. Same rule: do not guess its files |

`git diff origin/main -- .github/workflows/ci.yml` is empty.

---

## 5. Verification

`pnpm verify` green after merging `origin/main` (`727592f` C4-08). L1 sequence unchanged:
format → lint → typecheck → test:coverage → check:coverage → build → guardrails.
`check:sca` is not in that sequence.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 61 |
| `packages/config` | 45 |
| `packages/quality` | 144 |
| `server` | 1,734 |
| `app` | 1,089 |
| **Total** | **3,073** |

Zero skipped. Forty-two tests for G2.5 (37 library + 5 CLI). Coverage gate:

```
coverage global lines 93.83% (14200/15134), branches 91.59%, core lines 95.50%, diff lines 98.84% (256/259)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-LGFQlwOf.js` 350.40 kB / 106.98 kB gzip — the
C4-08 merge's artifact, not this slot's).

---

## 6. Left open

- **G2.3, CodeQL.** Playwright smoke E2E, and the CodeQL half of G2.4. Further L2 slices.
  Not faked with a grep.
- **Container image scan.** No Dockerfile and no image in this repository. A later slice
  that adds one must satisfy G2.5's image half; until then a present Dockerfile is red.
- **C4-03, C4-07.** Postgres/Drizzle/Redis, VIP. Beans/VIP/recharge stay AM-blocked; this
  slot does not invent rates, subscriptions, or ad-unit ids.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
