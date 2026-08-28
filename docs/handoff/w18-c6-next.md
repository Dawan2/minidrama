# W18 — INF-004: L1 S-C1 workflow self-audit

> **Slot:** W18, work slot (`bc-19bb7d97`). One backlog item, no pull request.
> **Branch:** `cursor/w18-work-c6-next-72c4`, cut from `origin/main` at **`3e8bdb2`**
> (QA-010 smallest axe-core scan already on main). Merged forward onto **`7ce0fd0`**
> (PLY-010 S7 stall chrome landed while this slot ran).
> **Item:** `INF-004` — smallest CI self-audit. `continue-on-error: true` and `if: false`
> in committed GitHub workflows are red. A comment that names those keys is not the
> gate. A scan that saw no workflow files is red.
> **Not in scope:** D-17 billing. C4-03 Postgres. C4-07 VIP. QA-010 (on main at
> `3e8bdb2`, remaining screens not this slice). X-26 倍速 / scrub (`bc-c68b4e10`).
> Interaction-sheet remainder (`bc-402f89a0`, landed as S7 stall at `7ce0fd0` while
> this slot ran). C5-03 / D-19 P3 writeback of `wave-protocol.md` §6.2. S-C3 echo-only
> steps, S-C4 required-checks vs branch protection. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not a branch), then the protocol-C4
交互验收单, then QA-010. QA-010 L1 landed on `main` at `3e8bdb2`. X-26 and the
remaining interaction sheet were already running. C4-03 and C4-07 stay skipped.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Protocol-C4 交互验收单 remainder | **RUNNING** (`bc-402f89a0`). Left. **Landed** as S7 stall (`7ce0fd0` / `docs/handoff/w18-interaction.md`) while this slot merged |
| QA-010 axe-core L1 | **On `main`** at `3e8bdb2`. Remaining implemented screens are a later remainder. Not retaken |
| X-26 倍速 / scrub | **RUNNING** (`bc-c68b4e10`). Forbidden leftover. Left |
| C4-03 T14/T16/T15 | Do not fake. Skipped |
| C4-07 SCR-11 / D8 | No contract. Skipped |
| C5-03 / D-19 `wave-protocol.md` §6.2 | P3's file |
| **INF-004 S-C1 self-audit** | **This slot.** DoD §7.1 is still a comment in the workflows, not a job |

A comment that forbids `continue-on-error` is not INF-004. Reverse verification is a
fixture whose workflow contains `continue-on-error: true` or `if: false`.

---

## 2. What changed

`pnpm run check:audit` walks `.github/workflows/*.yml` (and `.yaml`), fails if it saw
no workflow files, and fails on a truthy `continue-on-error:` / `allow_failure:` /
`soft_fail:` key, on `if: false`, or on a `|| true` swallowed exit in a `run` line.
Full-line comments are not hits. `workflow_dispatch:` as an event is not a bypass
(C4-01). There is no `continue-on-error` on the new step.

Folded into `pnpm verify` (no extra binary) and a named L1 step after G1.10.

| File | Change |
| --- | --- |
| `packages/quality/src/audit.ts` | Scan + policy |
| `packages/quality/src/cli/check-audit.ts` | Process boundary |
| `.github/workflows/ci.yml` | Step `INF-004 CI self-audit` after G1.10 |
| `package.json` | `check:audit` in `verify` |
| `docs/14-quality-gates.md` §2.1 | Dated note. S-C3 / S-C4 left as further slices |

`docs/plan/cycle-6-backlog.md` is not rewritten. Wallet top-up stays disabled.
`adUnlock` stays false. No BytePlus `vid`. Player files were not edited here.

---

## 3. Reverse verification

Against a fixture whose unique YAML is `continue-on-error: true`:

```
audit failed (1): continue-on-error / if: false / swallowed exits are INF-004 red
  continue-on-error .github/workflows/blocked.yml:4 continue-on-error: true
```

Exit 1. Against a fixture whose job is `if: false`:

```
audit failed (1): continue-on-error / if: false / swallowed exits are INF-004 red
  if-false .github/workflows/blocked.yml:4 if: false
```

Exit 1. Against a source directory with no `*.yml` / `*.yaml`:

```
scan source has no workflow files: a CI self-audit that saw no workflows has not run
```

Exit 1. A comment that names `continue-on-error` is not this gate. Stdout on green
says `0 continue-on-error, 0 if: false, 0 swallowed exits`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-b0108787` QA-010 | **Idle. Landed** `3e8bdb2` / `cursor/w16-work-qa010-72c4`. A11y files not edited |
| `bc-402f89a0` interaction sheet | **Idle. Landed** `7ce0fd0` / `cursor/w18-work-interaction-72c4` while this slot merged. Player stall files not edited here |
| `bc-c68b4e10` X-26 倍速 / scrub | **RUNNING.** Player rate/scrub files. Untouched |

`git diff origin/main -- app/ server/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` (`7ce0fd0`,
PLY-010 S7 stall).

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `1 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped) |
| G1.10 skips | `233 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits)` |
| QA-010 a11y | `a11y passed (1 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,525 passing** — shared 63, quality 419, config 45, server 1,785, app 1,213. Coverage: global lines 94.34% (17550/18603), branches 90.96%, core 95.70%, **diff lines 98.99% (196/198)** |
| Build | pass — `index-o9suSD8K.js` 362.88 kB / 111.05 kB gzip (S7 stall's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,480 on `main` after QA-010
→ 3,525 here; the extra tests are this audit slice plus the stall chrome absorbed from
`main`).

---

## 6. What is still open

- **S-C3 / S-C4.** Echo-only steps and required-checks vs GitHub branch protection.
  Further INF-004 slices. D-17 still falsifies GitHub reverse-verification.
- **QA-010 remainder.** S-A1 on every implemented SCR/PNL. This slot did not add
  screen fixtures.
- **X-26.** In flight. Do not invent `playbackRate`.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file.

This slice does **not** claim INF-004 S-C1–S-C4 closed. It is the named S-C1 job plus
the `if: false` reverse path from the backlog acceptance.
