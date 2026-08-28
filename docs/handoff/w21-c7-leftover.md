# W21 — C7 leftover: require unlock-panel P0 next to login-home and browse-play

> **Slot:** W21, work slot (`bc-9a564c5e`). One leftover item, no pull request.
> **Branch:** `cursor/w21-c7-leftover-72c4`, cut from `origin/main` at **`30921f4`**
> (QA-010 remainder already requires SCR-02…SCR-09, search, SCR-12, and
> SCR-13). Independent C7 verify (`bc-d04fddba`) is writing
> `docs/verify/cycle-7-report.md` and is left.
> **Item:** **G2.3 remainder** — additional Playwright P0 smoke. QA-010 already
> requires the remaining named hash screens, so this slot did **not** retake
> those stems. Remaining 交互验收单 rows that are still open are X-26 (倍速 /
> scrub) or D9 (device). `wave-protocol.md` is P3's file (D-19). The next
> unblocked C7 leftover is therefore the E-20 analog that G2.3 still lacked:
> locked episode → PNL-02. Deleting any of the three required P0 stems is
> red. Completing IAP is GATE-2 / GATE-4. First-frame play is GATE-8.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, Beans, GATE-7
> EIS, GATE-8 ingest, real TikTok login, a11y screen retakes, S-C4,
> `docs/verify/cycle-7-report.md`. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-7-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic: 倍速 / scrub stay
X-26, tap pause / CN-10 / stall / PLY-011 / PLY-012 are on `main`. Rank 3
QA-010 already requires home, browse, drama, play, profile, history,
favorites, wallet, search, settings, and fallback on `30921f4`. C4-03 /
C4-07 stay skipped. Independent verify owns the C7 report; left.

The named remainder after those skips is additional Playwright P0 that can
run without GATE-2 / GATE-4 / GATE-8. G2.3 already had login → feed and
feed → drama → honest 503 play attempt. **E-20's intercept** (locked row →
PNL-02) was not a required stem.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Protocol-C4 交互验收单 | Rank 2. Named remainders on `main`. 倍速 / scrub / D9 not picked |
| QA-010 remaining screens | **On `main`** at `30921f4`. Not retaken |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| C5-03 / D-19 `wave-protocol.md` | P3's file. Not edited |
| Independent C7 verify `bc-d04fddba` | **RUNNING.** `docs/verify/cycle-7-report.md` left |
| **G2.3 remainder E-20 analog** | **This slot.** Required stems were login-home + browse-play |

This slice does **not** claim E-20 closed. It does **not** claim protocol-C4
exit 1 closed. It does **not** invent Beans or a `vid`.

---

## 2. What changed

`pnpm run check:smoke` still preflights `app/dist`, the Playwright binary,
and the named P0 files, then drives Chromium against a sqlite stack. The
required stems are now `login-home`, `browse-play`, and `unlock-panel`. A
source that has the other two but not unlock-panel is red. The live spec
boots with test-login, opens the first feed drama, taps the first
`data-action="UNLOCK"` row, and asserts PNL-02 (`data-offer="COINS"`,
price, confirm). It does **not** press confirm. Ads stay off. `#/vip` stays
absent. The player is not constructed.

`pnpm verify` is unchanged: smoke stays L2. There is no `continue-on-error`,
no path filter, no test skip.

| File | Change |
| --- | --- |
| `packages/quality/e2e/specs/unlock-panel.spec.ts` | E-20 analog (intercept only) |
| `packages/quality/src/smoke.ts` | Required stems include `unlock-panel` |
| `packages/quality/src/smoke.test.ts` | Deleting the stem is red; stdout counts 3 |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §5.3 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names the three stems |

`docs/plan/cycle-7-backlog.md` is not rewritten. `docs/plan/wave-protocol.md`
is not rewritten. `docs/verify/cycle-7-report.md` is not written.
`.github/workflows/ci.yml` is untouched. Wallet top-up stays disabled.
`adUnlock` stays false. No BytePlus `vid`.

---

## 3. Mutations that bite

Covered by tests on this branch (preflight fixtures, not a live revert).

### 3.1 Required unlock-panel stem deleted

```
smoke specs are missing required P0 files: unlock-panel.spec.ts
```

Exit 1.

### 3.2 Confirm is pressed / a `vid` is invented / `#/vip` appears

The live spec fails if the panel never opens, if an ad channel is drawn, if
a `#/vip` link is present, or if a player surface is constructed. Completing
MockBridge `pay()` would not be E-20: GATE-2 / GATE-4 are unanswered.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-d04fddba` V21 cycle-7 independent verify | **RUNNING.** `docs/verify/cycle-7-report.md` not written here |
| `bc-4e76eb65` W21 settings a11y | **Idle. Landed** `30921f4` / `docs/handoff/w21-a11y-settings.md`. Fixtures not rewritten here |

`git diff origin/main -- app/ server/ .github/workflows/ci.yml packages/quality/a11y/`
is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch against `origin/main` (`30921f4`).
L1 sequence is format → lint → typecheck → check:commits → check:skips →
check:audit → check:a11y → test:coverage → check:coverage → build →
guardrails. `check:smoke` is **not** in that sequence.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `1 new commits vs origin/main, 0 prose, 0 missing-id` at the product SHA (unique commit carries `G2.3` / `E-20`) |
| G1.10 skips | `239 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (11 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` — fixtures not rewritten here |
| Tests + coverage | **3,607 passing** — shared 63, quality 457, config 45, server 1,785, app 1,257. Coverage: global lines 94.37% (17893/18961), branches 90.88%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-DGRevdWg.js` 367.05 kB / 112.17 kB gzip (this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |
| G2.3 `check:smoke` | `smoke passed (3 specs against http://127.0.0.1:39655)` — live Chromium, not in verify |

Native `<video>` remains absent. No `vid_demo_` in product source. Test count
did not fall (3,605 on `main` after settings → 3,607 here; the extra tests
are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **E-20 granted unlock + resume.** This slice is the intercept only.
- **E-21 / E-22 / E-24.** IAP sandbox. GATE-2 / GATE-4.
- **E-10 first-frame / E-11 swipe / E-12 resume.** GATE-8.
- **E-03 silent refresh.** Not this slice.
- **Full 交互验收单.** 倍速 / scrub stay plugin-owned (X-26). D9 stays `[ ]`
  until a device. Sheet is not 全过.
- **S-A1 on remaining PNL fixtures.** Screens already required. Panels later.
- **S-C4.** Required-checks vs GitHub branch protection. D-17 still falsifies
  GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named
G2.3 remainder that requires `unlock-panel` next to `login-home` and
`browse-play`.
