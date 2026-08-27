# W14 — C4 more2: L2 G2.4 CodeQL

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-more2-72c4`, cut from `origin/main` at `727592f` (C4-08 ads).
> Merged forward onto `98e75c6` (G2.5 Trivy SCA, landed while this slot ran).
> **Item:** `C4-02` remainder / `INF-007`, the CodeQL half of G2.4. Next missing L2 job that
> does not need Playwright, a device, or AM, after G2.8 / G2.7 / G2.2 / G2.6 / G2.4 Semgrep
> on main and G2.5 in flight on `cursor/w14-work-c4-cont-72c4`.
> **Skipped on purpose:** C4-08 (already on `main` as `727592f`). G2.5
> (`bc-25ee8442` / `cursor/w14-work-c4-cont-72c4`, landed as `98e75c6`). Subsequent C4
> `bc-eed03394` (in flight; long-running). G2.3 needs Playwright.
> **Not in scope:** G2.3, C4-03 Postgres, C4-07 VIP, Beans, inventing Portal ad-unit ids.
> No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` C4-02 names remaining L2 cheapest-first: G2.7, G2.2, G2.6,
G2.3, G2.4/G2.5. G2.8, G2.7, G2.2, G2.6, and G2.4 Semgrep already have jobs. G2.5 was on
`cursor/w14-work-c4-cont-72c4`. G2.3 needs Playwright. C4-08 was on `main`. C4-03 is T14
Postgres ("do not fake"). C4-07 has no subscription contract. The next local unblocked
slice was **CodeQL**, the other half of G2.4.

`docs/03-stack-decision.md` D13 names Semgrep **and** CodeQL for G2.4. `docs/14-quality-gates.md`
§4 and `docs/14-security.md` §2.2 fail on high-and-above. The Semgrep job owns the
14-security §2.1 custom rules. What was missing is the **job that runs CodeQL**.

L2 stays a second workflow. Folding CodeQL into `pnpm verify` would mix the levels and would
put a ~bundle-sized CLI on the L1 path. `.github/workflows/ci.yml` is byte-identical to
`origin/main`. There is no `continue-on-error`, no path filter, no test skip.

---

## 2. What changed

`pnpm run check:codeql` requires a codescanning config that names `security-extended`, a
tree with source files, and a CodeQL binary. It runs `codeql database create` then
`codeql database analyze` against
`codeql/javascript-queries:codeql-suites/javascript-security-extended.qls`, reads SARIF, and
maps severity the way GitHub code scanning does (`security-severity` ≥ 9.0 critical, ≥ 7.0
high; otherwise `level` / `problem.severity` error → high). A missing binary, a missing
config, a thinned suite, empty engine output, or a run with no queries fails — the same
fail-open G2.8 closed for an absent pnpm store.

The L2 job installs CodeQL bundle 2.26.2, then runs that CLI. The unit tests inject a runner
so L1 does not need the bundle.

| File | Change |
| --- | --- |
| `.github/workflows/l2.yml` | Job `codeql` (G2.4). Install CodeQL, then `check:codeql`. No `continue-on-error` |
| `.github/workflows/ci.yml` | **Unchanged** vs `origin/main` |
| `packages/quality/codeql/codeql-config.yml` | `queries: uses: security-extended`. Thinning this list is red |
| `packages/quality/src/codeql.ts` | Args, config preflight, suite pin, SARIF policy, create/analyze argv |
| `packages/quality/src/cli/check-codeql.ts` | Process boundary. `process.exit` of the library result |
| `package.json` | `check:codeql`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The CodeQL L2 job exists |

G2.5 (`check:sca`, job `sca`) landed on `main` while this branch was open. Merged in; both
jobs kept. This slot does not thin the Trivy job.

---

## 3. Reverse verification

The CLI tests are the injection for missing binary / missing config / unknown args /
thinned suite. Against a fixture SARIF whose only result is `js/xss` at
`security-severity` 9.8, the check exits 1:

```
codeql failed (1):
  js/xss Evil.tsx:1 CRITICAL
```

A missing `codeql` binary:

```
codeql is required: the binary is absent or not executable
```

Exit 1. An unknown argument exits 2.

Deleting `uses: security-extended` from the YAML, or passing
`--suite javascript-code-scanning.qls`, fails before analyze
(`codeql config is missing required query uses` /
`not the required security-extended pack`). A SARIF `runs[].tool.driver.rules`
array of length 0 fails (`codeql reported no queries`). That is how greening G2.4
by thinning the CodeQL half stays red.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| C4-08 ads (`727592f`) | Already on `main` at pick. Not retaken. No Portal ad-unit ids |
| G2.5 Trivy (`bc-25ee8442`, `cursor/w14-work-c4-cont-72c4`) | Landed on `main` as `0fef6e9` / `98e75c6` while this slot ran. `l2.yml` job `sca`, `check:sca`. Merged in; both jobs kept |
| Subsequent C4 (`bc-eed03394`) | Skipped at pick (long-running). Different item |
| C4-03 / C4-07 | Postgres and VIP. Not faked. No Beans rate |

`git diff origin/main -- .github/workflows/ci.yml` is empty (after merging G2.5, still empty
against this branch's `ci.yml`).

---

## 5. Verification

`pnpm verify` green after merging `origin/main` (`98e75c6` G2.5 Trivy SCA). L1 sequence
unchanged: format → lint → typecheck → test:coverage → check:coverage → build → guardrails.
`check:codeql` is not in that sequence.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 61 |
| `packages/config` | 45 |
| `packages/quality` | 188 |
| `server` | 1,734 |
| `app` | 1,089 |
| **Total** | **3,117** |

Zero skipped. Forty-four tests for CodeQL (38 library + 6 CLI). Coverage gate:

```
coverage global lines 93.94% (14563/15502), branches 91.59%, core lines 95.50%, diff lines 98.64% (363/368)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-LGFQlwOf.js` 350.40 kB / 106.98 kB gzip — the
G2.5 merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **G2.3.** Playwright smoke. Further L2 slice. Not faked with a grep.
- **C4-03, C4-07.** Postgres/Drizzle/Redis, VIP contract. Beans/VIP/recharge stay AM-blocked;
  this slot does not invent rates, `#/vip`, or `/v1/subscriptions`.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.

G2.5 Trivy (`bc-25ee8442`) landed on `main` as `98e75c6` while this slot ran. This branch
has taken it; `l2.yml` keeps both `codeql` and `sca`.
