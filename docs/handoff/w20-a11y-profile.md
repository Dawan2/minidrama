# W20 — QA-010 remainder: require SCR-06 profile next to play

> **Slot:** W20, work slot (`bc-a6639f6d`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-a11y-profile-72c4`, cut from `origin/main` at **`b34ef5b`**
> (QA-010 remainder already requires SCR-05 play next to drama).
> **Not merged.** C7-first (`bc-22d4f29b` / `cursor/w20-work-c7-first-72c4`)
> landed the same remainder on `main` at **`a49ebd7`** while this slot verified.
> This branch is a twin and is left. Host stays jsdom, not TikTok WebView.
> **Item:** **QA-010 remainder** — S-A1 on the next listing-critical implemented
> screen. After SCR-13, SCR-02, SCR-03, SCR-04, and SCR-05, the inventory ranks
> **SCR-06** (`#/me`, profile / 我的) next. Deleting any of the six required
> stems is red.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, C7-first
> (`bc-22d4f29b`), C7-second (`bc-1ed8782f`), remaining SCR/PNL fixtures
> (history, …), S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

SCR-05 play is on `main` at `b34ef5b`. `docs/plan/cycle-7-backlog.md` ranks
D-17 first (not a branch). Protocol-C4 交互验收单 is a named remainder, not an
implement epic. QA-010's smallest job and the SCR-02 / SCR-03 / SCR-04 /
SCR-05 remainders were on `main`. C4-03 / C4-07 stay skipped. C7-first
(`bc-22d4f29b`) and C7-second (`bc-1ed8782f`) were left. Cycle-7 plan docs
are not rewritten. TikTok WebView is not claimed.

The named remainder after play is S-A1 on further implemented screens. SCR-01
is an overlay. SCR-10 / SCR-11 are not product routes. The test-plan /
inventory order after SCR-05 is SCR-06 profile (`#/me`), then history.
**Profile is next and was not already scanned.**

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| C7-first `bc-22d4f29b` | **Left.** Not this remainder |
| C7-second `bc-1ed8782f` | **Left.** Not this remainder |
| QA-010 SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 | **On `main`** at `b34ef5b` |
| **QA-010 remainder SCR-06 profile** | **This slot.** Required stems after play are home + browse + drama + play + fallback |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are now `scr-02-home`, `scr-03-browse`, `scr-04-drama`,
`scr-05-play`, `scr-06-profile`, and `scr-13-fallback`. A source that has
home, browse, drama, play, and fallback but not profile is red. The profile
fixture uses product English copy and the anonymous-state chrome
(`profile-page`, heading, guest identity, in-place sign-in card rather than a
login screen, entries to history / favourites / wallet / settings). Body
colors stay the passing pair; live `--accent` is not remediated. The VIP card
is not in this fixture: guests see the login card, not invented VIP status.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-06-profile.html` | SCR-06 fixture (`lang="en"`, product body colors) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-06-profile` |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all six stems |

`docs/plan/cycle-6-backlog.md` and `docs/plan/cycle-7-backlog.md` are not
rewritten. `.github/` and product UI files are untouched. Wallet top-up stays
disabled. `adUnlock` stays false. No BytePlus `vid`. No `#/vip`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required profile stem deleted

```
required implemented-screen fixture missing: scr-06-profile (host=jsdom, not TikTok WebView)
```

Exit 1.

Stdout on green says `6 screens` and `host=jsdom, not TikTok WebView`. A
comment that names WCAG is not this gate.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-22d4f29b` C7-first | **Idle. Landed** `a49ebd7` / `docs/handoff/w20-c7-first.md` (SCR-06) while this slot verified. **Twin. Not merged.** Unique commit `3fd393d`. Do not retake `scr-06-profile.html` |
| `bc-1ed8782f` C7-second | **Left.** Files not guessed |
| `bc-f6e4b6a7` play a11y | **Idle. Landed** `b34ef5b` / `docs/handoff/w20-a11y-play.md` (SCR-05). Play fixture not edited here beyond requiring it |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch at `af4df52` against `origin/main`
`b34ef5b`. L1 sequence is format → lint → typecheck → check:commits →
check:skips → check:audit → check:a11y → test:coverage → check:coverage →
build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `1 new commits vs origin/main, 0 prose, 0 missing-id` on the unique `ci(qa-010)` commit; the handoff commit is the second unique commit and also carries `QA-010` / `SCR-06` |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (6 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,583 passing** — shared 63, quality 440, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17873/18941), branches 90.87%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip (unchanged client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,580 on `main`
after SCR-05 → 3,583 here; the extra tests are this remainder). jsdom still
prints `HTMLCanvasElement's getContext()` while axe attempts `color-contrast`;
that is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-06 only. SCR-07
  history, SCR-08 favourites, SCR-09 wallet, SCR-12 settings, and panels are
  later remainders. Of the listing-critical surfaces after profile, history
  is next.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  play.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C7-first / C7-second** (`bc-22d4f29b`, `bc-1ed8782f`). Left.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md` / `cycle-7-backlog.md`.** Plan-slot files.

This slice does **not** claim protocol-C4 exit 3 closed. The named
QA-010 remainder that requires SCR-06 profile is already on `main` at
`a49ebd7` via C7-first. This branch is the twin that lost the race and is
not merged.
