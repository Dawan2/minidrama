# W14 — L2 next: G2.4 Semgrep SAST

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-l2-next-72c4`, cut from `origin/main` at `eec7c71` (PLY-002).
> **Item:** `C4-02` remainder / `INF-007`, the G2.4 slice. Next missing L2 job that does not need
> Playwright, a device, or AM, after G2.8 / G2.7 / G2.2 on main and G2.6 in flight on
> `bc-0b570e4b` (`cursor/w14-work-c4-next-72c4`).
> **Skipped on purpose:** GET `/v1/users/me` (`bc-e35c1229`), the long-running C4-next G2.6
> branch (inspected; it is the artifact job, not this one), PLY-002 (already on main as
> `eec7c71`). G2.3 needs Playwright. G2.5 needs trivy.
> **Not in scope:** CodeQL (same gate, later slice), G2.5, G2.3, C4-04 splash, Beans, VIP, ads.
> No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` C4-02 names remaining L2 cheapest-first: G2.7, G2.2, G2.6, G2.3,
G2.4/G2.5. G2.8, G2.7, and G2.2 already have jobs. G2.6 was on `cursor/w14-work-c4-next-72c4`
(and landed on `main` while this slot ran). G2.3 needs Playwright. The next local unblocked
slice was **G2.4**.

`docs/03-stack-decision.md` D13 names Semgrep with custom rules: ban `dangerouslySetInnerHTML`,
ban string-concatenated SQL, and the rest of 14-security §2.1. `docs/14-quality-gates.md` §4
fails the gate on high-and-above. The backlog says not to fake this with a grep. What was
missing is the **job that runs Semgrep**.

L2 stays a second workflow. Folding SAST into `pnpm verify` would mix the levels and would put
a Python binary on the L1 path. `.github/workflows/ci.yml` is byte-identical to `origin/main`.
There is no `continue-on-error`, no path filter, no test skip.

---

## 2. What changed

`pnpm run check:sast` requires a rules directory, a tree with source files, and a Semgrep
binary. It validates that the seven required rule ids are present at ERROR/HIGH/CRITICAL,
invokes `semgrep scan --config … --json --error --metrics=off` (never a registry `p/` config),
and fails on blocking findings. A missing binary, an empty rules directory, a tree with no
source files, or non-JSON engine output fails — the same fail-open G2.8 closed for an absent
pnpm store.

The L2 job installs Semgrep 1.128.1, then runs that CLI. The unit tests inject a runner so L1
does not need Python; the reverse-verification quote below is the real engine against a fixture.

| File | Change |
| --- | --- |
| `.github/workflows/l2.yml` | Job `sast` (G2.4). Install Semgrep, then `check:sast`. No `continue-on-error` |
| `.github/workflows/ci.yml` | **Unchanged** vs `origin/main` |
| `packages/quality/semgrep/minidrama.yml` | Seven §2.1 rules, all `severity: ERROR` |
| `packages/quality/src/sast.ts` | Args, rule preflight, JSON policy, Semgrep argv. Coverage can see them |
| `packages/quality/src/cli/check-sast.ts` | Process boundary. `process.exit` of the library result |
| `package.json` | `check:sast`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The fifth L2 job exists |

The live check on this tree:

```
sast passed (219 files, 0 non-blocking findings)
```

---

## 3. Reverse verification

The CLI tests are the injection for missing binary / missing rules / unknown args. Against a
fixture that uses `dangerouslySetInnerHTML`, the real engine (Semgrep 1.128.1) exits 1:

```
sast failed (1):
  workspace.packages.quality.semgrep.ban-dangerously-set-inner-html …/Evil.tsx:1 ERROR
```

The same engine against `db.prepare("SELECT * FROM " + t)` reports `ban-string-concat-sql`,
against `eval("1")` reports `ban-eval`, against `el.innerHTML = location.hash` reports
`ban-innerhtml-assignment`. A clean `export const x = 1` exits 0.

Deleting a required id from the YAML, or lowering `ban-eval` to INFO, fails before Semgrep
runs (`semgrep rules are missing required ids` / `not blocking severity`). That is how greening
G2.4 by thinning the ruleset stays red.

A missing `semgrep` binary:

```
semgrep is required: the binary is absent or not executable
```

Exit 1. An unknown argument exits 2.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-0b570e4b` (`cursor/w14-work-c4-next-72c4`, G2.6) | Landed on `main` as `fe5405a` / `a8e1023` while this slot ran. `l2.yml` job `artifact`, `check:artifact`, `app/tools/artifact-budget.ts`. Merged in; both jobs kept. This slot does not touch those files except the workflow header and the docs that list every L2 job |
| `bc-e35c1229` (GET `/v1/users/me`) | Skipped at pick. Landed as `f4a4b1c` / `33d149f`. Identity me-routes and ProfilePage. Not touched |
| PLY-002 (`eec7c71`) | Already on `main` at pick. Not retaken |

`git diff origin/main -- .github/workflows/ci.yml` is empty.

---

## 5. Verification

`pnpm verify` green on `a020e5c` after merging `origin/main` (`33d149f` users-me + G2.6). L1
sequence unchanged: format → lint → typecheck → test:coverage → check:coverage → build →
guardrails. `check:sast` is not in that sequence.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 58 |
| `packages/config` | 45 |
| `packages/quality` | 102 |
| `server` | 1,673 |
| `app` | 1,050 |
| **Total** | **2,928** |

Zero skipped. Thirty-five tests for G2.4 (30 library + 5 CLI). Coverage gate:

```
coverage global lines 94.03% (12969/13793), branches 91.98%, core lines 98.13%, diff lines 91.78% (268/292)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DdfT1FNc.js` 342.98 kB / 104.21 kB gzip — the
users-me merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **G2.3, G2.5, CodeQL.** Playwright, trivy, and the CodeQL half of G2.4. Further L2 slices.
  Not faked with a grep.
- **C4-03, C4-04, C4-06, C4-07, C4-08.** Postgres/Drizzle/Redis, splash contract, Beans, VIP,
  ads. Beans/VIP/recharge stay AM-blocked; this slot does not invent rates or ad-unit ids.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
