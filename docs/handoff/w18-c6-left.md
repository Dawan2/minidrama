# W18 — leftover C6: INF-004 S-C3 echo-only workflow steps

> **Slot:** W18, work slot (`bc-2c841f7a`). One leftover item, no pull request.
> **Branch:** `cursor/w18-work-c6-left-72c4`, cut from `origin/main` at **`5544125`**
> (INF-004 S-C1 already on main). Reset onto **`9b563b0`** after C6-follow landed S6
> (`bc-119dafb6` / `docs/handoff/w18-c6-follow.md`) while this slot's first pick was
> the same remainder. Merged forward onto **`e6926f2`** (W19 cycle-6 report).
> **Item:** `INF-004` remainder **S-C3** — echo-only / `true` / `exit 0` `run` steps
> are red. Folded into the existing `pnpm check:audit` job. A `run` that echoes and
> then invokes a real command is not this gate. A comment that names `echo` is not
> this gate.
> **Not in scope:** D-17 billing. C4-03 Postgres. C4-07 VIP. 倍速 (`bc-3bac5e63`,
> landed). C6-follow S6 (`bc-119dafb6`, landed). INF-004 S-C1 (on main at `5544125`).
> QA-010 remainder screens (`bc-1a5a2455` in flight). S-C4 required-checks vs branch
> protection. C5-03 / D-19. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not a branch). INF-004 S-C1 was
already on `main`. 倍速 and C6-follow were in flight. This slot first implemented
S6 cover+lock; C6-follow landed that remainder first (`9b563b0`). The branch was
reset onto that tip. Remaining unblocked engineering after skipping D-17, C4-03,
C4-07, and the in-flight QA-010 remainder:

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| X-26 倍速 | **RUNNING** at first pick (`bc-3bac5e63`). **Landed** while this slot ran |
| PLY-011 S6 cover + lock | **RUNNING** at first pick (`bc-119dafb6`). **Landed** `9b563b0`. Duplicate dropped |
| QA-010 remainder screens | **RUNNING** (`bc-1a5a2455`). Left |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| C5-03 / D-19 `wave-protocol.md` §6.2 | P3's file |
| **INF-004 S-C3 echo-only** | **This slot.** Named remaining slice of the S-C1 job |

A comment that forbids `echo` is not S-C3. Reverse verification is a fixture whose
unique YAML is `run: echo ok`.

---

## 2. What changed

`pnpm run check:audit` still walks `.github/workflows/*.yml`. It now also fails
when a `run` script is only `echo`, `true`, `:`, or `exit 0`, including a
block-scalar whose every statement is one of those. `echo start && pnpm verify`
is not a hit. The CodeQL install's `echo /opt/codeql >> "$GITHUB_PATH"` is not
a hit because the same `run` also curls, tars, and runs `codeql version`.

| File | Change |
| --- | --- |
| `packages/quality/src/audit.ts` | Placeholder `run` predicate + scan |
| `packages/quality/src/cli/check-audit.ts` | Comment: S-C3 is this job |
| `.github/workflows/ci.yml` | Step comment names echo-only |
| `docs/14-quality-gates.md` §2.1 | Dated S-C3 note. S-C4 left as a further slice |

`docs/plan/cycle-6-backlog.md` is not rewritten. `app/` / `server/` were not
edited here. Wallet top-up stays disabled. `adUnlock` stays false. No BytePlus
`vid`. S6 chrome and the rate plugin stay the siblings that landed on `main`.

---

## 3. Reverse verification

Against a fixture whose unique YAML is `run: echo ok`:

```
audit failed (1): continue-on-error / if: false / swallowed exits / echo-only steps are INF-004 red
  echo-only .github/workflows/blocked.yml:6 - run: echo ok
```

Exit 1. Against `run: true` and `run: exit 0`: same `echo-only` kind. Against
`run: |\n          echo ok` (block scalar): `echo-only`. Against
`run: echo start && pnpm verify`: no hit. A comment `# run: echo ok` is not this
gate. Stdout on green says `0 echo-only`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-119dafb6` C6-follow S6 | **Idle. Landed** `9b563b0` / `cursor/w18-work-c6-follow-72c4`. Player lock files not edited here |
| `bc-3bac5e63` 倍速 | **Idle. Landed.** Rate plugin / `PlayerSurface`. Untouched |
| `bc-19bb7d97` INF-004 S-C1 | **Idle. Landed.** This slice extends `audit.ts`; does not retake S-C1 |
| `bc-1a5a2455` next after lock chrome | **RUNNING.** Likely QA-010 remainder screens. `packages/quality/a11y/` not edited |
| `bc-fffd4f10` W19 C6 verify | **Idle. Landed** `e6926f2` / `docs/verify/cycle-6-report.md` while this slot merged |

`git diff origin/main -- app/ server/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` (`e6926f2`,
W19 cycle-6 report). L1 sequence is format → lint → typecheck → check:commits →
check:skips → **check:audit** → check:a11y → test:coverage → check:coverage →
build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `1 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped) |
| G1.10 skips | `236 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (1 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,553 passing** — shared 63, quality 424, config 45, server 1,785, app 1,236. Coverage: global lines 94.37% (17725/18782), branches 90.88%, core 95.70%, **diff lines 97.50% (78/80)** |
| Build | pass — `index-C3L6HYpZ.js` 364.54 kB / 111.58 kB gzip (S6 + 倍速 client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,548 on `main` after
S6 → 3,553 here; the extra tests are this audit slice).

---

## 6. What is still open

- **S-C4.** Required-checks vs GitHub branch protection. Further INF-004 slice.
  D-17 still falsifies GitHub reverse-verification.
- **QA-010 remainder.** S-A1 on every implemented SCR/PNL. In flight
  (`bc-1a5a2455`). This slot did not add screen fixtures.
- **充值 option on PNL-02.** C4-06: recharge stays disabled.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file. W19 scored C6 **not passed**.

This slice does **not** claim INF-004 S-C1–S-C4 closed. It is the named S-C3
echo-only remainder of the S-C1 job.
