# W18 — QA-010 remainder: require SCR-02 home next to SCR-13

> **Slot:** W18, work slot (`bc-1a5a2455`). One leftover item, no pull request.
> **Branch:** `cursor/w18-work-c6-after-lock-72c4`, cut from `origin/main` at **`9b563b0`**
> (PLY-011 S6 cover + lock chrome already on main).
> **Item:** **QA-010 remainder** — S-A1 on one more implemented screen. The smallest
> axe-core job scanned SCR-13 only. This slice requires **SCR-02** (`#/home`) as a
> second stem. Deleting either fixture is red. Host stays jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, PLY-011 (`9b563b0`, not
> retaken), leftover C6 `bc-2c841f7a` (duplicate S6 chrome on
> `cursor/w18-work-c6-left-72c4`), cycle-6 verify docs `bc-fffd4f10`, remaining
> SCR/PNL fixtures, S-C3 / S-C4, playback failure report path. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not a branch) and protocol-C4
交互验收单 second. PLY-011 S6 locked chrome is on `main` at `9b563b0`. 倍速 /
scrub / stall are already landed as plugin-owned or named remainders. C4-03 /
C4-07 stay skipped. Leftover C6 `bc-2c841f7a` is a twin of PLY-011; its files
were left. Cycle-6 verify docs `bc-fffd4f10` were left.

Rank 3 after the smallest QA-010 job is the named remainder: S-A1 on further
implemented screens. SCR-01 is an overlay. SCR-10 / SCR-11 are not product
routes. SCR-02 is the first implemented numbered hash screen.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| PLY-011 S6 cover + lock | **On `main`** at `9b563b0`. Not retaken |
| Leftover C6 `bc-2c841f7a` | **RUNNING.** Twin of PLY-011 on `cursor/w18-work-c6-left-72c4`. Left |
| Cycle-6 verify `bc-fffd4f10` | **RUNNING.** Docs left |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| 充值 on PNL-02 | C4-06. Recharge stays disabled |
| INF-004 S-C3 / S-C4 | Further slices. Not this remainder |
| **QA-010 remainder SCR-02** | **This slot.** Required stems were SCR-13 only |

This slice does **not** claim protocol-C4 exit 3 closed.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are now `scr-02-home` and `scr-13-fallback`. A source that has
fallback but not home is red. The home fixture uses product English copy and
the empty-catalogue chrome (`home-page`, heading, nav, search, empty-state).
Body colors stay the passing pair; live `--accent` is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-02-home.html` | SCR-02 fixture (`lang="en"`, product body colors) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-02-home` |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names both stems |

`docs/plan/cycle-6-backlog.md` is not rewritten. `.github/` and player files
are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required home stem deleted

```
required implemented-screen fixture missing: scr-02-home (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

```
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast … color-contrast p 1.00:1 < 4.5:1
```

Exit 1. A comment that names WCAG is not this gate. Stdout on green says
`2 screens` and `host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-119dafb6` PLY-011 | **Idle. Landed** `9b563b0`. Player lock chrome not edited |
| `bc-2c841f7a` leftover C6 | **RUNNING.** Twin S6 on `cursor/w18-work-c6-left-72c4`. Player files not edited here |
| `bc-fffd4f10` cycle-6 verify | **RUNNING.** `docs/verify/` not written |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch at `9b563b0` + this slice.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` |
| G1.10 skips | `236 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits)` |
| QA-010 a11y | `a11y passed (2 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,552 passing** — shared 63, quality 423, config 45, server 1,785, app 1,236. Coverage: global lines 94.36% (17649/18704), branches 90.97%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-C3L6HYpZ.js` 364.54 kB / 111.58 kB gzip (PLY-011's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,548 on `main` after
PLY-011 → 3,552 here; the extra tests are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-02 only. SCR-03…
  SCR-09, SCR-12, and panels are later remainders. SCR-10 / SCR-11 are not
  product routes.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  the smallest job.
- **S-C3 / S-C4.** Echo-only steps and required-checks vs branch protection.
- **`POST /v1/playback/sessions/{id}/failures`.** Report path. No invented endpoint.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-02 next to SCR-13.
