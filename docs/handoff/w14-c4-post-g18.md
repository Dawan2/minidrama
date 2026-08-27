# W14 — C4 post-G1.8: L1 G1.6 oasdiff contract compatibility

> **Slot:** W14, work slot. One backlog leftover, no pull request.
> **Branch:** `cursor/w14-work-c4-post-g18-72c4`, cut from `origin/main` at `67d063f`
> (G1.8 Gitleaks on main). Merged forward onto `795baaf` (client resume seek).
> **Item:** G1.6 / T23 remainder — `oasdiff breaking` as an L1 job. An ERR-level change is
> red. A missing binary is red. A thinning ignore file is red.
> **Not in scope:** G1.8 (on `main` at `67d063f`; this slot does not retake it). Client
> resume seek `bc-5a3958d4` (in flight at pick; landed as `795baaf`). G2.3 Playwright
> `bc-9578758f` (in flight). C4-03 Postgres. C4-07 VIP. Beans, enabling wallet top-up,
> inventing ad-unit ids. No pull request. No AM fiction.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after G1.8, skipping items
this assignment named:

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 G2.4 Semgrep / CodeQL / G2.5 / G1.8 | on `main` |
| C4-04 splash / `GET /v1/config` | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` |
| C4-08 ads | on `main`; `adUnlock` stays false |
| Resume position API | on `main` (`07c1a4b` / `1f6ca13`) |
| Client resume seek (`bc-5a3958d4`) | in flight at pick; landed as `795baaf` while this slot ran |
| G2.3 Playwright (`bc-9578758f`) | in flight. Not this slot |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |
| **G1.6 oasdiff** | **this slot** |

Cycle-1/2/3 verify reports still scored G1.6 `no`. T23 named oasdiff. Provider schema
validation already lives in `server/src/contract.test.ts` (G1.4). The missing machinery is
the **job that runs oasdiff**. G1.7 overlaps G2.5 Trivy; this slot does not add a second
SCA. G2.3 needs Playwright and was owned.

`docs/14-quality-gates.md` §2 fails on a destructive OpenAPI change that did not go through
the contract change process. `docs/14-test-plan.md` §4.1 names the breaks: delete a field,
change a type, add a required request property, or narrow an enum. CTR-007 asked for an
oasdiff baseline snapshot in the tree.

G1.6 is L1, so it lives in `ci.yml`, not `l2.yml`. Folding it into `pnpm verify` would put
the binary on the local verify path. `.github/workflows/l2.yml` is byte-identical to
`origin/main` from this slot. There is no `continue-on-error`, no path filter, no test skip.

---

## 2. What changed

`pnpm run check:contract` requires a baseline spec, a revision spec, and an oasdiff binary.
It invokes `oasdiff breaking --format json --fail-on ERR` against
`contracts/oasdiff-baseline.yaml` → `contracts/openapi.yaml` (never a TypeScript grep of
path strings) and fails on any ERR-level change (`level >= 3`). A missing binary, a missing
spec, empty engine output, or non-JSON output fails — the same fail-open G2.8 closed for an
absent pnpm store.

`--err-ignore`, `--warn-ignore`, `--severity-levels`, and `--open` are never passed. A
`.oasdiff.*` / `err.ignore` / `warn.ignore` / `oasdiff-levels.txt` next to the spec fails
before the engine runs. Thinning the default checks is how this gate goes green without
scanning.

The live OpenAPI had two `PageInfo` component keys. kin-openapi last-key-wins; oasdiff
refuses the document (`mapping key "PageInfo" already defined`). They described the same
shape. This slot keeps one schema. That is loadability, not a new envelope.

The L1 job installs oasdiff 1.26.0, then runs that CLI. Unit tests inject a runner so local
`pnpm verify` does not need the binary.

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | Install oasdiff, then `check:contract`. No `continue-on-error` |
| `.github/workflows/l2.yml` | **Unchanged** vs `origin/main` |
| `packages/quality/src/contract.ts` | Args, thinning preflight, JSON policy, oasdiff argv |
| `packages/quality/src/cli/check-contract.ts` | Process boundary. `process.exit` of the library result |
| `contracts/openapi.yaml` | One `PageInfo` schema (duplicate key removed) |
| `contracts/oasdiff-baseline.yaml` | CTR-007 snapshot. Additive paths do not require updating it |
| `package.json` | `check:contract`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The G1.6 L1 job exists |

The live check on this tree (oasdiff 1.26.0):

```
contract passed (0 ERR, 0 WARN)
```

---

## 3. Reverse verification

The CLI tests are the injection for missing binary / missing spec / unknown args /
thinning config. Against a fixture that deletes `GET /health`, the real engine
(oasdiff 1.26.0) exits 1:

```
[{"id":"api-path-removed-without-deprecation","text":"api path removed without deprecation","level":3,"operation":"GET","operationId":"getHealth","path":"/health",...}]
```

```
contract failed (1):
  api-path-removed-without-deprecation GET /health
```

A missing `oasdiff` binary:

```
oasdiff is required: the binary is absent or not executable
```

Exit 1. An unknown argument exits 2. An `err.ignore` in the scan root fails before the
engine (`thinning ignore files is G1.6 red`). Adding a path is not ERR (`[]`, exit 0).

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| G1.8 (`67d063f`) | Already on `main` at pick. Not retaken |
| Client resume seek (`bc-5a3958d4`) | **Landed.** `795baaf` / `docs/handoff/w14-resume-seek.md`. PlayPage / VePlayer. Merged in; this slot does not touch those files |
| G2.3 Playwright (`bc-9578758f`) | In flight. This slot does not touch `.github/workflows/l2.yml` |

`git diff origin/main -- .github/workflows/l2.yml` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`795baaf` client resume
seek). L1 sequence unchanged in verify: format → lint → typecheck → test:coverage →
check:coverage → build → guardrails. `check:contract` is not in that sequence; CI runs it
after G1.8, after installing oasdiff.

| Package | Tests |
| --- | ---: |
| shared | 61 |
| quality | 250 |
| config | 45 |
| server | 1,740 |
| app | 1,121 |
| **Total** | **3,217** |

Zero skipped. Thirty tests for G1.6 (24 library + 6 CLI). Coverage gate:

```
coverage global lines 94.06% (15256/16219), branches 91.57%, core lines 95.50%, diff lines 98.61% (213/216)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DMmaAoAe.js` 353.43 kB / 108.04 kB gzip — the
resume-seek merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **G2.3.** Playwright smoke. In flight (`bc-9578758f`). Not faked with a grep.
- **G1.7 / G1.9 / G1.10.** osv-scanner (overlaps G2.5 Trivy; this slot does not add a
  second SCA), Conventional Commits, skip/empty-test detection. Further L1 slices.
- **Intentional breaking-change process.** Updating `contracts/oasdiff-baseline.yaml` is
  how a reviewed break is accepted. There is no ignore file.
- **C4-03, C4-07.** Postgres/Drizzle/Redis, VIP contract. Beans/VIP/recharge stay
  AM-blocked; this slot does not invent rates, `#/vip`, or `/v1/subscriptions`.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
