# W14 — C4 second work: L2 G2.7 migrate up → down → up

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-second-72c4`, cut from `origin/main` at `1a6c5d6`.
> **Item:** `C4-02` / C2 L2 remainder, the G2.7 slice. `docs/plan/cycle-4-backlog.md` names C4-01
> and C4-02 as the first C4 implement picks. Sibling `bc-a38390dc` (first C4 engineering) had no
> `cursor/w14-work-c4-first-*` branch on origin at pick or at write-up; C4-01 (G1.5,
> L1 `workflow_dispatch:`, D-07) was left for it. This slot takes the remaining L2 job.
> **Not in scope:** G1.5 coverage, L1 `workflow_dispatch:`, D-07 / D-11, G2.2–G2.6, T14 Postgres,
> `docs/verify/` (W15 `bc-649d7d50`). No pull request.

---

## 1. What was picked, and why

C4-01 is three L1 leftovers (coverage, `workflow_dispatch:` on `ci.yml`, the doc-12 unlock-path
contradiction). C4-02 is the next unblocked engineering item: L2 still had only G2.8. W13 CI-L2
named G2.7 as the next slice once the reversible runner existed. It does.

The runner and the seven paired `{up,down}.sql` files are on `main`. What was missing is the
**job**: a merge-level check that runs up → down → up and turns red when a down does not drop a
table, or when an up file has no pair. The unit tests already covered that; CI is the gate
C2's third exit still requires.

L2 stays a second workflow. Folding migrate into `pnpm verify` would mix the levels the way
folding G2.8 would have. `.github/workflows/ci.yml` is byte-identical to `1a6c5d6`. There is no
`continue-on-error`, no path filter, no test skip.

---

## 2. What changed

`pnpm run check:migrate` opens a temp sqlite file, applies every pending up, asserts user tables
exist, rolls them all back, asserts those tables are gone, and applies up again. The L2 workflow
gains a `migrate` job on the same events it already uses (`main`, `cursor/**`, `pull_request`,
`workflow_dispatch`). Postgres is not rewritten to a file.

| File | Change |
| --- | --- |
| `.github/workflows/l2.yml` | Job `migrate` (G2.7). No `continue-on-error` |
| `.github/workflows/ci.yml` | **Unchanged** |
| `server/src/db/check-migrate.ts` | The cycle. Empty dir, up-only, and no-op down fail |
| `server/src/db/check-migrate-cli.ts` | Exit 1 on a failed cycle, 2 on unknown args |
| `package.json` | `check:migrate`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The second L2 job exists |

The live check on this tree:

```
migrate up → down → up passed (7 migrations, 10 tables)
```

---

## 3. Reverse verification

The CLI tests are the injection. Against a fixture whose down is a comment:

```
down did not drop: unlocks. G2.7 requires rollback; a no-op down is not a migration.
```

Exit 1. Against an up file with no pair:

```
Migration 0002_orphan has no 0002_orphan.down.sql. C2 requires rollback; an up-only file is not a migration.
```

Exit 1. An unknown argument exits 2 rather than being ignored. An empty migrations directory
exits 1 ("a migrate check that saw no files has not run") rather than reporting zero tables as
a clean cycle — the same fail-open `check-licenses` closed for an empty store.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-a38390dc` (W14 first C4 engineering) | None visible. No `cursor/w14-work-c4-first-*` on origin. This branch does not touch `ci.yml`, coverage scripts, or `docs/12-api-contracts.md` |
| `bc-649d7d50` (W15 cycle-3 verify) | Landed as `4e6ad31` / `f45aef5` (`docs/verify/cycle-3-report.md`). Merged in; this slot did not edit that file |
| `origin/cursor/w13-work-c3-remain-72c4` | Unmerged wallet-transactions. Not rewritten |

`git diff origin/main -- .github/workflows/ci.yml` is empty.

---

## 5. Verification

`pnpm verify` green on `938ac1a`, first try, exit 0, then again after merging `origin/main`
(`4e6ad31`, docs only). L1 sequence unchanged: format → lint → typecheck → test → build →
guardrails. `check:migrate` is not in that sequence.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,604 |
| `app` | 964 |
| **Total** | **2,705** |

Zero skipped. Ten new tests (five library, five CLI). Guardrails passed against `app/dist`
(`index-CFYsMFzN.js` 337.44 kB / 102.92 kB gzip — not this slot's artifact).

---

## 6. Left open

- **C4-01.** G1.5 coverage, L1 `workflow_dispatch:`, D-07 / D-11. Left for the first C4 work
  sibling. `ci.yml` still has no `workflow_dispatch:`.
- **G2.2, G2.3, G2.4, G2.5, G2.6.** sqlite integration as a job, Playwright, Semgrep/CodeQL,
  trivy, ZIP budget. Further L2 slices, not this one.
- **T14 / T16 / T15.** Postgres is still refused at boot. This job runs sqlite. Do not mark T14
  `[x]` on that.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
