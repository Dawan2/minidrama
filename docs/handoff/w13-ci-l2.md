# W13 — the first L2 job: G2.8 license whitelist

> **Slot:** W13, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w13-work-ci-l2-72c4`, cut from `origin/main` at `828dfab`.
> **Item:** C2 `INF-007` / W10 §6.3 — the smallest real L2 job the protocol names. W10 found
> `.github/workflows/ci.yml` as the only workflow, carrying L1 only.
> **Not in scope:** G2.2 integration, G2.3 smoke E2E, G2.4 SAST, G2.5 SCA, G2.6 artifact budget,
> G2.7 migrations, G1.5 coverage, `workflow_dispatch` on L1. Wallet UI and durable stores were in
> flight at pick; both landed on `main` during the slot and were merged in with no overlap. No
> pull request.

---

## 1. What was picked, and why

C2's third exit condition is "L2 门禁全绿且反向验证通过". W10 (`docs/verify/cycle-2-report.md`
§6.3): `ls .github/workflows/` → `ci.yml`, and nothing else. No integration suite, no smoke E2E,
no SAST, no SCA, no artifact budget, no migration check, no licence audit.

`docs/14-quality-gates.md` §4 names eight L2 gates. Two of them (G2.2, G2.7) needed a database
that a sibling slot was writing. G2.3 needs Playwright. G2.4 / G2.5 need Semgrep, CodeQL, or
trivy. The remaining named gate that is local, fail-closed, and specified down to a whitelist is
**G2.8** — `docs/03-stack-decision.md` §4, which `INF-007` cites by name.

L2 is a **second workflow**, not a new step in L1. Folding it into `pnpm verify` would have mixed
the levels and given a later slot a reason to "speed up L1" by skipping a check. `ci.yml` is
byte-identical to `828dfab`. There is no `continue-on-error`, no path filter, no test skip.

CoverImage, paging flakes, ERROR_OUTCOMES, silent re-login, VePlayer replace, C3-07, gate docs,
and the seed floor were already on `main`. Wallet and durable stores were the in-flight pair.

---

## 2. What changed

A new workspace package `@minidrama/quality` reads the pnpm virtual store and evaluates every
installed `license` field against the §4 allow-list. A missing store, an empty store, or a
forbidden id fails. The L2 workflow runs that check on the same events L1 already uses (`main`,
`cursor/**`, `pull_request`), plus `workflow_dispatch`.

SPDX `OR` is a consumer choice, so `MIT OR GPL-3.0` passes. `AND` is a conjunction, so
`MIT AND GPL-3.0` fails. Commons Clause fails in both the spaced and hyphenated forms.

Four SPDX ids were already in the tree and are not on §4's printed list: `MIT-0`,
`BlueOak-1.0.0`, `Python-2.0`, `CC-BY-4.0`. All four are permissive; none is the GPL family.
Refusing them would have made the first run of a merge-level gate red on an unchanged install.
They are allowed as observed facts. A *new* id still fails until it is named in
`packages/quality/src/licenses.ts`.

| File | Change |
| --- | --- |
| `.github/workflows/l2.yml` | New. Job `licenses` (G2.8). No `continue-on-error` |
| `.github/workflows/ci.yml` | **Unchanged** |
| `packages/quality/` | Allow-list, store scan, CLI, 37 tests |
| `package.json` | `check:licenses`. **Not** added to `verify` |
| `pnpm-lock.yaml` | The workspace importer |
| `README.md`, `docs/engineering/repo-layout.md` | The second workflow exists |

---

## 3. Reverse verification

The CLI tests are the injection. Against a fixture store that contains `GPL-3.0`:

```
FAIL  check-licenses CLI > exits non-zero when a forbidden license is in the store
expected 1, received 0   // would be the fail-open
```

and the stderr names `copyleft@2.0.0` and `GPL-3.0`. A missing `node_modules/.pnpm` exits 1
("the dependency store is required") rather than reporting zero packages as a clean install —
the same fail-open `check-guardrails` closed for `app/dist`. An empty store is the same class of
failure. An unknown argument exits 2.

The live install at merge is green: `license whitelist passed (312 packages)`.

---

## 4. Overlap with in-flight

At pick, two work slots were live. Both published onto `main` during this slot:

| Slot | Overlap |
| --- | --- |
| W13 wallet UI (`bc-5f167886`) | None. Landed as `c57ff0d`. App routes and i18n; this branch does not touch `app/src/` |
| W13 durable stores (`bc-1668e0df`) | None. Landed as `ffa37ff`. `server/src/db/` and unlock sqlite; this branch does not touch `server/` |

`git diff 828dfab origin/main` against `.github/workflows/`, root `package.json`,
`pnpm-lock.yaml`, and `docs/engineering/repo-layout.md` was empty. The merge of `origin/main` at
`c57ff0d` was ort, no conflicts.

G2.7 is now *buildable* — `server/migrations/0001_unlocks.{up,down}.sql` exists, with tests that
roll back. It is not a CI job yet. That is the next L2 slice, not this one.

---

## 5. Verification

`pnpm verify` green on `8b40e3d` after merging `origin/main`, first try, exit 0. L1 sequence
unchanged: format → lint → typecheck → test → build → guardrails. `check:licenses` is not in
that sequence.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 51 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,362 |
| `app` | 857 |
| **Total** | **2,352** |

Zero skipped. Guardrails passed against `app/dist` (`index-CQnFIqTJ.js` 318.14 kB / 98.12 kB gzip
— the wallet merge's artifact, not this slot's).

---

## 6. Left open

- **G2.2 / G2.7.** Durable unlock sqlite and reversible migrations are on `main`. They still have
  no CI job. The next L2 slice is wiring `migrate up → down → up` as a required job, the way this
  slot wired G2.8.
- **G2.3, G2.4, G2.5, G2.6.** Playwright, Semgrep/CodeQL, trivy, ZIP budget (20 MB in
  `docs/03-nonfunctional.md`).
- **G1.5 coverage, L1 `workflow_dispatch`.** C3-11. Not this slot. L2 has `workflow_dispatch`;
  `ci.yml` still does not.
- **`docs/plan/cycle-3-backlog.md`.** Not rewritten. The document belongs to the plan slot.
- **The four observed extra SPDX ids.** They should be written back into stack-decision §4 or
  filed as waivers. Named here rather than silently dropped from the allow-list.
