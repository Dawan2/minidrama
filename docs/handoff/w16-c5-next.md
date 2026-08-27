# W16 — C5-01 / D-20: L1 G1.10 skip/empty-test detection

> **Slot:** W16, work slot (`bc-fed59ba3`). One backlog item, no pull request.
> **Branch:** `cursor/w16-work-c5-next-72c4`, cut from `origin/main` at **`8e5c803`**
> (PRG-001 remainder / 204 older clock already on main).
> **Item:** `C5-01` / **D-20** — G1.10 skip / empty-test detection as a required L1 step
> inside `pnpm verify` and `.github/workflows/ci.yml`. G1.7 dated as G2.5 Trivy. G1.9 left
> open (prose subjects).
> **Not in scope:** D-17 billing. C4-03 Postgres. C4-07 VIP. BytePlus `vid` fiction.
> Progress-conflict (on main). Swipe/ended 连播 (`bc-2fd6c885`, in flight). Third playback
> slice (`bc-5d32d64f`, in flight). No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-5-backlog.md` first implement pick after skipping ops and in-flight work:

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| PRG-001 remainder / 跨端进度冲突 | **On `main`** at `8e5c803`. Not retaken |
| Swipe / ended 连播 (`bc-2fd6c885`) | **RUNNING.** Left |
| Third playback slice (`bc-5d32d64f`) | **RUNNING.** Left |
| C4-03 T14/T16/T15 | Do not fake. Skipped |
| C4-07 SCR-11 / D8 | No contract. Skipped |
| **C5-01 / D-20 G1.10** | **This slot** |
| C5-02 D-18 wallet transactions | Integrator merge-or-drop. Not a second route |
| C5-03 D-19 `wave-protocol.md` §6.2 | P3's file |

A comment that forbids skips is not G1.10. Reverse verification is a fixture whose `.skip(`
or empty `it('…', () => {})` turns the check red.

---

## 2. What changed

`pnpm run check:skips` walks `*.test.ts(x)` / `*.spec.ts(x)` under the checkout, fails if it
saw no test files, and fails on `.skip(` / `.skipIf(` / `.only(` / `it.todo` / `test.todo` /
`xit(` / `xdescribe(` / `xtest(` / an empty `it`/`test` callback. R3 / §6: skip exemptions
do not apply. `process.exit(0)` is not `xit(`; an empty `it()` that only exists inside a
string fixture is not a product test.

G1.10 is folded into `pnpm verify` (no extra binary) and is a named L1 step. There is no
`continue-on-error`.

| File | Change |
| --- | --- |
| `packages/quality/src/skips.ts` | Scan + policy |
| `packages/quality/src/cli/check-skips.ts` | Process boundary |
| `.github/workflows/ci.yml` | Step `G1.10 skip/empty tests` after typecheck |
| `package.json` | `check:skips` in `verify` |
| `docs/14-quality-gates.md` §2.1 | Dated notes: G1.10 is the job; G1.7 is G2.5 Trivy; G1.9 remains a further slice |
| `README.md`, `docs/engineering/repo-layout.md` | The command exists |

`docs/plan/cycle-5-backlog.md` is not rewritten. The document belongs to the plan slot.
`.github/workflows/l2.yml` is unchanged. Wallet top-up stays disabled. `adUnlock` stays false.
No BytePlus `vid`.

---

## 3. Reverse verification

Against a fixture whose test file is `it.skip('blocked', () => { expect(1).toBe(1) })`:

```
skip-check failed (1): committed skip/only/todo/empty tests are G1.10 red
  skip blocked.test.ts:1
```

Exit 1. Against `it("blocked", () => {})`:

```
skip-check failed (1): committed skip/only/todo/empty tests are G1.10 red
  empty blocked.test.ts:1
```

Exit 1. Against a source directory with no `*.test.ts` / `*.spec.ts`:

```
scan source has no test files: a skip check that saw no tests has not run
```

Exit 1. An unknown argument exits 2 rather than being ignored. `process.exit(0)` is not a
hit. A comment that says skips are forbidden is not this gate.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-2fd6c885` (swipe / ended 连播) | **RUNNING.** `PlayerSurface` / `PlayPage`. Untouched |
| `bc-5d32d64f` (third playback slice) | **RUNNING.** No `cursor/*` branch on origin yet. Untouched |
| `bc-3c74c2c9` (PRG-001 remainder) | **Idle. Landed** at `8e5c803`. Not retaken |
| C4-03 / C4-07 / D-17 | Unchanged; billing cannot be code-fixed |

`git diff origin/main -- app/ server/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` on this branch after the implementation. L1 sequence is now format → lint →
typecheck → **check:skips** → test:coverage → check:coverage → build → guardrails. G1.8
`check:secrets` and G1.6 `check:contract` stay out of `verify`.

G1.9 Conventional Commits is not this slice. Commit subjects remain prose.

---

## 6. Left open

- **G1.9.** Prose subjects. Further D-20 slice. Do not rewrite history.
- **D-17.** Billing. Cannot be closed from a branch.
- **C5-02 / D-18.** Merge or drop `origin/cursor/w13-work-c3-remain-72c4`.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **Protocol-C4 播放体验 remainder.** Swipe/ended and the third slice are in flight; a11y
  (`QA-011` / `QA-010`) and PLY-012 are not this slot.
- **`docs/plan/cycle-5-backlog.md`.** Not rewritten. The document belongs to the plan slot.
