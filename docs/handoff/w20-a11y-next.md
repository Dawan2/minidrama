# W20 — QA-010 remainder: require SCR-03 browse next to home and fallback

> **Slot:** W20, work slot (`bc-25aea5c1`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-a11y-next-72c4`, cut from `origin/main` at **`51ab72f`**
> (QA-010 remainder already requires SCR-02 home next to SCR-13).
> **Item:** **QA-010 remainder** — S-A1 on the next listing-critical implemented
> screen. After SCR-13 and SCR-02, the inventory ranks **SCR-03** (`#/browse`,
> theatre / catalogue) next among browse, play, and profile. Deleting any of the
> three required stems is red. Host stays jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, C4-remain playback
> (`bc-7fbe0bc1`), cycle-7 plan docs (`bc-285529d4`), remaining SCR/PNL fixtures
> (play, profile, drama, …), S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic. QA-010's smallest job
and the SCR-02 remainder are on `main` at `51ab72f`. C4-03 / C4-07 stay skipped.
C4-remain playback (`bc-7fbe0bc1`) and cycle-7 plan docs (`bc-285529d4`) were
in flight; left.

The named remainder after home is S-A1 on further implemented screens. SCR-01
is an overlay. SCR-10 / SCR-11 are not product routes. The test-plan / inventory
order after SCR-02 is SCR-03 browse, then drama, then play (核心屏), then
profile. Of browse / play / profile, **browse is next and was not already
scanned**.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| C4-remain playback `bc-7fbe0bc1` | **RUNNING.** Left |
| Cycle-7 plan docs `bc-285529d4` | **RUNNING.** Left |
| QA-010 SCR-13 + SCR-02 | **On `main`** at `51ab72f` |
| **QA-010 remainder SCR-03 browse** | **This slot.** Required stems were home + fallback |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are now `scr-02-home`, `scr-03-browse`, and `scr-13-fallback`. A
source that has home and fallback but not browse is red. The browse fixture uses
product English copy and the empty-catalogue chrome (`browse-page`, heading,
nav, filters, empty-state). Body colors stay the passing pair; live `--accent`
is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-03-browse.html` | SCR-03 fixture (`lang="en"`, product body colors) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-03-browse` |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all three stems |

`docs/plan/cycle-6-backlog.md` is not rewritten. `.github/` and player files
are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required browse stem deleted

```
required implemented-screen fixture missing: scr-03-browse (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

```
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast … color-contrast p 1.00:1 < 4.5:1
```

Exit 1. A comment that names WCAG is not this gate. Stdout on green says
`3 screens` and `host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-7fbe0bc1` C4-remain playback | **RUNNING.** Player files not edited here |
| `bc-285529d4` cycle-7 plan docs | **RUNNING.** `docs/plan/` not rewritten |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch at `51ab72f`. L1 sequence is format →
lint → typecheck → check:commits → check:skips → check:audit → check:a11y →
test:coverage → check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped; unique commits carry `QA-010`) |
| G1.10 skips | `236 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (3 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,560 passing** — shared 63, quality 431, config 45, server 1,785, app 1,236. Coverage: global lines 94.37% (17725/18782), branches 90.88%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-C3L6HYpZ.js` 364.54 kB / 111.58 kB gzip (PLY-011's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,557 on `main` after
SCR-02 → 3,560 here; the extra tests are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-03 only. SCR-04
  drama, SCR-05 play, SCR-06 profile, SCR-07…SCR-09, SCR-12, and panels are
  later remainders. Of the listing-critical trio, play then profile are next.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  home.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C4-remain playback** (`bc-7fbe0bc1`) and **cycle-7 plan docs**
  (`bc-285529d4`). In flight. Not this slot.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-03 browse next to SCR-02 and SCR-13.
