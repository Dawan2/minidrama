# W16 — C5-01 remainder / D-20: L1 G1.9 Conventional Commits

> **Slot:** W16, work slot (`bc-72e30448`). One backlog item, no pull request.
> **Branch:** `cursor/w16-work-c5-more-72c4`, cut from `origin/main` at **`26b3c97`**
> (drama-detail Continue CTA). Fast-forwarded onto **`e6b9b86`** (C5-02 wallet ledger).
> Merged forward onto **`614f656`** (C5-01 G1.10 skip-check landed while this slot verified;
> both L1 steps kept).
> **Item:** `C5-01` remainder / **D-20** / **G1.9** — Conventional Commits as a required L1
> step inside `pnpm verify` and `.github/workflows/ci.yml`. Merge commits skipped. History
> on `main` is not rewritten.
> **Not in scope:** D-17 billing. C4-03 Postgres. C4-07 VIP. C5-01 G1.10 (`bc-fed59ba3`,
> landed at `614f656`). C5-02 D-18 (`bc-8f301285`, landed at `e6b9b86`). C5-03 / D-19 P3
> writeback. G1.7 (dated as G2.5 Trivy by the G1.10 sibling). PLY-012, axe-core, `#/vip`.
> No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-5-backlog.md` remaining unblocked engineering after skipping D-17, C4-03,
and C4-07, and after items already on `main` or in flight:

| Item | State |
| --- | --- |
| PLY-010 swipe / autoplay `playNext` | on `main` |
| PRG-001 cross-end conflict case | on `main` |
| Drama-detail Continue (`lastWatched`) | on `main` at `26b3c97` |
| C5-01 / D-20 G1.10 | in flight at pick (`bc-fed59ba3`); **landed** `614f656` while this slot verified |
| C5-02 / D-18 wallet transactions | in flight at pick (`bc-8f301285`); **landed** `e6b9b86` |
| G1.7 | dated as G2.5 Trivy by the G1.10 sibling. Not a second SCA |
| C5-03 / D-19 | P3's file. Not rewritten |
| D-17 / C4-03 / C4-07 | skipped |
| **C5-01 remainder / G1.9** | **this slot** |

C5-01 named G1.10 first, then G1.7 / G1.9. G1.9 "may be a further slice" and is not required
to close the skip-detection half. The G1.10 sibling left it open: "G1.9 Conventional
Commits remains a further slice; commit subjects stay prose."

A comment that names Conventional Commits is not G1.9. Reverse verification is a fixture
repository whose unique commit subject is `Wire the skip detector`.

---

## 2. What changed

`pnpm run check:commits` invokes git (never a TypeScript comment). The range is
merge-base with `origin/main` (or `--base`) through `HEAD`. `--no-merges` so absorbing
`main` does not rewrite history. A prose subject is red. An empty range is green — HEAD
is already the base.

| File | Change |
| --- | --- |
| `packages/quality/src/commits.ts` | Args, subject policy, git argv, range evaluation |
| `packages/quality/src/cli/check-commits.ts` | Process boundary |
| `.github/workflows/ci.yml` | Step `G1.9 commit convention` after typecheck. No `continue-on-error` |
| `package.json` | `check:commits` in `verify` |
| `docs/14-quality-gates.md` §2.1 | Dated note: G1.9 is the job. G1.10 / G1.7 notes from the sibling kept |
| `README.md`, `docs/engineering/repo-layout.md` | The command exists |

`.github/workflows/l2.yml` is unchanged. `docs/plan/cycle-5-backlog.md` is not rewritten.
Wallet top-up stays disabled. `adUnlock` stays false.

---

## 3. Reverse verification

Against a fixture whose unique commit is `Wire the skip detector`:

```
commits failed (1): prose subjects are G1.9 red; do not rewrite history on main
  Wire the skip detector
```

Exit 1. Against `feat: add skip detection`: exit 0. Against a merge commit whose message
is prose: the merge is skipped; an entitled unique conventional commit still passes.
Against an empty range: `commits passed (0 new commits vs main, 0 prose)`. A missing git
binary is red. An unknown argument exits 2 rather than being ignored.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-fed59ba3` C5-01 / G1.10 | **Landed** `614f656` / `cursor/w16-work-c5-next-72c4`. Merged in. Both `check:commits` and `check:skips` kept. `ci.yml`, `package.json`, `docs/14-quality-gates.md` combined |
| `bc-8f301285` C5-02 / D-18 | **Landed** `e6b9b86`. Wallet files not edited here |
| Playback UX siblings | Idle. On `main`. Player files not edited |

`git diff origin/main -- app/ server/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`614f656`). L1 sequence is
now format → lint → typecheck → **check:commits** → **check:skips** → test:coverage →
check:coverage → build → guardrails. G1.8 `check:secrets` and G1.6 `check:contract` stay
out of `verify`.

| Package | Tests |
| --- | ---: |
| shared | 63 |
| quality | 342 |
| config | 45 |
| server | 1,785 |
| app | 1,166 |
| **Total** | **3,401** |

```
coverage global lines 94.25% (16577/17589), branches 91.19%, core 95.70%, diff lines 100.00% (153/153)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-XKnvt0-l.js` 357.25 kB / 109.15 kB gzip). Native
`<video>` remains absent. `check:commits` reported `1 new commits vs origin/main, 0 prose`
before this handoff (the merge commit is skipped).

---

## 6. Left open

- **D-17.** Billing. Cannot be closed from a branch.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **QA-011 / QA-010** a11y. Still not started. Do not add axe-core as a drive-by.
- **PLY-012** token re-issue. Still open.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **`docs/plan/cycle-5-backlog.md`.** Not rewritten. The document belongs to the plan slot.

D-20's G1.10 + G1.7 (dated) + G1.9 halves are now jobs or dated notes. Prose on `main`
stays; new unique commits must be conventional.
